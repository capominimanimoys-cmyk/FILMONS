// Quick Trust Details -- reachable by tapping a TrustBadge anywhere in the
// app (Home Portfolio/Listing cards, Profile, HostProfile). Reuses the
// shared BottomSheet, which already renders as a page-level bottom sheet on
// mobile and a compact centered modal on desktop (md: breakpoint) -- exactly
// the "mobile sheet / desktop popover" split the spec asks for, without a
// second implementation.
import { useEffect, useState } from 'react';
import { Users, Star, Briefcase, ShieldCheck } from 'lucide-react';
import { BottomSheet } from '../BottomSheet';
import { TrustBadge } from './TrustBadge';
import { getTrustProfile, type TrustProfile } from '../../lib/trustApi';

const LEVEL_DESCRIPTION: Record<string, string> = {
  new:            'Just getting started on FILMONS.',
  building_trust: 'Building a track record on FILMONS.',
  reliable:       'A dependable presence on FILMONS.',
  trusted:        'Established FILMONS reliability.',
  elite:          'Highest FILMONS Trust Level.',
};

export function TrustDetailsSheet({ userId, onClose, onViewFullProfile }: {
  userId: string;
  onClose: () => void;
  onViewFullProfile: () => void;
}) {
  const [trust, setTrust] = useState<TrustProfile | null>(null);

  useEffect(() => { getTrustProfile(userId).then(setTrust).catch(() => {}); }, [userId]);

  const completedTransactions = trust
    ? trust.completedRentals + trust.completedBuySell + trust.completedPaidServices + trust.completedPaidOpportunities
    : 0;

  return (
    <BottomSheet onClose={onClose} maxHeightVh={80}>
      <div className="px-5 pb-4 pt-2 text-center">
        <TrustBadge level={trust?.trustLevel} size="lg" />
        <p className="text-[11px] text-gray-400 mt-2">FILMONS Trust Badge</p>
        <p className="text-xs text-gray-500 mt-3 leading-relaxed max-w-[280px] mx-auto">
          This creator has built {trust && trust.reliabilityScore >= 40 ? 'a strong' : 'their'} reputation on FILMONS through
          connections, recommendations, completed work, and verification.
        </p>
      </div>

      <div className="border-t border-gray-100 divide-y divide-gray-50">
        {/* Zero-value rows are hidden entirely (icon + spacing included),
            not just zeroed out -- an empty "0 Connections" row reads as a
            negative signal for a New creator, when the point of this sheet
            is to show evidence of trust that exists, not what doesn't. */}
        {!!trust?.validConnections && <Row icon={Users} label="Connections" value={trust.validConnections} />}
        {!!trust?.validRecommendations && <Row icon={Star} label="Recommendations" value={trust.validRecommendations} />}
        {!!completedTransactions && <Row icon={Briefcase} label="Successful Transactions" value={completedTransactions} />}
        {/* Only shown when true -- publicly exposing "Not verified" here
            would leak account-management info that must stay owner-only
            (see the Profile "Not verified" banner's own privacy rule). */}
        {trust?.identityVerified && (
          <div className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-gray-400" />
              <p className="text-sm text-gray-700">Identity Verified</p>
            </div>
            <p className="text-xs font-bold text-emerald-600">✓ Verified</p>
          </div>
        )}
        {!trust?.validConnections && !trust?.validRecommendations && !completedTransactions && !trust?.identityVerified && (
          <p className="text-xs text-gray-400 text-center py-6">No trust evidence yet.</p>
        )}
      </div>

      <div className="px-5 pt-4 pb-2">
        <button onClick={onViewFullProfile}
          className="w-full py-3 bg-gray-900 hover:bg-black text-white text-sm font-bold rounded-xl transition-colors">
          View full trust profile →
        </button>
      </div>
    </BottomSheet>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-gray-400" />
        <p className="text-sm text-gray-700">{label}</p>
      </div>
      <p className="text-sm font-bold text-gray-900">{value}</p>
    </div>
  );
}
