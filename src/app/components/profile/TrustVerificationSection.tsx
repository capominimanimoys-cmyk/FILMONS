// Shared "Trust Score" card for Profile.tsx and HostProfile.tsx (both reach
// this through ProfileAllTab). Per spec: the main profile shows ONLY the
// overall /100 score -- Professional Connections, Recommendations, and
// Successful Transactions have moved to the dedicated Trust Score Details
// page (TrustProfileOverlay.tsx), reached via onOpenDetails. Reads the
// FILMONS Reliability Score via trustApi.ts; only ever displays a real,
// live score -- no private transaction names, payment amounts, or
// customer info.
import { CircleAlert } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { TrustProfile } from '../../lib/trustApi';
import { normalizeVerificationStatus, getVerificationCopy } from '../../lib/verification';

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

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
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

      <p className="text-sm font-black text-gray-900">Trust Score</p>
      <p className="text-3xl font-black text-gray-900 mt-1.5">
        {trust?.reliabilityScore ?? 0}<span className="text-base font-bold text-gray-300"> / 100</span>
      </p>
      <p className="text-xs text-gray-400 mt-1">Your FILMONS reputation score</p>

      <button onClick={onOpenDetails} className="text-xs font-bold text-blue-600 hover:underline mt-3">
        View details →
      </button>
    </section>
  );
}
