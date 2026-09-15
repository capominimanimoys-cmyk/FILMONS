// "Consider a compact sticky action area above the bottom navigation" --
// only rendered on HostProfile.tsx (viewer mode). Sits just above
// MobileBottomNav (which is `fixed bottom-0 z-40`) -- z-30 keeps it under
// the global nav's stacking, and the page adds matching bottom padding so
// this bar never covers page content. md:hidden -- desktop keeps the
// inline header actions only, no mobile-style sticky bar.
import { Loader2, MessageCircle, UserCheck, UserPlus, MoreHorizontal } from 'lucide-react';

export function ProfileStickyActionBar({
  isFollowing, isPending, confirmUnfollow, onFollow, onMessage, onMore,
}: {
  isFollowing: boolean;
  isPending: boolean;
  confirmUnfollow: boolean;
  onFollow: () => void;
  onMessage: () => void;
  onMore: () => void;
}) {
  return (
    <div
      className="fixed left-0 right-0 z-30 md:hidden bg-white/95 backdrop-blur-md px-4 py-2.5 flex items-center gap-2"
      style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}
    >
      <button
        onClick={onMessage}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold active:opacity-80"
      >
        <MessageCircle className="w-4 h-4" /> Message
      </button>
      <button
        onClick={onFollow}
        disabled={isPending}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
          confirmUnfollow ? 'bg-red-100 text-red-600' : isFollowing ? 'bg-gray-100 text-gray-700' : 'bg-blue-600 text-white'
        }`}
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" />
          : confirmUnfollow ? 'Unfollow?'
          : isFollowing ? <><UserCheck className="w-4 h-4" /> Following</>
          : <><UserPlus className="w-4 h-4" /> Follow</>}
      </button>
      <button onClick={onMore} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-gray-100 text-gray-700" aria-label="More">
        <MoreHorizontal className="w-4 h-4" />
      </button>
    </div>
  );
}
