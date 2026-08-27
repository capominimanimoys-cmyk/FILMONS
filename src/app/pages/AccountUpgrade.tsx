import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { captureSnapshot } from '../lib/smartAnimate';
import { ArrowLeft, Check, ChevronRight, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../lib/api';
import { normalizeTier, getTierBadge, type AccountTier } from '../lib/reliabilityApi';
import { entitlementsApi, ENTITLEMENTS, formatLimit } from '../lib/entitlements';
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
    price: '$9.99', sub: 'CAD/month',
    accentColor: '#7c3aed', borderColor: 'border-purple-400', bgColor: 'bg-purple-50',
    tagline: 'For creators who need more opportunities.',
    requires: 'Creator+ required',
    requiresTier: 'creator_plus',
    ownFeatures: [
      `${formatLimit(ENTITLEMENTS.professional.posts)} Opportunity posts / month`,
      `${formatLimit(ENTITLEMENTS.professional.applications)} Opportunity applications / month`,
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
    price: '$19.99', sub: 'CAD/month',
    accentColor: '#b45309', borderColor: 'border-yellow-400', bgColor: 'bg-yellow-50',
    tagline: 'For businesses and high-volume users.',
    requires: 'Creator+ required',
    requiresTier: 'creator_plus',
    ownFeatures: [
      'Unlimited Opportunity posts',
      'Unlimited Opportunity applications',
      '✓ Verified Business badge',
      'Business profile',
      'Applicant management',
      'Opportunity insights',
      'Team management (up to 10 members)',
      'Multi-user roles (owner, admin, manager, editor)',
      'Branded company storefront',
      'Large inventory & warehouse hosting',
      'Enterprise booking & scheduling system',
      'Business invoices & tax export tools',
      'Revenue & operational analytics',
      'Business trust dimension',
    ],
    inherited: 'All Professional + Creator+ + Creator features',
  },
];

// ── tier order ────────────────────────────────────────────────────────────────
const TIER_ORDER: AccountTier[] = ['creator','creator_plus','professional','business'];
function tierRank(t: AccountTier) { return TIER_ORDER.indexOf(t); }

