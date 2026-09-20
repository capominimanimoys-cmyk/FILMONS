// Home -> Portfolio mode feed card. Reads real portfolio_items/
// portfolio_albums data (via getPortfolioFeed() in lib/portfolioApi.ts) --
// deliberately NOT the generic `posts`/PostCard system Home's Portfolio
// feed used before this. Likes and comments reuse portfolioApi's existing
// portfolio_item_likes/portfolio_item_comments functions (toggleItemLike,
// getItemComments, addItemComment) -- a completely separate engagement
// system from marketplace listings AND from posts' own likes/comments.
// Save reuses the generic `favorites` table (see togglePortfolioSave) --
// the same primitive savedPostsApi/savedListingsApi already use with a
// different item_type, not a new table.
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { usePortfolioPreview } from '../context/PortfolioPreviewContext';
import {
  Heart, MessageCircle, Send, Bookmark, Play, X, MoreHorizontal,
  BadgeCheck, UserPlus, UserCheck, ExternalLink, ChevronRight,
  User, Share2, Flag, Trash2, FolderCog,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFollow } from '../context/FollowContext';
import { UserAvatar } from './AccountTypeBadge';
import { BottomSheet, SheetCancel } from './BottomSheet';
import { PortfolioItemActionSheet } from './PortfolioItemActionSheet';
import { toast } from 'sonner';
import {
  PortfolioFeedEntry, PortfolioItem, PortfolioFeedPreviewItem,
  toggleItemLike, isItemLiked, toggleAlbumLike, isAlbumLiked, getAlbumItems,
  isPortfolioSaved, togglePortfolioSave, deleteAlbum,
  reportPortfolioContent, logPortfolioEngagementEvent,
} from '../lib/portfolioApi';
import { logPortfolioInteraction } from '../lib/personalization';
import { logProfileEngagement } from '../lib/profileEngagement';
import { TrustBadge } from './trust/TrustBadge';
import { TrustDetailsSheet } from './trust/TrustDetailsSheet';
import { TrustProfileOverlay } from './trust/TrustProfileOverlay';
import type { TrustLevel } from '../lib/trustApi';
import { PortfolioMedia } from './PortfolioMedia';
import { PortfolioItemFocusView } from './PortfolioItemFocusView';
import { PortfolioCommentSheet, timeAgo } from './PortfolioCommentSheet';
import { ViewPortfolioLink } from './connect/ViewPortfolioLink';

function timeAgoShort(iso: string): string { return timeAgo(iso); }
function EngagementRow({
  liked, likesCount, commentsCount, saved, onToggleLike, onOpenComments, onShare, onToggleSave,
}: {
  liked: boolean; likesCount: number; commentsCount: number; saved: boolean;
  onToggleLike: () => void; onOpenComments: () => void; onShare: () => void; onToggleSave: () => void;
}) {
  return (
    <div className="flex items-center gap-5 pt-1">
      <button onClick={onToggleLike} className="flex items-center gap-1.5 text-sm text-gray-600">
        <Heart className={`w-5 h-5 ${liked ? 'text-red-500 fill-red-500' : 'text-gray-500'}`} />
        {likesCount > 0 && <span className="font-semibold">{likesCount}</span>}
      </button>
      <button onClick={onOpenComments} className="flex items-center gap-1.5 text-sm text-gray-600">
        <MessageCircle className="w-5 h-5 text-gray-500" />
        {commentsCount > 0 && <span className="font-semibold">{commentsCount}</span>}
      </button>
      <button onClick={onShare} className="flex items-center gap-1.5 text-sm text-gray-600">
        <Send className="w-5 h-5 text-gray-500" />
      </button>
      <button onClick={onToggleSave} className="ml-auto flex items-center text-sm text-gray-600">
        <Bookmark className={`w-5 h-5 ${saved ? 'text-gray-900 fill-gray-900' : 'text-gray-500'}`} />
      </button>
    </div>
  );
}

