import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, MoreHorizontal, Heart, Send, X, ChevronDown } from 'lucide-react';
import { usePostStore } from '../context/PostContext';
import { Post, Comment } from '../types';
import { PostCard } from '../components/PostCard';
import { commentsApi, postsApi, fetchRepostContext } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { UserAvatar, AccountTypeBadge } from '../components/AccountTypeBadge';

export function PostDetail() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const inputRef  = useRef<HTMLInputElement>(null);

  const [post,         setPost]         = useState<any | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [comments,     setComments]     = useState<Comment[]>([]);
  const [loadingCmts,  setLoadingCmts]  = useState(false);
  const [newComment,   setNewComment]   = useState('');
  const [submitting,   setSubmitting]   = useState(false);

  // Fetch post directly with all fields
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('posts')
          .select('*, profiles!author_id(id,name,username,avatar_url,account_type)')
          .eq('id', id)
          .single();
        if (error || !data) throw error;
        const prof = (data.profiles as any) || {};
        const mu   = Array.isArray(data.media_urls) ? data.media_urls : [];
        // This is a hand-rolled fetch (not postsApi.getByIds), so it needs
        // its own repost-state check -- same (user_id, post_id) lookup
        // against `reposts` as fetchRepostedPostIds in api.ts.
        const hasReposted = user
          ? !!(await supabase.from('reposts').select('post_id').eq('user_id', user.id).eq('post_id', id).maybeSingle()).data
          : false;
        const repostContext = user ? (await fetchRepostContext([id], user.id)).get(id) : undefined;
        setPost({
          ...data,
          userId:          data.author_id,
          userName:        prof.name || prof.username || '',
          userAvatar:      prof.avatar_url,
          userAccountType: prof.account_type,
          images:          data.post_type === 'video' ? [] : mu,
          videos:          data.post_type === 'video' ? mu : mu.filter((u: string) => /\.(mp4|mov|webm)/i.test(u)),
          audioTitle:      data.audio_title,
          audioArtist:     data.audio_artist,
          audioId:         data.audio_id,
          audio_url:       data.audio_url,
          listingId:       data.listing_id,
          listingTitle:    data.listing_title,
          listingPrice:    data.listing_price,
          listingMode:     data.listing_mode,
          listingCity:     data.listing_city,
          listingImage:    data.listing_image,
          listingPins:     data.listing_pins,
          tagPins:         data.tag_pins,
          likes:           Array.isArray(data.likes) ? data.likes : [],
          likesCount:      data.likes_count ?? 0,
          content:         data.content || data.caption || '',
          commentCount:    data.comments_count ?? data.comment_count ?? 0,
          hasReposted,
          repostContext,
        });
      } catch {
        postsApi.getAll().then(posts => setPost(posts.find(p => p.id === id) || null)).catch(() => {});
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Comments: sorted, loaded gradually, replies collapsed ──────────────────
  const PAGE = 10;
  const { updatePost } = usePostStore();
  const [sort, setSort] = useState<'relevant' | 'newest'>('relevant');
  const [loadError, setLoadError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replies, setReplies] = useState<Record<string, Comment[]>>({});
  const [openReplies, setOpenReplies] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [kb, setKb] = useState(0);
  const offsetRef = useRef(0);

  const loadPage = (reset: boolean) => {
    if (!id) return;
    if (reset) { offsetRef.current = 0; setLoadingCmts(true); setLoadError(false); } else setLoadingMore(true);
    commentsApi.getPostComments(id, PAGE, offsetRef.current, 'newest', user?.id)
      .then(list => {
        offsetRef.current += list.length;
        setHasMore(list.length === PAGE);
        setComments(prev => {
          const base = reset ? [] : prev;
          const seen = new Set(base.map(c => c.id));
          return [...base, ...list.filter(c => !seen.has(c.id))];
        });
      })
      .catch(() => { if (reset) setLoadError(true); })
      .finally(() => { setLoadingCmts(false); setLoadingMore(false); });
  };
  useEffect(() => { loadPage(true); }, [id, user?.id]); // eslint-disable-line

  // "Most relevant" ranks what is loaded by engagement, then recency; "Newest" is plain time order.
  const shown = [...comments].sort((a, b) => {
    if (sort === 'newest') return +new Date(b.createdAt) - +new Date(a.createdAt);
    const sa = (a.likesCount ?? 0) + (a.replyCount ?? 0) * 2, sb = (b.likesCount ?? 0) + (b.replyCount ?? 0) * 2;
    return sb - sa || +new Date(b.createdAt) - +new Date(a.createdAt);
  });

  // Keep the composer above the on-screen keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize', on); vv.addEventListener('scroll', on);
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);

  const setCount = (delta: number) => setPost((p: any) => {
    if (!p) return p;
    const n = Math.max(0, (p.totalCommentsCount ?? p.commentCount ?? 0) + delta);
    updatePost(p.id, { commentCount: n, totalCommentsCount: n } as any);
    return { ...p, commentCount: n, totalCommentsCount: n };
  });

  const handleComment = async () => {
    const text = newComment.trim();
    if (!user || !text || !post || submitting) return;
    setSubmitting(true);
    try {
      const parent = replyTo ? (replyTo.parentId || replyTo.id) : undefined;
      const c = await commentsApi.add(post.id, text, post, parent);
      if (parent) {
        setReplies(prev => ({ ...prev, [parent]: [...(prev[parent] ?? []), c] }));
        setOpenReplies(prev => new Set(prev).add(parent));
        setComments(prev => prev.map(x => x.id === parent ? { ...x, replyCount: (x.replyCount ?? 0) + 1 } : x));
      } else {
        setComments(prev => [c, ...prev]);
      }
      setCount(1);
      setNewComment(''); setReplyTo(null);
    } catch { toast.error('Could not post your comment'); }
    finally { setSubmitting(false); }
  };

  const toggleLike = async (commentId: string, isReply: boolean, parentId?: string) => {
    if (!user) return;
    const flip = (c: Comment): Comment => c.id !== commentId ? c
      : { ...c, likedByMe: !c.likedByMe, likesCount: Math.max(0, (c.likesCount ?? 0) + (c.likedByMe ? -1 : 1)) };
    const apply = () => {
      if (isReply && parentId) setReplies(prev => ({ ...prev, [parentId]: (prev[parentId] ?? []).map(flip) }));
      else setComments(prev => prev.map(flip));
    };
    apply();
    try { await commentsApi.toggleCommentLike(commentId); } catch { apply(); }
  };

  const toggleReplies = async (c: Comment) => {
    const next = new Set(openReplies);
    if (next.has(c.id)) { next.delete(c.id); setOpenReplies(next); return; }
    next.add(c.id); setOpenReplies(next);
    if (!replies[c.id]) {
      try { const list = await commentsApi.getReplies(c.id); setReplies(prev => ({ ...prev, [c.id]: list })); }
      catch { toast.error('Could not load replies'); next.delete(c.id); setOpenReplies(new Set(next)); }
    }
  };

  const startReply = (c: Comment) => {
    setReplyTo(c);
    inputRef.current?.focus();
  };
  const focusComposer = () => { inputRef.current?.focus(); inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

  if (loading) return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-20 flex items-center justify-between px-3 py-3 bg-white border-b border-gray-100">
        <div className="w-9 h-9 rounded-full bg-gray-100" /><p className="text-sm font-black text-gray-900">Post</p><div className="w-9 h-9" />
      </div>
      <div className="p-4 space-y-3 animate-pulse">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-gray-100" /><div className="space-y-2"><div className="h-3 w-32 bg-gray-100 rounded" /><div className="h-2.5 w-20 bg-gray-100 rounded" /></div></div>
        <div className="h-4 w-full bg-gray-100 rounded" /><div className="h-4 w-2/3 bg-gray-100 rounded" /><div className="aspect-[4/3] bg-gray-100 rounded-2xl" />
      </div>
    </div>
  );

  if (!post) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
      <p className="text-gray-400">Post not found</p>
      <button onClick={() => navigate(-1)} className="text-blue-500 text-sm">Go back</button>
    </div>
  );

  const renderComment = (c: Comment, isReply = false, parentId?: string) => (
    <div key={c.id} className={`flex items-start gap-2.5 ${isReply ? 'ml-10 mt-3' : ''}`}>
      <button onClick={() => navigate(`/host/${c.userId}`)} className="shrink-0">
        <UserAvatar user={{ id: c.userId, name: c.userName, avatar: c.userAvatar }} size={isReply ? 26 : 32} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="bg-gray-50 rounded-2xl px-3 py-2">
          <p className="text-xs font-black text-gray-900 flex items-center gap-1.5">
            <button onClick={() => navigate(`/host/${c.userId}`)}>{c.userName}</button>
            {c.userAccountType && <AccountTypeBadge type={c.userAccountType} size="sm" />}
          </p>
          <p className="text-sm text-gray-800 mt-0.5 leading-relaxed whitespace-pre-line break-words">{c.content}</p>
        </div>
        <div className="flex items-center gap-4 px-2 pt-1 text-[11px] font-semibold text-gray-500">
          <span className="font-normal text-gray-400">{relTime(c.createdAt)}</span>
          <button onClick={() => toggleLike(c.id, isReply, parentId)} className={c.likedByMe ? 'text-red-500' : ''}>
            Like{(c.likesCount ?? 0) > 0 ? ` · ${c.likesCount}` : ''}
          </button>
          {user && post.allowComments !== false && <button onClick={() => startReply(c)}>Reply</button>}
        </div>
        {!isReply && (c.replyCount ?? 0) > 0 && (
          <button onClick={() => toggleReplies(c)} className="flex items-center gap-1 px-2 pt-1.5 text-[11px] font-bold text-blue-600">
            <ChevronDown className={`w-3 h-3 transition-transform ${openReplies.has(c.id) ? 'rotate-180' : ''}`} />
            {openReplies.has(c.id) ? 'Hide replies' : `View ${c.replyCount} ${c.replyCount === 1 ? 'reply' : 'replies'}`}
          </button>
        )}
        {!isReply && openReplies.has(c.id) && (replies[c.id] ?? []).map(r => renderComment(r, true, c.id))}
      </div>
    </div>
  );

  const total = post.totalCommentsCount ?? post.commentCount ?? comments.length;
  const commentsOff = post.allowComments === false;

  return (
    <div className="min-h-screen bg-white" style={{ paddingBottom: 'calc(84px + env(safe-area-inset-bottom))' }}>

      {/* Sticky header: back · Post · menu */}
      <div className="sticky top-0 z-20 grid grid-cols-[44px_1fr_44px] items-center px-2 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)', background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #f3f4f6' }}>
        <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <p className="text-center text-sm font-black text-gray-900">Post</p>
        <button onClick={() => window.dispatchEvent(new CustomEvent('postcard:detail-menu', { detail: { postId: post.id } }))}
          aria-label="More options" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 justify-self-end">
          <MoreHorizontal className="w-5 h-5 text-gray-700" />
        </button>
      </div>

      <PostCard post={post} detail={{ onComment: focusComposer }} />

      {/* Comments */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-black text-gray-900">Comments{total > 0 && <span className="text-gray-400 font-normal ml-1">({total})</span>}</p>
          {comments.length > 1 && (
            <div className="flex rounded-full bg-gray-100 p-0.5 text-[11px] font-bold">
              {(['relevant', 'newest'] as const).map(k => (
                <button key={k} onClick={() => setSort(k)} className={`px-3 py-1 rounded-full ${sort === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  {k === 'relevant' ? 'Most relevant' : 'Newest'}
                </button>
              ))}
            </div>
          )}
        </div>

        {commentsOff ? (
          <p className="text-sm text-gray-400 text-center py-8">Comments are turned off for this post.</p>
        ) : loadingCmts ? (
          <div className="space-y-4 animate-pulse">{[0, 1, 2].map(i => (
            <div key={i} className="flex gap-2.5"><div className="w-8 h-8 rounded-full bg-gray-100" /><div className="flex-1 h-14 bg-gray-100 rounded-2xl" /></div>
          ))}</div>
        ) : loadError ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 mb-2">Couldn't load comments.</p>
            <button onClick={() => loadPage(true)} className="text-sm font-bold text-blue-600">Retry</button>
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Start the conversation.</p>
        ) : (
          <div className="space-y-4">
            {shown.map(c => renderComment(c))}
            {hasMore && (
              <button onClick={() => loadPage(false)} disabled={loadingMore} className="w-full py-2 text-sm font-bold text-blue-600 disabled:opacity-50">
                {loadingMore ? 'Loading…' : 'Load more comments'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sticky composer */}
      {!commentsOff && (
        <div className="fixed left-0 right-0 z-30 bg-white border-t border-gray-100"
          style={{ bottom: kb, paddingBottom: kb > 0 ? 0 : 'env(safe-area-inset-bottom)' }}>
          {!user ? (
            <button onClick={() => navigate('/login')} className="w-full py-4 text-sm font-bold text-blue-600">Sign in to join the conversation</button>
          ) : (
            <>
              {replyTo && (
                <div className="flex items-center justify-between px-4 pt-2 text-xs text-gray-500">
                  <span>Replying to <b className="text-gray-800">{replyTo.userName}</b></span>
                  <button onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X className="w-4 h-4" /></button>
                </div>
              )}
              <div className="flex items-center gap-2.5 px-4 py-2.5">
                <UserAvatar user={{ id: user.id, name: user.name, avatar: user.avatar }} size={32} />
                <input ref={inputRef} value={newComment} onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleComment()}
                  placeholder={replyTo ? `Reply to ${replyTo.userName}…` : 'Write a comment…'} enterKeyHint="send"
                  className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none" />
                <button onClick={handleComment} disabled={!newComment.trim() || submitting} aria-label="Send"
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-blue-600 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}
