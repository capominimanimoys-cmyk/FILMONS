/**
 * ReelFeed.tsx — TikTok-style vertical reel feed
 * Features:
 * - Slide-up comments panel
 * - Friend activity toasts (like/comment)
 * - Swipe navigation
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { usePostStore } from '../context/PostContext';
import { postsApi, commentsApi, authApi } from '../lib/api';
import { Post, Comment } from '../types';
import {
  Heart, MessageCircle, Share2, X,
  Volume2, VolumeX, ChevronUp, ChevronDown, Play,
  Send, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

// ── Friend activity toast ─────────────────────────────────────────────────────
function FriendActivityToast({ avatar, name, action, content }: {
  avatar?: string; name: string; action: 'liked' | 'commented'; content?: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-2 rounded-2xl border border-white/10 max-w-[240px]">
      {avatar
        ? <img src={avatar} className="w-7 h-7 rounded-full object-cover shrink-0" alt="" />
        : <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold shrink-0">{name[0]}</div>
      }
      <div className="min-w-0">
        <p className="text-white text-xs font-semibold truncate">{name}</p>
        <p className="text-white/70 text-xs truncate">
          {action === 'liked' ? '❤️ liked this post' : `💬 ${content}`}
        </p>
      </div>
    </div>
  );
}

// ── Comments bottom sheet ─────────────────────────────────────────────────────
function CommentsSheet({ post, onClose }: { post: Post; onClose: () => void }) {
  const { user } = useAuth();
  const [visible, setVisible]     = useState(false);
  const [comments, setComments]   = useState<Comment[]>([]);
  const [loading, setLoading]     = useState(true);
  const [text, setText]           = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  useEffect(() => {
    commentsApi.getPostComments(post.id, 20, 0).then(c => { setComments(c); setLoading(false); });
  }, [post.id]);

  const handleClose = () => { setVisible(false); setTimeout(onClose, 300); };

  const handleSubmit = () => {
    if (!user || !text.trim() || submitting) return;
    const txt = text.trim();
    setText('');
    const opt: Comment = {
      id: `opt-${Date.now()}`, postId: post.id, userId: user.id,
      userName: user.name, userAvatar: user.avatar,
      userAccountType: user.accountType, content: txt, likes: [],
      createdAt: new Date().toISOString(),
    };
    setComments(prev => [opt, ...prev]);
    commentsApi.add(post.id, txt, post).then(real => {
      setComments(prev => prev.map(c => c.id === opt.id ? { ...opt, ...real } : c));
    }).catch(() => {
      setComments(prev => prev.filter(c => c.id !== opt.id));
      setText(txt);
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={handleClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-[61] bg-[#1a1a1a] rounded-t-3xl flex flex-col transition-transform duration-300 ease-out"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)', maxHeight: '75vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 border-b border-white/10 shrink-0">
          <h3 className="text-white font-bold text-base">Comments</h3>
          <button onClick={handleClose} className="text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Comment list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {loading
            ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-white/40 animate-spin" /></div>
            : comments.length === 0
            ? <p className="text-white/40 text-sm text-center py-8">No comments yet. Be the first!</p>
            : comments.map(c => (
              <div key={c.id} className="flex gap-3">
                {c.userAvatar
                  ? <img src={c.userAvatar} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                  : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold shrink-0">{c.userName?.[0]}</div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-semibold">{c.userName}</p>
                  <p className="text-white/80 text-sm mt-0.5">{c.content}</p>
                </div>
              </div>
            ))
          }
        </div>
        {/* Input */}
        <div className="px-4 py-3 border-t border-white/10 shrink-0 flex gap-3 items-center">
          {user?.avatar
            ? <img src={user.avatar} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
            : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold shrink-0">{user?.name?.[0]}</div>
          }
          <input
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Add a comment…"
            className="flex-1 bg-white/10 text-white placeholder-white/40 text-sm px-4 py-2.5 rounded-full outline-none"
          />
          <button onClick={handleSubmit} disabled={!text.trim()}
            className="w-9 h-9 rounded-full bg-white flex items-center justify-center disabled:opacity-30 transition-opacity shrink-0">
            <Send className="w-4 h-4 text-black" />
          </button>
        </div>
      </div>
    </>
  );
}