// ── Expandable "…more" clamp for titles/descriptions ────────────────────────
function ClampedText({ text, lines = 3 }: { text: string; lines?: number }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 140;
  return (
    <p className="text-sm text-gray-600 leading-snug">
      <span className={expanded ? '' : `line-clamp-${lines}`}>{text}</span>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="ml-1 text-gray-400 font-semibold text-xs align-baseline"
        >
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </p>
  );
}

function TagRow({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.slice(0, 6).map(t => (
        <span key={t} className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{t}</span>
      ))}
    </div>
  );
}

function CreatorHeader({
  entry, isOwn, onOpenMenu, trustLevel,
}: { entry: PortfolioFeedEntry; isOwn: boolean; onOpenMenu: () => void; trustLevel?: TrustLevel }) {
  const navigate = useNavigate();
  const { user, showGuestPrompt } = useAuth();
  const { isFollowing, isPending, follow, unfollow } = useFollow();
  const [showTrustDetails, setShowTrustDetails] = useState(false);
  const [trustProfileOpen, setTrustProfileOpen] = useState(false);
  const [trustProfileClosing, setTrustProfileClosing] = useState(false);
  const closeTrustProfile = () => {
    setTrustProfileClosing(true);
    setTimeout(() => { setTrustProfileOpen(false); setTrustProfileClosing(false); }, 260);
  };
  const c = entry.creator;
  const subline = [c.username ? `@${c.username}` : null, c.city].filter(Boolean).join(' · ');
  const following = isFollowing(c.id);

  const handleFollowClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { showGuestPrompt('Create your Filmons account to follow creators.', 'Sign up to follow'); return; }
    following ? unfollow(c.id) : follow(c.id);
  };

  return (
    <div className="flex items-center gap-2.5 w-full">
      {/* A `<div role="button">`, not a real <button> -- a nested TrustBadge
          button below needs its own independent tap target, and a <button>
          can't legally contain another <button> (browsers silently break
          the DOM structure, not just an a11y nitpick). */}
      <div
        role="button" tabIndex={0} onClick={() => navigate(`/host/${c.id}`)}
        onKeyDown={e => { if (e.key === 'Enter') navigate(`/host/${c.id}`); }}
        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
      >
        <UserAvatar user={{ id: c.id, name: c.name, avatar: c.avatar_url }} size={40} />
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
            {c.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
          </div>
          {subline && <p className="text-xs text-gray-400 truncate">{subline}</p>}
          {trustLevel && (
            <div className="mt-0.5" onClick={e => e.stopPropagation()}>
              <TrustBadge level={trustLevel} size="sm" onClick={() => setShowTrustDetails(true)} />
            </div>
          )}
        </div>
      </div>
      <span className="text-[11px] text-gray-400 shrink-0">{timeAgo(entry.created_at)}</span>
      {!isOwn && (
        <button
          onClick={handleFollowClick}
          disabled={isPending(c.id)}
          className={`shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
            following ? 'bg-gray-100 text-gray-700' : 'bg-blue-600 text-white'
          }`}
        >
          {following ? <><UserCheck className="w-3 h-3" /> Following</> : <><UserPlus className="w-3 h-3" /> Follow</>}
        </button>
      )}
      <button
        onClick={onOpenMenu}
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {showTrustDetails && createPortal(
        <TrustDetailsSheet
          userId={c.id}
          onClose={() => setShowTrustDetails(false)}
          onViewFullProfile={() => { setShowTrustDetails(false); setTrustProfileOpen(true); }}
        />,
        document.body,
      )}
      {(trustProfileOpen || trustProfileClosing) && createPortal(
        <TrustProfileOverlay userId={c.id} closing={trustProfileClosing} onClose={closeTrustProfile} />,
        document.body,
      )}
    </div>
  );
}

