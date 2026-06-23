/**
 * CommentSection.tsx — optimised for instant display and no content flash.
 *
 * Key changes vs original:
 *  - Module-level _commentCache & _fetchedPosts: comments survive hide/show
 *  - visible prop: component stays mounted in DOM, only fetches on first open
 *  - Comments list renders even while loading (no blank flash)
 *  - Spinner only shown when there is genuinely nothing to display yet
 *  - All cache writes kept in sync with state mutations
 */
import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { commentsApi, authApi } from '../lib/api';
import { Comment } from '../types';
import { UserAvatar, AccountTypeBadge } from './AccountTypeBadge';
import { Trash2, Reply, ChevronDown, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

// ── Module-level caches (survive component hide/show cycles) ──────────────────
const _commentCache = new Map<string, Comment[]>();  // postId → comments[]
const _replyCache   = new Map<string, Comment[]>();  // commentId → replies[]
const _fetchedPosts = new Set<string>();             // postIds we already fetched

// ── Time formatting ───────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)  return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

// ── Reply Input ───────────────────────────────────────────────────────────────
function ReplyInput({ parentId, postId, onSubmit, onCancel }: {
  parentId: string; postId: string;
  onSubmit: (c: Comment) => void; onCancel: () => void;
}) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const submit = async () => {
    if (!user || !text.trim() || submitting) return;
    setSubmitting(true);
    const su = (authApi.getCurrentUser() as any) || user as any;
    const optimistic: Comment = {
      id: `opt-${Date.now()}`, postId, userId: user.id,
      userName: su?.name || su?.username || user.name || user.username || user.email?.split('@')[0] || 'User',
      userAvatar: su?.avatar || su?.avatar_url || user.avatar || undefined,
      userAccountType: user.accountType,
      content: text.trim(), likes: [], createdAt: new Date().toISOString(),
    };
    onSubmit(optimistic);
    setText('');
    try {
      const real = await commentsApi.add(postId, text.trim(), undefined, parentId);
      onSubmit({ ...optimistic, id: real.id || optimistic.id, createdAt: real.createdAt || optimistic.createdAt, _replaceId: optimistic.id } as any);
    } catch {
      toast.error('Could not post reply');
      onSubmit({ ...optimistic, _remove: true } as any);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="flex items-center gap-2 mt-2 ml-10">
      <UserAvatar user={user!} size={24} />
      <div className="flex-1 flex items-center bg-gray-100 rounded-full px-3 py-1.5 gap-2">
        <input ref={ref} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit(); if (e.key === 'Escape') onCancel(); }}
          placeholder="Write a reply…"
          className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none" />
        <button onClick={submit} disabled={submitting || !text.trim()} className="text-blue-500 hover:text-blue-700 disabled:opacity-30 transition-colors">
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
      <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
    </div>
  );
}

