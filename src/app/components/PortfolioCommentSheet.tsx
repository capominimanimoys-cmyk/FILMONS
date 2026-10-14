// Portfolio item comments -- extracted out of PortfolioFeedCard.tsx so the
// new desktop Connect cards (ConnectFeedCard's PortfolioProjectCard) can
// reuse the exact same comment system instead of building a second one,
// per spec ("Comments should use the existing page-level Comments sheet...
// Do not build separate comments systems for Connect"). Portfolio's own
// comment table (portfolio_item_comments), not posts' CommentSheet.
//
// Reuses the shared BottomSheet (same slide-up/backdrop/drag-to-dismiss
// motion as every other sheet in the app). Newest top-level page loads
// first (reversed for oldest-at-top display); "Load earlier comments"
// pages further back in time. canModerate = the viewer owns the portfolio
// this item belongs to (item owners can delete any comment on their own
// work, not just their own).
import { useState, useEffect, useRef } from 'react';
import { Heart, MoreHorizontal, ChevronUp, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { BottomSheet } from './BottomSheet';
import { useCommentActions, DeletedComment } from './CommentActions';
import {
  PortfolioComment, getItemComments, getAlbumComments, addItemComment, addAlbumComment,
  toggleCommentLike, deleteItemComment, editItemComment,
} from '../lib/portfolioApi';
import { logPortfolioInteraction } from '../lib/personalization';

export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

function CommentRow({
  comment, depth = 0, onReply, onToggleLike, onDelete, ownerId, meId,
}: {
  comment: PortfolioComment; depth?: number;
  onReply: (c: PortfolioComment) => void;
  onToggleLike: (c: PortfolioComment) => void;
  /** Throws on failure; removes the comment (or leaves a "deleted" placeholder when it has replies). */
  onDelete: (c: PortfolioComment) => Promise<void>;
  /** The portfolio owner: may delete (not edit) anyone's comment. */
  ownerId: string; meId?: string;
}) {
  const act = useCommentActions({
    kind: 'portfolio', commentId: comment.id, text: comment.body, authorId: comment.user_id, contentOwnerId: ownerId,
    createdAt: comment.created_at, editedAt: (comment as any).edited_at ?? undefined,
    pending: String(comment.id).startsWith('tmp') || String(comment.id).startsWith('opt'),
    onSaveEdit: t => editItemComment(comment.id, meId!, t, comment.created_at),
    onDelete: () => onDelete(comment),
  });
  const deleted = !!(comment as any).deleted_at;

  return (
    <div className={depth > 0 ? 'ml-9 mt-2.5' : ''}>
      {deleted ? (
        <DeletedComment />
      ) : (
        <div className="flex items-start gap-2.5" {...act.longPress}>
          <div className="w-7 h-7 rounded-full bg-gray-200 shrink-0 overflow-hidden">
            {comment.author?.avatar_url && <img src={comment.author.avatar_url} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-gray-900">{comment.author?.name ?? 'Filmons user'}</p>
            {act.editing ? act.editor : <p className="text-sm text-gray-800 leading-snug break-words whitespace-pre-wrap">{act.text}</p>}
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[10px] text-gray-400">{timeAgo(comment.created_at)}{act.edited && ' · Edited'}</span>
              <button onClick={() => onReply(comment)} className="text-[10px] font-bold text-gray-500">Reply</button>
              {comment.likes_count > 0 && <span className="text-[10px] text-gray-400">{comment.likes_count} like{comment.likes_count === 1 ? '' : 's'}</span>}
            </div>
          </div>
          <button onClick={() => onToggleLike(comment)} className="shrink-0 pt-0.5" aria-label="Like comment">
            <Heart className={`w-3.5 h-3.5 ${comment.liked ? 'text-red-500 fill-red-500' : 'text-gray-300'}`} />
          </button>
          <span className="shrink-0">{act.optionsButton}</span>
          {act.overlays}
        </div>
      )}
      {comment.replies.map(r => (
        <CommentRow key={r.id} comment={r} depth={depth + 1} onReply={onReply} onToggleLike={onToggleLike} onDelete={onDelete} ownerId={ownerId} meId={meId} />
      ))}
    </div>
  );
}

export function PortfolioCommentSheet({
  itemId, targetType = 'item', creatorId, itemCategory, itemSubcategory, canModerate, onClose,
}: {
  /** The item OR album id -- prop name kept as `itemId` for every existing
   * caller, `targetType` says which table column it actually maps to. */
  itemId: string;
  targetType?: 'item' | 'album';
  creatorId: string; itemCategory?: string; itemSubcategory?: string; canModerate: boolean; onClose: () => void;
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

  const fetchComments = targetType === 'album' ? getAlbumComments : getItemComments;
  const createComment = targetType === 'album' ? addAlbumComment : addItemComment;

  const countAll = (list: PortfolioComment[]) => list.reduce((n, c) => n + (c.deleted_at ? 0 : 1) + c.replies.length, 0);

  useEffect(() => {
    fetchComments(itemId, { viewerId: user?.id }).then(({ comments: c, hasMore: hm }) => {
      setComments(c);
      setHasMore(hm);
      setCount(countAll(c));
    });
  }, [itemId]); // eslint-disable-line

  const loadEarlier = async () => {
    if (!comments?.length || loadingMore) return;
    setLoadingMore(true);
    const oldestCursor = comments[0].created_at;
    const { comments: more, hasMore: hm } = await fetchComments(itemId, { before: oldestCursor, viewerId: user?.id });
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
    const c = await createComment(itemId, user.id, body, replyingTo?.id, creatorId);
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
    const soft = c.replies.length > 0;
    const ok = await deleteItemComment(c.id, soft);
    if (!ok) throw new Error('delete failed');
    setComments(prev => {
      if (!prev) return prev;
      const merged = soft
        ? prev.map(row => row.id === c.id ? { ...row, body: '', deleted_at: new Date().toISOString() } as PortfolioComment : row)
        : prev.filter(row => row.id !== c.id).map(row => ({ ...row, replies: row.replies.filter(r => r.id !== c.id) }));
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
                ownerId={creatorId}
                meId={user?.id}
              />
            ))}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
