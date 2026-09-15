// Wraps the existing ReliabilityCard/ReliabilityBadge (src/app/components/
// ReliabilityScore.tsx) -- this is that card's first LIVE use on the
// Profile page (it was already imported there but only ever rendered in
// unreachable dead code). Compact mode here per spec ("Keep this section
// compact"); "View score details" opens the same card's full (non-compact)
// mode, which already has its own internal events/badges expansion.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ReliabilityCard } from '../ReliabilityScore';
import { BottomSheet } from '../BottomSheet';
import { isCreatorPlus } from '../../lib/reliabilityApi';

export function CreatorLevelSection({ userId, accountType, isVerified }: {
  userId: string; accountType?: string; isVerified?: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900">Creator Level</p>
        {isVerified && isCreatorPlus(accountType) && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
            ✓ Verified Creator+
          </span>
        )}
      </div>
      <ReliabilityCard userId={userId} accountType={accountType} compact />
      <button onClick={() => setShowDetails(true)} className="mt-3 text-xs font-semibold text-blue-600 hover:underline">
        View score details →
      </button>

      {showDetails && createPortal(
        <BottomSheet onClose={() => setShowDetails(false)} maxHeightVh={90}>
          <div className="px-4 pb-2">
            <ReliabilityCard userId={userId} accountType={accountType} />
          </div>
        </BottomSheet>,
        document.body,
      )}
    </section>
  );
}
