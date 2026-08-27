import { CircleAlert, BriefcaseBusiness, Building2, Lock } from 'lucide-react';
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

// Shown inline (never a navigation away) whenever a monthly Opportunity
// entitlement is hit — preserves whatever draft/form the caller had open,
// since the caller only swaps this view in without touching its own state.
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

  // Creator can't apply for Opportunities at all (limit is 0) -- a
  // distinct message from the "you've used your monthly cap" case below,
  // which still applies to Creator+.
  if (plan === 'creator' && kind === 'applications') {
    return (
      <div className="px-5 py-6 space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto"><Lock className="w-6 h-6 text-blue-600" /></div>
          <p className="text-base font-black text-gray-900">Creator+ Required</p>
          <p className="text-sm text-gray-500">
            You need a Creator+ account to apply for Opportunities.
            Upgrade to Creator+ to unlock Opportunity applications.
          </p>
        </div>
        <button onClick={onUpgradeToCreatorPlus} className="w-full py-3 rounded-2xl bg-blue-600 text-white font-bold text-sm">
          Upgrade to Creator+
        </button>
        <button onClick={onMaybeLater} className="w-full py-2 text-gray-400 font-semibold text-xs">Not now</button>
      </div>
    );
  }

  if (plan === 'professional') {
    return (
      <div className="px-5 py-6 space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto"><CircleAlert className="w-6 h-6 text-amber-500" /></div>
          <p className="text-base font-black text-gray-900">Opportunity limit reached</p>
          <p className="text-sm text-gray-500">
            You've used all {limit} Opportunity {nounPlural} included with Professional this month.
          </p>
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
        <p className="text-base font-black text-gray-900">Opportunity limit reached</p>
        <p className="text-sm text-gray-500">
          {kind === 'applications'
            ? `You've reached your monthly Opportunity application limit.`
            : `You've reached your monthly Opportunity posting limit.`}
          {' '}Creator and Creator+ accounts can {kind === 'applications' ? 'submit' : 'publish'} up to {limit} Opportunit{limit === 1 ? 'y' : 'ies'} per month.
        </p>
      </div>

      {isPosts && limit !== null && <UsageBar used={limit} limit={limit} />}

      <div className="rounded-2xl border-2 border-purple-200 bg-purple-50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="w-4 h-4 text-purple-600" />
          <p className="text-sm font-black text-purple-700">PROFESSIONAL</p>
        </div>
        <p className="text-sm font-black text-gray-900">{formatPrice(ENTITLEMENTS.professional.priceCents)} CAD / month</p>
        <p className="text-xs text-gray-600">{ENTITLEMENTS.professional.posts} Opportunity {nounPlural} / month</p>
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
