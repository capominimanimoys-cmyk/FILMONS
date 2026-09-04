import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { captureSnapshot } from '../lib/smartAnimate';
import {
  ArrowLeft, ChevronRight, Lock, Building2, CheckCircle, X,
  UserRound, BadgeCheck, BriefcaseBusiness, CircleCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../lib/api';
import { normalizeTier, getTierBadge, type AccountTier } from '../lib/reliabilityApi';
import { entitlementsApi, ENTITLEMENTS, formatLimit, formatPrice, getOpportunityUsage } from '../lib/entitlements';
import { toast } from 'sonner';

// Each tier shows exactly what IT adds (not inherited features — those are shown via inheritance label)
const TIERS: {
  id: AccountTier; label: string; price: string; sub: string;
  accentColor: string; borderColor: string; bgColor: string;
  headline: string; tagline: string;
  requires?: string;
  requiresTier?: AccountTier;
  ownFeatures: string[];
  inherited?: string;
}[] = [
  {
    id: 'creator', label: 'Creator',
    price: 'Free', sub: 'Forever free',
    accentColor: '#6b7280', borderColor: 'border-gray-200', bgColor: 'bg-white',
    headline: 'Your creator identity', tagline: 'Social creator identity.',
    ownFeatures: [
      'Public profile & portfolio',
      'Posts, reels & messaging',
      'Collaborate with creators',
      'Rent gear & hire creators',
      'Basic reliability score (Renter trust)',
    ],
  },
  {
    id: 'creator_plus', label: 'Creator+',
    price: 'Free', sub: 'with ID verification',
    accentColor: '#2563eb', borderColor: 'border-blue-400', bgColor: 'bg-blue-50',
    headline: 'Take your Creator account further', tagline: 'Get more access and start using advanced Creator features.',
    requires: 'ID + selfie + payout verification required',
    ownFeatures: [
      'Creator+ verification',
      'Creator+ badge after verification',
      `Post up to ${formatLimit(ENTITLEMENTS.creator_plus.posts)} Opportunity per ${ENTITLEMENTS.creator_plus.window}`,
      `Apply to up to ${formatLimit(ENTITLEMENTS.creator_plus.applications)} Opportunities per ${ENTITLEMENTS.creator_plus.window}`,
      'Additional Creator+ features',
    ],
    inherited: 'All Creator features',
  },
  {
    id: 'professional', label: 'Professional',
    price: formatPrice(ENTITLEMENTS.professional.priceCents), sub: 'CAD / month',
    accentColor: '#7c3aed', borderColor: 'border-purple-400', bgColor: 'bg-purple-50',
    headline: 'Unlock professional access', tagline: 'For creators who need greater access to opportunities and professional features.',
    requires: 'Creator+ required',
    requiresTier: 'creator_plus',
    ownFeatures: [
      'View all Opportunity listings',
      'View all Emergency listings',
      `Post up to ${ENTITLEMENTS.professional.posts} Opportunities per week`,
      `Apply to up to ${ENTITLEMENTS.professional.applications} Opportunities per week`,
      'Professional tools',
      'Professional account access',
    ],
    inherited: 'All Creator+ & Creator features',
  },
  {
    id: 'business', label: 'Business',
    price: formatPrice(ENTITLEMENTS.business.priceCents), sub: 'CAD / month',
    accentColor: '#b45309', borderColor: 'border-yellow-400', bgColor: 'bg-yellow-50',
    headline: 'Build and manage your business', tagline: 'For businesses, agencies, studios and teams that need maximum access.',
    requires: 'Creator+ required',
    requiresTier: 'creator_plus',
    ownFeatures: [
      'Unlimited Opportunity posts',
      'Unlimited Opportunity applications',
      'View all Opportunity listings',
      'View all Emergency listings',
      'Business tools',
      'Business account features',
    ],
    inherited: 'All Professional + Creator+ + Creator features',
  },
];

// ── tier order ────────────────────────────────────────────────────────────────
const TIER_ORDER: AccountTier[] = ['creator', 'creator_plus', 'professional', 'business'];
function tierRank(t: AccountTier) { return TIER_ORDER.indexOf(t); }

const TIER_ICON: Record<AccountTier, any> = {
  creator: UserRound, creator_plus: BadgeCheck, professional: BriefcaseBusiness, business: Building2,
};

// Personalized banner when the user arrived here from a specific locked
// feature (?reason=...), rather than browsing plans generally. Kept to the
// two concrete cases already wired up (Emergency access, weekly
// application limit) -- every other entry point still lands on the
// un-personalized page, which already explains the same limits via
// "Your usage this week" below.
const LOCKED_REASON_COPY: Record<string, { title: string; body: string }> = {
  emergency: {
    title: 'Unlock all Emergency listings',
    body: 'Upgrade to Professional or Business to access all Emergency listings.',
  },
  applications: {
    title: 'You reached your weekly application limit',
    body: 'Creator+ includes 2 Opportunity applications per week. Upgrade to Professional for 5 per week or Business for unlimited access.',
  },
  posts: {
    title: 'You reached your weekly posting limit',
    body: 'Creator+ includes 1 Opportunity post per week. Upgrade to Professional for 5 per week or Business for unlimited access.',
  },
};

// ── Shared shell — mobile bottom sheet (slide up), desktop centered modal
// (fade + scale, never a bottom sheet), per the FILMONS modal motion spec.
// `render` receives the shared `close()` (plays the exit animation, then
// calls onClose) so every consumer's own close/cancel buttons animate out
// the same way instead of vanishing instantly. ──
function ResponsiveSheet({ onClose, render }: { onClose: () => void; render: (close: () => void) => ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => { requestAnimationFrame(() => requestAnimationFrame(() => setShow(true))); }, []);
  const close = () => { setShow(false); setTimeout(onClose, 180); };
  const body = render(close);

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-black/50"
        style={{ opacity: show ? 1 : 0, transition: 'opacity 200ms ease' }}
        onClick={close}
      />
      {/* Mobile: bottom sheet */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-[70] bg-white rounded-t-3xl shadow-2xl"
        style={{
          transform: show ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 260ms cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3" />
        {body}
      </div>
      {/* Desktop: centered modal, fade + scale, never a bottom sheet */}
      <div className="hidden lg:flex fixed inset-0 z-[70] items-center justify-center p-4" onClick={close}>
        <div
          className="bg-white rounded-3xl shadow-2xl w-full max-w-sm"
          style={{
            opacity: show ? 1 : 0,
            transform: show ? 'scale(1)' : 'scale(0.96)',
            transition: 'opacity 220ms ease-out, transform 220ms ease-out',
          }}
          onClick={e => e.stopPropagation()}
        >
          {body}
        </div>
      </div>
    </>
  );
}

// Never charges by itself -- "Confirm and pay" is what actually starts the
// real Stripe Checkout redirect.
function CheckoutConfirmModal({ tier, onClose, onConfirm, confirming }: {
  tier: typeof TIERS[number]; onClose: () => void; onConfirm: () => void; confirming: boolean;
}) {
  const [agreed, setAgreed] = useState(false);
  return (
    <ResponsiveSheet onClose={onClose} render={close => (
      <>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-base font-black text-gray-900">Upgrade to {tier.label}</p>
          <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="px-5 pb-5 space-y-4">
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Plan</span>
              <span className="font-bold text-gray-900">{tier.label} plan</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Price</span>
              <span className="font-bold text-gray-900">{tier.price} / month</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Billing</span>
              <span className="font-bold text-gray-900">Monthly</span>
            </div>
            <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100 mt-2">
              <span className="text-gray-700 font-semibold">Due today</span>
              <span className="font-black text-gray-900 text-lg">{tier.price}</span>
            </div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-gray-900 shrink-0" />
            <span className="text-xs text-gray-600 leading-relaxed">
              I agree to the FILMONS subscription terms and recurring billing.
            </span>
          </label>

          <button
            onClick={onConfirm}
            disabled={!agreed || confirming}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-sm disabled:opacity-40 transition-opacity"
            style={{ background: tier.accentColor }}
          >
            {confirming ? 'Starting checkout…' : 'Confirm and pay'}
          </button>
          <p className="text-center text-[11px] text-gray-400">Cancel anytime</p>
        </div>
      </>
    )} />
  );
}

// Shown when Professional/Business is tapped by an account that isn't
// Creator+ yet -- explains the requirement instead of just disabling the
// button, with a way to continue straight into the Creator+ step.
function RequiresCreatorPlusModal({ tier, onClose, onContinue }: {
  tier: typeof TIERS[number]; onClose: () => void; onContinue: () => void;
}) {
  return (
    <ResponsiveSheet onClose={onClose} render={close => (
      <div className="px-5 pt-5 pb-5 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <p className="text-base font-black text-gray-900">{tier.label} requires Creator+</p>
          <p className="text-sm text-gray-500 mt-1">Complete your Creator+ upgrade and verification to continue to {tier.label}.</p>
        </div>
        <button onClick={() => { close(); onContinue(); }} className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-sm">
          Continue to Creator+
        </button>
        <button onClick={close} className="w-full py-2 text-gray-400 font-semibold text-xs">Not Now</button>
      </div>
    )} />
  );
}

// "See everything included with Creator+ before continuing" -- Creator+ is
// free (ID verification, not a Stripe charge), so this is a preview step,
// not a payment confirmation; Continue hands off to the verification flow.
function CreatorPlusPreviewModal({ onClose, onContinue }: { onClose: () => void; onContinue: () => void }) {
  const tier = TIERS.find(t => t.id === 'creator_plus')!;
  return (
    <ResponsiveSheet onClose={onClose} render={close => (
      <>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-base font-black text-gray-900">Upgrade to Creator+</p>
          <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="px-5 pb-5 space-y-4">
          <p className="text-sm text-gray-500">See everything included with Creator+ before continuing.</p>
          <div className="bg-blue-50 rounded-2xl p-4 space-y-2">
            {tier.ownFeatures.map(f => (
              <div key={f} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
                <p className="text-sm text-gray-700">{f}</p>
              </div>
            ))}
          </div>
          <p className="text-lg font-black text-gray-900">{tier.price}</p>
          <button onClick={() => { close(); onContinue(); }} className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-sm">
            Continue
          </button>
        </div>
      </>
    )} />
  );
}

export function AccountUpgrade() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, setUserDirectly } = useAuth();
  const current  = normalizeTier(user?.accountType);
  const [activating, setActivating] = useState(false);
  const [activatedPlan, setActivatedPlan] = useState<AccountTier | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<AccountTier | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [usage, setUsage] = useState<{ posts: number; applications: number } | null>(null);
  const [showCreatorPlusPreview, setShowCreatorPlusPreview] = useState(false);
  const [requiresPlan, setRequiresPlan] = useState<AccountTier | null>(null);

  const lockedReason = params.get('reason');
  const lockedCopy = lockedReason ? LOCKED_REASON_COPY[lockedReason] : null;

  // "Your usage this week" -- only meaningful for Creator+, whose tight
  // weekly caps are exactly what a Professional/Business upgrade lifts.
  useEffect(() => {
    if (!user?.id || current !== 'creator_plus') return;
    getOpportunityUsage(user.id, user.accountType).then(setUsage).catch(() => {});
  }, [user?.id, current]);

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

  // Opens the checkout confirmation for a paid plan; Creator+ opens a free
  // preview step instead (no payment, just "see what's included, then
  // continue" before handing off to verification). Professional/Business
  // route through the Creator+ requirement explanation first if the
  // account isn't there yet, rather than just disabling the button.
  const upgrade = (id: AccountTier) => {
    if (id === current) { toast.info('This is your current plan'); return; }
    if (tierRank(id) < tierRank(current)) { toast.info('Contact support to downgrade'); return; }
    if (id === 'creator_plus') { setShowCreatorPlusPreview(true); return; }
    if (id === 'professional' || id === 'business') {
      if (tierRank(current) < tierRank('creator_plus')) { setRequiresPlan(id); return; }
      if (!user) { navigate('/login'); return; }
      setConfirmPlan(id);
      return;
    }
    toast.info(`${TIERS.find(t=>t.id===id)?.label} upgrade — payment flow coming soon`);
  };

  const goToVerification = () => { captureSnapshot(); navigate('/verification'); };

  const confirmAndPay = async () => {
    if (!user || !confirmPlan) return;
    setConfirming(true);
    try {
      const origin = window.location.origin;
      const { url } = await entitlementsApi.startSubscriptionCheckout(
        user.id, confirmPlan, `${origin}/account/upgrade?sub_success=1&plan=${confirmPlan}&session_id={CHECKOUT_SESSION_ID}`, `${origin}/account/upgrade`,
      );
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message || 'Could not start checkout');
      setConfirming(false);
    }
  };

  // Deep-link straight into a specific plan's checkout confirmation
  // (?auto=professional or ?auto=business) -- used by the Opportunity/
  // Emergency display-limit upgrade gates elsewhere in the app, whose
  // "Upgrade to Professional" / "Upgrade to Business" buttons would
  // otherwise just land here and make the user find and tap the right
  // plan card again. Guarded with a ref (not just consuming the param) so
  // this can never re-open the confirmation a second time, e.g. if `user`
  // resolves a moment after mount and this effect re-runs.
  const autoTriggeredRef = useRef(false);
  useEffect(() => {
    const auto = params.get('auto');
    if (!auto || autoTriggeredRef.current) return;
    if (auto !== 'professional' && auto !== 'business') return;
    autoTriggeredRef.current = true;
    upgrade(auto);
  }, [params, user?.id]);

  if (activating) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" /></div>;
  }

  if (activatedPlan) {
    const tier = TIERS.find(t => t.id === activatedPlan)!;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-5 pop-in-card">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto"><CircleCheck className="w-8 h-8 text-green-600" /></div>
          <div>
            <h2 className="text-lg font-black text-gray-900">Welcome to {tier.label}</h2>
            <p className="text-sm text-gray-500 mt-1">Your account has been upgraded successfully. You now have access to your new {tier.label} features.</p>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => navigate('/')} className="w-full py-3.5 rounded-2xl text-white font-bold text-sm" style={{ background: tier.accentColor }}>Explore {tier.label}</button>
            <button onClick={() => setActivatedPlan(null)} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">Done</button>
          </div>
        </div>
      </div>
    );
  }

  const currentTierData = TIERS.find(t => t.id === current)!;
  const CurrentIcon = TIER_ICON[current];
  const subscriptionExpired = (current === 'professional' || current === 'business') && user?.subscriptionStatus === 'canceled';
  // Creator sees Creator+ (the recommended next step) alongside
  // Professional/Business (locked behind Creator+, explained on tap);
  // Creator+ and up only see Professional/Business.
  const featuredTiers = current === 'creator'
    ? TIERS.filter(t => t.id === 'creator_plus' || t.id === 'professional' || t.id === 'business')
    : TIERS.filter(t => t.id === 'professional' || t.id === 'business');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 lg:top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => { captureSnapshot(); navigate('/settings'); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700"/>
        </button>
        <h1 className="text-base font-black text-gray-900">Account Upgrade</h1>
      </div>

      <div className="max-w-lg lg:max-w-4xl mx-auto px-4 py-6">

        {/* Locked-feature personalization -- only when arriving from a
            specific gate (?reason=...); otherwise the generic hero below. */}
        {lockedCopy ? (
          <div className="text-center mb-6 pop-in-card">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6 text-amber-500" />
            </div>
            <p className="text-xl font-black text-gray-900">{lockedCopy.title}</p>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">{lockedCopy.body}</p>
          </div>
        ) : (
          <div className="text-center mb-6 pop-in-card">
            <p className="text-xl font-black text-gray-900">Upgrade your account</p>
            <p className="text-sm text-gray-500 mt-1">Get more access to opportunities, professional tools and features designed to help you grow on FILMONS.</p>
          </div>
        )}

        {/* Your account */}
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Your account</p>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 flex items-center justify-between pop-in-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${currentTierData.accentColor}15` }}>
              <CurrentIcon className="w-5 h-5" style={{ color: currentTierData.accentColor }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-base font-black text-gray-900">{currentTierData.label}</p>
                {subscriptionExpired ? (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-600">Subscription expired</span>
                ) : (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-600">Current account</span>
                )}
              </div>
            </div>
          </div>
          {subscriptionExpired && (
            <button onClick={() => upgrade(current)} className="text-xs font-bold px-3.5 py-2 rounded-xl text-white shrink-0" style={{ background: currentTierData.accentColor }}>
              Renew {currentTierData.label}
            </button>
          )}
        </div>

        {/* Your usage this week — Creator+ only, the tier the tight weekly
            caps actually apply to. */}
        {current === 'creator_plus' && usage && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 pop-in-card">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Your usage this week</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Opportunity posts</p>
                <p className="text-lg font-black text-gray-900">{Math.min(usage.posts, ENTITLEMENTS.creator_plus.posts!)} of {ENTITLEMENTS.creator_plus.posts} used</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Applications</p>
                <p className="text-lg font-black text-gray-900">{Math.min(usage.applications, ENTITLEMENTS.creator_plus.applications!)} of {ENTITLEMENTS.creator_plus.applications} used</p>
              </div>
            </div>
            <button onClick={() => upgrade('professional')}
              className="w-full flex items-center justify-between gap-2 bg-purple-50 hover:bg-purple-100 transition-colors rounded-xl px-4 py-3 text-left">
              <div>
                <p className="text-sm font-bold text-purple-700">Upgrade to Professional</p>
                <p className="text-xs text-purple-500">Get up to 5 Opportunity posts and 5 applications each week.</p>
              </div>
              <ChevronRight className="w-4 h-4 text-purple-400 shrink-0" />
            </button>
          </div>
        )}

        {/* Choose your upgrade — Creator sees Creator+ (recommended next
            step), Professional and Business; Creator+ and up only see
            Professional/Business. Side by side on desktop, stacked on
            mobile. */}
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Choose your upgrade</p>
        <div className={`grid grid-cols-1 ${featuredTiers.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-4 mb-6`}>
          {featuredTiers.map(tier => {
            const Icon = TIER_ICON[tier.id];
            const locked = tier.requiresTier && tierRank(current) < tierRank(tier.requiresTier);
            const isBusiness = tier.id === 'business';
            const isRecommended = tier.id === 'creator_plus' && current === 'creator';
            return (
              <div key={tier.id}
                className={`relative rounded-3xl border-2 ${tier.borderColor} ${tier.bgColor} p-5 pop-in-card ${isBusiness ? 'lg:scale-[1.02]' : ''}`}>
                {isBusiness && (
                  <span className="absolute -top-3 left-5 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full text-white shadow-sm" style={{ background: tier.accentColor }}>
                    Most Powerful
                  </span>
                )}
                {isRecommended && (
                  <span className="absolute -top-3 left-5 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full text-white shadow-sm" style={{ background: tier.accentColor }}>
                    Recommended next step
                  </span>
                )}
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-5 h-5" style={{ color: tier.accentColor }} />
                  <p className="text-lg font-black uppercase tracking-wide" style={{ color: tier.accentColor }}>{tier.label}</p>
                  {getTierBadge(tier.id) && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white ml-auto" style={{ background: tier.accentColor }}>
                      {getTierBadge(tier.id)}
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-gray-900 mb-1">{tier.headline}</p>
                <p className="text-sm text-gray-600 mb-4">{tier.tagline}</p>

                <div className="space-y-2 mb-5">
                  {tier.ownFeatures.map(f => (
                    <div key={f} className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tier.accentColor }} />
                      <p className="text-sm text-gray-700">{f}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-2xl font-black text-gray-900">{tier.price}</span>
                  <span className="text-xs text-gray-400">{tier.sub}</span>
                </div>

                {current === tier.id ? (
                  <div className="w-full py-3 rounded-2xl text-sm font-bold text-center" style={{ background: `${tier.accentColor}15`, color: tier.accentColor }}>
                    Your Current Plan
                  </div>
                ) : (
                  <button onClick={() => upgrade(tier.id)}
                    className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-opacity flex items-center justify-center gap-1.5"
                    style={{ background: tier.accentColor }}>
                    {locked ? <><Lock className="w-3.5 h-3.5" /> Requires Creator+ first</> : `Upgrade to ${tier.label}`}
                  </button>
                )}
                <p className="text-center text-[11px] text-gray-400 mt-2">Cancel anytime</p>
              </div>
            );
          })}
        </div>

        {/* Compare accounts */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6 pop-in-card">
          <p className="text-xs font-black text-gray-700 uppercase tracking-wide px-4 pt-4 pb-2">Compare accounts</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400">
                  <th className="text-left font-semibold px-4 py-2">Feature</th>
                  <th className="text-center font-semibold px-2 py-2">Creator</th>
                  <th className="text-center font-semibold px-2 py-2">Creator+</th>
                  <th className="text-center font-semibold px-2 py-2">Professional</th>
                  <th className="text-center font-semibold px-2 py-2">Business</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <tr><td className="px-4 py-2.5 text-gray-500">Opportunity posts</td><td className="text-center px-2 py-2.5">Restricted</td><td className="text-center px-2 py-2.5">1 weekly</td><td className="text-center px-2 py-2.5 font-semibold">5 weekly</td><td className="text-center px-2 py-2.5 font-semibold">Unlimited</td></tr>
                <tr><td className="px-4 py-2.5 text-gray-500">Opportunity applications</td><td className="text-center px-2 py-2.5">Restricted</td><td className="text-center px-2 py-2.5">2 weekly</td><td className="text-center px-2 py-2.5 font-semibold">5 weekly</td><td className="text-center px-2 py-2.5 font-semibold">Unlimited</td></tr>
                <tr><td className="px-4 py-2.5 text-gray-500">All Opportunities</td><td className="text-center px-2 py-2.5">No</td><td className="text-center px-2 py-2.5">No</td><td className="text-center px-2 py-2.5">Yes</td><td className="text-center px-2 py-2.5">Yes</td></tr>
                <tr><td className="px-4 py-2.5 text-gray-500">All Emergency listings</td><td className="text-center px-2 py-2.5">No</td><td className="text-center px-2 py-2.5">No</td><td className="text-center px-2 py-2.5">Yes</td><td className="text-center px-2 py-2.5">Yes</td></tr>
                <tr><td className="px-4 py-2.5 text-gray-500">Creator+ verification</td><td className="text-center px-2 py-2.5">No</td><td className="text-center px-2 py-2.5">Yes</td><td className="text-center px-2 py-2.5">Yes</td><td className="text-center px-2 py-2.5">Yes</td></tr>
                <tr><td className="px-4 py-2.5 text-gray-500">Professional access</td><td className="text-center px-2 py-2.5">No</td><td className="text-center px-2 py-2.5">No</td><td className="text-center px-2 py-2.5">Yes</td><td className="text-center px-2 py-2.5">Yes</td></tr>
                <tr><td className="px-4 py-2.5 text-gray-500">Business features</td><td className="text-center px-2 py-2.5">No</td><td className="text-center px-2 py-2.5">No</td><td className="text-center px-2 py-2.5">No</td><td className="text-center px-2 py-2.5">Yes</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Philosophy note */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm pop-in-card">
          <p className="text-xs font-bold text-gray-700 mb-2">The FILMONS progression</p>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Creator, Creator+, Professional, Business is a creative career journey, not just a subscription tier.
            Each level requires real verification and real activity. Trust is earned, not purchased.
          </p>
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-4 pb-24">
          Cancel anytime, access continues until the end of your billing period
        </p>
      </div>

      {confirmPlan && (
        <CheckoutConfirmModal
          tier={TIERS.find(t => t.id === confirmPlan)!}
          onClose={() => { if (!confirming) setConfirmPlan(null); }}
          onConfirm={confirmAndPay}
          confirming={confirming}
        />
      )}

      {requiresPlan && (
        <RequiresCreatorPlusModal
          tier={TIERS.find(t => t.id === requiresPlan)!}
          onClose={() => setRequiresPlan(null)}
          onContinue={() => { setRequiresPlan(null); setShowCreatorPlusPreview(true); }}
        />
      )}

      {showCreatorPlusPreview && (
        <CreatorPlusPreviewModal
          onClose={() => setShowCreatorPlusPreview(false)}
          onContinue={goToVerification}
        />
      )}
    </div>
  );
}
