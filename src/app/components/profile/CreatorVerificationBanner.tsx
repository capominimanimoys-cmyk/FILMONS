// Private, owner-only verification prompt for an unverified Creator. Never
// rendered on HostProfile.tsx (the viewer page) -- callers must gate on
// `isOwner && accountType === 'creator' && !isVerified` before mounting
// this at all; it does not re-check ownership itself, matching the pattern
// every other owner-only profile affordance in this codebase already uses
// (e.g. ProfileHeader's Edit Profile button, section Edit links).
import { Lock, CircleAlert, ChevronRight } from 'lucide-react';
import { CreatorVerificationStatus, getVerificationCopy } from '../../lib/verification';

export function CreatorVerificationBanner({ status, onVerify, onLearnMore }: {
  status: CreatorVerificationStatus;
  onVerify: () => void;
  onLearnMore: () => void;
}) {
  if (status === 'approved') return null;
  const copy = getVerificationCopy(status);

  return (
    <div className="mx-3 mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700/80 mb-2">
        <Lock className="w-3 h-3" /> This message is only visible to you
      </p>

      <div className="flex items-start gap-2.5">
        <div className="shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
          <CircleAlert className="w-4 h-4 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-gray-900">{copy.title}</p>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{copy.body}</p>

          <div className="flex items-center gap-2 mt-3">
            <button onClick={onVerify}
              className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors px-3.5 py-2 rounded-lg">
              {copy.ctaLabel}
            </button>
            <button onClick={onLearnMore}
              className="flex items-center gap-0.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors px-2 py-2">
              Learn more <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
