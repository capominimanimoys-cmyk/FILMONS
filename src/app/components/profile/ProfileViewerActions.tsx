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
import { Loader2, MessageCircle, UserCheck, UserPlus, UserRoundPlus, Clock, MoreHorizontal } from 'lucide-react';
import type { ConnectionStatus } from '../../lib/connectionsApi';

export function ProfileViewerActions({
  isFollowing, isPending, confirmUnfollow, onFollow, onMessage, onMore,
  connectionStatus, onConnect,
}: {
  isFollowing: boolean;
  isPending: boolean;
  confirmUnfollow: boolean;
  onFollow: () => void;
  onMessage: () => void;
  onMore: () => void;
  /** Mobile's own copy of ProfileHeader's Connect button -- that one is
   * desktop-only (hidden md:flex), so without this Connect never appeared
   * on mobile at all despite being the primary networking action. */
  connectionStatus?: ConnectionStatus;
  onConnect?: () => void;
}) {
  return (
    <div className="md:hidden bg-white px-4 py-2.5 flex items-center gap-2">
      {onConnect && connectionStatus && (
        <button
          onClick={onConnect}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            connectionStatus === 'connected' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : connectionStatus === 'pending_sent' ? 'bg-gray-100 text-gray-500'
              : 'bg-blue-600 text-white'
          }`}
        >
          {connectionStatus === 'connected' ? <><UserCheck className="w-4 h-4" /> Connected</>
            : connectionStatus === 'pending_sent' ? <><Clock className="w-4 h-4" /> Pending</>
            : connectionStatus === 'pending_received' ? <><UserRoundPlus className="w-4 h-4" /> Respond</>
            : <><UserRoundPlus className="w-4 h-4" /> Connect</>}
        </button>
      )}
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
