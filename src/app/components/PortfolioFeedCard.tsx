// Home -> Portfolio mode feed card. Reads real portfolio_items/
// portfolio_albums data (via getPortfolioFeed() in lib/portfolioApi.ts) --
// deliberately NOT the generic `posts`/PostCard system Home's Portfolio
// feed used before this. Likes and comments reuse portfolioApi's existing
// portfolio_item_likes/portfolio_item_comments functions (toggleItemLike,
// getItemComments, addItemComment) -- a completely separate engagement
// system from marketplace listings AND from posts' own likes/comments.
//
// Save is intentionally NOT included -- there is no portfolio-item-save
// table in this schema yet (only savedPostsApi for posts and
// savedListingsApi for marketplace listings exist). Adding one wasn't part
// of this correction and would need its own migration; flagging rather
// than faking it with the wrong table.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Heart, MessageCircle, Share2, Play, Images, X, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserAvatar } from './AccountTypeBadge';
import { toast } from 'sonner';
import {
  PortfolioFeedEntry, PortfolioItem, PortfolioComment,
  toggleItemLike, isItemLiked, getItemComments, addItemComment, getAlbumItems,
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
  liked, likesCount, commentsCount, onToggleLike, onOpenComments, onShare,
}: { liked: boolean; likesCount: number; commentsCount: number; onToggleLike: () => void; onOpenComments: () => void; onShare: () => void }) {
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
        <Share2 className="w-5 h-5 text-gray-500" />
      </button>
    </div>
  );
}

function CreatorHeader({ entry }: { entry: PortfolioFeedEntry }) {
  const navigate = useNavigate();
  const c = entry.creator;
  const roleLocation = [c.primary_role, c.city].filter(Boolean).join(' · ');
  return (
    <button onClick={() => navigate(`/host/${c.id}`)} className="flex items-center gap-2.5 w-full text-left">
      <UserAvatar user={{ id: c.id, name: c.name, avatar: c.avatar_url }} size={38} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
        {roleLocation && <p className="text-xs text-gray-400 truncate">{roleLocation}</p>}
      </div>
      <span className="text-[11px] text-gray-400 shrink-0">{timeAgo(entry.created_at)}</span>
    </button>
  );
}

export function PortfolioFeedCard({ entry }: { entry: PortfolioFeedEntry }) {
  const { user, showGuestPrompt } = useAuth();
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(false);

  const itemForLikes = entry.type === 'item' ? entry.item : null;
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(itemForLikes?.likes_count ?? 0);
  const [commentsCount] = useState(itemForLikes?.comments_count ?? 0);

  useEffect(() => {
    if (itemForLikes && user) isItemLiked(itemForLikes.id, user.id).then(setLiked);
  }, [itemForLikes?.id, user?.id]);

  const handleToggleLike = async () => {
    if (!itemForLikes) return; // album cards don't carry their own like -- likes are per-item
    if (!user) { showGuestPrompt('Create your Filmons account to like portfolio work.', 'Sign up to like posts'); return; }
    const next = !liked;
    setLiked(next);
    setLikesCount(c => c + (next ? 1 : -1));
    const ok = await toggleItemLike(itemForLikes.id, user.id, !next);
    if (!ok) { setLiked(!next); setLikesCount(c => c + (next ? -1 : 1)); toast.error('Could not update like'); }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/host/${entry.creator.id}`;
    if (navigator.share) { navigator.share({ url, title: entry.creator.name }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { toast.error('Could not copy link'); }
  };

  return (
    <div className="space-y-2.5">
      <CreatorHeader entry={entry} />

      {entry.type === 'item' ? (
        <>
          <PortfolioMedia item={entry.item} />
          {entry.item.title && <p className="text-sm font-bold text-gray-900">{entry.item.title}</p>}
          {entry.item.description && <p className="text-sm text-gray-600 line-clamp-3">{entry.item.description}</p>}
          {!!entry.item.tags?.length && (
            <div className="flex flex-wrap gap-1.5">
              {entry.item.tags.slice(0, 6).map(t => (
                <span key={t} className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          )}
          <EngagementRow
            liked={liked} likesCount={likesCount} commentsCount={commentsCount}
            onToggleLike={handleToggleLike} onOpenComments={() => setShowComments(true)} onShare={handleShare}
          />
        </>
      ) : (
        <AlbumMedia entry={entry} />
      )}

      <button
        onClick={() => navigate(`/host/${entry.creator.id}`)}
        className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-colors"
      >
        View Portfolio
      </button>

      {showComments && entry.type === 'item' && (
        <PortfolioCommentSheet itemId={entry.item.id} onClose={() => setShowComments(false)} />
      )}
    </div>
  );
}

// Album card -- cover + count only until "View album" is tapped, per spec
// (full contents fetched lazily via the existing getAlbumItems()).
function AlbumMedia({ entry }: { entry: Extract<PortfolioFeedEntry, { type: 'album' }> }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [albumItems, setAlbumItems] = useState<PortfolioItem[] | null>(null);

  const openAlbum = async () => {
    setExpanded(true);
    if (!albumItems) setAlbumItems(await getAlbumItems(entry.album.id));
  };

  return (
    <div className="space-y-2.5">
      <div className="relative w-full rounded-2xl overflow-hidden bg-gray-100" style={{ aspectRatio: 4 / 5 }}>
        {entry.coverUrl
          ? <img src={entry.coverUrl} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">📁</div>}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-full">
          <Images className="w-3 h-3" /> {entry.itemCount}
        </div>
      </div>
      <p className="text-sm font-bold text-gray-900">{entry.album.title}</p>
      {entry.album.description && <p className="text-sm text-gray-600 line-clamp-2">{entry.album.description}</p>}
      <button onClick={openAlbum} className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold">
        View album ({entry.itemCount})
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
