import { useState } from 'react';
import { useNavigate } from 'react-router';
import { captureSnapshot } from '../lib/smartAnimate';
import { ArrowLeft, Check, ChevronRight, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { normalizeTier, getTierBadge, type AccountTier } from '../lib/reliabilityApi';
import { toast } from 'sonner';

// Each tier shows exactly what IT adds (not inherited features — those are shown via inheritance label)
const TIERS: {
  id: AccountTier; label: string; emoji: string; price: string; sub: string;
  accentColor: string; borderColor: string; bgColor: string;
  tagline: string;
  requires?: string;
  requiresTier?: AccountTier;
  ownFeatures: string[];
  inherited?: string;
}[] = [
  {
    id: 'creator', label: 'Creator', emoji: '🎬',
    price: 'Free', sub: 'Forever free',
    accentColor: '#6b7280', borderColor: 'border-gray-200', bgColor: 'bg-white',
    tagline: 'Social creator identity.',
    ownFeatures: [
      'Public profile & portfolio',
      'Posts, reels & messaging',
      'Collaborate with creators',
      'Rent gear & hire creators',
      'Basic reliability score (Renter trust)',
    ],
  },
  {
    id: 'creator_plus', label: 'Creator+', emoji: '⚡',
    price: 'Free', sub: 'with ID verification',
    accentColor: '#2563eb', borderColor: 'border-blue-400', bgColor: 'bg-blue-50',
    tagline: 'Verified marketplace foundation.',
    requires: 'ID + selfie + payout verification required',
    ownFeatures: [
      '✓ Verified Creator+ badge',
      'Host gear & studio rentals',
      'List creative services',
      'Booking & payout system',
      'Marketplace analytics',
      'Invoices & transaction tools',
      '3-dimension reliability score (Renter + Host + Service)',
      'Verification auto-maxed (identity confirmed)',
    ],
    inherited: 'All Creator features',
  },
  {
    id: 'professional', label: 'Professional', emoji: '⭐',
    price: '$49', sub: '/month',
    accentColor: '#7c3aed', borderColor: 'border-purple-400', bgColor: 'bg-purple-50',
    tagline: 'Industry-recognized verified creator.',
    requires: 'Creator+ required · Portfolio review · Reliability score ≥ 50',
    requiresTier: 'creator_plus',
    ownFeatures: [
      '✓ Verified Professional badge',
      'Professionally verified portfolio',
      'Priority creator & service discovery',
      'Advanced analytics dashboard',
      'Lower platform fees',
      'Instant booking eligibility',
      'Featured placement eligibility',
      'Priority dispute support',
      'Professional trust dimension',
    ],
    inherited: 'All Creator+ & Creator features',
  },
  {
    id: 'business', label: 'Business', emoji: '🏢',
    price: '$149', sub: '/month',
    accentColor: '#b45309', borderColor: 'border-yellow-400', bgColor: 'bg-yellow-50',
    tagline: 'Enterprise & company operations.',
    requires: 'Professional required · Business documents · Company validation',
    requiresTier: 'creator_plus',
    ownFeatures: [
      '✓ Verified Business badge',
      'Team management (up to 10 members)',
      'Multi-user roles (owner, admin, manager, editor)',
      'Branded company storefront',
      'Large inventory & warehouse hosting',
      'Enterprise booking & scheduling system',
      'Business invoices & tax export tools',
      'Revenue & operational analytics',
      'Business trust dimension',
      'API access (coming soon)',
    ],
    inherited: 'All Professional + Creator+ + Creator features',
  },
];

// ── tier order ────────────────────────────────────────────────────────────────
const TIER_ORDER: AccountTier[] = ['creator','creator_plus','professional','business'];
function tierRank(t: AccountTier) { return TIER_ORDER.indexOf(t); }

export function AccountUpgrade() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const current  = normalizeTier(user?.accountType);
  const [expanded, setExpanded] = useState<AccountTier | null>(null);

  const upgrade = (id: AccountTier) => {
    if (id === current) { toast.info('This is your current plan'); return; }
    if (tierRank(id) < tierRank(current)) { toast.info('Contact support to downgrade'); return; }
    if (id === 'creator_plus') { captureSnapshot(); navigate('/creator-plus-steps'); return; }
    if (id === 'professional') { captureSnapshot(); navigate('/professional-account-steps'); return; }
    if (id === 'business') { captureSnapshot(); navigate('/business-account-steps'); return; }
    toast.info(`${TIERS.find(t=>t.id===id)?.label} upgrade — payment flow coming soon`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => { captureSnapshot(); navigate(-1); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700"/>
        </button>
        <h1 className="text-base font-black text-gray-900">Account Upgrade</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">

        {/* Hero */}
        <div className="text-center mb-6">
          <p className="text-xl font-black text-gray-900">Grow your creative career</p>
          <p className="text-sm text-gray-500 mt-1">Each tier builds on the one below — nothing is lost when you upgrade.</p>
        </div>

        {/* Progression ladder */}
        <div className="flex items-center justify-center gap-1 mb-6 overflow-x-auto py-1">
          {TIERS.map((t, i) => (
            <div key={t.id} className="flex items-center gap-1 shrink-0">
              <div className={`flex flex-col items-center px-2 py-1.5 rounded-xl text-center ${
                t.id === current ? 'bg-white border-2 shadow-sm' : 'bg-gray-50 border border-gray-200'
              }`} style={t.id === current ? { borderColor: t.accentColor } : {}}>
                <span className="text-xl">{t.emoji}</span>
                <p className="text-[10px] font-black" style={{ color: t.id === current ? t.accentColor : '#9ca3af' }}>{t.label}</p>
                {t.id === current && <p className="text-[8px] font-bold" style={{ color: t.accentColor }}>YOU</p>}
              </div>
              {i < TIERS.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 shrink-0"/>}
            </div>
          ))}
        </div>

        {/* Tier cards */}
        <div className="space-y-3">
          {TIERS.map(tier => {
            const isCurrent  = tier.id === current;
            const isAbove    = tierRank(tier.id) > tierRank(current);
            const isBelow    = tierRank(tier.id) < tierRank(current);
            const isExpanded = expanded === tier.id;
            const locked     = tier.requiresTier && tierRank(current) < tierRank(tier.requiresTier);

            return (
              <div key={tier.id}
                className={`rounded-2xl border-2 overflow-hidden transition-all ${tier.borderColor} ${tier.bgColor}`}
                style={isCurrent ? { boxShadow:`0 0 0 2px ${tier.accentColor}` } : {}}>

                {/* Current indicator */}
                {isCurrent && (
                  <div className="px-4 py-1.5 text-center text-[10px] font-black tracking-widest text-white"
                    style={{ background: tier.accentColor }}>
                    CURRENT PLAN
                  </div>
                )}

                {/* Header */}
                <button onClick={() => setExpanded(isExpanded ? null : tier.id)}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left">
                  <span className="text-2xl shrink-0">{tier.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-base font-black text-gray-900">{tier.label}</p>
                      {getTierBadge(tier.id) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                          style={{ background: tier.accentColor }}>
                          {getTierBadge(tier.id)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{tier.tagline}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-base font-black text-gray-900">{tier.price}</p>
                      <p className="text-[10px] text-gray-400">{tier.sub}</p>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`}/>
                  </div>
                </button>

                {/* Expanded features */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-100">

                    {/* Requirements */}
                    {tier.requires && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3">
                        {locked && <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5"/>}
                        <p className="text-[11px] text-amber-700 font-semibold">{tier.requires}</p>
                      </div>
                    )}

                    {/* Inherited */}
                    {tier.inherited && (
                      <div className="flex items-center gap-2 py-2 border-b border-gray-100">
                        <span className="text-xs text-gray-400">Includes:</span>
                        <span className="text-xs font-semibold text-gray-600">{tier.inherited}</span>
                      </div>
                    )}

                    {/* Own features */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                        {tier.inherited ? 'Plus these additions:' : 'Included:'}
                      </p>
                      {tier.ownFeatures.map(f => (
                        <div key={f} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: tier.accentColor }}/>
                          <p className="text-xs text-gray-700">{f}</p>
                        </div>
                      ))}
                    </div>

                    {/* CTA */}
                    {!isCurrent && (
                      <button onClick={() => upgrade(tier.id)}
                        disabled={!!locked}
                        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-40 mt-2"
                        style={{ background: tier.accentColor }}>
                        {locked ? `Requires ${TIERS.find(t=>t.id===tier.requiresTier)?.label} first` :
                         isAbove ? `Upgrade to ${tier.label}` :
                         isBelow ? `Downgrade to ${tier.label}` : 'Select'}
                      </button>
                    )}
                    {isCurrent && (
                      <div className="w-full py-3 rounded-xl text-sm font-bold text-center"
                        style={{ background:`${tier.accentColor}15`, color: tier.accentColor }}>
                        ✓ Your Current Plan
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Philosophy note */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs font-bold text-gray-700 mb-2">The Filmons progression</p>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Creator → Creator+ → Professional → Business is a creative career journey — not just a subscription tier.
            Each level requires real verification and real activity. Trust is earned, not purchased.
          </p>
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-4 pb-24">
          All paid plans include a 7-day free trial · Cancel anytime
        </p>
      </div>
    </div>
  );
}