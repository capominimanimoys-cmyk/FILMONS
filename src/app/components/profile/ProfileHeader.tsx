// Shared cover/avatar/identity header for both Profile.tsx (owner) and
// HostProfile.tsx (viewer). The actual photo-upload sheets (AvatarActionSheet,
// AvatarFullScreen, CoverActionSheet) stay owned by the page -- this
// component only exposes onTapCover/onTapAvatar callbacks, so it doesn't
// need to duplicate any upload logic to stay presentational.
//
// Deviation from the literal spec text (flagged to the user in the plan):
// Follow/Message live in the sticky bottom bar for a viewer, not here too --
// putting the same two actions in both places was redundant. This header's
// viewer-mode action row is Share + 3-dot only.
import { ShieldCheck, CircleAlert, MessageCircle, UserCheck, UserPlus, Loader2, UserRoundPlus, Clock } from 'lucide-react';
import { AccountTypeBadge } from '../AccountTypeBadge';
import { TrustBadge } from '../trust/TrustBadge';
import type { TrustLevel } from '../../lib/trustApi';
import type { ConnectionStatus } from '../../lib/connectionsApi';
import { ProfileStatsRow } from './ProfileStatsRow';

export function ProfileHeader({
  coverPhoto, avatar, name, username, isVerified, accountType, primaryRole, bio, location,
  trustLevel, onTapTrustBadge,
  isOwner, onTapCover, onTapAvatar, onEditProfile, onShare, onMenu,
  isFollowing, isPending, onFollow, onMessage,
  connectionStatus, onConnect,
  connectionCount, followerCount, followingCount, interactionCount, onTapConnections, onTapFollowers, onTapFollowing, onTapInteraction,
}: {
  coverPhoto?: string | null;
  avatar?: string | null;
  name: string;
  username?: string | null;
  isVerified?: boolean;
  accountType?: string;
  primaryRole?: string;
  bio?: string;
  location?: string;
  /** The unified FILMONS Trust Badge -- see trustApi.ts. Only the level is
   * ever shown here (never the underlying score/breakdown), per spec: "The
   * Profile header should show the Trust Level, not the entire calculation." */
  trustLevel?: TrustLevel | string | null;
  onTapTrustBadge?: () => void;
  isOwner: boolean;
  onTapCover?: () => void;
  onTapAvatar?: () => void;
  onEditProfile?: () => void;
  onShare: () => void;
  /** Owner-mode only now -- HostProfile.tsx (viewer) no longer passes this,
   * so the 3-dot button next to Share simply doesn't render there (it
   * duplicated the header's own Share action with a second, different
   * share mechanism). Profile.tsx (owner) still passes it for its own menu. */
  onMenu?: () => void;
  /** Viewer-mode only. ProfileStickyActionBar already covers Follow/Message
   * on mobile (md:hidden) -- these render Follow/Message here too, but only
   * at md: and up, so desktop (which never shows the mobile sticky bar)
   * isn't left with no way to follow or message at all. */
  isFollowing?: boolean;
  isPending?: boolean;
  onFollow?: () => void;
  onMessage?: () => void;
  /** Viewer-mode only -- a real accepted Professional Connection, distinct
   * from Follow. Omit (leave undefined) to hide the Connect button entirely. */
  connectionStatus?: ConnectionStatus;
  onConnect?: () => void;
  // Stats row -- rendered directly inside this header, right under the
  // identity block, per spec ("Move these three stats directly into the
  // Profile header area"). Shared ProfileStatsRow so Profile.tsx and
  // HostProfile.tsx can never drift on placement/behavior.
  connectionCount?: number | null;
  followerCount: number | null;
  followingCount: number | null;
  interactionCount: number | null;
  onTapConnections?: () => void;
  onTapFollowers: () => void;
  onTapFollowing: () => void;
  onTapInteraction?: () => void;
}) {
  return (
    <div className="relative bg-white">
      {/* Cover */}
      <div
        className={`relative h-40 overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 ${isOwner ? 'cursor-pointer' : ''}`}
        onClick={isOwner ? onTapCover : undefined}
      >
        {coverPhoto && <img src={coverPhoto} alt="" className="w-full h-full object-cover" />}
      </div>

      <div className="px-3 pb-4">
        {/* Avatar overlapping cover -- relative z-10 is required here: the
            cover div above is `position: relative`, and CSS always paints
            positioned elements above static ones regardless of DOM order,
            so without this the (static) avatar row rendered BEHIND the
            cover photo even though it comes later in the markup. */}
        <div className="relative z-10 flex items-end justify-between -mt-10">
          <button onClick={isOwner ? onTapAvatar : undefined} className="shrink-0" disabled={!isOwner}>
            <div className="w-20 h-20 rounded-full border-4 border-white overflow-hidden bg-gray-200 shadow-lg">
              {avatar
                ? <img src={avatar} alt={name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-xl font-black text-gray-400">{name?.[0]?.toUpperCase() || '?'}</div>}
            </div>
          </button>

          {/* Action row */}
          <div className="flex items-center gap-1.5 pb-1">
            {isOwner && (
              <button onClick={onEditProfile} className="text-xs font-bold text-blue-600 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                Edit Profile
              </button>
            )}
            {!isOwner && onMessage && (
              <button onClick={onMessage} className="hidden md:flex items-center gap-1.5 text-xs font-bold text-white bg-gray-900 hover:bg-gray-800 px-3 py-1.5 rounded-lg transition-colors">
                <MessageCircle className="w-3.5 h-3.5" /> Message
              </button>
            )}
            {!isOwner && onFollow && (
              <button
                onClick={onFollow}
                disabled={isPending}
                className={`hidden md:flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                  isFollowing ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : isFollowing ? <><UserCheck className="w-3.5 h-3.5" /> Following</>
                  : <><UserPlus className="w-3.5 h-3.5" /> Follow</>}
              </button>
            )}
            {/* Connect is the primary professional networking action, per
                spec -- visible (and tappable) in every state including
                Connected, not hidden away once accepted. Desktop-only here
                (hidden md:flex) since mobile gets its own copy of this same
                button in ProfileViewerActions, ordered first there. */}
            {!isOwner && onConnect && connectionStatus && (
              <button
                onClick={onConnect}
                className={`hidden md:flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                  connectionStatus === 'connected' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                    : connectionStatus === 'pending_sent' ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {connectionStatus === 'connected' ? <><UserCheck className="w-3.5 h-3.5" /> Connected</>
                  : connectionStatus === 'pending_sent' ? <><Clock className="w-3.5 h-3.5" /> Pending</>
                  : connectionStatus === 'pending_received' ? <><UserRoundPlus className="w-3.5 h-3.5" /> Respond</>
                  : <><UserRoundPlus className="w-3.5 h-3.5" /> Connect</>}
              </button>
            )}
            <button onClick={onShare} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors" title="Share" aria-label="Share">
              <ShareIcon />
            </button>
            {onMenu && (
              <button onClick={onMenu} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors" title="More" aria-label="More">
                <MoreIcon />
              </button>
            )}
          </div>
        </div>

        {/* Identity */}
        <div className="mt-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h1 className="text-lg font-black text-gray-900">{name}</h1>
            <AccountTypeBadge type={accountType as any} size="sm" />
            {isVerified && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
                <ShieldCheck className="w-2.5 h-2.5" /> Verified
              </span>
            )}
            {/* Owner-only: a Creator's unverified status is account-management
                info, never shown on the public profile (isOwner is always
                false on HostProfile.tsx, the only place a non-owner views
                this header). Scoped to plain "creator" so Creator+/
                Professional/Business (which have their own trust signals)
                are unaffected. */}
            {isOwner && !isVerified && accountType === 'creator' && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                <CircleAlert className="w-2.5 h-2.5" /> Not verified
              </span>
            )}
          </div>
          {(primaryRole) && <p className="text-xs font-semibold text-blue-600 mt-0.5">{primaryRole}</p>}
          {location && <p className="text-xs text-gray-400 mt-0.5">{location}</p>}
          {username && (
            <p className="text-xs text-gray-400 mt-0.5">@{username}</p>
          )}
          {trustLevel && (
            <div className="mt-1.5">
              <TrustBadge level={trustLevel} size="sm" onClick={onTapTrustBadge} />
            </div>
          )}
          {bio && <p className="text-sm text-gray-700 mt-2 leading-relaxed">{bio}</p>}
        </div>
      </div>

      {/* Stats -- full-bleed (outside the px-3 identity padding above), no
          border above/below/between (see ProfileStatsRow itself). */}
      <ProfileStatsRow
        connectionCount={connectionCount}
        followerCount={followerCount}
        followingCount={followingCount}
        interactionCount={interactionCount}
        onTapConnections={onTapConnections}
        onTapFollowers={onTapFollowers}
        onTapFollowing={onTapFollowing}
        onTapInteraction={onTapInteraction}
      />
    </div>
  );
}

function ShareIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
  );
}