export function AccountUpgrade() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, setUserDirectly } = useAuth();
  const current  = normalizeTier(user?.accountType);
  const [expanded, setExpanded] = useState<AccountTier | null>(null);
  const [activating, setActivating] = useState(false);
  const [activatedPlan, setActivatedPlan] = useState<AccountTier | null>(null);

  // Return from Stripe — mirrors BoostListingFlow.tsx's exact pattern.
  // Activation itself already happened server-side via the webhook; this
  // just polls once to confirm before showing the success screen.
  useEffect(() => {
    const success = params.get('sub_success');
    const sessionId = params.get('session_id');
    const plan = params.get('plan') as AccountTier | null;
    if (success !== '1' || !sessionId) return;
    setActivating(true);
    (async () => {
      try {
        let confirmed = false;
        for (let i = 0; i < 4 && !confirmed; i++) {
          const { activated } = await entitlementsApi.verifySubscription(sessionId);
          confirmed = activated;
          if (!confirmed) await new Promise(r => setTimeout(r, 1500));
        }
        if (confirmed && plan) {
          setActivatedPlan(plan);
          authApi.getMe().then(({ user: fresh }) => setUserDirectly(fresh)).catch(() => {});
        } else {
          toast.error('Payment received — activation is still processing, check back shortly');
        }
        window.history.replaceState({}, '', '/account/upgrade');
      } catch (e: any) {
        toast.error(e?.message || 'Could not confirm subscription');
      } finally {
        setActivating(false);
      }
    })();
  }, [params.get('sub_success')]);

  const upgrade = async (id: AccountTier) => {
    if (id === current) { toast.info('This is your current plan'); return; }
    if (tierRank(id) < tierRank(current)) { toast.info('Contact support to downgrade'); return; }
    if (id === 'creator_plus') { captureSnapshot(); navigate('/verification'); return; }
    if (id === 'professional' || id === 'business') {
      if (!user) { navigate('/login'); return; }
      try {
        const origin = window.location.origin;
        const { url } = await entitlementsApi.startSubscriptionCheckout(
          user.id, id, `${origin}/account/upgrade?sub_success=1&plan=${id}&session_id={CHECKOUT_SESSION_ID}`, `${origin}/account/upgrade`,
        );
        window.location.href = url;
      } catch (e: any) {
        toast.error(e?.message || 'Could not start checkout');
      }
      return;
    }
    toast.info(`${TIERS.find(t=>t.id===id)?.label} upgrade — payment flow coming soon`);
  };

  if (activating) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" /></div>;
  }

  if (activatedPlan) {
    const tier = TIERS.find(t => t.id === activatedPlan)!;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-5">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto"><ShieldCheck className="w-8 h-8 text-green-600" /></div>
          <div>
            <h2 className="text-lg font-black text-gray-900">Welcome to Filmons {tier.label} ✓</h2>
            <p className="text-sm text-gray-500 mt-1">Your {tier.label} account is now active. You can now post and apply to {activatedPlan === 'business' ? 'unlimited' : `up to ${ENTITLEMENTS[activatedPlan].posts}`} Opportunities each month.</p>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => navigate('/')} className="w-full py-3.5 rounded-2xl text-white font-bold text-sm" style={{ background: tier.accentColor }}>Explore Opportunities</button>
            <button onClick={() => setActivatedPlan(null)} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 lg:top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
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
                      <div className="space-y-2">
                        <div className="w-full py-3 rounded-xl text-sm font-bold text-center"
                          style={{ background:`${tier.accentColor}15`, color: tier.accentColor }}>
                          ✓ Your Current Plan
                        </div>
                        {(tier.id === 'professional' || tier.id === 'business') && (
                          user?.subscriptionCancelAtPeriodEnd ? (
                            <p className="text-center text-[11px] text-gray-400">
                              Active until {user.subscriptionCurrentPeriodEnd ? new Date(user.subscriptionCurrentPeriodEnd).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : 'the end of this billing period'}
                            </p>
                          ) : (
                            <button onClick={async () => {
                              if (!user) return;
                              try { await entitlementsApi.cancelSubscription(user.id); toast.success('Subscription will end at the current billing period'); }
                              catch (e: any) { toast.error(e?.message || 'Could not cancel subscription'); }
                            }} className="w-full text-center text-[11px] font-semibold text-gray-400 underline">
                              Cancel subscription
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Plan comparison */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <p className="text-xs font-black text-gray-700 uppercase tracking-wide px-4 pt-4 pb-2">Plan comparison</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400">
                  <th className="text-left font-semibold px-4 py-2">&nbsp;</th>
                  <th className="text-center font-semibold px-2 py-2">Creator</th>
                  <th className="text-center font-semibold px-2 py-2">Professional</th>
                  <th className="text-center font-semibold px-2 py-2">Business</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <tr><td className="px-4 py-2 text-gray-500">Price</td><td className="text-center px-2 py-2">Free</td><td className="text-center px-2 py-2 font-semibold">$9.99/mo</td><td className="text-center px-2 py-2 font-semibold">$19.99/mo</td></tr>
                <tr><td className="px-4 py-2 text-gray-500">Opportunity Posts</td><td className="text-center px-2 py-2">2/mo</td><td className="text-center px-2 py-2">5/mo</td><td className="text-center px-2 py-2">Unlimited</td></tr>
                <tr><td className="px-4 py-2 text-gray-500">Applications</td><td className="text-center px-2 py-2">2/mo</td><td className="text-center px-2 py-2">5/mo</td><td className="text-center px-2 py-2">Unlimited</td></tr>
                <tr><td className="px-4 py-2 text-gray-500">Professional Tools</td><td className="text-center px-2 py-2">—</td><td className="text-center px-2 py-2">✓</td><td className="text-center px-2 py-2">✓</td></tr>
                <tr><td className="px-4 py-2 text-gray-500">Business Profile</td><td className="text-center px-2 py-2">—</td><td className="text-center px-2 py-2">—</td><td className="text-center px-2 py-2">✓</td></tr>
                <tr><td className="px-4 py-2 text-gray-500">Business Tools</td><td className="text-center px-2 py-2">—</td><td className="text-center px-2 py-2">—</td><td className="text-center px-2 py-2">✓</td></tr>
              </tbody>
            </table>
          </div>
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
          Cancel anytime — access continues until the end of your billing period
        </p>
      </div>
    </div>
  );
}