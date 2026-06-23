/**
 * CommentSheet — slides in from the right as a full-height panel.
 *
 * - translateX slide-in with cubic-bezier easing
 * - Swipe right to dismiss (touch)
 * - Reply input opens inline under each comment
 * - Soft delete: comments with replies show "This comment was deleted"
 * - Hard delete: comments without replies are removed immediately
 * - Optimistic post with retry on failure
 */
import {
  useState, useRef, useEffect, useCallback, memo,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { commentsApi, authApi } from '../lib/api';
import { Comment } from '../types';
import { UserAvatar, AccountTypeBadge } from './AccountTypeBadge';
import { X, Heart, Loader2, Send, Pin } from 'lucide-react';
import { toast } from 'sonner';

// ── Module-level cache (survives open/close) ──────────────────────────────────
const _cache      = new Map<string, Comment[]>();
const _fetched    = new Set<string>();
const _replyCache = new Map<string, Comment[]>();

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)     return `${s}s`;
  if (s < 3600)   return `${Math.floor(s / 60)}m`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function RichText({ text }: { text: string }) {
  const navigate = useNavigate();
  const parts = text.split(/(@\w+|#\w+)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('@'))
          return <button key={i} onClick={() => navigate(`/feed?q=${part.slice(1)}`)} className="text-blue-500 font-medium hover:underline">{part}</button>;
        if (part.startsWith('#'))
          return <button key={i} onClick={() => navigate(`/feed?q=${part}`)} className="text-blue-500 font-medium hover:underline">{part}</button>;
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

// ── Heart button with pop animation ──────────────────────────────────────────
function HeartButton({ liked, count, onToggle }: {
  liked: boolean; count: number; onToggle: () => void;
}) {
  const [pop, setPop] = useState(false);
  const handle = () => { setPop(true); setTimeout(() => setPop(false), 300); onToggle(); };
  return (
    <button onClick={handle}
      className={`flex flex-col items-center gap-0.5 ${pop ? 'scale-125' : 'scale-100'}`}
      style={{ transition: 'transform 0.2s cubic-bezier(.36,.07,.19,.97)' }}>
      <Heart className="w-3.5 h-3.5 transition-colors"
        fill={liked ? '#ef4444' : 'none'} stroke={liked ? '#ef4444' : 'currentColor'} strokeWidth={2} />
      {count > 0 && (
        <span className={`text-[9px] font-semibold leading-none ${liked ? 'text-red-500' : 'text-gray-400'}`}>{count}</span>
      )}
    </button>
  );
}

// ── @mention autocomplete hook ────────────────────────────────────────────────
function useMentionSearch(text: string) {
  const [results, setResults]   = useState<{ id: string; name: string; username: string; avatar?: string }[]>([]);
  const [active, setActive]     = useState(false);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Detect trailing @query (nothing after the @query or only word chars)
  const match = text.match(/@(\w*)$/);
  const query = match ? match[1] : null;

  useEffect(() => {
    if (query === null) { setActive(false); setResults([]); return; }
    setActive(true);
    clearTimeout(debounceRef.current);
    if (!query) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const hits = await commentsApi.searchMentionable(query);
      setResults(hits);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const insertMention = (username: string, currentText: string) => {
    const replaced = currentText.replace(/@\w*$/, `@${username} `);
    setActive(false);
    setResults([]);
    return replaced;
  };

  return { active, results, insertMention };
}

// ── Inline reply composer ─────────────────────────────────────────────────────
function InlineReply({ parentName, onSubmit, onCancel, submitting, user }: {
  parentName: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  submitting: boolean;
  user: any;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const { active: mentionActive, results: mentionResults, insertMention } = useMentionSearch(text);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 50); }, []);

  const send = () => {
    if (!text.trim() || submitting) return;
    onSubmit(text.trim());
    setText('');
  };

  return (
    <div className="flex items-start gap-2 mt-2 ml-1 relative">
      <UserAvatar user={user} size={26} className="flex-shrink-0 mt-1" />
      <div className="flex-1">
        {mentionActive && mentionResults.length > 0 && (
          <div className="absolute bottom-full mb-1 left-0 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {mentionResults.map(u => (
              <button key={u.id} onMouseDown={e => { e.preventDefault(); setText(insertMention(u.username, text)); }}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-gray-50 text-left">
                <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0">
                  {(u.name || u.username || '?')[0].toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{u.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">@{u.username}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col bg-blue-50 rounded-2xl px-3 py-2 gap-0.5 border border-blue-100">
          <span className="text-[10px] text-blue-500 font-semibold">Replying to @{parentName}</span>
          <div className="flex items-center gap-2">
            <input
              ref={ref}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                if (e.key === 'Escape') onCancel();
              }}
              placeholder={`Reply to @${parentName}…`}
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
            />
            <button onClick={send} disabled={!text.trim() || submitting}
              className="text-blue-500 hover:text-blue-700 disabled:opacity-30 transition-colors flex-shrink-0">
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
      <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0 mt-1">✕</button>
    </div>
  );
}

// ── Single Comment Row ────────────────────────────────────────────────────────
const CommentRow = memo(function CommentRow({
  comment, postId, postOwnerId, depth, isPostOwner,
  onDeleted, onReplyPosted,
}: {
  comment: Comment & { pinned?: boolean; deleted?: boolean; replyCount?: number };
  postId: string;
  postOwnerId: string;
  depth: number;
  isPostOwner: boolean;
  onDeleted: (id: string, soft?: boolean) => void;
  onReplyPosted?: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [liking, setLiking]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expanded, setExpanded]         = useState(false);
  const [replies, setReplies]           = useState<Comment[]>(_replyCache.get(comment.id) ?? []);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [repliesLoaded, setRepliesLoaded]   = useState(_replyCache.has(comment.id));
  const [showReply, setShowReply]       = useState(false);
  const [replySubmitting, setReplySubmitting] = useState(false);

  // ── Like state — count from DB column, liked-by-me from localStorage ─────
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

  const replyCount = comment.replyCount ?? 0;
  const totalReplies = replyCount || replies.length;
  const isOwn    = user?.id === comment.userId;
  const isPinned = (comment as any).pinned;

  const handleLike = async () => {
    if (!user || liking) return;
    const wasLiked = likedByMe;
    // Optimistic UI
    setLikedByMe(!wasLiked);
    setDisplayCount(c => wasLiked ? Math.max(0, c - 1) : c + 1);
    setLiking(true);
    try {
      const { liked: nowLiked, likesCount } = await commentsApi.toggleCommentLike(comment.id);
      setLikedByMe(nowLiked);
      setDisplayCount(likesCount);
      // Persist liked state in localStorage so it survives page reload
      if (_likeKey) {
        try {
          const stored = JSON.parse(localStorage.getItem(_likeKey) || '{}');
          if (nowLiked) stored[comment.id] = true;
          else delete stored[comment.id];
          localStorage.setItem(_likeKey, JSON.stringify(stored));
        } catch {}
      }
    } catch {
      // Roll back optimistic update on failure
      setLikedByMe(wasLiked);
      setDisplayCount(c => wasLiked ? c + 1 : Math.max(0, c - 1));
    }
    finally { setLiking(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setShowDeleteConfirm(false);
    try {
      await commentsApi.delete(comment.id);
      const hasReplies = totalReplies > 0;
      onDeleted(comment.id, hasReplies); // soft delete if has replies
    } catch {
      toast.error('Could not delete');
      setDeleting(false);
    }
  };

  const loadReplies = async () => {
    if (repliesLoaded) { setExpanded(true); return; }
    setLoadingReplies(true);
    try {
      const data = await commentsApi.getReplies(comment.id);
      _replyCache.set(comment.id, data);
      setReplies(data); setRepliesLoaded(true); setExpanded(true);
    } catch { toast.error('Could not load replies'); }
    finally { setLoadingReplies(false); }
  };

  const handleReplySubmit = async (text: string) => {
    if (!user || !text.trim()) return;
    setReplySubmitting(true);
    const su = (authApi.getCurrentUser() as any) || (user as any);
    const optimistic: Comment = {
      id: `opt-${Date.now()}`, postId,
      userId: user.id,
      userName: su?.name || su?.username || user.email?.split('@')[0] || 'User',
      userAvatar: su?.avatar || su?.avatar_url || undefined,
      userAccountType: user.accountType,
      content: text, likes: [],
      createdAt: new Date().toISOString(),
    };
    const prevCache = _replyCache.get(comment.id) ?? [];
    _replyCache.set(comment.id, [...prevCache, optimistic]);
    setReplies(r => [...r, optimistic]);
    setExpanded(true); setRepliesLoaded(true); setShowReply(false);
    try {
      const real = await commentsApi.add(postId, text, undefined, comment.id);
      const merged: Comment = {
        ...optimistic,
        id: real.id || optimistic.id,
        createdAt: real.createdAt || optimistic.createdAt,
        userName: real.userName || optimistic.userName,
        userAvatar: real.userAvatar || optimistic.userAvatar,
      };
      setReplies(r => r.map(rr => rr.id === optimistic.id ? merged : rr));
      _replyCache.set(comment.id, (_replyCache.get(comment.id) ?? []).map(rr => rr.id === optimistic.id ? merged : rr));
      onReplyPosted?.();
    } catch {
      toast.error('Could not post reply — tap to retry');
      setReplies(r => r.filter(rr => rr.id !== optimistic.id));
      _replyCache.set(comment.id, (_replyCache.get(comment.id) ?? []).filter(rr => rr.id !== optimistic.id));
      setShowReply(true); // re-open so user can retry
    } finally {
      setReplySubmitting(false);
    }
  };

  // Soft-deleted: keep in DOM so replies remain visible
  if (comment.deleted) {
    return (
      <div className={depth > 0 ? 'ml-11' : ''}>
        <div className="bg-gray-50 rounded-xl px-3 py-2 border border-dashed border-gray-200">
          <p className="text-xs text-gray-400 italic">This comment was deleted</p>
        </div>
        {expanded && replies.length > 0 && (
          <div className="mt-2 space-y-3">
            {replies.map(r => (
              <CommentRow key={r.id} comment={r} postId={postId}
                postOwnerId={postOwnerId} depth={1} isPostOwner={isPostOwner}
                onDeleted={(id, soft) => {
                  if (soft) {
                    setReplies(prev => prev.map(rr => rr.id === id ? { ...rr, deleted: true } as any : rr));
                  } else {
                    const next = replies.filter(rr => rr.id !== id);
                    setReplies(next); _replyCache.set(comment.id, next);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const avatarSize = depth === 0 ? 36 : 28;

  return (
    <div className={depth > 0 ? 'ml-11' : ''}>
      <div className="flex items-start gap-2.5 group">
        {/* Avatar */}
        <button onClick={() => navigate(`/host/${comment.userId}`)} className="flex-shrink-0 mt-0.5">
          <UserAvatar user={{ name: comment.userName, avatar: comment.userAvatar, id: comment.userId }} size={avatarSize} />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isPinned && (
            <div className="flex items-center gap-1 mb-1">
              <Pin className="w-3 h-3 text-gray-400" />
              <span className="text-[10px] text-gray-400 font-medium">Pinned</span>
            </div>
          )}

          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0 bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2">
              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                <button onClick={() => navigate(`/host/${comment.userId}`)}
                  className="text-xs font-bold text-gray-900 hover:text-blue-600 transition-colors">
                  {comment.userName || 'User'}
                </button>
                {comment.userAccountType && <AccountTypeBadge type={comment.userAccountType} size="sm" />}
                {comment.userId === postOwnerId && (
                  <span className="text-[9px] font-bold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">Author</span>
                )}
              </div>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                <RichText text={comment.content} />
              </p>
            </div>

            <div className="flex-shrink-0 pt-1 pr-1">
              <HeartButton liked={likedByMe} count={displayCount} onToggle={handleLike} />
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1 ml-1">
            <span className="text-[11px] text-gray-400">{timeAgo(comment.createdAt)}</span>

            {depth === 0 && user && (
              <button onClick={() => setShowReply(v => !v)}
                className="text-[11px] font-semibold text-gray-400 hover:text-blue-500 transition-colors">
                {showReply ? 'Cancel' : 'Reply'}
              </button>
            )}

            {(isOwn || isPostOwner) && (
              <div className="relative">
                <button onClick={() => setShowDeleteConfirm(v => !v)} disabled={deleting}
                  className="text-[11px] font-semibold text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50">
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Delete'}
                </button>
                {showDeleteConfirm && (
                  <div className="absolute bottom-6 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-44">
                    <p className="text-xs text-gray-700 font-semibold mb-1">Delete this comment?</p>
                    {totalReplies > 0 && (
                      <p className="text-[10px] text-gray-400 mb-2">Replies will remain visible.</p>
                    )}
                    <div className="flex gap-2">
                      <button onClick={handleDelete}
                        className="flex-1 text-xs font-bold bg-red-500 text-white rounded-lg py-1.5 hover:bg-red-600">
                        Delete
                      </button>
                      <button onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg py-1.5 hover:bg-gray-200">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Inline reply composer */}
          {showReply && depth === 0 && user && (
            <InlineReply
              parentName={comment.userName}
              onSubmit={handleReplySubmit}
              onCancel={() => setShowReply(false)}
              submitting={replySubmitting}
              user={user}
            />
          )}

          {/* View / hide replies */}
          {depth === 0 && totalReplies > 0 && (
            <button onClick={expanded ? () => setExpanded(false) : loadReplies}
              className="flex items-center gap-1.5 mt-1.5 ml-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800 transition-colors">
              <span className="w-6 h-px bg-gray-300" />
              {loadingReplies
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : expanded
                  ? 'Hide replies'
                  : `View ${totalReplies} repl${totalReplies === 1 ? 'y' : 'ies'}`
              }
            </button>
          )}

          {expanded && replies.length > 0 && (
            <div className="mt-2.5 space-y-3">
              {replies.map(r => (
                <CommentRow key={r.id} comment={r} postId={postId}
                  postOwnerId={postOwnerId} depth={1} isPostOwner={isPostOwner}
                  onDeleted={(id, soft) => {
                    if (soft) {
                      const next = replies.map(rr => rr.id === id ? { ...rr, deleted: true } as any : rr);
                      setReplies(next); _replyCache.set(comment.id, next);
                    } else {
                      const next = replies.filter(rr => rr.id !== id);
                      setReplies(next); _replyCache.set(comment.id, next);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ── Main Sheet ────────────────────────────────────────────────────────────────
const INITIAL_LIMIT = 20;
const PAGE_SIZE     = 15;

interface CommentSheetProps {
  postId: string;
  postOwnerId: string;
  allowComments: boolean;
  commentCount: number;         // main comments only
  totalCommentsCount?: number;  // main + replies
  onClose: () => void;
  onCountChange?: (n: number) => void;
}

export function CommentSheet({
  postId, postOwnerId, allowComments, commentCount, totalCommentsCount, onClose, onCountChange,
}: CommentSheetProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef     = useRef<HTMLInputElement>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const sheetRef     = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);

  const isPostOwner = user?.id === postOwnerId;

  const getSessionUser  = () => (authApi.getCurrentUser() as any) || (user as any);
  const getDisplayName  = () => { const u = getSessionUser(); return u?.name || u?.username || u?.email?.split('@')[0] || 'User'; };
  const getAvatar       = () => { const u = getSessionUser(); return u?.avatar || u?.avatar_url || undefined; };

  const [comments,    setComments]    = useState<Comment[]>(() => _cache.get(postId) ?? []);
  const [mainCount,   setMainCount]   = useState(commentCount);
  const [totalCount,  setTotalCount]  = useState(totalCommentsCount ?? commentCount);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(false);
  const [offset,      setOffset]      = useState(0);
  const [newText,     setNewText]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [visible,     setVisible]     = useState(false);
  const mention = useMentionSearch(newText);

  const lastCommentRef     = useRef('');
  const lastCommentTimeRef = useRef(0);

  // Swipe-down-to-close
  const dragStartY = useRef<number | null>(null);
  const dragDeltaY = useRef(0);

  // Double-RAF: ensures the browser paints translateY(100%) before animating to 0
  useEffect(() => {
    let t: number;
    const outer = requestAnimationFrame(() => {
      t = requestAnimationFrame(() => setVisible(true));
    });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(t); };
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 320);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const load = useCallback(async (reset = true) => {
    const hasCached = _cache.has(postId);
    if (reset && !hasCached) setLoading(true);
    try {
      const [raw, cnt] = await Promise.all([
        commentsApi.getPostComments(postId, INITIAL_LIMIT, 0, 'newest', user?.id),
        commentsApi.getCount(postId),
      ]);
      _cache.set(postId, raw);
      _fetched.add(postId);
      setComments(raw);
      setOffset(raw.length);
      setHasMore(raw.length === INITIAL_LIMIT);
      if (cnt > 0) {
        setMainCount(cnt);
        // total = from prop (DB column) if fresher, else use main count as floor
        setTotalCount(t => Math.max(t, cnt));
        onCountChange?.(cnt);
      }
    } catch { toast.error('Could not load comments'); }
    finally { setLoading(false); }
  }, [postId]); // eslint-disable-line

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    if (_fetched.has(postId)) return;
    load();
    setTimeout(() => inputRef.current?.focus(), 450);
  }, [load, postId]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const raw = await commentsApi.getPostComments(postId, PAGE_SIZE, offset, 'newest', user?.id);
      setComments(prev => {
        const ids = new Set(prev.map(c => c.id));
        const next = [...prev, ...raw.filter(c => !ids.has(c.id))];
        _cache.set(postId, next);
        return next;
      });
      setOffset(o => o + raw.length);
      setHasMore(raw.length === PAGE_SIZE);
    } catch {}
    finally { setLoadingMore(false); }
  };

  const handleSubmit = async () => {
    const text = newText.trim();
    if (!user || !text || submitting) return;

    const now = Date.now();
    if (text === lastCommentRef.current && now - lastCommentTimeRef.current < 10_000) {
      toast.warning('You already sent that'); return;
    }
    if (now - lastCommentTimeRef.current < 2_000) {
      toast.warning("You're posting too fast"); return;
    }
    lastCommentRef.current = text;
    lastCommentTimeRef.current = now;

    setSubmitting(true);
    setNewText('');

    const optimistic: Comment = {
      id: `opt-${Date.now()}`, postId,
      userId: user.id,
      userName: getDisplayName(),
      userAvatar: getAvatar(),
      userAccountType: user.accountType,
      content: text, likes: [],
      createdAt: new Date().toISOString(),
    };

    setComments(prev => {
      const next = [optimistic, ...prev];
      _cache.set(postId, next);
      return next;
    });
    setTotalCount(c => c + 1);
    onCountChange?.(totalCount + 1);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50);

    try {
      const real = await commentsApi.add(postId, text);
      const merged: Comment = {
        ...optimistic,
        id: real.id || optimistic.id,
        createdAt: real.createdAt || optimistic.createdAt,
        userName: real.userName || optimistic.userName,
        userAvatar: real.userAvatar || optimistic.userAvatar,
        userAccountType: real.userAccountType || optimistic.userAccountType,
      };
      setComments(prev => {
        const next = prev.map(c => c.id === optimistic.id ? merged : c);
        _cache.set(postId, next);
        return next;
      });
    } catch {
      setComments(prev => {
        const next = prev.filter(c => c.id !== optimistic.id);
        _cache.set(postId, next);
        return next;
      });
      setTotalCount(c => Math.max(0, c - 1));
      onCountChange?.(Math.max(0, totalCount - 1));
      setNewText(text);
      toast.error('Could not post comment');
    }

    setSubmitting(false);
    inputRef.current?.focus();
  };

  const handleDeleted = (id: string, soft?: boolean) => {
    setComments(prev => {
      const next = soft
        ? prev.map(c => c.id === id ? { ...c, deleted: true } as any : c)
        : prev.filter(c => c.id !== id);
      _cache.set(postId, next);
      return next;
    });
    if (!soft) {
      setTotalCount(c => Math.max(0, c - 1));
      onCountChange?.(Math.max(0, totalCount - 1));
    }
  };

  // ── Swipe down to close ───────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragDeltaY.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy < 0) return; // don't allow dragging up
    dragDeltaY.current = dy;
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onTouchEnd = () => {
    if (dragDeltaY.current > 120) {
      close();
    } else {
      if (sheetRef.current) sheetRef.current.style.transform = '';
    }
    dragStartY.current = null;
    dragDeltaY.current = 0;
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={close}
      />

      {/* Sheet — slides up from bottom */}
      <div
        ref={sheetRef}
        className="relative bg-white rounded-t-2xl flex flex-col w-full shadow-2xl"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '90vh',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 pt-1 border-b border-gray-100 flex-shrink-0">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900">Comments</h3>
              {totalCount > 0 && (
                <span className="text-xs text-gray-400 font-medium">{totalCount.toLocaleString()} total</span>
              )}
            </div>
            {totalCount > 0 && (
              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                <span>{mainCount.toLocaleString()} comment{mainCount !== 1 ? 's' : ''}</span>
                {totalCount > mainCount && (
                  <>
                    <span>·</span>
                    <span>{(totalCount - mainCount).toLocaleString()} repl{(totalCount - mainCount) !== 1 ? 'ies' : 'y'}</span>
                  </>
                )}
              </div>
            )}
          </div>
          <button onClick={close} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Comment list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4">

          {loading && comments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
              <p className="text-xs text-gray-400">Loading comments…</p>
            </div>
          )}

          {!loading && comments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <span className="text-3xl">💬</span>
              <p className="text-sm font-semibold text-gray-700">No comments yet</p>
              <p className="text-xs text-gray-400">Be the first to comment</p>
            </div>
          )}

          {comments.map(c => (
            <CommentRow
              key={c.id}
              comment={c}
              postId={postId}
              postOwnerId={postOwnerId}
              depth={0}
              isPostOwner={isPostOwner}
              onDeleted={handleDeleted}
              onReplyPosted={() => onCountChange?.(commentCount + 1)}
            />
          ))}

          {!loading && hasMore && (
            <button onClick={loadMore} disabled={loadingMore}
              className="w-full py-3 text-xs font-semibold text-blue-500 hover:text-blue-700 flex items-center justify-center gap-2 transition-colors">
              {loadingMore
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading more…</>
                : 'Load more comments'
              }
            </button>
          )}

          <div className="h-4" />
        </div>

        {/* Composer */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-white px-3 py-3"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          {allowComments && user ? (
            <div className="relative">
              {/* @mention dropdown */}
              {mention.active && mention.results.length > 0 && (
                <div className="absolute bottom-full mb-2 left-0 right-0 z-50 bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
                  {mention.results.map(u => (
                    <button key={u.id}
                      onMouseDown={e => { e.preventDefault(); setNewText(mention.insertMention(u.username, newText)); inputRef.current?.focus(); }}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 hover:bg-gray-50 text-left">
                      <span className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                        {(u.name || u.username || '?')[0].toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{u.name}</p>
                        <p className="text-[10px] text-gray-400 truncate">@{u.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <UserAvatar user={user} size={32} className="flex-shrink-0" />
                <div className="flex-1 flex items-center bg-gray-100 rounded-full px-4 py-2 gap-2 min-h-[40px]">
                  <input
                    ref={inputRef}
                    value={newText}
                    onChange={e => setNewText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                    placeholder="Add a comment… (type @ to mention)"
                    className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
                  />
                  <button onClick={handleSubmit} disabled={!newText.trim() || submitting}
                    className="text-blue-500 hover:text-blue-700 disabled:opacity-30 transition-all flex-shrink-0">
                    {submitting
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <span className="text-sm font-bold">Post</span>
                    }
                  </button>
                </div>
              </div>
            </div>
          ) : !user ? (
            <button onClick={() => { close(); navigate('/login'); }}
              className="w-full py-3 text-sm font-semibold text-blue-500 hover:text-blue-700 text-center">
              Sign in to comment
            </button>
          ) : (
            <p className="text-xs text-gray-400 text-center py-2">Comments are turned off</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Public cache invalidation ─────────────────────────────────────────────────
export function invalidateCommentCache(postId: string) {
  _cache.delete(postId);
  _fetched.delete(postId);
}
