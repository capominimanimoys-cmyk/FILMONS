/**
 * ReelFeed.tsx — TikTok-style vertical reel feed
 * Features:
 * - Slide-up comments panel
 * - Friend activity toasts (like/comment)
 * - Swipe navigation
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { usePostStore } from '../context/PostContext';
import { postsApi, commentsApi, authApi } from '../lib/api';
import { Post, Comment } from '../types';
import {
  Heart, MessageCircle, Share2, X,
  Volume2, VolumeX, ChevronUp, ChevronDown, Play,
  Send, Loader2, MapPin, Music2, Link2, Tag, GraduationCap, Briefcase, FolderOpen, Repeat2, Check, Plus,
} from 'lucide-react';
import { useFollow } from '../context/FollowContext';
import { RepostMenuSheet } from '../components/RepostMenuSheet';
import { usePostRepostCompose } from '../context/PostRepostComposeContext';
import { logContentRepostActivity, removeContentRepostActivity } from '../lib/activityApi';
import * as notifs from '../lib/notifications';
import { useLearningTransition } from '../context/LearningTransitionContext';
import { buildLocationSlug, parseLocationFreeText } from '../lib/locationsApi';
import { toast } from 'sonner';
import { useCommentActions } from '../components/CommentActions';
import { PortfolioReelCard } from '../components/PortfolioReelCard';
import { PortfolioCommentSheet } from '../components/PortfolioCommentSheet';
import { getReelPortfolioVideos, type ReelPortfolioVideo } from '../lib/portfolioApi';
import { usePortfolioPreview } from '../context/PortfolioPreviewContext';
import { supabase } from '../../lib/supabase';

/** A reel is a normal post, or a portfolio video (id `pf_<itemId>`) whose engagement lives on the portfolio item. */
type Reel = Post & { portfolio?: ReelPortfolioVideo };
const PF = 'pf_';
const toReel = (v: ReelPortfolioVideo): Reel => ({
  id: `${PF}${v.item.id}`, userId: v.item.user_id, userName: v.creator.name,
  videos: [v.item.media_url!], images: v.item.thumbnail_url ? [v.item.thumbnail_url] : [], content: '', portfolio: v,
} as unknown as Reel);

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

