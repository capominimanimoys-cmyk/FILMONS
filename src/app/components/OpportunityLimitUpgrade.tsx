import { CircleAlert, BriefcaseBusiness, Building2, Lock, Check } from 'lucide-react';
import { AccountTier } from '../lib/reliabilityApi';
import { ENTITLEMENTS, formatPrice } from '../lib/entitlements';

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-bold text-gray-500">Opportunity Posts</p>
        <p className="text-xs font-bold text-gray-900">{used} / {limit} used</p>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full bg-red-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Shown inline (never a navigation away) whenever an Opportunity
// entitlement is hit (weekly for Creator/Professional, monthly for
// Creator+ — see entitlements.ts's `window` field) — preserves whatever
// draft/form the caller had open, since the caller only swaps this view in
// without touching its own state.
// The reported usage is always the limit itself (that's why this is
// showing at all) — no extra fetch needed for the progress bar.
export function OpportunityLimitUpgrade({ kind, plan, limit, onUpgrade, onUpgradeToCreatorPlus, onMaybeLater }: {
  kind: 'applications' | 'posts';
  plan: AccountTier;
  limit: number | null;
  onUpgrade: (plan: 'professional' | 'business') => void;
  /** Creator -> Creator+ is free (ID verification, not a Stripe checkout)
   *  -- only needed for the applications-blocked-entirely case below. */
  onUpgradeToCreatorPlus?: () => void;
  onMaybeLater: () => void;
}) {
  const nounPlural = kind === 'applications' ? 'applications' : 'posts';
  const isPosts = kind === 'posts';
  const windowUnit = ENTITLEMENTS[plan]?.window ?? 'month';
  const resetsNote = windowUnit === 'week'
    ? `Your ${limit} ${nounPlural} reset next week.`
    : `Your ${limit} ${nounPlural} reset next month.`;

  // Creator can't post OR apply for Opportunities at all (both limits are
  // 0) -- a distinct message from the "you've used your weekly/monthly
  // cap" case below, which only applies to tiers that actually get an
  // allowance (Creator+ and up).
  if (plan === 'creator' && (kind === 'applications' || kind === 'posts')) {
    const benefits = [
      isPosts ? 'Post Opportunities' : 'Apply to Opportunities',
      'Creator+ verification',
      'Increased trust and visibility',
    ];
    return (
      <div className="px-5 py-6 space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto"><Lock className="w-6 h-6 text-blue-600" /></div>
          <p className="text-base font-black text-gray-900">{isPosts ? 'Post Opportunities' : 'Apply to Opportunities'}</p>
          <p className="text-sm text-gray-500">Upgrade to Creator+ to {isPosts ? 'post' : 'apply for'} opportunities on FILMONS.</p>
        </div>
        <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 space-y-2.5">
          {benefits.map(b => (
            <div key={b} className="flex items-center gap-2">
              <Check className="w-4 h-4 text-blue-600 shrink-0" strokeWidth={3} />
              <p className="text-sm font-semibold text-gray-800">{b}</p>
            </div>
          ))}
        </div>
        <button onClick={onUpgradeToCreatorPlus} className="w-full py-3 rounded-2xl bg-blue-600 text-white font-bold text-sm">
          Upgrade to Creator+
        </button>
        <button onClick={onMaybeLater} className="w-full py-2 text-gray-400 font-semibold text-xs">Not Now</button>
      </div>
    );
  }

  if (plan === 'professional') {
    return (
      <div className="px-5 py-6 space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto"><CircleAlert className="w-6 h-6 text-amber-500" /></div>
          <p className="text-base font-black text-gray-900">Weekly limit reached</p>
          <p className="text-sm text-gray-500">
            You have reached your weekly Opportunity limit. Upgrade to Business for unlimited access.
          </p>
          <p className="text-xs text-gray-400">{resetsNote}</p>
        </div>

        {isPosts && limit !== null && <UsageBar used={limit} limit={limit} />}

        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-black text-amber-700">BUSINESS</p>
          </div>
          <p className="text-sm font-black text-gray-900">{formatPrice(ENTITLEMENTS.business.priceCents)} CAD / month</p>
          <p className="text-xs text-gray-600">Unlimited Opportunity {nounPlural}</p>
          <button onClick={() => onUpgrade('business')} className="w-full py-2.5 rounded-xl bg-amber-600 text-white font-bold text-sm">Upgrade to Business</button>
        </div>

        <button onClick={onMaybeLater} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">Maybe Later</button>
      </div>
    );
  }

  return (
    <div className="px-5 py-6 space-y-4">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto"><CircleAlert className="w-6 h-6 text-amber-500" /></div>
        <p className="text-base font-black text-gray-900">
          {kind === 'applications' ? 'Weekly application limit reached' : 'Weekly posting limit reached'}
        </p>
        <p className="text-sm text-gray-500">
          {kind === 'applications'
            ? `You have used your ${limit} Opportunity application${limit === 1 ? '' : 's'} for this week. Upgrade to Professional or Business to apply to more Opportunities.`
            : `You have used your ${limit} Opportunity post${limit === 1 ? '' : 's'} for this week. Upgrade to Professional or Business to post more Opportunities.`}
        </p>
        <p className="text-xs text-gray-400">{resetsNote}</p>
      </div>

      {isPosts && limit !== null && <UsageBar used={limit} limit={limit} />}

      <div className="rounded-2xl border-2 border-purple-200 bg-purple-50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="w-4 h-4 text-purple-600" />
          <p className="text-sm font-black text-purple-700">PROFESSIONAL</p>
        </div>
        <p className="text-sm font-black text-gray-900">{formatPrice(ENTITLEMENTS.professional.priceCents)} CAD / month</p>
        <p className="text-xs text-gray-600">{ENTITLEMENTS.professional.posts} Opportunity {nounPlural} / {ENTITLEMENTS.professional.window}</p>
        <button onClick={() => onUpgrade('professional')} className="w-full py-2.5 rounded-xl bg-purple-600 text-white font-bold text-sm">Upgrade to Professional</button>
      </div>

      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-amber-600" />
          <p className="text-sm font-black text-amber-700">BUSINESS</p>
        </div>
        <p className="text-sm font-black text-gray-900">{formatPrice(ENTITLEMENTS.business.priceCents)} CAD / month</p>
        <p className="text-xs text-gray-600">Unlimited Opportunity {nounPlural}</p>
        <button onClick={() => onUpgrade('business')} className="w-full py-2.5 rounded-xl bg-amber-600 text-white font-bold text-sm">Upgrade to Business</button>
      </div>

      <button onClick={onMaybeLater} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">Maybe Later</button>
    </div>
  );
}