// ── Creator-header overflow menu -- a real BottomSheet (slide up from
// bottom, backdrop, drag-to-dismiss, safe-area padding, above every other
// page chrome via its z-[70] -- higher than TopBar/MobileBottomNav's z-40,
// so it always sits above the page regardless of Home's own auto-hide
// chrome state) rather than a floating dropdown, shared with every other
// action sheet in this app instead of a bespoke mobile-only implementation.
//
// Standalone items delegate entirely to PortfolioItemActionSheet -- the
// same shared component Portfolio.tsx's own grid uses, so "my item" is an
// identical menu (same actions, ordering, labels, handlers) no matter
// which page it's opened from. Albums keep their own simpler menu here
// (own: Manage/Share/Delete; someone else's: profile/portfolio/Share/
// Save/Report) -- unifying album menus wasn't part of this request.
function CardMenu({
  entry, isOwn, saved, onToggleSave, onShare, onClose, onRemoved, onViewItem,
}: {
  entry: PortfolioFeedEntry; isOwn: boolean; saved: boolean;
  onToggleSave: () => void; onShare: () => void; onClose: () => void;
  onRemoved: () => void; onViewItem: () => void;
}) {
  // A plain dispatcher, not itself a hook-using component -- entry.type
  // decides between two entirely separate components below (AlbumCardMenu
  // owns its own hooks) rather than an early-return-before-hooks inside one
  // function, which would violate the Rules of Hooks even though this
  // particular case (a stable `entry` prop for the component's whole
  // mounted lifetime) happens to never actually change branches at runtime.
  if (entry.type === 'item') {
    return (
      <PortfolioItemActionSheet
        item={entry.item}
        creatorId={entry.creator.id}
        isOwn={isOwn}
        onClose={onClose}
        onViewItem={onViewItem}
        onRemoved={onRemoved}
      />
    );
  }
  return (
    <AlbumCardMenu
      entry={entry} isOwn={isOwn} saved={saved}
      onToggleSave={onToggleSave} onShare={onShare} onClose={onClose} onRemoved={onRemoved}
    />
  );
}

function AlbumCardMenu({
  entry, isOwn, saved, onToggleSave, onShare, onClose, onRemoved,
}: {
  entry: Extract<PortfolioFeedEntry, { type: 'album' }>; isOwn: boolean; saved: boolean;
  onToggleSave: () => void; onShare: () => void; onClose: () => void; onRemoved: () => void;
}) {
  const navigate = useNavigate();
  const { openPortfolioPreview } = usePortfolioPreview();
  const { user, showGuestPrompt } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const run = (fn: () => void) => { onClose(); fn(); };

  const handleDelete = async () => {
    if (!window.confirm('Delete this album? Its photos/videos will stay in your portfolio, just ungrouped.')) return;
    setDeleting(true);
    const ok = await deleteAlbum(entry.album.id);
    setDeleting(false);
    if (!ok) { toast.error('Could not delete this album.'); return; }
    toast.success('Album deleted');
    onClose();
    onRemoved();
  };

  const handleReport = async () => {
    if (!user) { onClose(); showGuestPrompt('Create your Filmons account to report content.', 'Sign up'); return; }
    if (!window.confirm('Report this content to Filmons?')) return;
    const ok = await reportPortfolioContent(user.id, entry.album.id, 'portfolio_album');
    onClose();
    toast[ok ? 'success' : 'error'](ok ? 'Reported. Thanks for letting us know.' : 'Could not submit report. Please try again.');
  };

  return (
    <BottomSheet onClose={onClose}>
      <div className="px-2 py-1">
        {isOwn ? (
          <>
            <button onClick={() => run(() => navigate('/portfolio'))} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
              <FolderCog className="w-4 h-4 text-gray-400" /> Manage in Portfolio
            </button>
            <button onClick={() => run(onShare)} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
              <Share2 className="w-4 h-4 text-gray-400" /> Share
            </button>
            <div className="border-t border-gray-50 my-1" />
            <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting…' : 'Delete album'}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => run(() => navigate(`/host/${entry.creator.id}`))} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
              <User className="w-4 h-4 text-gray-400" /> View creator profile
            </button>
            <button onClick={() => run(() => { logProfileEngagement(entry.creator.id, 'view_portfolio_click', user?.id); openPortfolioPreview(entry.creator.id); })} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
              <ExternalLink className="w-4 h-4 text-gray-400" /> View portfolio
            </button>
            <button onClick={() => run(onShare)} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
              <Share2 className="w-4 h-4 text-gray-400" /> Share
            </button>
            <button onClick={() => run(onToggleSave)} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
              <Bookmark className={`w-4 h-4 ${saved ? 'text-gray-900 fill-gray-900' : 'text-gray-400'}`} /> {saved ? 'Unsave' : 'Save'}
            </button>
            <div className="border-t border-gray-50 my-1" />
            <button onClick={handleReport} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors">
              <Flag className="w-4 h-4" /> Report
            </button>
          </>
        )}
        <div className="border-t border-gray-50 mt-1" />
        <SheetCancel onClick={onClose} />
      </div>
    </BottomSheet>
  );
}