function ReelCommentRow({ c, ownerId, onRemoved }: { c: Comment; ownerId?: string; onRemoved: (c: Comment) => void }) {
  const act = useCommentActions({
    kind: 'post', commentId: c.id, text: c.content, authorId: c.userId, contentOwnerId: ownerId, createdAt: c.createdAt,
    editedAt: c.editedAt, pending: String(c.id).startsWith('opt-'),
    onSaveEdit: t => commentsApi.edit(c.id, t, c.createdAt),
    onDelete: async () => { await commentsApi.delete(c.id, { soft: (c.replyCount ?? 0) > 0 }); onRemoved(c); },
  });
  if (c.deleted) return <p className="text-sm italic text-white/40">This comment was deleted.</p>;
  return (
    <div className="flex gap-3" {...act.longPress}>
      {c.userAvatar
        ? <img src={c.userAvatar} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
        : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold shrink-0">{c.userName?.[0]}</div>}
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-semibold">{c.userName}</p>
        {act.editing ? act.editor : <p className="text-white/80 text-sm mt-0.5 whitespace-pre-wrap break-words">{act.text}</p>}
        {act.edited && <p className="text-[11px] text-white/40 mt-0.5">Edited</p>}
      </div>
      <span className="text-white/60 shrink-0">{act.optionsButton}</span>
      {act.overlays}
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
              <ReelCommentRow key={c.id} c={c} ownerId={post.userId} onRemoved={cm => setComments(prev =>
                (cm.replyCount ?? 0) > 0 ? prev.map(x => x.id === cm.id ? { ...x, deleted: true, content: '' } : x) : prev.filter(x => x.id !== cm.id))} />
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
  post, active, hasPlayer, preload, onLike, onComment, friendActivity,
}: {
  post: Post;
  active: boolean;
  /** Previous / current / next reels own a <video>; farther ones keep only the poster (frees decoders + memory). */
  hasPlayer: boolean;
  preload: 'auto' | 'metadata' | 'none';
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
  const { isFollowing, follow } = useFollow();
  const { requestPostRepostCompose } = usePostRepostCompose();

  // "+" on the avatar: tap to follow -> it turns into a green check, holds a
  // moment, then shrinks away. Hidden outright for your own reels and for
  // anyone you already follow.
  const [followAnim, setFollowAnim] = useState<'idle' | 'done' | 'leaving'>('idle');
  const canFollow = !!user && post.userId !== user.id;
  const showFollowBadge = canFollow && (!isFollowing(post.userId) || followAnim !== 'idle');
  const handleFollow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (followAnim !== 'idle') return;
    setFollowAnim('done');
    follow(post.userId).catch(() => {});
    setTimeout(() => setFollowAnim('leaving'), 900);
    setTimeout(() => setFollowAnim('idle'), 1250);
  };

  // Repost (same semantics as PostCard: instant repost / undo / with thoughts)
  const [showRepostMenu, setShowRepostMenu] = useState(false);
  const [hasReposted, setHasReposted] = useState(!!(post as any).hasReposted);
  const [repostCount, setRepostCount] = useState(post.repostCount ?? 0);
  const [reposting, setReposting] = useState(false);
  const handleRepost = async () => {
    if (!user || reposting) return;
    setReposting(true);
    setHasReposted(true); setRepostCount(c => c + 1); setShowRepostMenu(false);
    try {
      const { error } = await supabase.from('reposts').insert({ user_id: user.id, post_id: post.id, quote_text: null });
      if (error) throw error;
      logContentRepostActivity(user.id, 'post', post.id, post.content?.slice(0, 80) || null).catch(() => {});
      toast.success('Reposted to your followers');
      if (post.userId !== user.id) {
        notifs.push(post.userId, {
          type: 'content_repost', fromUserId: user.id, fromUserName: user.name, fromUserAvatar: user.avatar,
          postId: post.id, postContent: (post.content || '').slice(0, 60), postImage: post.images?.[0] || post.thumbnailUrl,
        });
      }
    } catch (e: any) {
      if (e?.code === '23505') { setRepostCount(c => Math.max(0, c - 1)); toast.info('Already reposted'); }
      else { setHasReposted(false); setRepostCount(c => Math.max(0, c - 1)); toast.error('Could not repost'); }
    } finally { setReposting(false); }
  };
  const handleUndoRepost = async () => {
    if (!user || reposting) return;
    setReposting(true);
    setHasReposted(false); setRepostCount(c => Math.max(0, c - 1)); setShowRepostMenu(false);
    try {
      const { error } = await supabase.from('reposts').delete().eq('user_id', user.id).eq('post_id', post.id);
      if (error) throw error;
      removeContentRepostActivity(user.id, 'post', post.id).catch(() => {});
      toast.success('Repost removed');
    } catch { setHasReposted(true); setRepostCount(c => c + 1); toast.error('Could not remove repost'); }
    finally { setReposting(false); }
  };

  const videoSrc = post.videos?.[0];
  const poster = post.images?.[0] || post.thumbnailUrl;
  const [videoReady, setVideoReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);   // autoplay refused -> show a play button
  const [attempt, setAttempt] = useState(0);        // bump to retry a failed video
  const wantPlay = useRef(false);

  const tryPlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || !wantPlay.current) return;
    v.play().then(() => { setPlaying(true); setBlocked(false); }).catch(e => {
      if (e?.name === 'NotAllowedError') { setBlocked(true); setPlaying(false); }
    });
  }, []);

  // Only the visible reel plays. Swiping away pauses at once; the position is kept for when you come back.
  useEffect(() => {
    const v = videoRef.current;
    wantPlay.current = active;
    if (!v) return;
    if (active) {
      setBlocked(false);
      if (v.readyState >= 3) tryPlay();
      else { v.addEventListener('canplay', tryPlay, { once: true }); if (v.preload !== 'auto') v.load(); }
    } else {
      v.pause(); setPlaying(false);
    }
    return () => v.removeEventListener('canplay', tryPlay);
  }, [active, hasPlayer, attempt, tryPlay]);

  // Backgrounded app / hidden tab: pause; resume where it was when visible again.
  useEffect(() => {
    const onVis = () => {
      const v = videoRef.current;
      if (!v) return;
      if (document.hidden) { v.pause(); setPlaying(false); }
      else if (active) tryPlay();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [active, tryPlay]);

  // Leaving Reels: stop audio and release the media.
  useEffect(() => () => {
    const v = videoRef.current;
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  }, []);

  // Players that scroll out of range are released (their element is unmounted); reset flags for a fresh start.
  useEffect(() => { if (!hasPlayer) { setVideoReady(false); setPlaying(false); } }, [hasPlayer]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) { wantPlay.current = false; v.pause(); setPlaying(false); } else { wantPlay.current = true; tryPlay(); }
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
            {/* Poster stays until the first frame is playing. */}
            {poster && !(videoReady && playing) && (
              <img src={poster} alt="" className="absolute inset-0 w-full h-full object-contain" />
            )}
            {hasPlayer && !failed && (
              <video
                key={attempt}
                ref={videoRef}
                src={videoSrc}
                poster={poster}
                muted={muted}
                loop
                playsInline
                preload={preload}
                onCanPlay={() => setVideoReady(true)}
                onWaiting={() => setVideoReady(false)}
                onPlaying={() => { setVideoReady(true); setPlaying(true); }}
                onError={() => { if (videoRef.current?.error) { setFailed(true); setPlaying(false); } }}
                className="relative w-full h-full object-contain"
                onClick={handleDoubleTap}
              />
            )}
            {/* Small buffering indicator over the poster */}
            {active && hasPlayer && !failed && !blocked && !videoReady && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            )}
            {active && failed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40">
                <p className="text-white text-sm">This video couldn't be played.</p>
                <button onClick={() => { setFailed(false); setVideoReady(false); setAttempt(n => n + 1); }}
                  className="px-5 py-2 rounded-full bg-white text-black text-sm font-semibold">Retry</button>
              </div>
            )}
          </>
        : <div className="w-full h-full flex items-center justify-center" onClick={handleDoubleTap}>
            {post.images?.[0] ? <img src={post.images[0]} alt="" className="w-full h-full object-contain" /> : <div className="text-white/50 text-lg p-8 text-center">{post.content}</div>}
          </div>
      }

      {!playing && videoSrc && !failed && (blocked || videoReady) && (
        <div className={`absolute inset-0 flex items-center justify-center ${blocked ? '' : 'pointer-events-none'}`}
          onClick={blocked ? () => { wantPlay.current = true; tryPlay(); } : undefined}>
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
        <ReelAttachments post={post} />
      </div>

      {/* Right actions */}
      <div className="absolute right-3 bottom-16 flex flex-col items-center gap-5">
        <div className="relative">
          <button onClick={() => navigate(`/host/${post.userId}`)} aria-label={`Open ${post.userName}'s profile`}>
            {post.userAvatar
              ? <img src={post.userAvatar} className="w-11 h-11 rounded-full border-2 border-white object-cover shadow-lg" alt="" />
              : <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg">{post.userName?.[0]?.toUpperCase()}</div>
            }
          </button>
          {showFollowBadge && (
            <button onClick={handleFollow} aria-label={followAnim === 'idle' ? `Follow ${post.userName}` : 'Following'}
              className="absolute -bottom-2 left-1/2 w-6 h-6 rounded-full flex items-center justify-center shadow border-2 border-black/20"
              style={{
                transform: `translateX(-50%) scale(${followAnim === 'leaving' ? 0.2 : 1})`,
                opacity: followAnim === 'leaving' ? 0 : 1,
                background: followAnim === 'idle' ? '#ef4444' : '#22c55e',
                transition: 'transform 300ms cubic-bezier(0.34,1.56,0.64,1), opacity 300ms ease, background-color 250ms ease',
              }}>
              <Plus className="w-3.5 h-3.5 text-white absolute"
                style={{ transform: followAnim === 'idle' ? 'rotate(0) scale(1)' : 'rotate(90deg) scale(0)', opacity: followAnim === 'idle' ? 1 : 0, transition: 'transform 250ms ease, opacity 200ms ease' }} strokeWidth={3} />
              <Check className="w-3.5 h-3.5 text-white absolute" strokeWidth={3.5}
                style={{ transform: followAnim === 'idle' ? 'scale(0) rotate(-45deg)' : 'scale(1) rotate(0)', opacity: followAnim === 'idle' ? 0 : 1, transition: 'transform 350ms cubic-bezier(0.34,1.56,0.64,1) 80ms, opacity 200ms ease 80ms' }} />
            </button>
          )}
        </div>
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
        {/* Repost */}
        <div className="flex flex-col items-center gap-1">
          <button onClick={() => { if (!user) { toast.error('Sign in to repost'); return; } setShowRepostMenu(true); }} aria-label="Repost" className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform">
            <Repeat2 className={`w-8 h-8 drop-shadow-lg ${hasReposted ? 'text-green-400' : 'text-white'}`} />
          </button>
          <span className="text-white text-xs font-semibold drop-shadow">{repostCount > 0 ? repostCount : ''}</span>
        </div>
        {videoSrc && (
          <button onClick={() => setMuted(m => !m)} className="w-10 h-10 flex items-center justify-center">
            {muted ? <VolumeX className="w-6 h-6 text-white/70 drop-shadow" /> : <Volume2 className="w-6 h-6 text-white drop-shadow" />}
          </button>
        )}
      </div>

      {/* The sheet is portaled, but React still bubbles its touches up to the
          reel's swipe handlers -- stop them so dragging the sheet can't move the reel. */}
      <div onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
      <RepostMenuSheet
        open={showRepostMenu}
        onClose={() => setShowRepostMenu(false)}
        hasReposted={hasReposted}
        busy={reposting}
        onRepost={handleRepost}
        onUndoRepost={handleUndoRepost}
        onRepostWithThoughts={() => { setShowRepostMenu(false); requestPostRepostCompose(post, () => { setHasReposted(true); setRepostCount(c => c + 1); }); }}
      />
      </div>
    </div>
  );
}

