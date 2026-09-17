// Trust Score Details page -- reached via the Trust Score card's "View
// details" on Profile.tsx / HostProfile.tsx. Per spec: shows the overall
// /100 score plus exactly three metrics (Professional Connections,
// Recommendations, Successful Transactions), always rendered even when
// zero -- unlike the old granular "Trust & Verification" breakdown this
// replaces (identity banner, tier badge, and a 4-way rentals/buy-sell/
// services/opportunities split), a zero here is meaningful: it shows the
// viewer exactly what currently does and doesn't contribute to the score.
// Full-screen push page, same right-to-left motion system as the Edit
// Profile / Education overlays (styles/motion.css).
import { useEffect, useState } from 'react';
import { ChevronLeft, Users, Star, Briefcase } from 'lucide-react';
import { getTrustProfile, type TrustProfile } from '../../lib/trustApi';

export function TrustProfileOverlay({ userId, closing, onClose }: {
  userId: string; closing: boolean; onClose: () => void;
}) {
  const [trust, setTrust] = useState<TrustProfile | null>(null);
  useEffect(() => { getTrustProfile(userId).then(setTrust).catch(() => {}); }, [userId]);

  const completedTransactions = trust
    ? trust.completedRentals + trust.completedBuySell + trust.completedPaidServices + trust.completedPaidOpportunities
    : 0;

  const metrics = [
    { label: 'Professional Connections', value: trust?.validConnections ?? 0, Icon: Users },
    { label: 'Recommendations', value: trust?.validRecommendations ?? 0, Icon: Star },
    { label: 'Successful Transactions', value: completedTransactions, Icon: Briefcase },
  ];

  return (
    <div className={`fixed inset-0 z-[75] bg-white flex flex-col ${closing ? 'push-page-exit' : 'push-page-enter'}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-50 -ml-1.5">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <p className="text-sm font-bold text-gray-900">Trust Score</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="text-center pt-8 pb-6 px-4">
          <p className="text-4xl font-black text-gray-900">
            {trust?.reliabilityScore ?? 0}<span className="text-xl font-bold text-gray-300"> / 100</span>
          </p>
        </div>

        <div className="max-w-md mx-auto px-4 space-y-3 pb-8">
          {metrics.map(({ label, value, Icon }) => (
            <div key={label} className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-500">{label}</p>
                <p className="text-lg font-black text-gray-900">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
