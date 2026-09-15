// Message/Follow for a non-owner viewing this profile -- was previously a
// `position: fixed` bar pinned above MobileBottomNav that hid/slid away
// together with the global chrome on scroll (ProfileStickyActionBar). Per
// explicit correction: these are profile-specific actions, not part of the
// global mobile navigation chrome, and must never be tied to the same
// scroll-hide state (chromeHidden/useMobileScrollChrome) that hides the
// FILMONS header and bottom nav -- they stay visible and simply scroll
// away naturally with the rest of the profile content, like any other
// section. Rendered in normal document flow (no `fixed`, no `bottom`
// offset, no hidden/translateY prop) right after ProfileHeader.
// md:hidden -- desktop already has Message/Follow inline in ProfileHeader's
// own action row (added alongside this), so this is mobile-only to avoid
// showing the same two actions twice on wider screens.
import { Loader2, MessageCircle, UserCheck, UserPlus, MoreHorizontal } from 'lucide-react';

export function ProfileViewerActions({
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
    <div className="md:hidden bg-white px-4 py-2.5 flex items-center gap-2">
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