// ── Everything the author attached to the post ────────────────────────────────
// Same attachments PostCard shows (caption #hashtags/@mentions, location,
// sound, link, tagged people, listings, portfolio work, course) so a post
// reads the same in Reels as in the feed.
function ReelCaption({ text }: { text: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const long = text.length > 90;
  const shown = long && !open ? text.slice(0, 90).trimEnd() : text;
  return (
    <p className="text-white text-sm leading-relaxed drop-shadow">
      {shown.split(/(@\w+|#\w+)/g).map((part, i) =>
        part.startsWith('#') && part.length > 1
          ? <button key={i} onClick={() => navigate(`/search/hashtags/${part.slice(1).toLowerCase()}`)} className="font-semibold text-sky-300">{part}</button>
        : part.startsWith('@') && part.length > 1
          ? <button key={i} onClick={() => navigate(`/${part.slice(1)}`)} className="font-semibold text-sky-300">{part}</button>
          : <span key={i}>{part}</span>)}
      {long && !open && <>{'… '}<button onClick={() => setOpen(true)} className="font-semibold text-white/60">more</button></>}
    </p>
  );
}

function Chip({ icon: Icon, children, onClick, thumb }: { icon: any; children: React.ReactNode; onClick: () => void; thumb?: string }) {
  return (
    <button onClick={onClick}
      className="shrink-0 flex items-center gap-1.5 max-w-[210px] rounded-full bg-black/45 backdrop-blur-md border border-white/15 pl-1.5 pr-3 py-1.5 text-white text-xs font-semibold">
      {thumb
        ? <img src={thumb} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
        : <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5" /></span>}
      <span className="truncate">{children}</span>
    </button>
  );
}

function ReelAttachments({ post }: { post: Post }) {
  const navigate = useNavigate();
  const { openPortfolioItem } = usePortfolioPreview();
  const { enterLearning } = useLearningTransition();
  const p = post as any;

  const taggedUsers = ((p.taggedUserIds || []) as string[])
    .map(id => authApi.getUserByIdSync(id)).filter(Boolean) as import('../types').User[];

  const listings: { id: string; title: string; image?: string }[] = [];
  if (p.listingId) listings.push({ id: p.listingId, title: p.listingTitle || 'Listing', image: p.listingImage });
  (p.listingPins || []).forEach((pin: any) => {
    const id = pin.listingId || pin.id;
    if (id && !listings.some(l => l.id === id)) listings.push({ id, title: pin.title || 'Listing', image: pin.image });
  });

  const chips: React.ReactNode[] = [];
  if (p.location) chips.push(
    <Chip key="loc" icon={MapPin} onClick={() => {
      const { city, province } = parseLocationFreeText(p.location);
      navigate(`/search/locations/${encodeURIComponent(buildLocationSlug(city, province))}`);
    }}>{String(p.location).split(',')[0]}</Chip>);
  if (p.audioTitle) chips.push(
    <Chip key="aud" icon={Music2} onClick={() => {
      if (p.audioId) navigate(`/audio/${p.audioId}`);
      else navigate(`/audio/search?title=${encodeURIComponent(p.audioTitle)}`);
    }}>{p.audioTitle}{p.audioArtist ? ` · ${p.audioArtist}` : ''}</Chip>);
  if (p.link) chips.push(
    <Chip key="link" icon={Link2} onClick={() => window.open(String(p.link).startsWith('http') ? p.link : `https://${p.link}`, '_blank', 'noopener,noreferrer')}>
      {String(p.link).replace(/^https?:\/\//, '')}</Chip>);
  taggedUsers.forEach(u => chips.push(
    <Chip key={`u-${u.id}`} icon={Tag} thumb={u.avatar} onClick={() => navigate(`/host/${u.id}`)}>@{u.username || u.name}</Chip>));
  listings.forEach(l => chips.push(
    <Chip key={`l-${l.id}`} icon={Tag} thumb={l.image} onClick={() => navigate(`/listing/${l.id}`)}>{l.title}</Chip>));
  if (p.portfolioItemId) chips.push(
    <Chip key="pf" icon={Briefcase} thumb={p.portfolioItemThumb} onClick={() => openPortfolioItem(p.portfolioItemId)}>{p.portfolioItemTitle || 'Portfolio work'}</Chip>);
  const album = p.ownAlbum || p.repostOfAlbum;
  if (album?.albumId) chips.push(
    <Chip key="alb" icon={FolderOpen} thumb={album.coverUrl} onClick={() => openPortfolioItem(album.albumId, [], 'album')}>{album.title || 'Album'}</Chip>);
  if (p.course) chips.push(
    <Chip key="course" icon={GraduationCap} thumb={p.course.coverUrl || undefined}
      onClick={() => enterLearning(`/course/${p.course.id}`, { route: window.location.pathname + window.location.search })}>{p.course.title}</Chip>);

  return (
    <>
      {post.content && <ReelCaption text={post.content} />}
      {chips.length > 0 && (
        // Horizontal scroller: its touches must not reach the reel's
        // vertical swipe handler on the page container.
        <div className="mt-2 -mr-4 flex gap-2 overflow-x-auto no-scrollbar pr-4"
          style={{ touchAction: 'pan-x' }}
          onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
          {chips}
        </div>
      )}
    </>
  );
}

// ── Reel Feed Page ────────────────────────────────────────────────────────────
export function ReelFeed() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getAllPosts, updatePost } = usePostStore();

  const [posts, setPosts]         = useState<Reel[]>([]);
  const { openPortfolioItem } = usePortfolioPreview();
  const [searchParams] = useSearchParams();
  const [muted, setMuted] = useState(true);
  const [pfComment, setPfComment] = useState<ReelPortfolioVideo | null>(null);
  const [commentDeltas, setCommentDeltas] = useState<Record<string, number>>({});
  const pfCursor = useRef<string | undefined>(undefined);
  const pfDone = useRef(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [friendActivity, setFriendActivity] = useState<Array<{
    id: string; avatar?: string; name: string; action: 'liked' | 'commented'; content?: string;
  }>>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  // Slow / data-saver connections: don't buffer the next reel ahead of time.
  const slowNet = (() => {
    const c = (navigator as any).connection;
    return !!c && (c.saveData || /(^|-)2g$/.test(String(c.effectiveType || '')) || c.effectiveType === '3g');
  })();
  const touchStartY  = useRef(0);
  const touchStartT  = useRef(0);
  const isDragging   = useRef(false);
  // Live finger offset (px) so the reel follows the swipe, then slides into
  // place on release instead of jumping after the finger lifts.
  const [dragY, setDragY]       = useState(0);
  const [dragging, setDragging] = useState(false);

  // The next reels after the one that was tapped. Two small steps -- ids of recent posts that have a
  // video (tiny rows), then the full posts for just the first batch -- instead of loading 100 full
  // posts before anything can play.
  const cursorRef = useRef<string | undefined>(undefined);
  const loadingMoreRef = useRef(false);
  const exhaustedRef = useRef(false);
  const fetchMorePosts = useCallback(async (known: Set<string>, count = 12): Promise<Post[]> => {
    if (loadingMoreRef.current || exhaustedRef.current) return [];
    loadingMoreRef.current = true;
    try {
      let q = supabase.from('posts').select('id, videos, created_at')
        .not('videos', 'is', null).or('is_archived.eq.false,is_archived.is.null')
        .order('created_at', { ascending: false }).limit(120);
      if (cursorRef.current) q = q.lt('created_at', cursorRef.current);
      const { data } = await q;
      const rows = (data ?? []) as any[];
      if (!rows.length) { exhaustedRef.current = true; return []; }
      const nextCursor = rows[rows.length - 1].created_at;
      const ids = rows.filter(r => Array.isArray(r.videos) && r.videos.length > 0 && !known.has(r.id)).map(r => String(r.id)).slice(0, count);
      if (!ids.length) { cursorRef.current = nextCursor; return []; }
      const fetched = await postsApi.getByIds(ids);
      cursorRef.current = nextCursor;   // advance only once the batch loaded, so a failure retries the same page
      const order = new Map(ids.map((id, i) => [id, i]));
      return fetched.filter(p => (p.videos?.length ?? 0) > 0).sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
    } catch { return []; }
    finally { loadingMoreRef.current = false; }
  }, []);

  const busyRef = useRef(false);
  // Posts and eligible portfolio videos load side by side; one portfolio video after every three posts.
  const fetchMoreVideos = useCallback(async (known: Set<string>, count = 12): Promise<Reel[]> => {
    if (busyRef.current) return [];
    busyRef.current = true;
    try {
      const pfKnown = new Set([...known].filter(id => id.startsWith(PF)).map(id => id.slice(PF.length)));
      const [p, pf] = await Promise.all([
        fetchMorePosts(known, count),
        pfDone.current ? Promise.resolve([] as ReelPortfolioVideo[]) : getReelPortfolioVideos({ before: pfCursor.current, limit: 5, excludeIds: pfKnown })
          .then(r => { pfCursor.current = r.cursor; if (r.done) pfDone.current = true; return r.videos; })
          .catch(() => [] as ReelPortfolioVideo[]),   // portfolio failing never blocks the feed
      ]);
      const out: Reel[] = []; const pfr = pf.map(toReel);
      p.forEach((x, i) => { out.push(x as Reel); if ((i + 1) % 3 === 0 && pfr.length) out.push(pfr.shift()!); });
      return [...out, ...pfr];
    } finally { busyRef.current = false; }
  }, [fetchMorePosts]);

  const appendReels = useCallback((extra: Reel[]) => {
    if (!extra.length) return;
    setPosts(prev => {
      const seen = new Set(prev.map(p => p.id));
      const fresh = extra.filter(p => !seen.has(p.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  // Load video posts: the tapped reel plays at once; the queue fills in behind it.
  useEffect(() => {
    let cancelled = false;
    cursorRef.current = undefined; exhaustedRef.current = false; pfCursor.current = undefined; pfDone.current = false;
    const init = async () => {
      setLoading(true);
      try {
        if (!postId) {
          // Reels tab: open the feed from the top.
          const first = await fetchMoreVideos(new Set(), 15);
          if (cancelled) return;
          if (!first.length) { toast.error('No reels to show yet'); navigate(-1); return; }
          setPosts(first); setActiveIdx(0); setLoading(false);
          return;
        }
        if (postId?.startsWith(PF)) {
          // Portfolio video opened directly (profile, search, activity, shared link).
          const itemId = postId.slice(PF.length);
          const first = (await getReelPortfolioVideos({ itemId, limit: 1 })).videos[0];
          if (!first) { if (!cancelled) navigate(`/portfolio/${searchParams.get('creator') || ''}`.replace(/\/$/, ''), { replace: true }); return; }
          let list: Reel[] = [toReel(first)];
          const mine = await getReelPortfolioVideos({ creatorId: first.creator.id, limit: 10, excludeIds: new Set([itemId]) }).catch(() => null);
          if (mine) list = [...list, ...mine.videos.map(toReel)];
          if (cancelled) return;
          setPosts(list); setActiveIdx(0); setLoading(false);
          const extra = await fetchMoreVideos(new Set(list.map(p => p.id)), 15);
          if (!cancelled) appendReels(extra);
          return;
        }
        const stored = getAllPosts().filter(p => (p.videos?.length ?? 0) > 0) as Reel[];
        let list = stored;
        let idx = stored.findIndex(p => p.id === postId);
        if (idx < 0) {
          const [one] = postId ? await postsApi.getByIds([postId]) : [];
          if (!one || (one.videos?.length ?? 0) === 0) { if (!cancelled) navigate(-1); return; }
          list = [one as Reel, ...stored]; idx = 0;
        }
        if (cancelled) return;
        setPosts(list);
        setActiveIdx(idx);
        setLoading(false);
        // Top up the queue in the background (never blocks the tapped reel).
        const extra = await fetchMoreVideos(new Set(list.map(p => p.id)), 15);
        if (!cancelled) appendReels(extra);
      } catch { if (!cancelled) navigate(-1); }
      finally { if (!cancelled) setLoading(false); }
    };
    init();
    return () => { cancelled = true; };
  }, [postId]);

  // Keep the queue ahead of the viewer: a few reels before the end, fetch the next batch.
  useEffect(() => {
    if (!posts.length || activeIdx < posts.length - 3) return;
    fetchMoreVideos(new Set(posts.map(p => p.id)), 15).then(appendReels);
  }, [activeIdx, posts.length]); // eslint-disable-line

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

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartT.current = Date.now();
    isDragging.current = true;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    let dy = e.touches[0].clientY - touchStartY.current;
    // Rubber-band when pulling past the first / last reel.
    if ((activeIdx === 0 && dy > 0) || (activeIdx === posts.length - 1 && dy < 0)) dy *= 0.35;
    setDragY(dy);
  };
  const onTouchEnd   = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    const velocity = Math.abs(dy) / Math.max(Date.now() - touchStartT.current, 1); // px/ms
    // A short fast flick counts the same as a long slow drag.
    if (Math.abs(dy) > 60 || (Math.abs(dy) > 20 && velocity > 0.4)) dy > 0 ? goNext() : goPrev();
    setDragging(false);
    setDragY(0);
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
    <div ref={containerRef} className="fixed inset-0 bg-black z-50 overflow-hidden" style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} onWheel={onWheel}>
      <div className="h-full" style={{
        transform: `translate3d(0, calc(-${activeIdx * 100}% + ${dragY}px), 0)`,
        transition: dragging ? 'none' : 'transform 450ms cubic-bezier(0.22, 1, 0.36, 1)',
        willChange: 'transform',
      }}>
        {posts.map((post, idx) => {
          // Keep full slides (lightweight details + poster) within ±3 so swiping back stays smooth;
          // only previous / current / next own a video player.
          const dist = idx - activeIdx;
          if (Math.abs(dist) > 3) return <div key={post.id} className="w-full h-full bg-black" />;
          if (post.portfolio) return (
            <div key={post.id} className="w-full h-full">
              <PortfolioReelCard reel={post.portfolio} active={dist === 0} hasPlayer={Math.abs(dist) <= 1}
                preload={dist === 0 ? 'auto' : dist === 1 ? (slowNet ? 'none' : 'auto') : 'none'}
                muted={muted} onToggleMuted={() => setMuted(m => !m)} onBack={() => navigate(-1)}
                onProfile={() => navigate(`/host/${post.portfolio!.creator.id}`)}
                onViewProject={() => post.portfolio!.albumId
                  ? openPortfolioItem(post.portfolio!.albumId, [], 'album')
                  : openPortfolioItem(post.portfolio!.item.id, [], 'item', { forceDetail: true })}
                onComment={() => setPfComment(post.portfolio!)} commentDelta={commentDeltas[post.id] ?? 0} />
            </div>
          );
          return (
            <div key={post.id} className="w-full h-full">
              <ReelCard
                post={post}
                active={dist === 0}
                hasPlayer={Math.abs(dist) <= 1}
                preload={dist === 0 ? 'auto' : dist === 1 ? (slowNet ? 'none' : 'auto') : 'none'}
                onLike={handleLike}
                onComment={() => setCommentPost(post)}
                friendActivity={idx === activeIdx ? friendActivity : []}
              />
            </div>
          );
        })}
      </div>

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

      {pfComment && (
        <div onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
          <PortfolioCommentSheet itemId={pfComment.item.id} creatorId={pfComment.item.user_id} itemCategory={pfComment.item.category}
            itemSubcategory={pfComment.item.subcategory} canModerate={user?.id === pfComment.item.user_id} onClose={() => setPfComment(null)} />
        </div>
      )}

      {/* Comments sheet */}
      {commentPost && (
        <div onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
          <CommentsSheet post={commentPost} onClose={() => setCommentPost(null)} />
        </div>
      )}
    </div>
  );
}