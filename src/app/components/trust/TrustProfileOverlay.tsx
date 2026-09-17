// Public "Trust & Verification" details page -- reached via "View full trust
// profile" / "View trust details". Explains WHY a creator has earned their
// trust status without exposing any private information (no payment
// amounts, no transaction counterparties, no internal verification
// progress). Full-screen push page, same right-to-left motion system as the
// Edit Profile / Education overlays (styles/motion.css).
import { useEffect, useState } from 'react';
import { ChevronLeft, Users, Star, Briefcase, ShieldCheck } from 'lucide-react';
import { TrustBadge } from './TrustBadge';
import { getTrustProfile, type TrustProfile } from '../../lib/trustApi';

const LEVEL_DESCRIPTION: Record<string, string> = {
  new:            'Just getting started on FILMONS.',
  building_trust: 'Building a track record on FILMONS.',
  reliable:       'A dependable presence on FILMONS.',
  trusted:        'Established FILMONS reliability.',
  elite:          'Highest FILMONS Trust Level.',
};

export function TrustProfileOverlay({ userId, closing, onClose }: {
  userId: string; closing: boolean; onClose: () => void;
}) {
  const [trust, setTrust] = useState<TrustProfile | null>(null);
  useEffect(() => { getTrustProfile(userId).then(setTrust).catch(() => {}); }, [userId]);

  const activity = trust ? [
    { label: 'Rentals', value: trust.completedRentals },
    { label: 'Buy / Sell', value: trust.completedBuySell },
    { label: 'Paid Services', value: trust.completedPaidServices },
    { label: 'Paid Opportunities', value: trust.completedPaidOpportunities },
  ].filter(a => a.value > 0) : [];

  return (
    <div className={`fixed inset-0 z-[75] bg-white flex flex-col ${closing ? 'push-page-exit' : 'push-page-enter'}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-50 -ml-1.5">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <p className="text-sm font-bold text-gray-900">Trust & Verification</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="text-center pt-8 pb-6 px-4">
          <TrustBadge level={trust?.trustLevel} size="lg" />
          <p className="text-xs text-gray-400 mt-3">{LEVEL_DESCRIPTION[trust?.trustLevel ?? 'new']}</p>
        </div>

        <div className="max-w-md mx-auto px-4 space-y-3 pb-8">
          {trust?.identityVerified && (
            <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="text-sm font-bold text-emerald-700">Identity Verified</p>
            </div>
          )}

          {/* Each row (icon + spacing included) is hidden entirely when its
              value is zero, not shown as "0" -- an empty stat reads as a
              negative signal, not evidence of trust. */}
          {!!trust?.validConnections && (
            <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-500">Professional Connections</p>
                <p className="text-lg font-black text-gray-900">{trust.validConnections} connections</p>
              </div>
            </div>
          )}

          {!!trust?.validRecommendations && (
            <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <Star className="w-4 h-4 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-500">Recommendations</p>
                <p className="text-lg font-black text-gray-900">{trust.validRecommendations} received</p>
              </div>
            </div>
          )}

          {activity.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                  <Briefcase className="w-4 h-4 text-gray-500" />
                </div>
                <p className="text-xs font-semibold text-gray-500">Successful Activity</p>
              </div>
              <div className="space-y-1 pl-12">
                {activity.map(a => (
                  <p key={a.label} className="text-sm text-gray-800"><span className="font-black">{a.value}</span> {a.label}</p>
                ))}
              </div>
            </div>
          )}

          {!trust?.validConnections && !trust?.validRecommendations && !activity.length && !trust?.identityVerified && (
            <p className="text-xs text-gray-400 text-center py-6">No trust evidence yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