// ── Single Reel Card ──────────────────────────────────────────────────────────
function ReelCard({
  post, active, onLike, onComment, friendActivity,
}: {
  post: Post;
  active: boolean;
  onLike: (post: Post) => void;
  onComment: () => void;
  friendActivity: Array<{ id: string; avatar?: string; name: string; action: 'liked' | 'commented'; content?: string }>;
}) {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying]   = useState(false);
  const [muted, setMuted]       = useState(true);
  const [liked, setLiked]       = useState(() => (post.likes ?? []).includes(user?.id ?? ''));
  const [likesCount, setLikesCount] = useState(post.likesCount ?? (post.likes?.length ?? 0));
  const [liking, setLiking]     = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const doubleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  const videoSrc = post.videos?.[0];
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      // Load before playing
      v.load();
      const tryPlay = () => v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      if (v.readyState >= 3) tryPlay();
      else v.addEventListener('canplay', tryPlay, { once: true });
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [active]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); } else { v.play(); setPlaying(true); }
  };

  const handleDoubleTap = () => {
    if (doubleTapTimer.current) {
      clearTimeout(doubleTapTimer.current);
      doubleTapTimer.current = null;
      handleLike();
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 800);
    } else {
      doubleTapTimer.current = setTimeout(() => { doubleTapTimer.current = null; togglePlay(); }, 250);
    }
  };

  const handleLike = async () => {
    if (!user) { toast.error('Sign in to like'); return; }
    if (liking) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikesCount(c => wasLiked ? Math.max(0, c - 1) : c + 1);
    setLiking(true);
    try {
      const { liked: sl, likesCount: sc } = await postsApi.toggleLike(post.id);
      setLiked(sl); setLikesCount(sc);
      onLike({ ...post, likes: sl ? [...(post.likes ?? []), user.id] : (post.likes ?? []).filter(id => id !== user.id), likesCount: sc });
    } catch { setLiked(wasLiked); setLikesCount(c => wasLiked ? c + 1 : Math.max(0, c - 1)); }
    finally { setLiking(false); }
  };

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      {/* Video */}
      {videoSrc
        ? <>
            <video
              ref={videoRef}
              src={videoSrc}
              muted={muted}
              loop
              playsInline
              preload={active ? 'auto' : 'metadata'}
              onCanPlay={() => setVideoReady(true)}
              onWaiting={() => setVideoReady(false)}
              onPlaying={() => setVideoReady(true)}
              className="w-full h-full object-contain"
              onClick={handleDoubleTap}
            />
            {/* Buffering spinner */}
            {active && !videoReady && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </>
        : <div className="w-full h-full flex items-center justify-center" onClick={handleDoubleTap}>
            {post.images?.[0] ? <img src={post.images[0]} alt="" className="w-full h-full object-contain" /> : <div className="text-white/50 text-lg p-8 text-center">{post.content}</div>}
          </div>
      }

      {!playing && videoSrc && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm">
            <Play className="w-7 h-7 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      {showHeart && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Heart className="w-28 h-28 text-red-500 fill-red-500 animate-ping" style={{ animationDuration: '0.6s', animationIterationCount: '1' }} />
        </div>
      )}

      {/* Friend activity toasts — bottom left */}
      {friendActivity.length > 0 && (
        <div className="absolute bottom-36 left-3 flex flex-col gap-2 z-10">
          {friendActivity.map(a => (
            <FriendActivityToast key={a.id} avatar={a.avatar} name={a.name} action={a.action} content={a.content} />
          ))}
        </div>
      )}

      {/* Top controls */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white">
          <X className="w-5 h-5" />
        </button>
        <span className="text-white font-semibold text-sm tracking-wide">Videos</span>
        <button onClick={() => setMuted(m => !m)} className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white">
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-14 p-4 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
        <button onClick={() => navigate(`/host/${post.userId}`)} className="flex items-center gap-2 mb-2">
          {post.userAvatar
            ? <img src={post.userAvatar} className="w-8 h-8 rounded-full border border-white/50 object-cover" alt="" />
            : <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">{post.userName?.[0]?.toUpperCase()}</div>
          }
          <span className="text-white font-semibold text-sm drop-shadow">@{post.userName}</span>
        </button>
        {post.content && <p className="text-white text-sm leading-relaxed line-clamp-2 drop-shadow">{post.content}</p>}
      </div>

      {/* Right actions */}
      <div className="absolute right-3 bottom-16 flex flex-col items-center gap-5">
        <button onClick={() => navigate(`/host/${post.userId}`)} className="relative">
          {post.userAvatar
            ? <img src={post.userAvatar} className="w-11 h-11 rounded-full border-2 border-white object-cover shadow-lg" alt="" />
            : <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg">{post.userName?.[0]?.toUpperCase()}</div>
          }
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow">
            <span className="text-white text-[9px] font-bold">+</span>
          </div>
        </button>
        {/* Like */}
        <div className="flex flex-col items-center gap-1">
          <button onClick={handleLike} disabled={liking} className="w-11 h-11 flex items-center justify-center transition-transform active:scale-90">
            <Heart className={`w-8 h-8 drop-shadow-lg transition-all ${liked ? 'fill-red-500 text-red-500 scale-110' : 'text-white fill-none'}`} />
          </button>
          <span className="text-white text-xs font-semibold drop-shadow">{likesCount > 0 ? likesCount : ''}</span>
        </div>
        {/* Comment */}
        <div className="flex flex-col items-center gap-1">
          <button onClick={onComment} className="w-11 h-11 flex items-center justify-center">
            <MessageCircle className="w-8 h-8 text-white fill-none drop-shadow-lg" />
          </button>
          <span className="text-white text-xs font-semibold drop-shadow">{post.commentCount ?? ''}</span>
        </div>
        {/* Share */}
        <div className="flex flex-col items-center gap-1">
          <button onClick={() => { navigator.share?.({ url: window.location.href }).catch(() => {}); }} className="w-11 h-11 flex items-center justify-center">
            <Share2 className="w-7 h-7 text-white drop-shadow-lg" />
          </button>
        </div>
        {videoSrc && (
          <button onClick={() => setMuted(m => !m)} className="w-10 h-10 flex items-center justify-center">
            {muted ? <VolumeX className="w-6 h-6 text-white/70 drop-shadow" /> : <Volume2 className="w-6 h-6 text-white drop-shadow" />}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Reel Feed Page ────────────────────────────────────────────────────────────
export function ReelFeed() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getAllPosts, updatePost } = usePostStore();

  const [posts, setPosts]         = useState<Post[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [friendActivity, setFriendActivity] = useState<Array<{
    id: string; avatar?: string; name: string; action: 'liked' | 'commented'; content?: string;
  }>>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY  = useRef(0);
  const isDragging   = useRef(false);

  // Load video posts
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const stored = getAllPosts().filter(p => (p.videos?.length ?? 0) > 0);
        let all = stored;
        if (!stored.find(p => p.id === postId)) {
          const fresh = await postsApi.getAll(100, 0);
          all = fresh.filter(p => (p.videos?.length ?? 0) > 0);
        }
        if (all.length === 0) { navigate(-1); return; }
        setPosts(all);
        const idx = all.findIndex(p => p.id === postId);
        setActiveIdx(idx >= 0 ? idx : 0);
      } catch { navigate(-1); }
      finally { setLoading(false); }
    };
    init();
  }, [postId]);

  // Realtime: watch for friend likes/comments on active post
  useEffect(() => {
    if (!user || posts.length === 0) return;
    const activePost = posts[activeIdx];
    if (!activePost) return;

    const myFollowing = new Set(user.following ?? []);

    const channel = supabase
      .channel(`reel-activity-${activePost.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_likes', filter: `post_id=eq.${activePost.id}` }, async (payload: any) => {
        const likerId = payload.new?.user_id;
        if (!likerId || likerId === user.id || !myFollowing.has(likerId)) return;
        const liker = authApi.getUserByIdSync(likerId);
        const name = liker?.name || 'A friend';
        const avatar = liker?.avatar;
        const id = `like-${likerId}-${Date.now()}`;
        setFriendActivity(prev => [...prev.slice(-2), { id, avatar, name, action: 'liked' }]);
        setTimeout(() => setFriendActivity(prev => prev.filter(a => a.id !== id)), 4000);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${activePost.id}` }, async (payload: any) => {
        const commenterId = payload.new?.author_id;
        if (!commenterId || commenterId === user.id || !myFollowing.has(commenterId)) return;
        const commenter = authApi.getUserByIdSync(commenterId);
        const name = commenter?.name || 'A friend';
        const avatar = commenter?.avatar;
        const content = (payload.new?.content || '').slice(0, 40);
        const id = `comment-${commenterId}-${Date.now()}`;
        setFriendActivity(prev => [...prev.slice(-2), { id, avatar, name, action: 'commented', content }]);
        setTimeout(() => setFriendActivity(prev => prev.filter(a => a.id !== id)), 5000);
      })
      .subscribe();

    // Clear activity when switching posts
    setFriendActivity([]);
    return () => { supabase.removeChannel(channel); };
  }, [activeIdx, posts, user]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  goPrev();
      if (e.key === 'Escape') navigate(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIdx, posts.length]);

  const goNext = useCallback(() => setActiveIdx(i => Math.min(i + 1, posts.length - 1)), [posts.length]);
  const goPrev = useCallback(() => setActiveIdx(i => Math.max(i - 1, 0)), []);

  const onTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; isDragging.current = true; };
  const onTouchEnd   = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 50) dy > 0 ? goNext() : goPrev();
  };
  const lastWheel = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastWheel.current < 600) return;
    lastWheel.current = now;
    e.deltaY > 0 ? goNext() : goPrev();
  };

  const handleLike = (updated: Post) => {
    updatePost(updated.id, { likes: updated.likes, likesCount: updated.likesCount });
    setPosts(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
  };

  if (loading) return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black z-50 overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onWheel={onWheel}>
      <div className="h-full transition-transform duration-300 ease-out" style={{ transform: `translateY(-${activeIdx * 100}%)` }}>
        {posts.map((post, idx) => {
          // Only render ±2 slides to save memory; preload src for adjacent
          const inView = Math.abs(idx - activeIdx) <= 2;
          if (!inView) return <div key={post.id} className="w-full h-screen bg-black" />;
          return (
            <div key={post.id} className="w-full h-screen">
              <ReelCard
                post={post}
                active={idx === activeIdx}
                onLike={handleLike}
                onComment={() => setCommentPost(post)}
                friendActivity={idx === activeIdx ? friendActivity : []}
              />
            </div>
          );
        })}
      </div>

      {/* Preload next video in background */}
      {posts[activeIdx + 1]?.videos?.[0] && (
        <link rel="preload" as="video" href={posts[activeIdx + 1].videos![0]} />
      )}

      {/* Navigation arrows */}
      <div className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 flex-col gap-3 z-10">
        <button onClick={goPrev} disabled={activeIdx === 0} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition disabled:opacity-30">
          <ChevronUp className="w-5 h-5" />
        </button>
        <button onClick={goNext} disabled={activeIdx === posts.length - 1} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition disabled:opacity-30">
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>

      {/* Progress dots */}
      {posts.length > 1 && posts.length <= 10 && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-10">
          {posts.map((_, i) => (
            <button key={i} onClick={() => setActiveIdx(i)}
              className={`rounded-full transition-all ${i === activeIdx ? 'w-1.5 h-5 bg-white' : 'w-1.5 h-1.5 bg-white/40'}`}
            />
          ))}
        </div>
      )}

      {/* Comments sheet */}
      {commentPost && <CommentsSheet post={commentPost} onClose={() => setCommentPost(null)} />}
    </div>
  );
}