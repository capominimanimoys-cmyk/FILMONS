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
import {
  Heart, MessageCircle, Send, Bookmark, Play, X, MoreHorizontal,
  BadgeCheck, UserPlus, UserCheck, ExternalLink, ChevronRight, ChevronUp,
  User, Share2, Flag, Trash2, FolderCog, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFollow } from '../context/FollowContext';
import { UserAvatar } from './AccountTypeBadge';
import { BottomSheet, SheetCancel } from './BottomSheet';
import { PortfolioItemActionSheet } from './PortfolioItemActionSheet';
import { toast } from 'sonner';
import {
  PortfolioFeedEntry, PortfolioItem, PortfolioComment, PortfolioFeedPreviewItem,
  toggleItemLike, isItemLiked, getItemComments, addItemComment, getAlbumItems,
  isPortfolioSaved, togglePortfolioSave, deleteAlbum,
  reportPortfolioContent, toggleCommentLike, deleteItemComment,
} from '../lib/portfolioApi';
import { logPortfolioInteraction } from '../lib/personalization';

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
// Portfolio cards respect the creator's own upload -- a vertical portrait
// stays vertical, a widescreen video stays widescreen, never forced into
// one fixed shape the way a marketplace listing card is allowed to be.
// aspect_ratio comes from real stored width/height metadata captured at
// upload time (see AddPortfolioItemSheet.tsx / readImageDimensions /
// readVideoDimensions in portfolioApi.ts) so the card can reserve the
// correct space before the asset itself loads, preventing feed layout
// shift -- not measured from the live element here. MEDIA_MAX_HEIGHT caps
// an extremely tall upload from creating an excessively long feed card;
// object-contain (not cover) is what keeps that cap from cropping the
// image/video instead of just letterboxing it -- when the box's rendered
// ratio is unclamped (the common case), contain and cover are pixel-
// identical anyway, since the box already matches the media's own ratio.
const MEDIA_MAX_HEIGHT = 'max-h-[75vh] lg:max-h-[750px]';