export function PortfolioFeedCard({ entry, onRemoved, trustLevel }: { entry: PortfolioFeedEntry; onRemoved: () => void; trustLevel?: TrustLevel }) {
  const { user, showGuestPrompt } = useAuth();
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [viewingItem, setViewingItem] = useState(false);
  const isOwn = !!user && user.id === entry.creator.id;

  // Engagement belongs to whichever entity the card actually represents --
  // an item's own like/comment for an item card, the ALBUM's own (not any
  // one member item's) for an album card. Was previously a documented
  // no-op for albums (always 0, tapping Like/Comment did nothing).
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(entry.type === 'item' ? (entry.item.likes_count ?? 0) : (entry.album.likes_count ?? 0));
  const [commentsCount] = useState(entry.type === 'item' ? (entry.item.comments_count ?? 0) : (entry.album.comments_count ?? 0));
  const [saved, setSaved] = useState(false);

  const saveTargetId = entry.type === 'item' ? entry.item.id : entry.album.id;
  const saveTargetType = entry.type === 'item' ? 'portfolio_item' as const : 'portfolio_album' as const;

  useEffect(() => {
    if (!user) return;
    if (entry.type === 'item') isItemLiked(entry.item.id, user.id).then(setLiked);
    else isAlbumLiked(entry.album.id, user.id).then(setLiked);
  }, [entry.type === 'item' ? entry.item.id : entry.album.id, user?.id]); // eslint-disable-line

  useEffect(() => {
    if (user) isPortfolioSaved(user.id, saveTargetId, saveTargetType).then(setSaved);
  }, [saveTargetId, saveTargetType, user?.id]);

  const handleToggleLike = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to like portfolio work.', 'Sign up to like posts'); return; }
    const next = !liked;
    setLiked(next);
    setLikesCount(c => c + (next ? 1 : -1));
    const ok = entry.type === 'item'
      ? await toggleItemLike(entry.item.id, user.id, !next, entry.creator.id)
      : await toggleAlbumLike(entry.album.id, user.id, !next);
    if (!ok) { setLiked(!next); setLikesCount(c => c + (next ? -1 : 1)); toast.error('Could not update like'); return; }
    const target = entry.type === 'item' ? { category: entry.item.category, subcategory: entry.item.subcategory } : { category: entry.album.category ?? '' };
    logPortfolioInteraction(user.id, target, next ? 'like' : 'unlike');
  };

  const handleToggleSave = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to save portfolio work.', 'Sign up to save'); return; }
    const next = !saved;
    setSaved(next);
    const ok = await togglePortfolioSave(user.id, saveTargetId, saveTargetType, !next, entry.creator.id);
    if (!ok) { setSaved(!next); toast.error('Could not update save'); return; }
    const target = entry.type === 'item'
      ? { category: entry.item.category, subcategory: entry.item.subcategory }
      : { category: entry.album.category ?? '' };
    logPortfolioInteraction(user.id, target, next ? 'save' : 'unsave');
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/portfolio/${entry.creator.id}`;
    // Only attributable to a specific item when this card IS one (not an
    // album card) -- portfolio_engagement_events.item_id is NOT NULL, and
    // there's no single item to credit an album/profile-level share to.
    if (itemForLikes) logPortfolioEngagementEvent(entry.creator.id, itemForLikes.id, 'share', user?.id);
    if (navigator.share) { navigator.share({ url, title: entry.creator.name }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { toast.error('Could not copy link'); }
  };

  return (
    <div className="bg-white rounded-[20px] border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5 space-y-2.5">
      <CreatorHeader entry={entry} isOwn={isOwn} onOpenMenu={() => setShowMenu(true)} trustLevel={trustLevel} />

      {entry.type === 'item' ? (
        <>
          {/* Caption (title/description) ABOVE media, never below -- same
              hierarchy as every other Connect card now. */}
          {entry.item.title && (
            <p onClick={() => setViewingItem(true)} className="text-sm font-bold text-gray-900 cursor-pointer">{entry.item.title}</p>
          )}
          {entry.item.description && <ClampedText text={entry.item.description} />}

          {/* Tapping the media opens THIS item's own full-screen detail
              (ItemFocusView) -- not the creator's page. Video keeps its own
              established tap-to-play-inline behavior unchanged
              (PortfolioMedia's own internal button), so the click-to-open-
              detail wrapper only applies to non-video media -- otherwise a
              single tap would both start playback AND open the detail view
              at once. ViewPortfolioLink below is the ONLY thing that
              navigates to the creator's general Portfolio page. */}
          <div
            onClick={entry.item.media_type !== 'video' ? () => setViewingItem(true) : undefined}
            className={entry.item.media_type !== 'video' ? 'cursor-pointer' : ''}
          >
            <PortfolioMedia item={entry.item} />
          </div>
          <TagRow tags={entry.item.tags ?? []} />
          <ViewPortfolioLink
            creatorId={entry.creator.id} creatorFirstName={entry.creator.name.split(' ')[0]} isOwn={isOwn}
            onNavigate={() => logProfileEngagement(entry.creator.id, 'view_portfolio_click', user?.id)}
          />
          <EngagementRow
            liked={liked} likesCount={likesCount} commentsCount={commentsCount} saved={saved}
            onToggleLike={handleToggleLike} onOpenComments={() => setShowComments(true)} onShare={handleShare} onToggleSave={handleToggleSave}
          />
        </>
      ) : (
        <>
          <p className="text-sm font-bold text-gray-900">{entry.album.title}</p>
          {(entry.album.description || entry.itemCount) && (
            <p className="text-xs text-gray-400">
              {entry.itemCount} item{entry.itemCount === 1 ? '' : 's'}
              {entry.album.description ? ` · ${entry.album.description}` : ''}
            </p>
          )}
          <AlbumMedia entry={entry} />
          <TagRow tags={entry.album.tags ?? []} />
          <ViewPortfolioLink creatorId={entry.creator.id} creatorFirstName={entry.creator.name.split(' ')[0]} isOwn={isOwn} />
          <EngagementRow
            liked={liked} likesCount={likesCount} commentsCount={commentsCount} saved={saved}
            onToggleLike={handleToggleLike} onOpenComments={() => setShowComments(true)} onShare={handleShare} onToggleSave={handleToggleSave}
          />
        </>
      )}

      {/* Portaled to document.body -- this card's own root div carries the
          .pop-stagger-card entrance animation (a `transform`, which per the
          CSS spec establishes a new containing block for any `position:
          fixed` descendant, and keeps doing so even after the animation
          finishes since `animation-fill-mode: both` leaves the final
          non-none transform value applied). A BottomSheet/full-screen
          overlay rendered as a normal DOM child of this card would
          therefore be positioned/clipped relative to the CARD's own box
          instead of the real viewport -- exactly the "menu looks attached
          to the card" bug. Portaling to body sidesteps this entirely,
          regardless of what any ancestor's transform/overflow/z-index does,
          same as Portfolio.tsx's own createPortal(<ItemActionsSheet/>...)
          pattern for its three-dot menu. */}
      {showComments && createPortal(
        entry.type === 'item' ? (
          <PortfolioCommentSheet itemId={entry.item.id} creatorId={entry.creator.id} itemCategory={entry.item.category} itemSubcategory={entry.item.subcategory} canModerate={isOwn} onClose={() => setShowComments(false)} />
        ) : (
          <PortfolioCommentSheet itemId={entry.album.id} targetType="album" creatorId={entry.creator.id} itemCategory={(entry.album as any).category} canModerate={isOwn} onClose={() => setShowComments(false)} />
        ),
        document.body,
      )}
      {showMenu && createPortal(
        <CardMenu
          entry={entry} isOwn={isOwn} saved={saved}
          onToggleSave={handleToggleSave} onShare={handleShare}
          onClose={() => setShowMenu(false)} onRemoved={onRemoved}
          onViewItem={() => setViewingItem(true)}
        />,
        document.body,
      )}
      {viewingItem && entry.type === 'item' && createPortal(
        <PortfolioItemFocusView item={entry.item} onClose={() => setViewingItem(false)} />,
        document.body,
      )}
    </div>
  );
}

function CollageThumb({ item, className = '' }: { item: PortfolioFeedPreviewItem; className?: string }) {
  return (
    <div className={`relative bg-gray-100 overflow-hidden ${className}`}>
      {item.url
        ? <img src={item.url} alt="" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎨</div>}
      {item.media_type === 'video' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/10">
          <div className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center">
            <Play className="w-3.5 h-3.5 text-gray-900 ml-0.5" fill="currentColor" />
          </div>
        </div>
      )}
    </div>
  );
}

// Album card -- eager editorial collage (large left + 2 stacked right, per
// the reference design) built from the feed's own previewItems (already
// fetched respecting portfolio_album_items.sort_order -- see
// getPortfolioFeed) rather than a single cover + count badge. Tapping the
// collage or "View album" opens the full, real ordered set of items
// in-place (lazy-fetched via the existing getAlbumItems()) without
// navigating away from the feed, so the feed's own scroll position is
// never disturbed.
function AlbumMedia({ entry }: { entry: Extract<PortfolioFeedEntry, { type: 'album' }> }) {
  const [expanded, setExpanded] = useState(false);
  const [albumItems, setAlbumItems] = useState<PortfolioItem[] | null>(null);
  const preview = entry.previewItems;
  const remaining = entry.itemCount - preview.length;

  const openAlbum = async () => {
    setExpanded(true);
    if (!albumItems) setAlbumItems(await getAlbumItems(entry.album.id));
  };

  return (
    <div className="space-y-2.5">
      <button onClick={openAlbum} className="block w-full rounded-2xl overflow-hidden" style={{ aspectRatio: preview.length <= 1 ? 4 / 5 : 4 / 3 }}>
        {preview.length === 0 ? (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center text-4xl opacity-30">📁</div>
        ) : preview.length === 1 ? (
          <CollageThumb item={preview[0]} className="w-full h-full" />
        ) : preview.length === 2 ? (
          <div className="grid grid-cols-2 gap-1 w-full h-full">
            <CollageThumb item={preview[0]} className="w-full h-full" />
            <CollageThumb item={preview[1]} className="w-full h-full" />
          </div>
        ) : (
          <div className="grid grid-cols-2 grid-rows-2 gap-1 w-full h-full">
            <CollageThumb item={preview[0]} className="row-span-2 w-full h-full" />
            <CollageThumb item={preview[1]} className="w-full h-full" />
            <div className="relative w-full h-full">
              <CollageThumb item={preview[2]} className="w-full h-full" />
              {remaining > 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                  <span className="text-white text-lg font-black">+{remaining}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </button>
      <button onClick={openAlbum} className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-800 text-xs font-bold flex items-center justify-center gap-0.5">
        View album <ChevronRight className="w-3.5 h-3.5" />
      </button>

      {expanded && (
        <div className="fixed inset-0 z-[65] bg-white overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-black text-gray-900 truncate">{entry.album.title}</p>
            <button onClick={() => setExpanded(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            {albumItems === null ? (
              <p className="text-center text-xs text-gray-400 py-10">Loading…</p>
            ) : (
              albumItems.map(item => <PortfolioMedia key={item.id} item={item} capHeight={false} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
