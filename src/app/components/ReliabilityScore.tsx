/**
 * Filmons ReliabilityScore — cinematic, contained, aesthetic.
 * No clipping. All text wraps properly. Mobile-first.
 */
import { useEffect, useState, useRef } from 'react';
import { ChevronDown, ChevronUp, Shield, TrendingUp, CheckCircle } from 'lucide-react';
import {
  reliabilityApi, ReputationScore, ReputationEvent, TrustBadge,
  CREATOR_TIERS, CREATOR_PLUS_TIERS, HOST_TIERS, SERVICE_TIERS,
  RENTER_BREAKDOWN, HOST_BREAKDOWN, SERVICE_BREAKDOWN,
  isCreatorPlus, getCompositeTier, scoreColor, nextTierInfo,
} from '../lib/reliabilityApi';

// ─── animated counter ────────────────────────────────────────────────────────
function useCountUp(to: number, ms = 900) {
  const [v, setV] = useState(0);
  const raf = useRef<number>(); const t0 = useRef<number|null>(null);
  useEffect(() => {
    if (to === 0) { setV(0); return; }
    t0.current = null;
    const tick = (ts: number) => {
      if (!t0.current) t0.current = ts;
      const p = Math.min((ts - t0.current) / ms, 1);
      setV(Math.round((1 - Math.pow(2, -10 * p)) * to));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [to, ms]);
  return v;
}

// ─── ring ────────────────────────────────────────────────────────────────────
function Ring({ score, color, size = 88 }: { score: number; color: string; size?: number }) {
  const n = useCountUp(score);
  const cx = size / 2, cy = size / 2, r = size / 2 - 8;
  const C = 2 * Math.PI * r, d = (n / 100) * C;
  const fs = size > 72 ? 18 : size > 52 ? 14 : 11;
  return (
    <svg width={size} height={size} style={{ overflow: 'visible', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="7"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={`${d} ${C - d}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ filter: `drop-shadow(0 0 5px ${color}44)`, transition: 'stroke-dasharray 0.05s' }}/>
      <text x={cx} y={cy + fs * 0.35} textAnchor="middle"
        fontSize={fs} fontWeight="900" fill={color}>{n}</text>
    </svg>
  );
}

// ─── bar ─────────────────────────────────────────────────────────────────────
function Bar({ label, icon, value, cap, color }: {
  label: string; icon: string; value: number; cap: number; color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] text-gray-500 font-medium">{icon} {label}</span>
        <span className="text-[11px] font-bold" style={{ color }}>
          {Math.round(value)}<span className="font-normal text-gray-300">/{cap}</span>
        </span>
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full"
          style={{ width: `${Math.min(100, (value / cap) * 100)}%`, background: color, transition: 'width 0.8s ease' }}/>
      </div>
    </div>
  );
}

// ─── tier path ───────────────────────────────────────────────────────────────
function TierPath({ score, tiers }: { score: number; tiers: Record<string, any> }) {
  const sorted = Object.entries(tiers).sort((a, b) => a[1].min - b[1].min);
  return (
    <div className="space-y-1.5">
      {sorted.map(([key, t]) => {
        const here = score >= t.min && score <= t.max;
        const past = score > t.max;
        const col  = here ? scoreColor(score) : undefined;
        return (
          <div key={key} className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] border-2"
              style={here ? { borderColor: col, background: `${col}18` }
                   : past ? { borderColor: '#22c55e', background: '#f0fdf4' }
                   : { borderColor: '#e5e7eb', background: '#f9fafb' }}>
              {past ? <CheckCircle className="w-3 h-3 text-green-500"/> : t.emoji}
            </div>
            <div className="flex-1 flex items-center justify-between rounded-lg px-2.5 py-1.5 border"
              style={here ? { borderColor: `${col}40`, background: `${col}08` }
                   : past ? { borderColor: '#dcfce7', background: '#f0fdf4' }
                   : { borderColor: '#f3f4f6', background: '#fafafa' }}>
              <p className="text-[11px] font-bold" style={here ? { color: col } : past ? { color: '#15803d' } : { color: '#9ca3af' }}>
                {t.label}
              </p>
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                <span className="text-[9px] text-gray-400">{t.min}–{t.max}</span>
                {here && <span className="text-[8px] font-black px-1 py-0.5 rounded-full"
                  style={{ background: `${col}20`, color: col }}>YOU</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── dim section ─────────────────────────────────────────────────────────────
function DimSection({ title, weight, score, tier, breakdown, rep, events, penaltyKey, dim }: {
  title: string; weight: string; score: number; tier: any;
  breakdown: readonly any[]; rep: ReputationScore;
  events: ReputationEvent[]; penaltyKey: string; dim: string;
}) {
  const color   = scoreColor(score);
  const penalty = Number((rep as any)[penaltyKey] || 0);
  const dimEvs  = events.filter(e => e.dimension === dim).slice(0, 3);
  return (
    <div className="rounded-xl p-3 space-y-2.5"
      style={{ border: `1px solid ${color}28`, background: `${color}05` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide">
            {title} · <span className="normal-case font-normal">{weight}</span>
          </p>
          <p className="text-xs font-bold mt-0.5 truncate" style={{ color }}>{tier.emoji} {tier.label}</p>
        </div>
        <Ring score={score} color={color} size={48}/>
      </div>
      <div className="space-y-1.5">
        {breakdown.map((cat: any) => (
          <Bar key={cat.key} label={cat.label} icon={cat.icon}
            value={Number((rep as any)[cat.key] || 0)} cap={cat.cap} color={cat.color}/>
        ))}
        {penalty < 0 && (
          <div className="flex justify-between text-[10px] pt-1 border-t border-red-100">
            <span className="text-red-400 font-semibold">⚠️ Penalties</span>
            <span className="font-bold text-red-500">{penalty}</span>
          </div>
        )}
      </div>
      {dimEvs.length > 0 && (
        <div className="space-y-1 pt-1.5 border-t border-black/5">
          {dimEvs.map(ev => (
            <div key={ev.id} className="flex items-center gap-2 text-[10px]">
              <span className="text-gray-500 truncate flex-1">{ev.reason}</span>
              <span className={`font-bold shrink-0 ${ev.score_delta >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                {ev.score_delta >= 0 ? '+' : ''}{ev.score_delta}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── next-tier progress pill ─────────────────────────────────────────────────
function NextTierPill({ next, score, color, className = '' }: {
  next: { label: string; pointsNeeded: number };
  score: number; color: string; className?: string;
}) {
  // Calculate progress within current tier (approximate 25-pt bands)
  const band  = 25;
  const pct   = Math.max(4, Math.min(96, ((score % band) / band) * 100));
  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 ${className}`}
      style={{ background:`${color}10`, border:`1px solid ${color}30` }}>
      {/* Mini arc progress */}
      <svg width="18" height="18" style={{ flexShrink:0 }}>
        <circle cx="9" cy="9" r="6.5" fill="none" stroke={`${color}28`} strokeWidth="2.5"/>
        <circle cx="9" cy="9" r="6.5" fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={`${(pct/100)*40.8} 40.8`}
          strokeLinecap="round"
          transform="rotate(-90 9 9)"/>
      </svg>
      {/* Text */}
      <span className="text-[10px] font-bold" style={{ color }}>
        +{next.pointsNeeded}
      </span>
      <span className="text-[10px] text-gray-400 font-medium">pts to</span>
      <span className="text-[10px] font-bold text-gray-700 truncate max-w-[110px]">{next.label}</span>
    </div>
  );
}

// ─── inline badge ─────────────────────────────────────────────────────────────
export function ReliabilityBadge({ score, level, accountType, size = 'md' }: {
  score: number; level: string; accountType?: string; size?: 'sm' | 'md';
}) {
  const plus = isCreatorPlus(accountType);
  const tier = getCompositeTier(level, plus);
  const n    = useCountUp(score);
  const sm   = size === 'sm';
  return (
    <div className={`inline-flex items-center gap-1 rounded-full border font-semibold
      ${tier.bg} ${tier.border} ${tier.color}
      ${sm ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}
      style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
      <span>{tier.emoji}</span>
      <span className="font-black tabular-nums">{n}</span>
      <span className="opacity-30 mx-0.5">·</span>
      <span className="font-semibold">{tier.label}</span>
    </div>
  );
}

// ─── MAIN CARD ────────────────────────────────────────────────────────────────
export function ReliabilityCard({ userId, accountType: propType, repData, compact = false, isOwner = true }: {
  userId: string; accountType?: string; repData?: ReputationScore; compact?: boolean; isOwner?: boolean;
}) {
  const [rep, setRep]       = useState<ReputationScore | null>(repData ?? null);
  const [events, setEvents] = useState<ReputationEvent[]>([]);
  const [badges, setBadges] = useState<TrustBadge[]>([]);
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(!repData);

  useEffect(() => {
    if (!userId) return;
    if (!repData) reliabilityApi.getScore(userId).then(r => { setRep(r); setLoading(false); }).catch(() => setLoading(false));
    reliabilityApi.getEvents(userId, 12).then(setEvents).catch(() => {});
    reliabilityApi.getBadges(userId).then(setBadges).catch(() => {});
  }, [userId]);

  if (loading) return <div className="h-20 rounded-2xl bg-gray-100 animate-pulse"/>;
  if (!rep) return null;

  const plus  = isCreatorPlus(propType ?? rep.account_type);
  const tier  = getCompositeTier(rep.reliability_level, plus);
  const color = scoreColor(rep.reliability_score);
  const next  = nextTierInfo(rep.reliability_score, plus);
  const score = rep.reliability_score;

  // ─── COMPACT (HostProfile) ────────────────────────────────────────────────
  if (compact) {
    if (plus) {
      return (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
          {/* Score + label row */}
          <div className="flex items-center gap-3 mb-3">
            <Ring score={score} color={color} size={64}/>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">Creator+ Reliability</p>
              <p className="text-sm font-black leading-tight" style={{ color }}>{tier.emoji} {tier.label}</p>
              {next && (
                <p className="text-[10px] text-gray-400 mt-1">
                  +{next.pointsNeeded} pts {next.label}
                </p>
              )}
            </div>
          </div>
          {/* 3 dimension mini-cards */}
          {(() => {
            const hasListings = rep.rentals_hosted > 0 || rep.host_reviews_count > 0;
            const hasServices = rep.completed_services > 0 || rep.service_reviews_count > 0;
            const dims = [
              { l:'Renter', s:rep.renter_score, i:'🎬', show:true },
              { l:'Hosting', s:rep.host_score, i:'🏠', show:hasListings },
              { l:'Service', s:rep.service_score, i:'⭐', show:hasServices },
            ].filter(d => d.show);
            const cols = dims.length === 3 ? 'grid-cols-3' : dims.length === 2 ? 'grid-cols-2' : 'grid-cols-1';
            return (
              <div className={`grid ${cols} gap-1.5`}>
                {dims.map(d => (
                  <div key={d.l} className="rounded-xl bg-gray-50 p-2 text-center">
                    <span className="text-sm">{d.i}</span>
                    <p className="text-sm font-black tabular-nums" style={{ color:scoreColor(d.s) }}>{d.s}</p>
                    <p className="text-[9px] text-gray-400">{d.l}</p>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      );
    }
    return (
      <div className="rounded-2xl border p-3 flex items-center gap-3" style={{ borderColor:`${color}35`, background:`${color}07` }}>
        <Ring score={score} color={color} size={68}/>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black leading-tight" style={{ color }}>{tier.emoji} {tier.label}</p>
          {isOwner && next && <NextTierPill next={next} score={score} color={color}/>}
        </div>
      </div>
    );
  }

  // ─── FULL CARD ────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100">

      {/* ── Gradient accent top ── */}
      <div className="h-0.5 rounded-t-2xl"
        style={{ background:`linear-gradient(90deg, ${color}, ${color}44)` }}/>

      {/* ── Collapsed header / toggle ── */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full text-left p-4" style={{ WebkitTapHighlightColor:'transparent' }}>
        <div className="flex gap-3 items-start">

          {/* Left: ring(s) */}
          {plus ? (
            <div className="shrink-0">
              <Ring score={score} color={color} size={72}/>
            </div>
          ) : (
            <Ring score={score} color={color} size={80}/>
          )}

          {/* Right: text block — flex-col so nothing overflows horizontally */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">

            {/* Tier label row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-black leading-tight" style={{ color }}>{tier.emoji}</span>
              <span className="text-sm font-black leading-tight" style={{ color }}>{tier.label}</span>
              {plus && (
                <span className="inline-flex items-center text-[9px] font-black px-1.5 py-0.5 rounded-full"
                  style={{ background:'#ede9fe', color:'#6d28d9' }}>
                  Creator+
                </span>
              )}
              <span className="ml-auto shrink-0 text-gray-300">
                {open ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
              </span>
            </div>

            {/* Description — hide for visitors; they already see the label */}
            {isOwner && <p className="text-[11px] text-gray-500 leading-relaxed">{tier.description}</p>}

            {/* Creator+: 3 mini scores inline */}
            {plus && (() => {
              const hasL = rep.rentals_hosted > 0 || rep.host_reviews_count > 0;
              const hasS = rep.completed_services > 0 || rep.service_reviews_count > 0;
              const dims = [
                { l:'Renter',  s:rep.renter_score,  i:'🎬', show:true },
                { l:'Hosting', s:rep.host_score,    i:'🏠', show:hasL },
                { l:'Service', s:rep.service_score, i:'⭐', show:hasS },
              ].filter(d => d.show);
              return (
                <div className="flex gap-1.5 flex-wrap mt-0.5">
                  {dims.map(d => (
                    <div key={d.l} className="flex items-center gap-1 rounded-full px-2 py-0.5"
                      style={{ background:`${scoreColor(d.s)}12`, border:`1px solid ${scoreColor(d.s)}25` }}>
                      <span className="text-[10px]">{d.i}</span>
                      <span className="text-[10px] font-bold tabular-nums" style={{ color:scoreColor(d.s) }}>{d.s}</span>
                      <span className="text-[9px] text-gray-400">{d.l}</span>
                    </div>
                  ))}
                  {!hasL && !hasS && (
                    <span className="text-[10px] text-gray-400 italic">Host rentals or services to unlock more trust dimensions</span>
                  )}
                </div>
              );
            })()}

            {isOwner && next && <NextTierPill next={next} score={score} color={color} className="mt-1"/>}
          </div>
        </div>
      </button>

      {/* ── Expanded section ── */}
      {open && (
        <div className="border-t border-gray-50 p-4 space-y-5">

          {/* Creator */}
          {!plus && (
            <>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Score Breakdown</p>
                <DimSection title="Creator Reliability" weight="100%" score={rep.renter_score}
                  tier={CREATOR_TIERS[rep.renter_level] ?? CREATOR_TIERS.new_user}
                  breakdown={RENTER_BREAKDOWN} rep={rep} events={events}
                  penaltyKey="renter_penalty_pts" dim="renter"/>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Trust Levels</p>
                <TierPath score={score} tiers={CREATOR_TIERS}/>
              </div>
            </>
          )}

          {/* Creator+ — dynamic dimensions based on actual activity */}
          {plus && (() => {
            const hasListings = rep.rentals_hosted > 0 || rep.host_reviews_count > 0 || rep.host_service_pts > 0;
            const hasServices = rep.completed_services > 0 || rep.service_reviews_count > 0 || rep.service_delivery_pts > 0;
            // Weight distribution based on active dimensions
            const activeDims = 1 + (hasListings ? 1 : 0) + (hasServices ? 1 : 0);
            const w = activeDims === 3 ? '30%' : activeDims === 2 ? '45%' : '90%';
            return (
              <>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Your Trust Journey</p>
                  <TierPath score={score} tiers={CREATOR_PLUS_TIERS}/>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Trust Dimensions</p>
                  <p className="text-[10px] text-gray-400 mb-3">
                    {hasListings && hasServices ? 'Renter · Hosting · Service trust all active' :
                     hasListings ? 'Renter + Hosting trust active — list a service to unlock Service trust' :
                     hasServices ? 'Renter + Service trust active — host a rental to unlock Hosting trust' :
                     'Only Renter trust active — host a rental or service to unlock more dimensions'}
                  </p>
                  <div className="space-y-3">
                    {/* Renter trust — always shown */}
                    <DimSection title="Renter Trust" weight={w} score={rep.renter_score}
                      tier={CREATOR_TIERS[rep.renter_level] ?? CREATOR_TIERS.new_user}
                      breakdown={RENTER_BREAKDOWN} rep={rep} events={events}
                      penaltyKey="renter_penalty_pts" dim="renter"/>

                    {/* Marketplace Hosting Trust — only if user has listings */}
                    {hasListings ? (
                      <DimSection title="Marketplace Hosting Trust" weight={w} score={rep.host_score}
                        tier={HOST_TIERS[rep.host_level] ?? HOST_TIERS.untrusted_host}
                        breakdown={HOST_BREAKDOWN} rep={rep} events={events}
                        penaltyKey="host_penalty_pts" dim="host"/>
                    ) : (
                      <div className="rounded-xl border border-dashed border-gray-200 p-3 flex items-center gap-3 opacity-60">
                        <span className="text-xl">🏠</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-400">Marketplace Hosting Trust</p>
                          <p className="text-[10px] text-gray-400">Unlock by hosting your first gear rental or studio</p>
                        </div>
                        <span className="text-[9px] font-black bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full shrink-0">INACTIVE</span>
                      </div>
                    )}

                    {/* Service Trust — only if user has services */}
                    {hasServices ? (
                      <DimSection title="Service Trust" weight={w} score={rep.service_score}
                        tier={SERVICE_TIERS[rep.service_level] ?? SERVICE_TIERS.new_provider}
                        breakdown={SERVICE_BREAKDOWN} rep={rep} events={events}
                        penaltyKey="service_penalty_pts" dim="service"/>
                    ) : (
                      <div className="rounded-xl border border-dashed border-gray-200 p-3 flex items-center gap-3 opacity-60">
                        <span className="text-xl">⭐</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-400">Service Trust</p>
                          <p className="text-[10px] text-gray-400">Unlock by completing your first service booking</p>
                        </div>
                        <span className="text-[9px] font-black bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full shrink-0">INACTIVE</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{ background:'#f0fdf4', border:'1px solid #bbf7d0' }}>
                  <Shield className="w-4 h-4 text-green-600 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-green-700">Verification · 10%</p>
                    <p className="text-[10px] text-green-600">Auto-maxed — Creator+ requires full identity verification</p>
                  </div>
                  <span className="text-sm font-black text-green-700 shrink-0">100</span>
                </div>
              </>
            );
          })()}

          {/* Badges */}
          {badges.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Badges</p>
              <div className="flex flex-wrap gap-1.5">
                {badges.map(b => (
                  <span key={b.badge_type} className={`text-[11px] px-2.5 py-1 rounded-full font-semibold border ${
                    b.dimension==='host'    ? 'bg-purple-50 text-purple-700 border-purple-200' :
                    b.dimension==='service' ? 'bg-pink-50 text-pink-700 border-pink-200' :
                    b.dimension==='renter'  ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                             'bg-gray-100 text-gray-600 border-gray-200'
                  }`}>{b.badge_type}</span>
                ))}
              </div>
            </div>
          )}

          {/* Tips — only shown to profile owner */}
          {isOwner && score < 60 && (
            <div className="rounded-xl p-3 space-y-1"
              style={{ background:`${color}08`, border:`1px solid ${color}20` }}>
              <p className="text-[11px] font-bold mb-1" style={{ color }}>💡 Increase your score</p>
              {!rep.identity_verified       && <p className="text-[11px] text-gray-600">• Verify your identity (+10 pts)</p>}
              {!rep.professional_verified   && <p className="text-[11px] text-gray-600">• Professional verification (+15 pts)</p>}
              {rep.completed_collabs < 3    && <p className="text-[11px] text-gray-600">• Complete collaborations (+3 each)</p>}
              {rep.gear_returned_ontime < 3 && <p className="text-[11px] text-gray-600">• Return gear on time (+5 each)</p>}
              {plus && rep.rentals_hosted < 3     && <p className="text-[11px] text-gray-600">• Host rentals (+4 each)</p>}
              {plus && rep.completed_services < 3 && <p className="text-[11px] text-gray-600">• Complete service bookings (+5 each)</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}