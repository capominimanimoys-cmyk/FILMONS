import { Check, Sparkles } from 'lucide-react';
import { AccountTier } from '../lib/reliabilityApi';
import { ENTITLEMENTS, formatPrice } from '../lib/entitlements';

// Shown inline (never a navigation away) whenever a monthly Opportunity
// entitlement is hit — preserves whatever draft/form the caller had open,
// since the caller only swaps this view in without touching its own state.
export function OpportunityLimitUpgrade({ kind, plan, limit, onUpgrade, onMaybeLater }: {
  kind: 'applications' | 'posts';
  plan: AccountTier;
  limit: number | null;
  onUpgrade: (plan: 'professional' | 'business') => void;
  onMaybeLater: () => void;
}) {
  const noun = kind === 'applications' ? 'application' : 'post';
  const nounPlural = kind === 'applications' ? 'applications' : 'posts';
  const actionLabel = kind === 'applications' ? 'applications' : 'posting';

  if (plan === 'professional') {
    return (
      <div className="px-5 py-6 text-center space-y-4">
        <p className="text-base font-black text-gray-900">
          {kind === 'applications' ? "You've reached your monthly application limit." : "You've reached your monthly Opportunity posting limit."}
        </p>
        <p className="text-sm text-gray-500">
          Your Professional plan includes {limit} Opportunity {nounPlural} per month.
          {' '}Upgrade to Business for unlimited {kind === 'applications' ? 'applications' : 'Opportunity posting'}.
        </p>
        <button onClick={() => onUpgrade('business')} className="w-full py-3.5 rounded-2xl bg-amber-600 text-white font-bold text-sm">
          Upgrade to Business
        </button>
        <button onClick={onMaybeLater} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">Maybe Later</button>
      </div>
    );
  }

  return (
    <div className="px-5 py-6 space-y-4">
      <div className="text-center space-y-1.5">
        <p className="text-base font-black text-gray-900 flex items-center justify-center gap-1.5">
          <Sparkles className="w-4 h-4 text-purple-500" /> Unlock more Opportunities
        </p>
        <p className="text-sm text-gray-500">
          {kind === 'applications'
            ? `You've used your ${limit} Opportunity ${nounPlural} for this month.`
            : `Your account can post up to ${limit} Opportunit${limit === 1 ? 'y' : 'ies'} per month.`}
        </p>
      </div>

      <div className="rounded-2xl border-2 border-purple-200 bg-purple-50 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-black text-purple-700">PROFESSIONAL</p>
          <p className="text-sm font-black text-gray-900">{formatPrice(ENTITLEMENTS.professional.priceCents)}/mo</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-600 flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-purple-600" /> {ENTITLEMENTS.professional.posts} Opportunity posts/month</p>
          <p className="text-xs text-gray-600 flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-purple-600" /> {ENTITLEMENTS.professional.applications} Opportunity applications/month</p>
        </div>
        <button onClick={() => onUpgrade('professional')} className="w-full py-2.5 rounded-xl bg-purple-600 text-white font-bold text-sm">Choose Professional</button>
      </div>

      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-black text-amber-700">BUSINESS</p>
          <p className="text-sm font-black text-gray-900">{formatPrice(ENTITLEMENTS.business.priceCents)}/mo</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-600 flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-amber-600" /> Unlimited Opportunity posts</p>
          <p className="text-xs text-gray-600 flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-amber-600" /> Unlimited Opportunity applications</p>
        </div>
        <button onClick={() => onUpgrade('business')} className="w-full py-2.5 rounded-xl bg-amber-600 text-white font-bold text-sm">Choose Business</button>
      </div>

      <button onClick={onMaybeLater} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">Maybe Later</button>
    </div>
  );
}
