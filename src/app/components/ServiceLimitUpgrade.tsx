import { CircleAlert, BriefcaseBusiness, Building2 } from 'lucide-react';
import { ENTITLEMENTS, formatPrice, type LimitReachedInfo } from '../lib/entitlements';

// Shown inline (never a navigation away) when a Guest/Creator/Creator+
// account hits the 1-concurrent-active-Service cap -- unlike Opportunity's
// posts/applications (OpportunityLimitUpgrade.tsx), this isn't a resettable
// weekly/monthly quota, so there's no "resets next week" copy and no
// Creator-vs-Creator+ distinction: every tier below Professional sees the
// same message per spec.
export function ServiceLimitUpgrade({ limitReached, onUpgrade, onManage, onMaybeLater }: {
  limitReached: LimitReachedInfo;
  onUpgrade: (plan: 'professional' | 'business') => void;
  onManage: () => void;
  onMaybeLater: () => void;
}) {
  const { limit } = limitReached;
  return (
    <div className="px-5 py-6 space-y-4">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto"><CircleAlert className="w-6 h-6 text-amber-500" /></div>
        <p className="text-base font-black text-gray-900">You've reached your Service listing limit</p>
        <p className="text-sm text-gray-500">
          Your current plan allows you to publish {limit ?? 1} Service. Upgrade to Professional or Business to offer more services.
        </p>
      </div>

      <div className="rounded-2xl border-2 border-purple-200 bg-purple-50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="w-4 h-4 text-purple-600" />
          <p className="text-sm font-black text-purple-700">PROFESSIONAL</p>
        </div>
        <p className="text-sm font-black text-gray-900">{formatPrice(ENTITLEMENTS.professional.priceCents)} CAD / month</p>
        <p className="text-xs text-gray-600">Multiple Service listings</p>
        <button onClick={() => onUpgrade('professional')} className="w-full py-2.5 rounded-xl bg-purple-600 text-white font-bold text-sm">Upgrade to Professional</button>
      </div>

      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-amber-600" />
          <p className="text-sm font-black text-amber-700">BUSINESS</p>
        </div>
        <p className="text-sm font-black text-gray-900">{formatPrice(ENTITLEMENTS.business.priceCents)} CAD / month</p>
        <p className="text-xs text-gray-600">Multiple Service listings</p>
        <button onClick={() => onUpgrade('business')} className="w-full py-2.5 rounded-xl bg-amber-600 text-white font-bold text-sm">Upgrade to Business</button>
      </div>

      <button onClick={onManage} className="w-full py-3 rounded-2xl bg-gray-900 text-white font-bold text-sm">Manage my service</button>
      <button onClick={onMaybeLater} className="w-full py-2 text-gray-400 font-semibold text-xs">Maybe Later</button>
    </div>
  );
}
