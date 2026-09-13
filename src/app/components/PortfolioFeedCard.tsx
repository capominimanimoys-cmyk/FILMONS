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
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Heart, MessageCircle, Send, Bookmark, Play, X, MoreHorizontal,
  BadgeCheck, UserPlus, UserCheck, ExternalLink, ChevronRight,
  User, Share2, Flag, Trash2, FolderCog,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFollow } from '../context/FollowContext';
import { UserAvatar } from './AccountTypeBadge';
import { BottomSheet, SheetCancel } from './BottomSheet';
import { toast } from 'sonner';
import {
  PortfolioFeedEntry, PortfolioItem, PortfolioComment, PortfolioFeedPreviewItem,
  toggleItemLike, isItemLiked, getItemComments, addItemComment, getAlbumItems,
  isPortfolioSaved, togglePortfolioSave, deletePortfolioItem, deleteAlbum,
  reportPortfolioContent,
} from '../lib/portfolioApi';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

// ── Media renderer -- image / video (poster + tap-to-play) / audio ─────────
// Never stretches: the container's aspect-ratio comes from the item's own
// stored aspect_ratio (falls back to a sane default per media type) and the
// image/video itself is object-cover within that box, so orientation is
// respected instead of forcing every post into one fixed square.
function PortfolioMedia({ item }: { item: PortfolioItem }) {
  const [playing, setPlaying] = useState(false);
  if (item.media_type === 'video') {
    return (
      <div className="relative w-full bg-black rounded-2xl overflow-hidden" style={{ aspectRatio: item.aspect_ratio || 16 / 9 }}>
        {playing ? (
          <video src={item.media_url} controls autoPlay muted className="w-full h-full object-contain" />
        ) : (
          <button onClick={() => setPlaying(true)} className="relative w-full h-full block">
            {item.thumbnail_url
              ? <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">🎬</div>}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
                <Play className="w-6 h-6 text-gray-900 ml-0.5" fill="currentColor" />
              </div>
            </div>
          </button>
        )}
      </div>
    );
  }
  if (item.media_type === 'audio') {
    return (
      <div className="w-full rounded-2xl bg-gray-100 p-4">
        <audio src={item.media_url} controls className="w-full" />
      </div>
    );
  }
  // image / link -- link items still usually carry a preview thumbnail
  return (
    <div className="w-full rounded-2xl overflow-hidden bg-gray-100" style={{ aspectRatio: item.aspect_ratio || 4 / 5 }}>
      {(item.media_url || item.thumbnail_url)
        ? <img src={item.media_url || item.thumbnail_url} alt="" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">🎨</div>}
    </div>
  );
}

// ── Comment sheet -- minimal bottom sheet: view + add, portfolio's own
// comment table (portfolio_item_comments), not posts' CommentSheet. ───────
function PortfolioCommentSheet({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const { user, showGuestPrompt } = useAuth();
  const [comments, setComments] = useState<PortfolioComment[] | null>(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => { getItemComments(itemId).then(setComments); }, [itemId]);

  const post = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to comment.', 'Sign up to comment'); return; }
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true);
    const c = await addItemComment(itemId, user.id, body);
    setPosting(false);
    if (c) { setComments(prev => [...(prev ?? []), c]); setText(''); }
    else toast.error('Could not post comment');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end lg:items-center lg:justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full lg:max-w-md bg-white rounded-t-3xl lg:rounded-3xl max-h-[75vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-gray-100 shrink-0">
          <p className="text-sm font-black text-gray-900">Comments</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {comments === null ? (
            <p className="text-center text-xs text-gray-400 py-6">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-6">No comments yet.</p>
          ) : (
            comments.map(c => (
              <div key={c.id} className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gray-200 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-800 leading-snug">{c.body}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(c.created_at)}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 shrink-0" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <input
            value={text} onChange={e => setText(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm outline-none"
            onKeyDown={e => { if (e.key === 'Enter') post(); }}
          />
          <button onClick={post} disabled={!text.trim() || posting} className="w-9 h-9 rounded-full bg-blue-600 disabled:opacity-40 flex items-center justify-center shrink-0">
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

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
  entry, isOwn, onOpenMenu,
}: { entry: PortfolioFeedEntry; isOwn: boolean; onOpenMenu: () => void }) {
  const navigate = useNavigate();
  const { user, showGuestPrompt } = useAuth();
  const { isFollowing, isPending, follow, unfollow } = useFollow();
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
      <button onClick={() => navigate(`/host/${c.id}`)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
        <UserAvatar user={{ id: c.id, name: c.name, avatar: c.avatar_url }} size={40} />
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
            {c.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
          </div>
          {subline && <p className="text-xs text-gray-400 truncate">{subline}</p>}
        </div>
      </button>
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
    </div>
  );
}

// ── Creator-header overflow menu -- a real BottomSheet (slide up from
// bottom, backdrop, drag-to-dismiss, safe-area padding, above every other
// page chrome via its z-[70] -- higher than TopBar/MobileBottomNav's z-40,
// so it always sits above the page regardless of Home's own auto-hide
// chrome state) rather than a floating dropdown, shared with every other
// action sheet in this app (ItemActionsSheet, etc.) instead of a bespoke
// mobile-only implementation. Context-sensitive: own content swaps in
// manage/delete actions instead of follow-oriented ones a creator would
// never use on their own post.
//
// "Edit" / "Add to album" for own content deliberately route to the
// existing Portfolio management page instead of duplicating those flows
// here -- both already exist as real, working UI there (ItemActionsSheet's
// own album-context actions, AddPortfolioItemSheet), and forking a second
// implementation of them into the feed card risks exactly the kind of
// drift a shared codebase is supposed to avoid. Delete is simple and
// low-risk enough to wire directly instead.
function CardMenu({
  entry, isOwn, saved, onToggleSave, onShare, onClose, onRemoved,
}: {
  entry: PortfolioFeedEntry; isOwn: boolean; saved: boolean;
  onToggleSave: () => void; onShare: () => void; onClose: () => void;
  onRemoved: () => void;
}) {
  const navigate = useNavigate();
  const { user, showGuestPrompt } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const isAlbum = entry.type === 'album';

  const run = (fn: () => void) => { onClose(); fn(); };

  const handleDelete = async () => {
    const confirmMsg = isAlbum
      ? 'Delete this album? Its photos/videos will stay in your portfolio, just ungrouped.'
      : 'Delete this project? This action cannot be undone.';
    if (!window.confirm(confirmMsg)) return;
    setDeleting(true);
    const ok = isAlbum ? await deleteAlbum(entry.album.id) : await deletePortfolioItem(entry.item.id);
    setDeleting(false);
    if (!ok) { toast.error(`Could not delete this ${isAlbum ? 'album' : 'project'}.`); return; }
    toast.success(`${isAlbum ? 'Album' : 'Project'} deleted`);
    onClose();
    onRemoved();
  };

  const handleReport = async () => {
    if (!user) { onClose(); showGuestPrompt('Create your Filmons account to report content.', 'Sign up'); return; }
    if (!window.confirm('Report this content to Filmons?')) return;
    const targetId = isAlbum ? entry.album.id : entry.item.id;
    const ok = await reportPortfolioContent(user.id, targetId, isAlbum ? 'portfolio_album' : 'portfolio_item');
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
              <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting…' : `Delete ${isAlbum ? 'album' : 'project'}`}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => run(() => navigate(`/host/${entry.creator.id}`))} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
              <User className="w-4 h-4 text-gray-400" /> View creator profile
            </button>
            <button onClick={() => run(() => navigate(`/portfolio/${entry.creator.id}`))} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
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

export function PortfolioFeedCard({ entry, onRemoved }: { entry: PortfolioFeedEntry; onRemoved: () => void }) {
  const { user, showGuestPrompt } = useAuth();
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const isOwn = !!user && user.id === entry.creator.id;

  const itemForLikes = entry.type === 'item' ? entry.item : null;
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(itemForLikes?.likes_count ?? 0);
  const [commentsCount] = useState(itemForLikes?.comments_count ?? 0);
  const [saved, setSaved] = useState(false);

  const saveTargetId = entry.type === 'item' ? entry.item.id : entry.album.id;
  const saveTargetType = entry.type === 'item' ? 'portfolio_item' as const : 'portfolio_album' as const;

  useEffect(() => {
    if (itemForLikes && user) isItemLiked(itemForLikes.id, user.id).then(setLiked);
  }, [itemForLikes?.id, user?.id]);

  useEffect(() => {
    if (user) isPortfolioSaved(user.id, saveTargetId, saveTargetType).then(setSaved);
  }, [saveTargetId, saveTargetType, user?.id]);

  const handleToggleLike = async () => {
    if (!itemForLikes) return; // album cards don't carry their own like -- likes are per-item
    if (!user) { showGuestPrompt('Create your Filmons account to like portfolio work.', 'Sign up to like posts'); return; }
    const next = !liked;
    setLiked(next);
    setLikesCount(c => c + (next ? 1 : -1));
    const ok = await toggleItemLike(itemForLikes.id, user.id, !next);
    if (!ok) { setLiked(!next); setLikesCount(c => c + (next ? -1 : 1)); toast.error('Could not update like'); }
  };

  const handleToggleSave = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to save portfolio work.', 'Sign up to save'); return; }
    const next = !saved;
    setSaved(next);
    const ok = await togglePortfolioSave(user.id, saveTargetId, saveTargetType, !next);
    if (!ok) { setSaved(!next); toast.error('Could not update save'); }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/portfolio/${entry.creator.id}`;
    if (navigator.share) { navigator.share({ url, title: entry.creator.name }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { toast.error('Could not copy link'); }
  };

  return (
    <div className="bg-white rounded-[20px] border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5 space-y-2.5">
      <CreatorHeader entry={entry} isOwn={isOwn} onOpenMenu={() => setShowMenu(true)} />

      {entry.type === 'item' ? (
        <>
          <PortfolioMedia item={entry.item} />
          <EngagementRow
            liked={liked} likesCount={likesCount} commentsCount={commentsCount} saved={saved}
            onToggleLike={handleToggleLike} onOpenComments={() => setShowComments(true)} onShare={handleShare} onToggleSave={handleToggleSave}
          />
          {entry.item.title && <p className="text-sm font-bold text-gray-900">{entry.item.title}</p>}
          {entry.item.description && <ClampedText text={entry.item.description} />}
          <TagRow tags={entry.item.tags ?? []} />
          <button
            onClick={() => navigate(`/portfolio/${entry.creator.id}`)}
            className="flex items-center gap-0.5 text-xs font-bold text-blue-600"
          >
            View portfolio <ChevronRight className="w-3.5 h-3.5" />
          </button>
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
          <EngagementRow
            liked={liked} likesCount={likesCount} commentsCount={commentsCount} saved={saved}
            onToggleLike={handleToggleLike} onOpenComments={() => setShowComments(true)} onShare={handleShare} onToggleSave={handleToggleSave}
          />
          <TagRow tags={entry.album.tags ?? []} />
        </>
      )}

      {showComments && entry.type === 'item' && (
        <PortfolioCommentSheet itemId={entry.item.id} onClose={() => setShowComments(false)} />
      )}
      {showMenu && (
        <CardMenu
          entry={entry} isOwn={isOwn} saved={saved}
          onToggleSave={handleToggleSave} onShare={handleShare}
          onClose={() => setShowMenu(false)} onRemoved={onRemoved}
        />
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
              albumItems.map(item => <PortfolioMedia key={item.id} item={item} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
