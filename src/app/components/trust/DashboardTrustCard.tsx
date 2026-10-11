// Dashboard summary of the FILMONS Reliability score -- same data and
// weighting as Settings -> Trust & Verification (trustApi.getTrustProfile):
// Connections /45, Recommendations /20, Transactions /20, Identity /15.
// Tapping it opens that full breakdown. Fetches itself, shows cached data or a
// skeleton straight away, retries once, then offers a Retry link.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, ShieldCheck, BadgeCheck } from 'lucide-react';
import { ReliabilityProgressBar } from './ReliabilityProgressBar';
import {
  getTrustProfile, trustLevelLabel, nextTrustLevel, type TrustProfile,
} from '../../lib/trustApi';
import { withTimeout } from '../../lib/withTimeout';
import { setSettingsReturnTo } from '../../lib/settingsReturnTo';

const PARTS: { key: keyof TrustProfile; label: string; max: number }[] = [
  { key: 'connectionScore',     label: 'Connections',     max: 45 },
  { key: 'recommendationScore', label: 'Recommendations', max: 20 },
  { key: 'transactionScore',    label: 'Transactions',    max: 20 },
  { key: 'identityScore',       label: 'Identity',        max: 15 },
];

export function DashboardTrustCard({ userId }: { userId: string }) {
  const navigate = useNavigate();
  // Stale-while-revalidate: show the last score instantly, refresh behind it.
  const cacheKey = `filmons:trust-card:${userId}`;
  const [trust, setTrust] = useState<TrustProfile | null>(() => {
    try { const c = localStorage.getItem(cacheKey); return c ? JSON.parse(c) : null; } catch { return null; }
  });
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    // 4.2s: just inside the 4.5s Supabase read abort. One silent retry on
    // failure (the first request often loses the race with the dashboard's
    // other parallel loads) before surfacing the error.
    const load = async () => {
      for (let i = 0; i < 2; i++) {
        const t = await withTimeout<TrustProfile | null>(getTrustProfile(userId), 4200, null);
        if (!alive) return;
        if (t) {
          setTrust(t);
          try { localStorage.setItem(cacheKey, JSON.stringify(t)); } catch { /* ignore */ }
          return;
        }
      }
      setFailed(true);
    };
    load();
    return () => { alive = false; };
  }, [userId, attempt]);

  if (!trust) {
    return failed ? (
      <button onClick={() => setAttempt(a => a + 1)}
        className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 text-left text-xs text-gray-500">
        Couldn't load your Trust Score. <span className="font-bold text-blue-600">Retry</span>
      </button>
    ) : (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-[52px] h-[52px] rounded-full bg-gray-100" />
          <div className="flex-1 space-y-2"><div className="h-3 w-28 bg-gray-100 rounded" /><div className="h-2.5 w-20 bg-gray-100 rounded" /></div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4">
          {PARTS.map(p => <div key={p.key} className="h-5 bg-gray-100 rounded" />)}
        </div>
      </div>
    );
  }

  const score = trust.reliabilityScore;
  const elite = trust.trustLevel === 'elite';
  const color = elite ? '#9333ea' : '#2563eb';
  const next = nextTrustLevel(score, trust.trustLevel);
  const C = 2 * Math.PI * 20;

  return (
    <button
      onClick={() => { setSettingsReturnTo(window.location.pathname); navigate('/settings/verification'); }}
      className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center gap-4">
        <svg width={52} height={52} style={{ flexShrink: 0, overflow: 'visible' }}>
          <circle cx={26} cy={26} r={20} fill="none" stroke="#e5e7eb" strokeWidth="5" />
          <circle cx={26} cy={26} r={20} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${(Math.min(100, score) / 100) * C} ${C}`} strokeLinecap="round" transform="rotate(-90 26 26)" />
          <text x={26} y={30} textAnchor="middle" fontSize={13} fontWeight="900" fill={color}>{Math.round(score)}</text>
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900 flex items-center gap-1">
            {elite ? <BadgeCheck className="w-3.5 h-3.5 text-purple-600" /> : <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />}
            FILMONS Trust Score
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{ color }}>
            {trustLevelLabel(trust.trustLevel)}
            {next && <span className="text-gray-400 font-medium"> · {next.pointsRemaining} pts to {next.label}</span>}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-3.5">
        {PARTS.map(p => {
          const v = trust[p.key] as number;
          return (
            <div key={p.key}>
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span>{p.label}</span><span className="text-gray-700 font-bold">{Math.round(v)}/{p.max}</span>
              </div>
              <ReliabilityProgressBar value={v} max={p.max} colorClass={elite ? 'bg-purple-600' : 'bg-blue-600'} />
            </div>
          );
        })}
      </div>
    </button>
  );
}
