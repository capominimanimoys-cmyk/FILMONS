// Shared "Trust & Verification" card for Profile.tsx and HostProfile.tsx --
// supersedes the old CreatorLevelSection (which wrapped the review-based
// ReliabilityCard/ReliabilityBadge, a differently-weighted, differently-named
// scoring system -- see src/app/components/ReliabilityScore.tsx). That older
// system is left untouched for whatever else still reads it; this section
// reads the new FILMONS Reliability Score (Connections/Recommendations/
// Transactions/Identity) via trustApi.ts instead.
//
// Only ever displays real counts -- no private transaction names, payment
// amounts, or customer info.
import { ShieldCheck, Users, Star, Briefcase, CircleAlert } from 'lucide-react';
import { useNavigate } from 'react-router';
import { TrustBadge } from '../trust/TrustBadge';
import type { TrustProfile } from '../../lib/trustApi';
import { normalizeVerificationStatus, getVerificationCopy } from '../../lib/verification';

const LEVEL_DESCRIPTION: Record<string, string> = {
  new:            'Just getting started on FILMONS.',
  building_trust: 'Building a track record on FILMONS.',
  reliable:       'A dependable presence on FILMONS.',
  trusted:        'Established FILMONS reliability.',
  elite:          'Highest FILMONS Trust Level.',
};

export function TrustVerificationSection({ trust, isOwner, accountType, isVerified, verificationStatus, onOpenDetails }: {
  trust: TrustProfile | null;
  isOwner?: boolean;
  accountType?: string;
  isVerified?: boolean;
  verificationStatus?: string;
  onOpenDetails: () => void;
}) {
  const navigate = useNavigate();

  // Scoped to plain "creator" -- Creator+/Professional/Business already have
  // their own trust signals and must not be affected by this nudge. Owner-
  // only: never rendered for a viewer (HostProfile.tsx doesn't pass isOwner).
  const showUnverifiedPrompt = isOwner && !isVerified && accountType === 'creator';
  const copy = showUnverifiedPrompt ? getVerificationCopy(normalizeVerificationStatus(verificationStatus, isVerified)) : null;

  const completedTransactions = trust
    ? trust.completedRentals + trust.completedBuySell + trust.completedPaidServices + trust.completedPaidOpportunities
    : 0;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-sm font-black text-gray-900 mb-3">Trust & Verification</p>

      {showUnverifiedPrompt && (
        <div className="mb-3 pb-3 border-b border-gray-50">
          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full w-fit">
            <CircleAlert className="w-2.5 h-2.5" /> {copy!.title}
          </span>
          <p className="text-xs text-gray-500 leading-relaxed mt-2">{copy!.body}</p>
          <div className="flex items-center gap-3 mt-2.5">
            <button onClick={() => navigate('/verification')}
              className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors px-3.5 py-2 rounded-lg">
              {copy!.ctaLabel}
            </button>
            <button onClick={() => navigate('/settings/verification')}
              className="text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors">
              Learn more →
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-gray-500" />
        </div>
        <div>
          <TrustBadge level={trust?.trustLevel} size="md" />
          <p className="text-[11px] text-gray-400 mt-1">{LEVEL_DESCRIPTION[trust?.trustLevel ?? 'new']}</p>
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        {trust?.identityVerified && (
          <p className="text-xs text-gray-600 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-emerald-500" /> Identity Verified
          </p>
        )}
        <p className="text-xs text-gray-600 flex items-center gap-1.5">
          <Users className="w-3 h-3 text-gray-400" /> {trust?.validConnections ?? 0} Professional Connections
        </p>
        <p className="text-xs text-gray-600 flex items-center gap-1.5">
          <Star className="w-3 h-3 text-gray-400" /> {trust?.validRecommendations ?? 0} Recommendations
        </p>
        <p className="text-xs text-gray-600 flex items-center gap-1.5">
          <Briefcase className="w-3 h-3 text-gray-400" /> {completedTransactions} Successful Transactions
        </p>
      </div>

      <button onClick={onOpenDetails} className="text-xs font-bold text-blue-600 hover:underline">
        View trust details →
      </button>
    </section>
  );
}