function PortfolioMedia({ item, capHeight = true }: { item: PortfolioItem; capHeight?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const maxHeightClass = capHeight ? MEDIA_MAX_HEIGHT : '';
  if (item.media_type === 'video') {
    return (
      <div className={`relative w-full bg-black rounded-2xl overflow-hidden mx-auto ${maxHeightClass}`} style={{ aspectRatio: item.aspect_ratio || 16 / 9 }}>
        {playing ? (
          <video src={item.media_url} controls autoPlay muted className="w-full h-full object-contain" />
        ) : (
          <button onClick={() => setPlaying(true)} className="relative w-full h-full block">
            {item.thumbnail_url
              ? <img src={item.thumbnail_url} alt="" className="w-full h-full object-contain" />
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
    <div className={`w-full rounded-2xl overflow-hidden bg-gray-100 mx-auto ${maxHeightClass}`} style={{ aspectRatio: item.aspect_ratio || 4 / 5 }}>
      {(item.media_url || item.thumbnail_url)
        ? <img src={item.media_url || item.thumbnail_url} alt="" className="w-full h-full object-contain" />
        : <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">🎨</div>}
    </div>
  );
}

function timeAgoShort(iso: string): string { return timeAgo(iso); }

// ── One comment row (+ its replies, indented) ───────────────────────────────
function CommentRow({
  comment, depth = 0, onReply, onToggleLike, onDelete, canModerate, meId,
}: {
  comment: PortfolioComment; depth?: number;
  onReply: (c: PortfolioComment) => void;
  onToggleLike: (c: PortfolioComment) => void;
  onDelete: (c: PortfolioComment) => void;
  canModerate: boolean; meId?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwnComment = !!meId && comment.user_id === meId;
  const canDelete = isOwnComment || canModerate;

  return (
    <div className={depth > 0 ? 'ml-9 mt-2.5' : ''}>
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-gray-200 shrink-0 overflow-hidden">
          {comment.author?.avatar_url && <img src={comment.author.avatar_url} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-gray-900">{comment.author?.name ?? 'Filmons user'}</p>
          <p className="text-sm text-gray-800 leading-snug break-words">{comment.body}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-gray-400">{timeAgoShort(comment.created_at)}</span>
            <button onClick={() => onReply(comment)} className="text-[10px] font-bold text-gray-500">Reply</button>
            {comment.likes_count > 0 && <span className="text-[10px] text-gray-400">{comment.likes_count} like{comment.likes_count === 1 ? '' : 's'}</span>}
          </div>
        </div>
        <button onClick={() => onToggleLike(comment)} className="shrink-0 pt-0.5">
          <Heart className={`w-3.5 h-3.5 ${comment.liked ? 'text-red-500 fill-red-500' : 'text-gray-300'}`} />
        </button>
        {canDelete && (
          <div className="relative shrink-0">
            <button onClick={() => setMenuOpen(v => !v)} className="w-6 h-6 flex items-center justify-center text-gray-300">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-6 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 w-32">
                  <button
                    onClick={() => { setMenuOpen(false); onDelete(comment); }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {comment.replies.map(r => (
        <CommentRow key={r.id} comment={r} depth={depth + 1} onReply={onReply} onToggleLike={onToggleLike} onDelete={onDelete} canModerate={canModerate} meId={meId} />
      ))}
    </div>
  );
}

// ── Comments bottom sheet -- portfolio's own comment table
// (portfolio_item_comments), not posts' CommentSheet. Reuses the shared
// BottomSheet (same slide-up/backdrop/drag-to-dismiss motion as the card's
// three-dot menu, per spec) rather than a bespoke overlay -- was a plain
// `fixed inset-0` div before this, now consistent with every other sheet
// in the app. Newest top-level page loads first (reversed for oldest-at-
// top display); "Load earlier comments" pages further back in time.
// canModerate = the viewer owns the portfolio this item belongs to (item
// owners can delete any comment on their own work, not just their own). ──
function PortfolioCommentSheet({
  itemId, itemCategory, itemSubcategory, canModerate, onClose,
}: {
  itemId: string; itemCategory?: string; itemSubcategory?: string; canModerate: boolean; onClose: () => void;
}) {
  const { user, showGuestPrompt } = useAuth();
  const [comments, setComments] = useState<PortfolioComment[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<PortfolioComment | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const countAll = (list: PortfolioComment[]) => list.reduce((n, c) => n + 1 + c.replies.length, 0);

  useEffect(() => {
    getItemComments(itemId, { viewerId: user?.id }).then(({ comments: c, hasMore: hm }) => {
      setComments(c);
      setHasMore(hm);
      setCount(countAll(c));
    });
  }, [itemId]); // eslint-disable-line

  const loadEarlier = async () => {
    if (!comments?.length || loadingMore) return;
    setLoadingMore(true);
    const oldestCursor = comments[0].created_at;
    const { comments: more, hasMore: hm } = await getItemComments(itemId, { before: oldestCursor, viewerId: user?.id });
    setLoadingMore(false);
    setHasMore(hm);
    setComments(prev => {
      const merged = [...more, ...(prev ?? [])];
      setCount(countAll(merged));
      return merged;
    });
  };

  const post = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to comment.', 'Sign up to comment'); return; }
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true);
    const c = await addItemComment(itemId, user.id, body, replyingTo?.id);
    setPosting(false);
    if (!c) { toast.error('Could not post comment'); return; }
    const withAuthor: PortfolioComment = { ...c, author: { id: user.id, name: user.name, username: user.username ?? null, avatar_url: user.avatar ?? null } };
    setComments(prev => {
      const base = prev ?? [];
      const merged = replyingTo
        ? base.map(p => p.id === replyingTo.id ? { ...p, replies: [...p.replies, withAuthor] } : p)
        : [...base, withAuthor];
      setCount(countAll(merged));
      return merged;
    });
    setText('');
    setReplyingTo(null);
    logPortfolioInteraction(user.id, itemCategory ? { category: itemCategory, subcategory: itemSubcategory } : null, 'comment');
  };

  const handleToggleLike = async (c: PortfolioComment) => {
    if (!user) { showGuestPrompt('Create your Filmons account to like comments.', 'Sign up to like'); return; }
    const next = !c.liked;
    let snapshot: PortfolioComment[] | null = null;
    setComments(prev => {
      snapshot = prev;
      if (!prev) return prev;
      return prev.map(row => {
        if (row.id === c.id) return { ...row, liked: next, likes_count: Math.max(0, row.likes_count + (next ? 1 : -1)) };
        if (row.replies.some(r => r.id === c.id)) {
          return { ...row, replies: row.replies.map(r => r.id === c.id ? { ...r, liked: next, likes_count: Math.max(0, r.likes_count + (next ? 1 : -1)) } : r) };
        }
        return row;
      });
    });
    const ok = await toggleCommentLike(c.id, user.id, c.liked);
    if (!ok) { toast.error('Could not update like'); setComments(snapshot); }
  };

  const handleDelete = async (c: PortfolioComment) => {
    if (!window.confirm('Delete this comment?')) return;
    const ok = await deleteItemComment(c.id);
    if (!ok) { toast.error('Could not delete comment'); return; }
    setComments(prev => {
      if (!prev) return prev;
      const merged = prev
        .filter(row => row.id !== c.id)
        .map(row => ({ ...row, replies: row.replies.filter(r => r.id !== c.id) }));
      setCount(countAll(merged));
      return merged;
    });
  };

  return (
    <BottomSheet
      onClose={onClose}
      title={count != null && count > 0 ? `Comments · ${count}` : 'Comments'}
      maxHeightVh={85}
      footer={
        <div>
          {replyingTo && (
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-[11px] text-gray-500">Replying to <b>{replyingTo.author?.name ?? 'comment'}</b></span>
              <button onClick={() => setReplyingTo(null)} className="text-[11px] font-bold text-gray-400">Cancel</button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0 overflow-hidden">
              {user?.avatar && <img src={user.avatar} alt="" className="w-full h-full object-cover" />}
            </div>
            <textarea
              ref={inputRef}
              value={text} onChange={e => setText(e.target.value)}
              placeholder={replyingTo ? 'Write a reply…' : 'Add a comment…'}
              rows={1}
              className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm outline-none resize-none max-h-24"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); post(); } }}
            />
            <button onClick={post} disabled={!text.trim() || posting} className="w-9 h-9 rounded-full bg-blue-600 disabled:opacity-40 flex items-center justify-center shrink-0">
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      }
    >
      <div className="px-4 py-3 min-h-[55vh] space-y-3.5">
        {comments === null ? (
          <p className="text-center text-xs text-gray-400 py-10">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-10">No comments yet. Be the first to say something.</p>
        ) : (
          <>
            {hasMore && (
              <button onClick={loadEarlier} disabled={loadingMore} className="flex items-center gap-1 mx-auto text-xs font-bold text-gray-400 hover:text-gray-600">
                <ChevronUp className="w-3.5 h-3.5" /> {loadingMore ? 'Loading…' : 'Load earlier comments'}
              </button>
            )}
            {comments.map(c => (
              <CommentRow
                key={c.id} comment={c}
                onReply={cm => { setReplyingTo(cm); inputRef.current?.focus(); }}
                onToggleLike={handleToggleLike}
                onDelete={handleDelete}
                canModerate={canModerate}
                meId={user?.id}
              />
            ))}
          </>
        )}
      </div>
    </BottomSheet>
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
  const [viewingItem, setViewingItem] = useState(false);
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
    if (!ok) { setLiked(!next); setLikesCount(c => c + (next ? -1 : 1)); toast.error('Could not update like'); return; }
    logPortfolioInteraction(user.id, { category: itemForLikes.category, subcategory: itemForLikes.subcategory }, next ? 'like' : 'unlike');
  };

  const handleToggleSave = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to save portfolio work.', 'Sign up to save'); return; }
    const next = !saved;
    setSaved(next);
    const ok = await togglePortfolioSave(user.id, saveTargetId, saveTargetType, !next);
    if (!ok) { setSaved(!next); toast.error('Could not update save'); return; }
    const target = entry.type === 'item'
      ? { category: entry.item.category, subcategory: entry.item.subcategory }
      : { category: entry.album.category ?? '' };
    logPortfolioInteraction(user.id, target, next ? 'save' : 'unsave');
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
          {/* Tapping the media/title opens THIS item's own full-screen
              detail (ItemFocusView) -- not the creator's page. Video keeps
              its own established tap-to-play-inline behavior unchanged
              (PortfolioMedia's own internal button), so the click-to-open-
              detail wrapper only applies to non-video media -- otherwise a
              single tap would both start playback AND open the detail view
              at once. "View portfolio" below is the ONLY thing that
              navigates to the creator's general Portfolio page. */}
          <div
            onClick={entry.item.media_type !== 'video' ? () => setViewingItem(true) : undefined}
            className={entry.item.media_type !== 'video' ? 'cursor-pointer' : ''}
          >
            <PortfolioMedia item={entry.item} />
          </div>
          <EngagementRow
            liked={liked} likesCount={likesCount} commentsCount={commentsCount} saved={saved}
            onToggleLike={handleToggleLike} onOpenComments={() => setShowComments(true)} onShare={handleShare} onToggleSave={handleToggleSave}
          />
          {entry.item.title && (
            <p onClick={() => setViewingItem(true)} className="text-sm font-bold text-gray-900 cursor-pointer">{entry.item.title}</p>
          )}
          {entry.item.description && <ClampedText text={entry.item.description} />}
          <TagRow tags={entry.item.tags ?? []} />
          {/* Always the creator's general Portfolio page -- clicking the
              media/title above is what opens the specific item's own
              detail view instead. */}
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
      {showComments && entry.type === 'item' && createPortal(
        <PortfolioCommentSheet itemId={entry.item.id} itemCategory={entry.item.category} itemSubcategory={entry.item.subcategory} canModerate={isOwn} onClose={() => setShowComments(false)} />,
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
        <ItemFocusView item={entry.item} onClose={() => setViewingItem(false)} />,
        document.body,
      )}
    </div>
  );
}

// ── Full-screen focus view for a single item ("View Item") -- an immersive
// overlay, not a route: the underlying feed is never unmounted, so scroll
// position and the active For You/Following tab are preserved automatically
// just by closing this rather than needing any explicit restore logic.
// Hides the global TopBar/MobileBottomNav for the duration via the same
// 'filmons:home-bars-hidden' window event Home.tsx's own auto-hide-on-
// scroll already dispatches (TopBar/MobileBottomNav/Root.tsx all already
// listen for it) -- always cleared on unmount so it can never linger past
// this view closing. Slide-in-from-the-right / slide-out-to-the-right
// motion mirrors this app's .page-enter-forward convention but needs its
// own mount/unmount-timed show state (that CSS class only plays once on
// mount and has no matching exit animation).
function ItemFocusView({ item, onClose }: { item: PortfolioItem; onClose: () => void }) {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: true } }));
    logPortfolioInteraction(user?.id, { category: item.category, subcategory: item.subcategory }, 'view');
    return () => { window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: false } })); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    setShow(false);
    setTimeout(onClose, 320);
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black flex flex-col"
      style={{
        transform: show ? 'translateX(0)' : 'translateX(100%)',
        opacity: show ? 1 : 0,
        transition: show ? 'transform 350ms ease-out, opacity 350ms ease-out' : 'transform 280ms ease-in, opacity 280ms ease-in',
      }}
    >
      <div className="px-4 py-3 shrink-0" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <button
          onClick={close}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-3">
          {/* Uncapped -- "the full original media can be shown when the
              user opens the Portfolio item detail" (the feed's own height
              cap is specifically about keeping the compact feed dense, not
              a constraint that should follow the media into its own
              detail view). */}
          <PortfolioMedia item={item} capHeight={false} />
          {item.title && <p className="text-sm font-bold text-white">{item.title}</p>}
          {item.description && <p className="text-sm text-white/70 leading-snug">{item.description}</p>}
        </div>
      </div>
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