// ── Single Comment Row ────────────────────────────────────────────────────────
const CommentRow = memo(function CommentRow({ comment, postId, depth = 0, onDeleted }: {
  comment: Comment & { deleted?: boolean };
  postId: string; depth?: number;
  onDeleted: (id: string) => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwn = user?.id === comment.userId;

  const [liking, setLiking]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [showReply, setShowReply]   = useState(false);
  const [replies, setReplies]       = useState<Comment[]>(_replyCache.get(comment.id) ?? []);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [repliesLoaded, setRepliesLoaded]   = useState(_replyCache.has(comment.id));
  const [showReplies, setShowReplies]       = useState(false);
  const [replyCount, setReplyCount]         = useState(comment.replyCount ?? 0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Like state — localStorage for persistence, likesCount from DB ──────────
  const _likeKey = user ? `filmons_clikes_${user.id}` : null;
  const _readLiked = () => {
    if (!_likeKey) return false;
    try { return JSON.parse(localStorage.getItem(_likeKey) || '{}')[comment.id] === true; }
    catch { return false; }
  };
  const [likedByMe,    setLikedByMe]    = useState(() => comment.likedByMe ?? _readLiked());
  const [displayCount, setDisplayCount] = useState<number>(
    comment.likesCount ?? comment.likes?.length ?? 0,
  );

  const handleLike = async () => {
    if (!user || liking) return;
    const wasLiked = likedByMe;
    setLikedByMe(!wasLiked);
    setDisplayCount(c => wasLiked ? Math.max(0, c - 1) : c + 1);
    setLiking(true);
    try {
      const { liked: nowLiked, likesCount } = await commentsApi.toggleCommentLike(comment.id);
      setLikedByMe(nowLiked);
      setDisplayCount(likesCount);
      if (_likeKey) {
        try {
          const stored = JSON.parse(localStorage.getItem(_likeKey) || '{}');
          if (nowLiked) stored[comment.id] = true;
          else delete stored[comment.id];
          localStorage.setItem(_likeKey, JSON.stringify(stored));
        } catch {}
      }
    } catch {
      setLikedByMe(wasLiked);
      setDisplayCount(c => wasLiked ? c + 1 : Math.max(0, c - 1));
    }
    finally { setLiking(false); }
  };

  const handleDelete = async () => {
    setDeleting(true); setShowDeleteConfirm(false);
    try { await commentsApi.delete(comment.id); onDeleted(comment.id); }
    catch { toast.error('Could not delete'); setDeleting(false); }
  };

  const loadReplies = async () => {
    if (repliesLoaded) { setShowReplies(true); return; }
    setLoadingReplies(true);
    try {
      const data = await commentsApi.getReplies(comment.id);
      _replyCache.set(comment.id, data);
      setReplies(data); setRepliesLoaded(true); setShowReplies(true);
    } catch { toast.error('Could not load replies'); }
    finally { setLoadingReplies(false); }
  };

  const handleReplySubmit = (reply: Comment & { _replaceId?: string; _remove?: boolean }) => {
    if (reply._remove) {
      setReplies(prev => prev.filter(r => r.id !== reply._replaceId));
      setReplyCount((c: number) => Math.max(0, c - 1)); return;
    }
    if (reply._replaceId) {
      const next = replies.map(r => r.id === reply._replaceId ? reply : r);
      setReplies(next); _replyCache.set(comment.id, next); return;
    }
    setReplies(prev => { const n = [...prev, reply]; _replyCache.set(comment.id, n); return n; });
    setReplyCount((c: number) => c + 1);
    setShowReplies(true); setRepliesLoaded(true); setShowReply(false);
  };

  if (comment.deleted) return (
    <div className={`flex items-start gap-2 ${depth > 0 ? 'ml-10' : ''}`}>
      <div className="w-7 h-7 rounded-full bg-gray-100 flex-shrink-0" />
      <p className="text-xs text-gray-400 italic py-1">[deleted]</p>
    </div>
  );

  return (
    <div className={depth > 0 ? 'ml-10' : ''}>
      <div className="flex items-start gap-2.5 group">
        <button onClick={() => navigate(`/host/${comment.userId}`)} className="flex-shrink-0 mt-0.5">
          <UserAvatar user={{ name: comment.userName, avatar: comment.userAvatar, id: comment.userId }} size={depth === 0 ? 32 : 26} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="inline-block max-w-full bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <button onClick={() => navigate(`/host/${comment.userId}`)} className="text-xs font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                {comment.userName || 'User'}
              </button>
              {comment.userAccountType && <AccountTypeBadge type={comment.userAccountType} size="sm" />}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{comment.content}</p>
          </div>
          <div className="flex items-center gap-3 mt-0.5 ml-2">
            <span className="text-[11px] text-gray-400">{timeAgo(comment.createdAt)}</span>
            <button onClick={handleLike} disabled={liking}
              className={`text-xs font-semibold transition-colors ${likedByMe ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}>
              {likedByMe ? '♥' : '♡'} {displayCount > 0 ? displayCount : ''}
            </button>
            {depth === 0 && user && (
              <button onClick={() => setShowReply(v => !v)} className="text-xs font-semibold text-gray-400 hover:text-blue-500 transition-colors flex items-center gap-0.5">
                <Reply className="w-3 h-3" /> Reply
              </button>
            )}
            {isOwn && (
              <div className="relative">
                <button onClick={() => setShowDeleteConfirm(v => !v)} disabled={deleting}
                  className="text-xs text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                  <Trash2 className="w-3 h-3" />
                </button>
                {showDeleteConfirm && (
                  <div className="absolute bottom-6 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-44">
                    <p className="text-xs text-gray-700 font-medium mb-2">Delete this comment?</p>
                    <div className="flex gap-2">
                      <button onClick={handleDelete} className="flex-1 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg py-1.5 transition-colors">Delete</button>
                      <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-1.5 transition-colors">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {showReply && user && depth === 0 && (
            <ReplyInput parentId={comment.id} postId={postId} onSubmit={handleReplySubmit as any} onCancel={() => setShowReply(false)} />
          )}
          {depth === 0 && replyCount > 0 && (
            <button onClick={showReplies ? () => setShowReplies(false) : loadReplies}
              className="flex items-center gap-1 text-xs font-semibold text-blue-500 hover:text-blue-700 mt-1.5 ml-2 transition-colors">
              {loadingReplies ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className={`w-3 h-3 transition-transform ${showReplies ? 'rotate-180' : ''}`} />}
              {showReplies ? 'Hide' : `${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}`}
            </button>
          )}
          {showReplies && replies.length > 0 && (
            <div className="mt-2 space-y-2.5">
              {replies.map(r => (
                <CommentRow key={r.id} comment={r} postId={postId} depth={1}
                  onDeleted={id => {
                    const next = replies.filter(rr => rr.id !== id);
                    setReplies(next); setReplyCount((c: number) => Math.max(0, c - 1));
                    _replyCache.set(comment.id, next);
                  }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ── Comment Section ───────────────────────────────────────────────────────────
const INITIAL_LIMIT = 5;
const PAGE_SIZE = 10;

export const CommentSection = memo(function CommentSection({
  postId, allowComments, onCountChange, visible = true,
}: {
  postId: string;
  allowComments: boolean;
  onCountChange?: (n: number) => void;
  /** Keep-alive support: stays mounted when false, but won't fetch until true */
  visible?: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const hasOpenedRef = useRef(false);

  const getSessionUser = () => authApi.getCurrentUser() as any || user as any;
  const getDisplayName = () => { const u = getSessionUser(); return u?.name || u?.username || u?.email?.split('@')[0] || 'User'; };
  const getAvatar = () => { const u = getSessionUser(); return u?.avatar || u?.avatar_url || undefined; };

  // Seed from cache immediately — zero-latency render on re-open
  const [comments, setComments] = useState<Comment[]>(() => _commentCache.get(postId) ?? []);
  const [loading, setLoading]   = useState(false);
  const [newComment, setNewComment] = useState('');
  const [hasMore, setHasMore]   = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset]     = useState(0);

  const load = useCallback(async (reset = true) => {
    const hasCached = _commentCache.has(postId);
    if (reset && !hasCached) setLoading(true);
    try {
      const data = await commentsApi.getPostComments(postId, INITIAL_LIMIT, 0, 'newest', user?.id);
      _commentCache.set(postId, data);
      _fetchedPosts.add(postId);
      setComments(data);
      setOffset(data.length);
      setHasMore(data.length === INITIAL_LIMIT);
    } catch { toast.error('Could not load comments'); }
    finally { setLoading(false); }
  }, [postId]);

  // Fetch only on first open; skip entirely if already cached
  useEffect(() => {
    if (!visible) return;
    if (hasOpenedRef.current) return;
    hasOpenedRef.current = true;
    if (_fetchedPosts.has(postId)) return; // already have fresh data
    load();
  }, [visible, postId, load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await commentsApi.getPostComments(postId, PAGE_SIZE, offset, 'newest');
      setComments(prev => {
        const ids = new Set(prev.map(c => c.id));
        const next = [...prev, ...data.filter(c => !ids.has(c.id))];
        _commentCache.set(postId, next);
        return next;
      });
      setOffset(o => o + data.length);
      setHasMore(data.length === PAGE_SIZE);
    } catch {}
    finally { setLoadingMore(false); }
  };

  const handleSubmit = () => {
    if (!user || !newComment.trim()) return;
    const text = newComment.trim();
    setNewComment('');
    const optimistic: Comment = {
      id: `opt-${Date.now()}`, postId, userId: user.id,
      userName: getDisplayName(), userAvatar: getAvatar(),
      userAccountType: user.accountType,
      content: text, likes: [], createdAt: new Date().toISOString(),
    };
    setComments(prev => { const next = [optimistic, ...prev]; _commentCache.set(postId, next); return next; });
    onCountChange?.(comments.length + 1);

    commentsApi.add(postId, text).then(real => {
      const merged: Comment = {
        ...optimistic,
        id: real.id || optimistic.id, createdAt: real.createdAt || optimistic.createdAt,
        userName: real.userName || optimistic.userName, userAvatar: real.userAvatar || optimistic.userAvatar,
        userAccountType: real.userAccountType || optimistic.userAccountType,
      };
      setComments(prev => { const next = prev.map(c => c.id === optimistic.id ? merged : c); _commentCache.set(postId, next); return next; });
    }).catch(() => {
      setComments(prev => { const next = prev.filter(c => c.id !== optimistic.id); _commentCache.set(postId, next); return next; });
      onCountChange?.(comments.length);
      setNewComment(text);
      toast.error('Could not post comment');
    });
  };

  const handleDeleted = (id: string) => {
    setComments(prev => { const next = prev.filter(c => c.id !== id); _commentCache.set(postId, next); return next; });
    onCountChange?.(Math.max(0, comments.length - 1));
  };

  return (
    <div className="px-4 pb-4 space-y-3 pt-3">
      {/* Input */}
      {allowComments && user ? (
        <div className="flex items-center gap-2">
          <UserAvatar user={user} size={32} className="flex-shrink-0" />
          <div className="flex-1 flex items-center bg-gray-100 rounded-full px-3 py-1.5 gap-2">
            <input ref={inputRef} value={newComment} onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
              placeholder="Write a comment…"
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none" />
            <button onClick={handleSubmit} disabled={!newComment.trim()}
              className="text-blue-500 hover:text-blue-700 disabled:opacity-30 transition-colors flex-shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : !user && allowComments ? (
        <p className="text-sm text-gray-400 text-center py-1">
          <button onClick={() => navigate('/login')} className="text-blue-500 hover:underline">Sign in</button> to comment.
        </p>
      ) : null}

      {/* Spinner — only when nothing to show yet */}
      {loading && comments.length === 0 && (
        <div className="flex justify-center py-3">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
        </div>
      )}

      {/* Empty state */}
      {!loading && comments.length === 0 && allowComments && (
        <p className="text-sm text-gray-400 text-center py-2">No comments yet. Be the first!</p>
      )}

      {/* Comments — rendered whenever we have data, even mid-reload */}
      {comments.length > 0 && (
        <div className="space-y-3">
          {comments.map(c => (
            <CommentRow key={c.id} comment={c} postId={postId} onDeleted={handleDeleted} />
          ))}
        </div>
      )}

      {/* Load more */}
      {!loading && hasMore && (
        <button onClick={loadMore} disabled={loadingMore}
          className="w-full text-xs font-semibold text-blue-500 hover:text-blue-700 py-1.5 flex items-center justify-center gap-1.5 transition-colors">
          {loadingMore ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</> : 'Load more comments'}
        </button>
      )}
    </div>
  );
});