import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { TextLayerRenderer, type TextLayer } from './TextLayerEditor';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { usePostStore } from '../context/PostContext';
import { CommentSheet } from './CommentSheet';
import {
  Heart, Trash2, MoreHorizontal, Play, Volume2, VolumeX,
  MessageCircle, Send, X, UserX, AtSign, Loader2,
  Bookmark, Share2, Download, Lock, Link2, ExternalLink,
  Zap, BarChart2, Pin, Star, TrendingUp, Maximize2,
  ChevronLeft, ChevronRight, Music, Repeat2, Flag,
  EyeOff, BarChart, User as UserIcon, AlertTriangle,
  Bell, BellOff, UserMinus, Archive, Edit2, Globe, Eye,
  Copy, Clock, Tag, Smile, ThumbsDown, MapPin,
} from 'lucide-react';
import { Post, Comment } from '../types';
import { postsApi, commentsApi, authApi, savedPostsApi } from '../lib/api';
import * as notifs from '../lib/notifications';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { UserAvatar, AccountTypeBadge } from './AccountTypeBadge';
import { AudioPlayer } from './AudioPlayer';
import { AudioFeedCard } from './AudioFeedCard';
import { AudioPostCard } from './AudioPostCard';
import { SharePostModal } from './SharePostModal';
import { ListingTagSheet } from './ListingTagSheet';
import { EditPostModal } from './EditPostModal';
import { LikesSheet } from './LikesSheet';
import { addImageWatermark, triggerDownload } from '../lib/watermark';

function timeAgo(dateString?: string | null): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Bottom Sheet — slides up from bottom with transition ─────────────────────
function BottomSheet({ open, onClose, children }: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 360);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.28s ease',
        }}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: visible
            ? 'transform 0.36s cubic-bezier(0.32,0.72,0,1)'
            : 'transform 0.28s cubic-bezier(0.4,0,1,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="overflow-y-auto max-h-[80vh] pb-6">
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ── Inline video player ───────────────────────────────────────────
function VideoPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    if (!ref.current) return;
    if (playing) { ref.current.pause(); setPlaying(false); }
    else { ref.current.play(); setPlaying(true); }
  };
  return (
    <div className="relative bg-black aspect-video overflow-hidden group cursor-pointer" onClick={toggle}>
      <video ref={ref} src={src} muted={muted} loop playsInline className="w-full h-full object-contain" onEnded={() => setPlaying(false)} />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
            <Play className="w-6 h-6 text-gray-900 ml-0.5" />
          </div>
        </div>
      )}
      {playing && (
        <button onClick={e => { e.stopPropagation(); setMuted(v => !v); if (ref.current) ref.current.muted = !muted; }}
          className="absolute bottom-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}

// ── Comment item ─────────────────────────────────────────────────
function CommentItem({ comment, onDeleted }: { comment: Comment; onDeleted: (id: string) => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwn = user?.id === comment.userId;
  const [deleting, setDeleting] = useState(false);
  const [commentLikes, setCommentLikes] = useState<string[]>(comment.likes || []);
  const [likingComment, setLikingComment] = useState(false);
  const isCommentLiked = user ? commentLikes.includes(user.id) : false;

  const handleDelete = async () => {
    if (!window.confirm('Delete this comment?')) return;
    setDeleting(true);
    try { await commentsApi.delete(comment.id); onDeleted(comment.id); }
    catch { toast.error('Could not delete comment'); }
    finally { setDeleting(false); }
  };

  const handleLikeComment = async () => {
    if (!user) { toast.error('Sign in to like comments'); return; }
    if (likingComment) return;
    setLikingComment(true);
    const optimistic = isCommentLiked
      ? commentLikes.filter(id => id !== user.id)
      : [...commentLikes, user.id];
    setCommentLikes(optimistic);
    try {
      const updated = await commentsApi.toggleCommentLike(comment.id);
      setCommentLikes(updated);
    } catch {
      setCommentLikes(commentLikes);
      toast.error('Could not like comment');
    } finally { setLikingComment(false); }
  };

  return (
    <div className="flex items-start gap-2.5 group">
      <button onClick={() => navigate(`/host/${comment.userId}`)} className="flex-shrink-0 cursor-pointer">
        <UserAvatar user={{ name: comment.userName, avatar: comment.userAvatar, id: comment.userId }} size={30} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-3 py-2">
          <div className="flex items-center gap-1.5 mb-0.5">
            <button onClick={() => navigate(`/host/${comment.userId}`)}
              className="text-xs font-semibold text-gray-900 hover:text-blue-600 transition-colors">
              {comment.userName}
            </button>
            {comment.userAccountType && <AccountTypeBadge type={comment.userAccountType} size="sm" />}
          </div>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{comment.content}</p>
        </div>
        <div className="flex items-center gap-3 mt-0.5 ml-3">
          <p className="text-[11px] text-gray-400">{timeAgo(comment.createdAt)}</p>
          <button onClick={handleLikeComment} disabled={likingComment}
            className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${isCommentLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}>
            <Heart className={`w-3 h-3 ${isCommentLiked ? 'fill-red-500 scale-110' : ''} transition-transform`} />
            {commentLikes.length > 0 && <span>{commentLikes.length}</span>}
          </button>
        </div>
      </div>
      {isOwn && (
        <button onClick={handleDelete} disabled={deleting}
          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all flex-shrink-0 mt-1">
          {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
}

// ── Main PostCard ─────────────────────────────────────────────────
const POST_MENU_EVENT = 'postcard:menuopen';

interface PostCardProps {
  post: Post;
  onDeleted?: (id: string) => void;
  onLikeToggled?: (updated: Post) => void;
  onReposted?: (newPost: Post) => void;
  /** ID of the current user's existing repost of this post (if any) */
  userRepostPostId?: string;
}

// Normalize a post's media fields — handles PG array strings e.g. "{url1,url2}"
function normalizePost(p: any): any {
  const a = (v: any): string[] => {
    if (Array.isArray(v)) return v;
    if (!v) return [];
    if (typeof v !== 'string') return [];
    if (v.startsWith('{')) return v.slice(1,-1).split(',').map((s:string)=>s.trim().replace(/^"|"$/g,'')).filter(Boolean);
    return [v];
  };
  return { ...p, images: a(p.images), videos: a(p.videos), audios: a(p.audios) };
}

export function PostCard({ post: rawPost, onDeleted, onLikeToggled, onReposted, userRepostPostId }: PostCardProps) {
  const post = normalizePost(rawPost);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getPost, updatePost } = usePostStore();

  // Always initialise from prop for content; only take cached values for engagement counts
  const [localPost, setLocalPost] = useState<Post>(() => {
    const cached = getPost(post.id);
    const base = cached ? {
      ...post,
      likes:        (cached.likes?.length ?? 0) > (post.likes?.length ?? 0) ? cached.likes : (post.likes ?? []),
      likesCount:   Math.max(cached.likesCount ?? 0, post.likesCount ?? 0),
      commentCount: Math.max(cached.commentCount ?? 0, post.commentCount ?? 0),
    } : post;
    return normalizePost(base);
  });
  const [showMenu, setShowMenu] = useState(false);
  const [audioPlaying,   setAudioPlaying]   = useState(false);
  const [showListingTags, setShowListingTags] = useState(false);
  const [activeListing,   setActiveListing]   = useState<any|null>(null);
  const [tagOverlay,      setTagOverlay]      = useState<'people'|'listings'|null>(null);
  const [activeProfile,   setActiveProfile]   = useState<any|null>(null);
  const cardRef      = useRef<HTMLDivElement>(null);
  const postAudioRef = useRef<HTMLAudioElement|null>(null);
  const [showOtherMenu, setShowOtherMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [liking, setLiking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Repost
  const [showRepostMenu,   setShowRepostMenu]   = useState(false);
  const [hasReposted,      setHasReposted]      = useState(!!userRepostPostId);
  const [repostBanner, setRepostBanner] = useState<{ names: string[]; extra: number } | null>(null);

  // Fetch who from the current user's circle reposted this post
  useEffect(() => {
    if (!user || !(localPost.repostCount ?? 0)) return;
    const following = user.following || [];
    const idsToCheck = [...new Set([user.id, ...following])];
    if (!idsToCheck.length) return;
    let cancelled = false;
    supabase
      .from('reposts')
      .select('user_id')
      .eq('post_id', localPost.id)
      .in('user_id', idsToCheck.slice(0, 50))
      .limit(3)
      .then(async ({ data }) => {
        if (cancelled || !data?.length) return;
        const ids = data.map((r: any) => r.user_id);
        const names: string[] = [];
        if (ids.includes(user.id)) names.push('You');
        const friendIds = ids.filter((id: string) => id !== user.id).slice(0, 2);
        if (friendIds.length) {
          const { data: profiles } = await supabase
            .from('profiles').select('id, name, username').in('id', friendIds);
          (profiles || []).forEach((p: any) => names.push(p.name || p.username || ''));
        }
        if (!cancelled && names.length) {
          const extra = Math.max(0, (localPost.repostCount ?? 0) - names.length);
          setRepostBanner({ names, extra });
        }
      });
    return () => { cancelled = true; };
  }, [localPost.id, localPost.repostCount, user?.id]); // eslint-disable-line
  const [textOverlays,     setTextOverlays]     = useState<TextLayer[]>([]);

  // Fetch text overlays for this post
  useEffect(() => {
    if (!localPost.id) return;
    (async () => {
      try {
        const { data } = await supabase.from('text_overlays')
          .select('*')
          .eq('post_id', localPost.id)
          .eq('visible', true)
          .order('layer_order');
        if (data?.length) setTextOverlays(data as TextLayer[]);
      } catch {}
    })();
  }, [localPost.id]); // eslint-disable-line
  const [metaIdx,          setMetaIdx]          = useState(0);
  const [metaVisible,      setMetaVisible]      = useState(true);
  const [showMetaSheet,    setShowMetaSheet]    = useState(false);

  // Rotating metadata: location shows 2.8s → slides out → audio shows 2.8s → repeat
  useEffect(() => {
    const hasLoc   = !!(localPost as any).location;
    const hasAudio = !!(localPost as any).audioTitle;
    if (!hasLoc || !hasAudio) return;
    const interval = setInterval(() => {
      setMetaVisible(false);                    // trigger slide-out
      setTimeout(() => {
        setMetaIdx(i => (i + 1) % 2);          // swap content
        setMetaVisible(true);                   // trigger slide-in
      }, 280);                                  // matches metaSlideOut duration
    }, 2800);
    return () => clearInterval(interval);
  }, [(localPost as any).location, (localPost as any).audioTitle]); // eslint-disable-line
  const [showEditModal,  setShowEditModal]  = useState(false);
  const [showLikesSheet, setShowLikesSheet] = useState(false);
  const [showDoubleTapHeart, setDoubleTapHeart] = useState(false);
  const doubleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRepostModal, setShowRepostModal] = useState(false);
  const [repostComment, setRepostComment] = useState('');
  const [reposting, setReposting] = useState(false);

  // Lightbox
  const [lightbox, setLightbox] = useState<{ type: 'image' | 'video' | 'audio'; index: number } | null>(null);

  // Save
  const [saved, setSaved] = useState(() =>
    user ? savedPostsApi.isSavedSync(user.id, post.id) : false
  );

  // Share modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [notifMuted, setNotifMuted] = useState(false);

  // Comments
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(() => {
    const cached = getPost(post.id);
    return cached?.commentCount
      ?? commentsApi.getCountSync(post.id)
      ?? post.commentCount
      ?? 0;
  });
  const inputRef = useRef<HTMLInputElement>(null);

  // Wrap setLocalPost so every state update also persists to the global store.
  const setPost = (updater: Post | ((prev: Post) => Post)) => {
    setLocalPost(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      updatePost(next.id, next);
      return next;
    });
  };

  const isOwn = user?.id === localPost.userId;

  // Auto-play audio when post scrolls into view, stop when leaving
  // Global singleton: only one post plays at a time
  // AudioFeedCard (standalone audio posts) manages its own element — skip auto-play for those.
  useEffect(() => {
    const audioUrl = (localPost as any).audio_url
      || (localPost as any).audioUrl
      || (Array.isArray((localPost as any).audios) ? (localPost as any).audios[0] : null)
      || (typeof (localPost as any).audios === 'string' ? (localPost as any).audios : null);
    if (!audioUrl || !(localPost as any).audioTitle) return;
    if (isStandaloneAudio) return; // AudioFeedCard handles its own playback

    const snippetStart = (localPost as any).audio_snippet_start ?? 0;
    const snippetEnd   = (localPost as any).audio_snippet_end;

    let timeListener: (() => void) | null = null;

    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        // Stop whatever other post was playing
        const w = window as any;
        if (w.__filmons_audio && w.__filmons_audio !== postAudioRef.current) {
          w.__filmons_audio.pause();
          w.__filmons_audio = null;
        }
        // Create audio element if needed
        if (!postAudioRef.current) {
          postAudioRef.current = new Audio(audioUrl);
          postAudioRef.current.volume = w.__filmons_muted ? 0 : 0.45;
          postAudioRef.current.loop   = !snippetEnd;
        }
        // Register as global
        w.__filmons_audio = postAudioRef.current;
        // Seek to snippet start
        if (snippetStart) postAudioRef.current.currentTime = snippetStart;
        // Loop within snippet
        if (snippetEnd) {
          timeListener = () => {
            if (postAudioRef.current && postAudioRef.current.currentTime >= snippetEnd) {
              postAudioRef.current.currentTime = snippetStart;
              postAudioRef.current.play().catch(()=>{});
            }
          };
          postAudioRef.current.addEventListener('timeupdate', timeListener);
        }
        postAudioRef.current.play().catch(()=>{});
        setAudioPlaying(true);
      } else {
        // Stop when scrolled away
        if (postAudioRef.current) {
          postAudioRef.current.pause();
          if (timeListener) postAudioRef.current.removeEventListener('timeupdate', timeListener);
          const w = window as any;
          if (w.__filmons_audio === postAudioRef.current) w.__filmons_audio = null;
        }
        setAudioPlaying(false);
      }
    }, { threshold: 0.5 });

    if (cardRef.current) obs.observe(cardRef.current);

    return () => {
      obs.disconnect();
      if (postAudioRef.current) {
        postAudioRef.current.pause();
        if (timeListener) postAudioRef.current.removeEventListener('timeupdate', timeListener);
        const w = window as any;
        if (w.__filmons_audio === postAudioRef.current) w.__filmons_audio = null;
        postAudioRef.current = null;
      }
      setAudioPlaying(false);
    };
  }, [(localPost as any).audio_url, (localPost as any).audioTitle]); // eslint-disable-line

  // Sync ALL content fields when the post prop changes (e.g. after server fetch
  // replaces a stale sessionStorage-cached version with real data).
  useEffect(() => {
    setLocalPost(prev => normalizePost({
      ...prev,
      content:         post.content         ?? prev.content,
      images:          post.images          ?? prev.images,
      videos:          post.videos          ?? prev.videos,
      gifs:            post.gifs            ?? prev.gifs,
      audios:          (post as any).audios ?? (prev as any).audios,
      audioNames:      post.audioNames      ?? prev.audioNames,
      userName:        post.userName        || prev.userName,
      userAvatar:      post.userAvatar      ?? prev.userAvatar,
      userAccountType: post.userAccountType ?? prev.userAccountType,
      taggedUserIds:   (post as any).taggedUserIds   ?? (prev as any).taggedUserIds,
      allowComments:   post.allowComments   ?? prev.allowComments,
      allowDownload:   post.allowDownload   ?? prev.allowDownload,
      link:            post.link            ?? prev.link,
      repostOf:        post.repostOf        ?? prev.repostOf,
      isArchived:      (post as any).isArchived      ?? (prev as any).isArchived,
      isPinned:        (post as any).isPinned        ?? (prev as any).isPinned,
      // Extra fields that PostCard renders
      location:        (post as any).location        ?? (prev as any).location,
      audioTitle:      (post as any).audioTitle      ?? (prev as any).audioTitle,
      audioArtist:     (post as any).audioArtist     ?? (prev as any).audioArtist,
      audioId:         (post as any).audioId         ?? (prev as any).audioId,
      audio_url:       (post as any).audio_url       ?? (prev as any).audio_url,
      listingId:       (post as any).listingId       ?? (prev as any).listingId,
      listingTitle:    (post as any).listingTitle     ?? (prev as any).listingTitle,
      listingPrice:    (post as any).listingPrice     ?? (prev as any).listingPrice,
      listingMode:     (post as any).listingMode      ?? (prev as any).listingMode,
      listingCity:     (post as any).listingCity      ?? (prev as any).listingCity,
      listingImage:    (post as any).listingImage     ?? (prev as any).listingImage,
      listingPins:     (post as any).listingPins      ?? (prev as any).listingPins,
      tagPins:         (post as any).tagPins          ?? (prev as any).tagPins,
    }));
  }, [post.id, post.content, post.images, post.videos, post.userAvatar, post.userName]); // eslint-disable-line

  // Sync likes when prop changes — prefer whichever confirms the user liked it
  useEffect(() => {
    if (!user) return;
    const propLikes  = post.likes ?? [];
    const localLikes = localPost.likes ?? [];
    const userInProp  = propLikes.includes(user.id);
    const userInLocal = localLikes.includes(user.id);
    if (userInProp && !userInLocal) {
      setLocalPost(prev => normalizePost({ ...prev, likes: propLikes, likesCount: post.likesCount ?? prev.likesCount }));
    } else if (!userInProp && !userInLocal && propLikes.length !== localLikes.length) {
      setLocalPost(prev => normalizePost({ ...prev, likesCount: post.likesCount ?? prev.likesCount }));
    }
  }, [post.likes, post.likesCount]); // eslint-disable-line

  // ── Realtime: live like count from any user ──────────────────────────────
  // Only subscribe to posts UPDATE — this carries the authoritative likes_count
  // and avoids double-counting from simultaneous post_likes INSERT + posts UPDATE.
  useEffect(() => {
    const ch = supabase
      .channel(`post_likes:${localPost.id}:${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'posts',
        filter: `id=eq.${localPost.id}`,
      }, async (payload: any) => {
        const updated = payload.new;
        if (!updated) return;
        const newCount: number = updated.likes_count ?? 0;

        // Fetch fresh post row for metadata.likes (JSONB is often null in realtime payload)
        const { data: fresh } = await supabase
          .from('posts')
          .select('metadata, likes_count')
          .eq('id', localPost.id)
          .single();

        const authoritative = fresh?.likes_count ?? newCount;
        const meta = fresh?.metadata && typeof fresh.metadata === 'object' ? fresh.metadata
          : (() => { try { return JSON.parse(fresh?.metadata || '{}'); } catch { return {}; } })();
        const metaLikes: string[] = Array.isArray(meta.likes) ? meta.likes : [];

        // Also try post_likes if available
        const { data: plRows } = await supabase
          .from('post_likes').select('user_id').eq('post_id', localPost.id);
        const plLikes: string[] = (plRows ?? []).map((r: any) => r.user_id);

        // Use whichever source has more data
        const newLikes = plLikes.length >= metaLikes.length ? plLikes : metaLikes;

        setPost(prev => ({ ...prev, likesCount: authoritative, likes: newLikes }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [localPost.id]); // eslint-disable-line
  const isLiked = user ? (localPost.likes || []).includes(user.id) : false;
  // Use dedicated likesCount if available (server-authoritative), fallback to array length
  const displayLikesCount = localPost.likesCount ?? (localPost.likes || []).length;
  const canDownload = isOwn || localPost.allowDownload !== false;

  // ── Fetch real comment count — staggered to avoid mass re-render cascade ──
  useEffect(() => {
    const t = setTimeout(() => {
      commentsApi.getCount(localPost.id).then(cnt => {
        // Always update from server — server is authoritative
        setCommentCount(cnt);
        try {
          const cache = JSON.parse(localStorage.getItem('filmons_comment_counts') || '{}');
          cache[localPost.id] = cnt;
          localStorage.setItem('filmons_comment_counts', JSON.stringify(cache));
        } catch {}
      }).catch(() => {});
    }, Math.random() * 2000 + 500); // stagger 0.5–2.5s
    return () => clearTimeout(t);
  }, [localPost.id]); // eslint-disable-line

  // tagged users
  const taggedUsers = ((localPost as any).taggedUserIds || []).length
    ? (((localPost as any).taggedUserIds || []).map((id: string) => authApi.getUserByIdSync(id)).filter(Boolean) as import('../types').User[])
    : [];

  // ── like ──
  const handleDoubleTapLike = () => {
    if (doubleTapTimer.current) {
      clearTimeout(doubleTapTimer.current);
      doubleTapTimer.current = null;
      // Double-tap: only like, never unlike
      const wasLiked = (localPost.likes ?? []).includes(user?.id ?? '');
      if (!wasLiked) handleLike();
      setDoubleTapHeart(true);
      setTimeout(() => setDoubleTapHeart(false), 900);
    } else {
      doubleTapTimer.current = setTimeout(() => { doubleTapTimer.current = null; }, 280);
    }
  };

  const handleLike = async () => {
    if (!user) { toast.error('Sign in to like posts'); return; }
    if (liking) return;
    // Haptic feedback
    try { if ('vibrate' in navigator) navigator.vibrate(10); } catch {}
    setLiking(true);

    const wasLiked = (localPost.likes ?? []).includes(user.id);
    const prevLikes = localPost.likes ?? [];
    const prevCount = localPost.likesCount ?? prevLikes.length;

    // 1. Optimistic flip — instant UI feedback
    const nextLikes = wasLiked
      ? prevLikes.filter(id => id !== user.id)
      : [...prevLikes, user.id];
    const nextCount = wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1;
    setPost(p => ({ ...p, likes: nextLikes, likesCount: nextCount }));

    try {
      // 2. Server saves — use client's known state for likes array (server count is authoritative)
      const { likesCount } = await postsApi.toggleLike(localPost.id, wasLiked);

      // nextLikes already reflects the correct post-toggle state from the optimistic update
      setPost(p => ({ ...p, likes: nextLikes, likesCount }));
      onLikeToggled?.({ ...localPost, likes: nextLikes, likesCount });

      // 4. Notify post owner on like (not unlike, not self)
      if (!wasLiked && localPost.userId && localPost.userId !== user.id) {
        notifs.push(localPost.userId, {
          type: 'like',
          fromUserId:    user.id,
          fromUserName:  user.name,
          fromUserAvatar: user.avatar,
          postId:        localPost.id,
          postContent:   (localPost.content || '').slice(0, 60),
          postImage:     localPost.images?.[0] || localPost.thumbnailUrl,
        });
      }
    } catch (err: any) {
      // 4. Rollback
      console.error('[like] FAILED — code:', (err as any)?.code, '| message:', err?.message ?? err);
      setPost(p => ({ ...p, likes: prevLikes, likesCount: prevCount }));
      toast.error('Could not update like');
    } finally {
      setLiking(false);
    }
  };

  // ── save ──
  const handleSave = async () => {
    if (!user) { toast.error('Sign in to save posts'); return; }
    try {
      const nowSaved = await savedPostsApi.toggle(user.id, localPost.id);
      setSaved(nowSaved);
      toast(nowSaved ? 'Post saved!' : 'Post removed from saved', { icon: nowSaved ? '🔖' : '✕' });
    } catch { toast.error('Could not save post'); }
  };

  // ── download ──
  const handleDownload = async () => {
    const wOpts = { userName: localPost.userName || 'Filmons User', userId: localPost.userId };
    for (let i = 0; i < (localPost.images || []).length; i++) {
      try {
        const watermarked = await addImageWatermark(localPost.images![i], wOpts);
        triggerDownload(watermarked, `filmons-${localPost.userId}-photo-${i + 1}.jpg`);
      } catch { triggerDownload(localPost.images![i], `filmons-photo-${i + 1}.jpg`); }
    }
    safeVideos.forEach((src: string, i: number) => triggerDownload(src, `filmons-${localPost.userId}-video-${i + 1}.mp4`));
    (Array.isArray((localPost as any).audios) ? (localPost as any).audios : []).forEach((src: string, i: number) => triggerDownload(src, `filmons-${localPost.userId}-${localPost.audioNames?.[i] || `audio-${i + 1}.mp3`}`));
    toast.success('Downloading with Filmons watermark…');
  };

  // ── delete post ──
  // Pass confirmed=true when calling from a custom sheet so window.confirm is skipped.
  const handleDelete = async (confirmed = false) => {
    if (!confirmed && !window.confirm('Delete this post?')) return;
    setDeleting(true);
    try { await postsApi.delete(localPost.id); onDeleted?.(localPost.id); toast.success('Post deleted'); }
    catch { toast.error('Could not delete post'); }
    finally { setDeleting(false); }
  };

  // ── repost ──
  const handleRepost = async () => {
    if (!user) { toast.error('Sign in to repost'); return; }
    setReposting(true);
    try {
      const { error } = await supabase.from('reposts').insert({
        user_id: user.id,
        post_id: localPost.id,
        quote_text: null,
      });
      if (error) throw error;
      // Update both local state and PostContext so all views stay in sync
      setPost(p => ({ ...p, repostCount: (p.repostCount ?? 0) + 1 }));
      // Also increment posts.reposts_count in DB
      supabase.from('posts')
        .update({ reposts_count: (localPost.repostCount ?? 0) + 1 })
        .eq('id', localPost.id)
        .then(() => {});
      setHasReposted(true);
      onReposted?.(localPost);
      toast.success('Reposted to your followers');
      setShowRepostMenu(false);
      if (localPost.userId && localPost.userId !== user.id) {
        notifs.push(localPost.userId, {
          type: 'content_repost',
          fromUserId:    user.id,
          fromUserName:  user.name,
          fromUserAvatar: user.avatar,
          postId:        localPost.id,
          postContent:   (localPost.content || '').slice(0, 60),
          postImage:     localPost.images?.[0] || localPost.thumbnailUrl,
        });
      }
    } catch (e: any) {
      if (e?.code === '23505') toast.info('Already reposted');
      else toast.error('Could not repost');
    } finally { setReposting(false); }
  };

  const handleUndoRepost = async (_?: string) => {
    if (!user) return;
    setReposting(true);
    try {
      await supabase.from('reposts').delete().eq('user_id', user.id).eq('post_id', localPost.id);
      setPost(p => ({ ...p, repostCount: Math.max(0, (p.repostCount ?? 1) - 1) }));
      supabase.from('posts')
        .update({ reposts_count: Math.max(0, (localPost.repostCount ?? 1) - 1) })
        .eq('id', localPost.id)
        .then(() => {});
      setHasReposted(false);
      setShowRepostMenu(false);
      toast.success('Repost removed');
    } catch { toast.error('Could not remove repost'); }
    finally { setReposting(false); }
  };

  const handleQuoteRepost = async () => {
    if (!user) { toast.error('Sign in to repost'); return; }
    if (!repostComment.trim()) { toast.error('Add a comment to quote repost'); return; }
    setReposting(true);
    try {
      const newPost = await postsApi.create(
        repostComment.trim(), undefined, undefined, undefined, undefined,
        true, undefined, undefined, true, undefined,
        {
          postId: localPost.id,
          userId: localPost.userId,
          userName: localPost.userName,
          userAvatar: localPost.userAvatar,
          content: localPost.content,
          images: localPost.images,
          createdAt: localPost.createdAt,
        },
      );
      onReposted?.(newPost);
      toast.success('Quote reposted!');
      setShowRepostModal(false);
      setRepostComment('');
    } catch { toast.error('Could not quote repost'); }
    finally { setReposting(false); }
  };

  // ── toggle comments ──
  const handleToggleComments = () => setShowComments(v => !v);



  const safeImages = Array.isArray(localPost.images) ? localPost.images : (typeof localPost.images === 'string' && localPost.images ? [localPost.images] : []);
  const safeVideos = Array.isArray(localPost.videos) ? localPost.videos : (typeof localPost.videos === 'string' && localPost.videos ? [localPost.videos] : []);
  const safeAudios = Array.isArray((localPost as any).audios) ? (localPost as any).audios : (typeof (localPost as any).audios === 'string' && (localPost as any).audios ? [(localPost as any).audios] : []);
  const hasImages = safeImages.length > 0;
  const hasVideos = safeVideos.length > 0;
  const hasAudios = safeAudios.length > 0;
  const hasGifs   = (localPost.gifs?.length   ?? 0) > 0;
  const hasMedia  = hasImages || hasVideos || hasAudios;

  // Parse media_urls — may arrive as a JS array, PG array literal "{...}", or JSON array "[...]".
  const safeMediaUrls: string[] = (() => {
    const raw = (localPost as any).media_urls;
    if (Array.isArray(raw)) return (raw as string[]).filter(Boolean);
    if (typeof raw !== 'string' || !raw) return [];
    if (raw.startsWith('{'))
      return raw.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
    if (raw.startsWith('[')) {
      try { const p = JSON.parse(raw); if (Array.isArray(p)) return (p as string[]).filter(Boolean); } catch {}
    }
    if (raw.startsWith('http')) return [raw];
    return [];
  })();

  // Regex that matches audio file extensions in a URL.
  const RX_AUDIO = /\.(mp3|m4a|wav|ogg|aac|webm|flac)(\?|$)/i;

  // Best audio src: audios column → audio_url → audio-ext URL in media_urls → audio-ext URL
  // accidentally placed in the images array by server-side normalization.
  const resolvedAudioSrc: string =
    safeAudios[0] ||
    (localPost as any).audio_url ||
    safeMediaUrls.find(u => RX_AUDIO.test(u)) ||
    safeImages.find(u => RX_AUDIO.test(u)) ||       // ← server sometimes puts audio into images
    '';

  // ── Standalone audio detection — latched ──────────────────────────────────
  // PRIMARY signal: post_type === 'audio' (set by AudioPostComposer at publish time).
  // This is reliable from the very first render and survives component remounts.
  // FALLBACK signals: audios array, audio-extension URLs in media_urls or images.
  // The latch (false→true, never reversed) prevents flickering during data syncs.
  const _audioLatch     = useRef(false);
  const _postTypeAudio  = (localPost as any).post_type === 'audio';
  const _imagesHasAudio = safeImages.some(u => RX_AUDIO.test(u));
  const _mediaHasAudio  = safeMediaUrls.some(u => RX_AUDIO.test(u));
  const _audioCheck     = (_postTypeAudio || hasAudios || _mediaHasAudio || _imagesHasAudio)
                          && !hasVideos && !!(localPost as any).audioTitle;
  if (_audioCheck) _audioLatch.current = true;
  const isStandaloneAudio = _audioLatch.current;

  // Photo grid for regular posts: strip any audio-extension URLs that the server
  // accidentally placed into the images array (they'd render as broken image cells).
  const photoImages = safeImages.filter(u => !RX_AUDIO.test(u));

  // Cover art for audio posts. Exclude audio-extension URLs from cover candidates.
  // Latched so the cover never disappears once found.
  const _coverLatch = useRef<string | undefined>(undefined);
  const _coverNow = (() => {
    if (!isStandaloneAudio) return undefined;
    // Look in images, skipping audio-extension URLs
    const imgCover = safeImages.find(u => !RX_AUDIO.test(u));
    if (imgCover) return imgCover;
    const artworkUrl = (localPost as any).artwork_url || (localPost as any).artworkUrl;
    if (artworkUrl) return artworkUrl as string;
    return safeMediaUrls.find(u => u && !RX_AUDIO.test(u) && /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u)) ?? undefined;
  })();
  if (_coverNow && !_coverLatch.current) _coverLatch.current = _coverNow;
  const audioPostCover = _coverLatch.current;

  // ── boost / analytics modal state ──
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [boostStep, setBoostStep] = useState<'goal' | 'audience' | 'budget' | 'confirm'>('goal');
  const [boostGoal, setBoostGoal] = useState<'profile' | 'website' | 'message' | ''>('');
  const [boostAudience, setBoostAudience] = useState<'suggested' | 'custom'>('suggested');
  const [boostBudget, setBoostBudget] = useState(4);
  const [boostDays, setBoostDays] = useState(1);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);

  // ── Global menu singleton ──
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ postId: string }>;
      if (ce.detail.postId !== localPost.id) {
        setShowMenu(false); setShowOtherMenu(false); setShowRepostMenu(false);
      }
    };
    window.addEventListener(POST_MENU_EVENT, handler);
    return () => window.removeEventListener(POST_MENU_EVENT, handler);
  }, [localPost.id]);

  const dispatchMenuOpen = () =>
    window.dispatchEvent(new CustomEvent(POST_MENU_EVENT, { detail: { postId: localPost.id } }));

  const toggleMenu = () => { if (!showMenu) dispatchMenuOpen(); setShowMenu(v => !v); };
  const toggleOtherMenu = () => { if (!showOtherMenu) dispatchMenuOpen(); setShowOtherMenu(v => !v); };

  if (hidden) return null;

  // ── Standalone audio posts use their own visually distinct dark card ──────
  if (isStandaloneAudio) {
    return (
      <>
        <AudioPostCard
          post={localPost}
          audioSrc={resolvedAudioSrc}
          coverUrl={audioPostCover}
          isLiked={isLiked}
          likesCount={displayLikesCount}
          commentCount={commentCount}
          saved={saved}
          hasReposted={hasReposted}
          repostCount={localPost.repostCount ?? 0}
          isOwn={isOwn}
          onLike={handleLike}
          onSave={handleSave}
          onComment={() => setShowComments(true)}
          onShare={() => setShowShareModal(true)}
          onRepost={() => { dispatchMenuOpen(); setShowRepostMenu(v => !v); }}
          onNavigateAudio={() => {
            const aId    = (localPost as any).audioId;
            const aTitle = (localPost as any).audioTitle;
            if (aId)     navigate(`/audio/${aId}`);
            else if (aTitle) navigate(`/audio/search?title=${encodeURIComponent(aTitle)}`);
            else         navigate(`/post/${localPost.id}`);
          }}
          onNavigateProfile={() => navigate(`/host/${localPost.userId}`)}
          onMenuOpen={isOwn ? toggleMenu : toggleOtherMenu}
        />

        {/* Shared sheets — same ones used by regular PostCard */}
        <BottomSheet open={showMenu} onClose={() => setShowMenu(false)}>
          <div className="px-2 py-1">
            <button onClick={() => { setShowMenu(false); setShowEditModal(true); }}
              className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl">
              <Edit2 className="w-4 h-4 text-gray-400" /> Edit post
            </button>
            <button onClick={() => { setShowMenu(false); handleSave(); }}
              className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl">
              <Bookmark className="w-3.5 h-3.5 text-gray-500" /> {saved ? 'Unsave' : 'Save'}
            </button>
            <button onClick={() => { setShowMenu(false); navigator.clipboard?.writeText(`${window.location.origin}/post/${localPost.id}`); toast.success('Link copied!'); }}
              className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl">
              <Link2 className="w-4 h-4 text-gray-400" /> Copy link
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }}
              className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 rounded-xl">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </BottomSheet>

        <BottomSheet open={showOtherMenu} onClose={() => setShowOtherMenu(false)}>
          <div className="px-2 py-1">
            <button onClick={() => { setShowOtherMenu(false); handleSave(); }}
              className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl">
              <Bookmark className="w-3.5 h-3.5 text-gray-500" /> {saved ? 'Unsave' : 'Save'}
            </button>
            <button onClick={() => { setShowOtherMenu(false); navigator.clipboard?.writeText(`${window.location.origin}/post/${localPost.id}`); toast.success('Link copied!'); }}
              className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl">
              <Link2 className="w-4 h-4 text-gray-400" /> Copy link
            </button>
            <button onClick={() => { setShowOtherMenu(false); setHidden(true); toast('Post hidden'); }}
              className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl">
              <EyeOff className="w-4 h-4 text-gray-400" /> Hide post
            </button>
          </div>
        </BottomSheet>

        <BottomSheet open={showRepostMenu} onClose={() => setShowRepostMenu(false)}>
          <div className="px-2 py-2">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest px-4 pb-3">Repost</p>
            {hasReposted ? (
              <button onClick={() => handleUndoRepost()} disabled={reposting}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-left rounded-xl hover:bg-red-50">
                <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                  <Repeat2 className="w-4 h-4 text-red-500" />
                </div>
                <div><p className="text-sm font-black text-red-600">Remove Repost</p><p className="text-xs text-gray-400">Remove from your profile</p></div>
              </button>
            ) : (
              <button onClick={handleRepost} disabled={reposting}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-left rounded-xl hover:bg-green-50">
                <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                  <Repeat2 className="w-4 h-4 text-green-500" />
                </div>
                <div><p className="text-sm font-black text-gray-900">Repost</p><p className="text-xs text-gray-400">Share to your followers</p></div>
              </button>
            )}
          </div>
        </BottomSheet>

        {showComments && (
          <CommentSheet
            postId={localPost.id}
            postOwnerId={localPost.userId}
            allowComments={localPost.allowComments !== false}
            commentCount={commentCount}
            totalCommentsCount={localPost.totalCommentsCount ?? commentCount}
            onClose={() => setShowComments(false)}
            onCountChange={n => { setCommentCount(n); updatePost(localPost.id, { commentCount: n }); }}
          />
        )}
        {showShareModal && <SharePostModal post={localPost} onClose={() => setShowShareModal(false)} />}
        {showEditModal && (
          <EditPostModal
            post={localPost}
            onSave={updated => { setPost(updated); setShowEditModal(false); }}
            onClose={() => setShowEditModal(false)}
          />
        )}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
            <div className="relative w-full bg-white rounded-t-3xl p-6 pb-10 z-10">
              <p className="text-base font-black text-gray-900 mb-2">Delete this audio post?</p>
              <p className="text-sm text-gray-400 mb-6">This cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-sm">Cancel</button>
                <button onClick={() => handleDelete(true)} disabled={deleting} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-black text-sm">
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
        {showLikesSheet && (
          <LikesSheet postId={localPost.id} likeIds={localPost.likes || []} onClose={() => setShowLikesSheet(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="relative">
        {/* ── Repost banner (top of card) ── */}
        {repostBanner && (
          <div className="flex items-center gap-1.5 px-4 py-1.5 bg-green-50 border-b border-green-100">
            <Repeat2 className="w-3 h-3 text-green-500 shrink-0" />
            <p className="text-[11px] text-gray-500 truncate">
              <span className="font-semibold text-gray-700">
                {repostBanner.names.slice(0, 2).join(', ')}
              </span>
              {repostBanner.extra > 0 && (
                <span className="text-gray-400"> +{repostBanner.extra} more</span>
              )}
              {' '}reposted
            </p>
          </div>
        )}

        {/* ── Three-dot for OWN posts — now inside header ── */}
        {/* ── Own post menu ── */}
          <BottomSheet open={showMenu} onClose={() => setShowMenu(false)}>
            <div className="px-2 py-1">
              {/* Edit */}
              <button onClick={() => { setShowMenu(false); setShowEditModal(true); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                <Edit2 className="w-4 h-4 text-gray-400" /> Edit post
              </button>

              {/* Pin / unpin */}
              <button onClick={() => { setShowMenu(false); toast.success('Post pinned to your profile!'); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                <Pin className="w-4 h-4 text-gray-400" /> Pin to profile
              </button>

              {/* Highlight */}
              <button onClick={() => { setShowMenu(false); toast.success('Added to highlights!'); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                <Star className="w-4 h-4 text-yellow-500" /> Add to highlight
              </button>

              {/* Save */}
              <button onClick={() => { setShowMenu(false); handleSave(); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                <Bookmark className={`w-3.5 h-3.5 ${saved ? 'fill-current text-blue-600' : 'text-gray-500'}`} />
                {saved ? 'Unsave post' : 'Save post'}
              </button>

              {/* Copy link */}
              <button onClick={() => { setShowMenu(false); navigator.clipboard?.writeText(`${window.location.origin}/post/${localPost.id}`); toast.success('Link copied!'); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                <Link2 className="w-4 h-4 text-gray-400" /> Copy link to post
              </button>

              {/* Audience */}
              <button onClick={() => { setShowMenu(false); toast.info('Audience settings coming soon'); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                <Globe className="w-4 h-4 text-gray-400" /> Edit audience
              </button>

              {/* Turn off comments */}
              <button onClick={() => { setShowMenu(false); toast.success(localPost.allowComments === false ? 'Comments turned on' : 'Comments turned off'); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                <MessageCircle className="w-4 h-4 text-gray-400" /> {localPost.allowComments === false ? 'Turn on comments' : 'Turn off comments'}
              </button>

              {/* Repost / Remove repost */}
              <button onClick={() => { setShowMenu(false); dispatchMenuOpen(); setShowRepostMenu(true); }}
                className={`flex items-center gap-3 w-full px-4 py-3.5 text-sm rounded-xl transition-colors ${hasReposted ? 'text-red-600 hover:bg-red-50 font-semibold' : 'text-gray-800 hover:bg-gray-50'}`}>
                <Repeat2 className={`w-4 h-4 ${hasReposted ? 'text-red-500' : 'text-green-600'}`} />
                {hasReposted ? 'Remove repost' : 'Repost'}
              </button>

              {/* Boost */}
              <button onClick={() => { setShowMenu(false); setBoostStep('goal'); setShowBoostModal(true); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-purple-700 hover:bg-purple-50 rounded-xl transition-colors font-semibold">
                <Zap className="w-4 h-4" /> Boost post
              </button>

              {/* Analytics */}
              <button onClick={() => { setShowMenu(false); setShowAnalyticsModal(true); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                <BarChart2 className="w-4 h-4 text-gray-400" /> View analytics
              </button>

              {/* Who can see */}
              <button onClick={() => { setShowMenu(false); toast.info(`${(localPost.likes||[]).length} likes · ${commentCount} comments`); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                <Eye className="w-4 h-4 text-gray-400" /> Post activity
              </button>

              {/* Archive */}
              <button onClick={() => { setShowMenu(false); toast.success('Post archived'); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                <Archive className="w-4 h-4 text-gray-400" /> Archive post
              </button>

              <div className="border-t border-gray-100 my-1" />

              {/* Download media */}
              {hasMedia && (
                <button onClick={() => { setShowMenu(false); handleDownload(); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                  <Download className="w-4 h-4 text-gray-400" /> Download media
                </button>
              )}

              {/* Delete */}
              <button onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }} disabled={deleting}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting…' : 'Move to trash'}
              </button>
            </div>
          </BottomSheet>


        {/* ── Three-dot for OTHER users' posts ── */}
        {!isOwn && (
          <div className="absolute top-3 right-3 z-30">
            <button onClick={toggleOtherMenu}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-md text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-all">
              <MoreHorizontal className="w-4 h-4" />
            </button>
            <BottomSheet open={showOtherMenu} onClose={() => setShowOtherMenu(false)}>
              <div className="px-2 py-1">
                {/* Save */}
                <button onClick={() => { setShowOtherMenu(false); handleSave(); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                  <Bookmark className={`w-3.5 h-3.5 ${saved ? 'fill-current text-blue-600' : 'text-gray-500'}`} />
                  {saved ? 'Unsave post' : 'Save post'}
                </button>

                {/* Copy link */}
                <button onClick={() => { setShowOtherMenu(false); navigator.clipboard?.writeText(`${window.location.origin}/post/${localPost.id}`); toast.success('Link copied!'); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                  <Link2 className="w-4 h-4 text-gray-400" /> Copy link to post
                </button>

                {/* View post */}
                <button onClick={() => { setShowOtherMenu(false); navigate(`/post/${localPost.id}`); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                  <ExternalLink className="w-4 h-4 text-gray-400" /> Open post
                </button>

                {/* Repost / Remove repost */}
                <button onClick={() => { setShowOtherMenu(false); dispatchMenuOpen(); setShowRepostMenu(true); }}
                  className={`flex items-center gap-3 w-full px-4 py-3.5 text-sm rounded-xl transition-colors ${hasReposted ? 'text-red-600 hover:bg-red-50' : 'text-gray-800 hover:bg-gray-50'}`}>
                  <Repeat2 className={`w-4 h-4 ${hasReposted ? 'text-red-500' : 'text-green-600'}`} />
                  {hasReposted ? 'Remove your repost' : 'Repost'}
                </button>

                {/* Post activity */}
                <button onClick={() => { setShowOtherMenu(false); toast.info(`${(localPost.likes||[]).length} likes · ${commentCount} comments`); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                  <BarChart className="w-4 h-4 text-gray-400" /> View post interactions
                </button>

                {/* View profile */}
                <button onClick={() => { setShowOtherMenu(false); navigate(`/host/${localPost.userId}`); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                  <UserIcon className="w-4 h-4 text-gray-400" /> See {localPost.userName}&apos;s profile
                </button>

                {/* Mute notifications for post */}
                <button onClick={() => { setShowOtherMenu(false); setNotifMuted(v => !v); toast.success(notifMuted ? 'Notifications on for this post' : 'Notifications muted for this post'); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                  {notifMuted
                    ? <Bell className="w-4 h-4 text-gray-400" />
                    : <BellOff className="w-4 h-4 text-gray-400" />
                  }
                  {notifMuted ? 'Unmute notifications' : 'Mute notifications'}
                </button>

                {/* Unfollow */}
                <button onClick={() => { setShowOtherMenu(false); toast.success(`Unfollowed ${localPost.userName}`); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                  <UserMinus className="w-4 h-4 text-gray-400" /> Unfollow {localPost.userName}
                </button>

                {/* Hide post */}
                <button onClick={() => { setShowOtherMenu(false); setHidden(true); toast('Post hidden', { description: "You won't see this again" }); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                  <EyeOff className="w-4 h-4 text-gray-400" /> Hide post
                </button>

                {/* Not interested */}
                <button onClick={() => { setShowOtherMenu(false); setHidden(true); toast("Got it! We'll show you less of this"); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                  <ThumbsDown className="w-4 h-4 text-gray-400" /> Not interested in this
                </button>

                {/* Download */}
                {hasMedia && canDownload && (
                  <button onClick={() => { setShowOtherMenu(false); handleDownload(); }}
                    className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
                    <Download className="w-4 h-4 text-gray-400" /> Download media
                  </button>
                )}

                <div className="border-t border-gray-100 my-1" />

                {/* Report */}
                <button onClick={() => { setShowOtherMenu(false); toast.warning("Post reported. We'll review it shortly."); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-orange-600 hover:bg-orange-50 rounded-xl transition-colors">
                  <Flag className="w-4 h-4" /> Report post
                </button>

                {/* Spam */}
                <button onClick={() => { setShowOtherMenu(false); toast.warning('Marked as spam. Thank you!'); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                  <AlertTriangle className="w-4 h-4" /> Mark as spam
                </button>

                {/* Block */}
                <button onClick={() => { setShowOtherMenu(false); toast.warning(`${localPost.userName} has been blocked`); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                  <UserX className="w-4 h-4" /> Block {localPost.userName}
                </button>
              </div>
            </BottomSheet>
          </div>
        )}

        {/* ── Repost dropdown ── */}
        <BottomSheet open={showRepostMenu} onClose={() => setShowRepostMenu(false)}>
          <div className="px-2 py-2">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest px-4 pb-3">Repost</p>
            {hasReposted ? (
              <button onClick={() => handleUndoRepost()} disabled={reposting}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-left rounded-xl hover:bg-red-50 transition-colors">
                <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                  <Repeat2 className="w-4 h-4 text-red-500"/>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black text-red-600">{reposting ? 'Removing…' : 'Remove Repost'}</p>
                  <p className="text-xs text-gray-400">Remove from your profile and feed</p>
                </div>
              </button>
            ) : (
              <button onClick={handleRepost} disabled={reposting}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-left rounded-xl hover:bg-green-50 transition-colors">
                <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                  <Repeat2 className="w-4 h-4 text-green-500"/>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black text-gray-900">{reposting ? 'Reposting…' : 'Repost'}</p>
                  <p className="text-xs text-gray-400">Share to your followers</p>
                </div>
              </button>
            )}
            <button onClick={() => { setShowRepostMenu(false); setShowRepostModal(true); }}
              className="flex items-center gap-3 w-full px-4 py-3.5 text-left rounded-xl hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4 text-blue-500"/>
              </div>
              <div className="flex-1">
                <p className="text-sm font-black text-gray-900">Quote Repost</p>
                <p className="text-xs text-gray-400">Add your own commentary</p>
              </div>
            </button>
          </div>
        </BottomSheet>

        {/* ── Card box ── */}
        <div ref={cardRef} className="bg-white border-b border-gray-100">

          {/* ── Repost banner ── */}
          {localPost.repostOf && (
            <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5 text-xs text-gray-400">
              <Repeat2 className="w-3 h-3 text-green-500 shrink-0"/>
              <span>Reposted by{' '}
                <span className="font-semibold text-gray-600">
                  @{(localPost.repostOf as any).reposterUsername
                    || (localPost.repostOf as any).userName
                    || localPost.userName}
                </span>
              </span>
            </div>
          )}

          {/* ══ 1. HEADER ══ */}
          <div className="flex items-center px-3 pt-3 pb-2 gap-2.5">
            <button onClick={()=>navigate(`/host/${localPost.userId}`)} className="shrink-0">
              <UserAvatar user={{name:localPost.userName,avatar:localPost.userAvatar,id:localPost.userId}} size={38}/>
            </button>
            <div className="flex-1 min-w-0">
              <button onClick={()=>navigate(`/host/${localPost.userId}`)} className="text-left block">
                <p className="text-[13px] font-black text-gray-900 leading-tight truncate">
                  {(localPost as any).collaborators?.length > 0
                    ? <>{localPost.userName}<span className="font-normal text-gray-400"> × </span>{(localPost as any).collaborators.map((c:any)=>c.username||c.name).join(' × ')}</>
                    : localPost.userName}
                </p>
                <p className="text-[11px] text-gray-400 leading-tight">
                  {(localPost as any).userRole && <span className="capitalize">{(localPost as any).userRole} · </span>}
                  {timeAgo(localPost.createdAt)}
                </p>
              </button>
            </div>
            {isOwn && (
              <button onClick={toggleMenu}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 shrink-0">
                <MoreHorizontal className="w-5 h-5"/>
              </button>
            )}
          </div>

          {/* ══ 1b. ROTATING METADATA ROW (location → audio → repeat) ══ */}
          {(()=>{
            const hasLoc   = !!(localPost as any).location;
            const hasAudio = !!(localPost as any).audioTitle;
            // Standalone audio posts show track info inside AudioFeedCard — skip the row
            if (isStandaloneAudio) return null;
            if (!hasLoc && !hasAudio) return null;
            const isOriginal = !(localPost as any).audioArtist || (localPost as any).audioArtist === localPost.userName;
            const showAudio  = hasAudio && (!hasLoc || metaIdx === 1);
            const handleTap  = () => {
              if (hasLoc && hasAudio) { setShowMetaSheet(true); return; }
              if (hasAudio) {
                const aId=(localPost as any).audioId, aTitle=(localPost as any).audioTitle;
                if(aId) navigate(`/audio/${aId}`);
                else if(aTitle) navigate(`/audio/search?title=${encodeURIComponent(aTitle)}`);
              }
            };
            return (
              <>
                <style>{`
                  @keyframes metaSlideIn {
                    0%   { opacity:0; transform:translateY(6px); }
                    100% { opacity:1; transform:translateY(0);   }
                  }
                  @keyframes metaSlideOut {
                    0%   { opacity:1; transform:translateY(0);    }
                    100% { opacity:0; transform:translateY(-6px); }
                  }
                `}</style>

                <div style={{height:'28px', overflow:'hidden', position:'relative'}}>
                <button
                  onClick={handleTap}
                  onContextMenu={e=>{
                    e.preventDefault();
                    const w=window as any;
                    if(postAudioRef.current){
                      w.__filmons_muted = !w.__filmons_muted;
                      postAudioRef.current.volume = w.__filmons_muted ? 0 : 0.45;
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 pb-2.5 w-full text-left group overflow-hidden"
                  style={{
                    animation: metaVisible
                      ? 'metaSlideIn 0.3s cubic-bezier(0.22,1,0.36,1) forwards'
                      : 'metaSlideOut 0.25s ease forwards',
                  }}>

                  {showAudio ? (
                    <>
                      <div className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-[10px] text-white"
                        style={{background:'linear-gradient(135deg,#3b82f6,#8b5cf6)'}}>♫</div>
                      <p className="text-[12px] text-gray-500 truncate group-hover:text-blue-500 transition-colors flex-1">
                        {!isOriginal
                          ? <><span className="font-bold">{(localPost as any).audioTitle}</span><span className="text-gray-400"> · {(localPost as any).audioArtist}</span></>
                          : <><span className="font-bold">Original Audio</span><span className="text-gray-400"> · {localPost.userName}</span></>}
                      </p>
                    </>
                  ) : (
                    <>
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0"/>
                      <p className="text-[12px] text-gray-500 truncate group-hover:text-blue-500 transition-colors flex-1 font-medium">
                        {(localPost as any).location}
                      </p>
                    </>
                  )}


                </button>
                </div>

                {/* Post Details sheet */}
                <BottomSheet open={showMetaSheet} onClose={()=>setShowMetaSheet(false)}>
                  <div className="px-2 py-2">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest px-4 pb-3">Post Details</p>
                    {hasLoc && (
                      <button onClick={()=>setShowMetaSheet(false)}
                        className="flex items-center gap-3 w-full px-4 py-3.5 text-left rounded-xl hover:bg-gray-50 transition-colors">
                        <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4 text-blue-500"/>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-black text-gray-900">📍 View Location</p>
                          <p className="text-xs text-gray-400">{(localPost as any).location}</p>
                        </div>
                      </button>
                    )}
                    {hasAudio && (
                      <button onClick={()=>{
                        setShowMetaSheet(false);
                        const aId=(localPost as any).audioId, aTitle=(localPost as any).audioTitle;
                        if(aId) navigate(`/audio/${aId}`);
                        else if(aTitle) navigate(`/audio/search?title=${encodeURIComponent(aTitle)}`);
                      }}
                        className="flex items-center gap-3 w-full px-4 py-3.5 text-left rounded-xl hover:bg-gray-50 transition-colors">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-sm"
                          style={{background:'linear-gradient(135deg,#3b82f6,#8b5cf6)'}}>♫</div>
                        <div className="flex-1">
                          <p className="text-sm font-black text-gray-900">🎵 View Audio Details</p>
                          <p className="text-xs text-gray-400">
                            {isOriginal ? `Original Audio · @${localPost.userName}` : `${(localPost as any).audioTitle} · ${(localPost as any).audioArtist}`}
                          </p>
                        </div>
                      </button>
                    )}
                  </div>
                </BottomSheet>
              </>
            );
          })()}

          {/* ══ 2. MEDIA ══ */}

          {/* ── Standalone audio post: SoundCloud-style card ── */}
          {isStandaloneAudio && (
            <AudioFeedCard
              audioSrc={resolvedAudioSrc}
              audioTitle={(localPost as any).audioTitle}
              audioArtist={(localPost as any).audioArtist || localPost.userName || ''}
              coverUrl={audioPostCover}
              onNavigate={() => {
                const aId    = (localPost as any).audioId;
                const aTitle = (localPost as any).audioTitle;
                if (aId)    navigate(`/audio/${aId}`);
                else if (aTitle) navigate(`/audio/search?title=${encodeURIComponent(aTitle)}`);
                else        navigate(`/post/${localPost.id}`);
              }}
            />
          )}

          {hasVideos && (
            <div className="overflow-hidden">
              {safeVideos.map((v,i)=>(
                <div key={i} className="relative bg-black cursor-pointer" onClick={()=>navigate(`/reels/${localPost.id}`)}>
                  <VideoPlayer src={v}/>
                  {/* Marketplace icon on video */}
                  {((localPost as any).listingPins?.length>0 || (localPost as any).listingId) && !showListingTags && (
                    <button
                      onClick={e=>{e.stopPropagation(); setShowListingTags(true);}}
                      className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full px-2.5 py-1.5"
                      style={{background:'rgba(0,0,0,0.55)',backdropFilter:'blur(8px)'}}>
                      <span className="text-base leading-none">🛒</span>
                      {(localPost as any).listingPins?.length > 1 && (
                        <span className="text-[11px] font-bold text-white">{(localPost as any).listingPins.length}</span>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {photoImages.length > 0 && !isStandaloneAudio && (
            <div className={`relative overflow-hidden grid gap-px ${photoImages.length===1?'grid-cols-1':photoImages.length===2?'grid-cols-2':photoImages.length===3?'grid-cols-3':'grid-cols-2'}`}
              onDoubleClick={handleDoubleTapLike}
              onTouchEnd={handleDoubleTapLike}>
              {/* Double-tap heart overlay */}
              {showDoubleTapHeart && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <style>{`@keyframes dtHeart{0%{transform:scale(0.3);opacity:0.9}50%{transform:scale(1.2);opacity:1}80%{transform:scale(1);opacity:1}100%{transform:scale(1.1);opacity:0}}`}</style>
                  <Heart className="w-28 h-28 fill-white text-white drop-shadow-2xl"
                    style={{ animation: 'dtHeart 0.85s ease forwards' }}/>
                </div>
              )}
              {photoImages.slice(0,4).map((img,i)=>{
                // Apply non-destructive crop transform from stored metadata
                const cropData = (localPost as any).originalUrls?.crops?.[i];
                const scale    = cropData?.zoom_scale   ?? (i===0 ? ((localPost as any).zoomScale   ?? 1) : 1);
                const offX     = cropData?.offset_x     ?? (i===0 ? ((localPost as any).zoomOffsetX ?? 0) : 0);
                const offY     = cropData?.offset_y     ?? (i===0 ? ((localPost as any).zoomOffsetY ?? 0) : 0);
                const aspectR  = (localPost as any).ratio?.replace(':','/') || '4/5';
                return (
                <div key={i}
                  className={`relative overflow-hidden bg-gray-100 cursor-pointer`}
                  style={{aspectRatio: photoImages.length===1 ? aspectR : '1/1'}}
                  onClick={()=>{
                    const pins=(localPost as any).listingPins;
                    if(showListingTags){setShowListingTags(false);}
                    else if(pins?.length>0){/* let icon handle */}
                    else setLightbox({type:'image',index:i});
                  }}>
                  <img src={img} alt="" className="w-full h-full object-cover"
                    style={{
                      transform: (scale!==1||offX!==0||offY!==0)
                        ? `scale(${scale}) translate(${offX/scale}px,${offY/scale}px)`
                        : undefined,
                      transformOrigin: 'center',
                    }}/>
                  {/* Text overlays (non-destructive, from DB) */}
                  {i === 0 && textOverlays.length > 0 && (
                    <TextLayerRenderer layers={textOverlays}/>
                  )}
                  {/* Text layers (non-destructive overlays) */}
                  {i===0 && (localPost as any).text_layers?.length > 0 && (
                    <TextLayerRenderer layers={(localPost as any).text_layers}/>
                  )}
                  {i===3 && photoImages.length>4 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white font-bold text-xl">+{photoImages.length-4}</span>
                    </div>
                  )}

                  {/* ── Bottom-left: tagged people icon ── */}
                  {i===0 && (localPost as any).tagPins?.length>0 && (
                    <button onClick={e=>{e.stopPropagation(); setTagOverlay(v=>v==='people'?null:'people'); setShowListingTags(false);}}
                      className="absolute bottom-2.5 left-2.5 w-8 h-8 rounded-full flex items-center justify-center text-base transition-all active:scale-90"
                      style={{background:'rgba(0,0,0,0.55)',backdropFilter:'blur(8px)'}}>
                      👥
                    </button>
                  )}

                  {/* ── Bottom-right: listing icon ── */}
                  {i===0 && ((localPost as any).listingPins?.length>0||(localPost as any).listingId) && (
                    <button onClick={e=>{e.stopPropagation(); setShowListingTags(v=>!v); setTagOverlay(null);}}
                      className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
                      style={{background:'rgba(0,0,0,0.55)',backdropFilter:'blur(8px)'}}>
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                      </svg>
                    </button>
                  )}

                  {/* ── People tag pins ── */}
                  {i===0 && tagOverlay==='people' && (
                    <>
                      <div className="absolute inset-0 bg-black/20 pointer-events-none"/>
                      <button onClick={e=>{e.stopPropagation();setTagOverlay(null);}}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                        <X className="w-3.5 h-3.5 text-white"/>
                      </button>
                      {(localPost as any).tagPins?.map((pin:any,pi:number)=>(
                        <button key={pi}
                          onClick={e=>{e.stopPropagation(); navigate(`/host/${pin.userId||pin.id||''}`)}}
                          className="absolute"
                          style={{left:`${pin.x??50}%`,top:`${pin.y??40}%`,transform:'translate(-50%,-100%)'}}>
                          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl px-2.5 py-1.5 flex items-center gap-1.5 whitespace-nowrap border border-white/60">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0"/>
                            <p className="text-[11px] font-black text-gray-900 max-w-[90px] truncate">{pin.displayName||pin.name}</p>
                          </div>
                          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-0 h-0"
                            style={{borderLeft:'5px solid transparent',borderRight:'5px solid transparent',borderTop:'5px solid white'}}/>
                        </button>
                      ))}
                    </>
                  )}

                  {/* ── Listing tag pins ── */}
                  {i===0 && showListingTags && (
                    <>
                      <div className="absolute inset-0 bg-black/20 pointer-events-none"/>
                      <button onClick={e=>{e.stopPropagation();setShowListingTags(false);}}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                        <X className="w-3.5 h-3.5 text-white"/>
                      </button>
                      {(localPost as any).listingPins?.map((pin:any,pi:number)=>(
                        <button key={pi}
                          onClick={e=>{e.stopPropagation();setActiveListing({...pin,listingId:pin.listingId||pin.id});}}
                          className="absolute"
                          style={{left:`${pin.x??50}%`,top:`${pin.y??40}%`,transform:'translate(-50%,-100%)'}}>
                          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl px-2.5 py-1.5 flex items-center gap-1.5 whitespace-nowrap border border-white/60">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"/>
                            <p className="text-[11px] font-black text-gray-900 max-w-[100px] truncate">{pin.title}</p>
                            {pin.price&&<p className="text-[10px] text-blue-500 font-bold shrink-0">${pin.price}{pin.mode==='rent'?'/d':''}</p>}
                          </div>
                          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-0 h-0"
                            style={{borderLeft:'5px solid transparent',borderRight:'5px solid transparent',borderTop:'5px solid white'}}/>
                        </button>
                      ))}
                      {!(localPost as any).listingPins?.length && (localPost as any).listingId && (
                        <button onClick={e=>{e.stopPropagation();setActiveListing({listingId:(localPost as any).listingId,title:(localPost as any).listingTitle,price:(localPost as any).listingPrice,mode:(localPost as any).listingMode,image:(localPost as any).listingImage,city:(localPost as any).listingCity});}}
                          className="absolute" style={{left:'50%',top:'40%',transform:'translate(-50%,-100%)'}}>
                          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl px-2.5 py-1.5 flex items-center gap-1.5 border border-white/60">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"/>
                            <p className="text-[11px] font-black text-gray-900 max-w-[120px] truncate">{(localPost as any).listingTitle}</p>
                          </div>
                          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-0 h-0"
                            style={{borderLeft:'5px solid transparent',borderRight:'5px solid transparent',borderTop:'5px solid white'}}/>
                        </button>
                      )}
                    </>
                  )}
                </div>
              );})}
            </div>
          )}

          {hasGifs && (
            <div className={`overflow-hidden grid gap-px ${(localPost.gifs||[]).length>1?'grid-cols-2':'grid-cols-1'}`}>
              {(localPost.gifs||[]).map((gif,i)=>(
                <div key={i} className="relative overflow-hidden bg-gray-100">
                  <img src={gif} alt="GIF" className="w-full h-auto max-h-80 object-cover"/>
                  <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">GIF</span>
                </div>
              ))}
            </div>
          )}

          {hasAudios && !isStandaloneAudio && (
            <div className="px-3 pt-2 space-y-2">
              {safeAudios.map((audioSrc:string,i:number)=>(
                <AudioPlayer key={i} src={audioSrc} name={localPost.audioNames?.[i]} canDownload={canDownload}/>
              ))}
            </div>
          )}

          {/* Repost embedded */}
          {localPost.repostOf && (
            <div className="mx-3 mt-2 border border-gray-200 rounded-xl overflow-hidden cursor-pointer"
              onClick={()=>navigate(`/post/${localPost.repostOf!.postId}`)}>
              <div className="px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <UserAvatar user={{name:localPost.repostOf.userName,avatar:localPost.repostOf.userAvatar,id:localPost.repostOf.userId}} size={18}/>
                  <span className="text-xs font-semibold text-gray-700">{localPost.repostOf.userName}</span>
                </div>
                {localPost.repostOf.content && <p className="text-sm text-gray-600 line-clamp-2">{localPost.repostOf.content}</p>}
              </div>
              {(Array.isArray(localPost.repostOf.images)?localPost.repostOf.images:[])[0] && (
                <img src={(Array.isArray(localPost.repostOf.images)?localPost.repostOf.images:[])[0]} alt="" className="w-full h-28 object-cover"/>
              )}
            </div>
          )}

          {/* ══ 3. ACTIONS ══ */}
          <div className="flex items-center px-1 pt-0.5 pb-0.5">
            {/* Like */}
            <style>{`@keyframes hrtBounce{0%{transform:scale(1)}25%{transform:scale(1.4)}50%{transform:scale(0.9)}75%{transform:scale(1.15)}100%{transform:scale(1)}}`}</style>
            <button onClick={handleLike} disabled={liking}
              className={`flex items-center gap-1 px-2 py-2 rounded-full transition-colors active:scale-90 ${isLiked?'text-red-500':'text-gray-700 hover:text-red-400'}`}>
              <Heart className={`w-6 h-6 ${isLiked ? 'fill-red-500' : ''}`}
                style={isLiked ? { animation: 'hrtBounce 0.4s ease' } : undefined}/>
              {(localPost.likesCount??0)>0 && (
                <button
                  onClick={e => { e.stopPropagation(); setShowLikesSheet(true); }}
                  className="text-[13px] font-semibold min-w-[12px] hover:underline">
                  {localPost.likesCount}
                </button>
              )}
            </button>
            {/* Comment */}
            <button onClick={()=>setShowComments(true)}
              className="flex items-center gap-1 px-2 py-2 rounded-full text-gray-700 hover:text-blue-500 transition-all active:scale-90">
              <MessageCircle className="w-6 h-6"/>
              {((localPost.totalCommentsCount ?? commentCount) > 0) && <span className="text-[13px] font-semibold min-w-[12px]">{localPost.totalCommentsCount ?? commentCount}</span>}
            </button>
            {/* Repost */}
            <button
              onClick={()=>{ if(!user){toast.error('Sign in to repost');return;} dispatchMenuOpen(); setShowRepostMenu(v=>!v); }}
              className={`flex items-center gap-1 px-2 py-2 rounded-full transition-all active:scale-90 ${hasReposted?'text-green-500':'text-gray-700 hover:text-green-500'}`}>
              <Repeat2 className={`w-6 h-6 ${hasReposted?'text-green-500':''}`}/>
              {(localPost.repostCount??0)>0 && <span className="text-[13px] font-semibold min-w-[12px]">{localPost.repostCount}</span>}
            </button>
            {/* Share */}
            <button onClick={()=>setShowShareModal(true)}
              className="flex items-center gap-1 px-2 py-2 rounded-full text-gray-700 hover:text-blue-500 transition-all active:scale-90">
              <Send className="w-6 h-6"/>
            </button>
            {/* Save — right aligned */}
            <button onClick={handleSave}
              className={`ml-auto px-2 py-2 rounded-full transition-all active:scale-90 ${saved?'text-blue-500':'text-gray-700 hover:text-blue-400'}`}>
              <Bookmark className={`w-6 h-6 ${saved?'fill-blue-500':''}`}/>
            </button>
          </div>




          {/* ══ 5. CAPTION + CREDITS + LISTING ══ */}
          <div className="px-3 pt-2 pb-1">
            {localPost.content && (
              <p className="text-[13px] text-gray-900 leading-relaxed">
                <span className="font-black mr-1.5">{localPost.userName}</span>
                {localPost.content}
              </p>
            )}

            {/* Link */}
            {localPost.link && (
              <a href={String(localPost.link).startsWith('http')?String(localPost.link):`https://${localPost.link}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 text-[12px] mt-1">
                <Link2 className="w-3 h-3"/>{String(localPost.link).replace(/^https?:\/\//,'')}
              </a>
            )}

            {/* Tagged users */}
            {taggedUsers.length>0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {taggedUsers.map(u=>(
                  <button key={u.id} onClick={()=>navigate(`/host/${u.id}`)}
                    className="text-blue-600 text-[12px] font-semibold">
                    @{u.name}
                  </button>
                ))}
              </div>
            )}

            {/* Credits */}
            {(localPost as any).credits?.length>0 && (
              <div className="mt-1.5 space-y-0.5">
                {(localPost as any).credits.map((credit:any,i:number)=>(
                  <p key={i} className="text-[11px] text-gray-500">
                    <span className="text-gray-400">{credit.role} </span>
                    <button onClick={()=>navigate(`/host/${credit.userId}`)} className="font-semibold text-blue-600">@{credit.name}</button>
                  </p>
                ))}
              </div>
            )}


          </div>

        </div>

      </div>

      {/* ── Comment Sheet (Instagram-style bottom modal) ── */}
      {showComments && (
        <CommentSheet
          postId={localPost.id}
          postOwnerId={localPost.userId}
          allowComments={localPost.allowComments !== false}
          commentCount={commentCount}
          totalCommentsCount={localPost.totalCommentsCount ?? commentCount}
          onClose={() => setShowComments(false)}
          onCountChange={(n) => {
            setCommentCount(n);
            updatePost(localPost.id, { commentCount: n });
          }}
        />
      )}

      {/* ── Fullscreen lightbox ── */}
      {lightbox && (
        <MediaLightbox post={localPost} type={lightbox.type} index={lightbox.index} onClose={() => setLightbox(null)} />
      )}

      {/* ── Listing Tag Sheet ── */}
      {activeListing && (
        <ListingTagSheet
          listing={{
            id:            activeListing.listingId,
            title:         activeListing.title,
            price:         activeListing.price,
            listingMode:   activeListing.mode,
            images:        activeListing.image ? [activeListing.image] : [],
            city:          activeListing.city,
          } as any}
          onClose={()=>setActiveListing(null)}
        />
      )}

      {/* ── Share Modal ── */}
      {showShareModal && (
        <SharePostModal post={localPost} onClose={() => setShowShareModal(false)} />
      )}

      {/* ── Likes Sheet ── */}
      {showLikesSheet && (
        <LikesSheet
          postId={localPost.id}
          likeIds={localPost.likes || []}
          onClose={() => setShowLikesSheet(false)}
        />
      )}

      {/* ── Edit Post Modal ── */}
      {showEditModal && (
        <EditPostModal
          post={localPost}
          onSave={updated => { setPost(updated); setShowEditModal(false); }}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {/* ── Delete confirmation bottom sheet ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative w-full bg-white rounded-t-3xl p-6 pb-10 z-10">
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-gray-900 font-bold text-lg">Delete Post?</h3>
              <p className="text-gray-500 text-sm mt-1">This action cannot be undone. Your post will be permanently removed.</p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setShowDeleteConfirm(false); handleDelete(true); }}
                disabled={deleting}
                className="w-full py-3.5 rounded-2xl bg-red-500 text-white font-bold text-base hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, Delete Post'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-base hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quote Repost Modal ── */}
      {showRepostModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Quote Repost</h3>
              <button onClick={() => setShowRepostModal(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <textarea value={repostComment} onChange={e => setRepostComment(e.target.value)}
                placeholder="Add your comment…" rows={3}
                className="w-full text-sm text-gray-800 placeholder-gray-400 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-400 resize-none" />
              <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                <div className="flex items-center gap-2 mb-1.5">
                  <UserAvatar user={{ name: localPost.userName, avatar: localPost.userAvatar, id: localPost.userId }} size={22} />
                  <span className="text-xs font-semibold text-gray-700">{localPost.userName}</span>
                </div>
                {localPost.content && <p className="text-xs text-gray-600 line-clamp-2">{localPost.content}</p>}
                {localPost.images?.[0] && <img src={localPost.images[0]} alt="" className="mt-1.5 w-full h-16 object-cover rounded-lg" />}
              </div>
              <button onClick={handleQuoteRepost} disabled={reposting || !repostComment.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                {reposting ? <><Loader2 className="w-4 h-4 animate-spin" /> Reposting…</> : <><Repeat2 className="w-4 h-4" /> Quote Repost</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Boost Post Modal ── */}
      {showBoostModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowBoostModal(false)} />
          <div className="relative bg-white w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-700 px-5 py-4 text-white flex items-center justify-between">
              <div><h3 className="font-bold text-base">Boost Post</h3><p className="text-purple-200 text-xs">Reach more people on Filmons</p></div>
              <button onClick={() => setShowBoostModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20"><X className="w-4 h-4"/></button>
            </div>
            <div className="flex gap-1 px-5 pt-3">
              {(['goal','audience','budget','confirm'] as const).map((s,i)=>(
                <div key={s} className={`h-1 flex-1 rounded-full ${['goal','audience','budget','confirm'].indexOf(boostStep)>=i?'bg-purple-500':'bg-gray-200'}`}/>
              ))}
            </div>
            <div className="p-5 space-y-4">
              {boostStep === 'goal' && (<>
                <p className="text-sm font-semibold text-gray-800">What do you want people to do when they see your post?</p>
                <div className="space-y-2">
                  {[{id:'profile',label:'Visit your profile',desc:'Drive people to your Filmons profile',icon:'👤'},{id:'website',label:'Visit your website',desc:'Send traffic to your external link',icon:'🌐'},{id:'message',label:'Message you',desc:'Invite people to start a conversation',icon:'💬'}].map(opt=>(
                    <button key={opt.id} onClick={()=>setBoostGoal(opt.id as any)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${boostGoal===opt.id?'border-purple-500 bg-purple-50':'border-gray-200 hover:border-gray-300'}`}>
                      <span className="text-2xl">{opt.icon}</span>
                      <div><p className="text-sm font-semibold text-gray-800">{opt.label}</p><p className="text-xs text-gray-500">{opt.desc}</p></div>
                    </button>
                  ))}
                </div>
                <button disabled={!boostGoal} onClick={()=>setBoostStep('audience')} className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-semibold rounded-xl py-3 transition-colors">Next →</button>
              </>)}
              {boostStep === 'audience' && (<>
                <p className="text-sm font-semibold text-gray-800">Who should see your ad?</p>
                <div className="space-y-2">
                  {[{id:'suggested',label:'Suggested audience',desc:"We'll target the best people based on your content",icon:'✨'},{id:'custom',label:'Create your own',desc:'Target by location within Canada',icon:'🎯'}].map(opt=>(
                    <button key={opt.id} onClick={()=>setBoostAudience(opt.id as any)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${boostAudience===opt.id?'border-purple-500 bg-purple-50':'border-gray-200 hover:border-gray-300'}`}>
                      <span className="text-2xl">{opt.icon}</span>
                      <div><p className="text-sm font-semibold text-gray-800">{opt.label}</p><p className="text-xs text-gray-500">{opt.desc}</p></div>
                    </button>
                  ))}
                </div>
                {boostAudience==='custom'&&(<div className="bg-gray-50 border border-gray-200 rounded-xl p-3"><p className="text-xs font-semibold text-gray-600 mb-1.5">Location (Canada only)</p><input type="text" placeholder="Province or city — e.g. Toronto, ON" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400"/></div>)}
                <div className="flex gap-2">
                  <button onClick={()=>setBoostStep('goal')} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl py-3 transition-colors">← Back</button>
                  <button onClick={()=>setBoostStep('budget')} className="flex-[2] bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl py-3 transition-colors">Next →</button>
                </div>
              </>)}
              {boostStep === 'budget' && (<>
                <p className="text-sm font-semibold text-gray-800">What's your ad budget?</p>
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-1">
                  <div className="flex justify-between text-xs text-gray-600"><span>Rate</span><span className="font-bold">$0.0099/view</span></div>
                  <div className="flex justify-between text-xs text-gray-600"><span>Est. views/day</span><span className="font-bold">~{Math.round(boostBudget/0.0099).toLocaleString()}</span></div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1"><label className="text-xs font-semibold text-gray-700">Daily budget</label><span className="text-sm font-black text-purple-700">${boostBudget} CAD</span></div>
                  <input type="range" min={4} max={100} step={1} value={boostBudget} onChange={e=>setBoostBudget(Number(e.target.value))} className="w-full accent-purple-600"/>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5"><span>$4</span><span>$100</span></div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1"><label className="text-xs font-semibold text-gray-700">Duration</label><span className="text-sm font-black text-purple-700">{boostDays} day{boostDays>1?'s':''}</span></div>
                  <input type="range" min={1} max={30} step={1} value={boostDays} onChange={e=>setBoostDays(Number(e.target.value))} className="w-full accent-purple-600"/>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5"><span>1 day</span><span>30 days</span></div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 flex justify-between"><span className="text-sm text-gray-600">Total</span><span className="text-sm font-black text-gray-900">${(boostBudget*boostDays).toFixed(2)} CAD</span></div>
                <div className="flex gap-2">
                  <button onClick={()=>setBoostStep('audience')} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl py-3 transition-colors">← Back</button>
                  <button onClick={()=>setBoostStep('confirm')} className="flex-[2] bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl py-3 transition-colors">Review →</button>
                </div>
              </>)}
              {boostStep === 'confirm' && (<>
                <p className="text-sm font-semibold text-gray-800">Review your boost</p>
                <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Goal</span><span className="font-semibold capitalize">{boostGoal}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Audience</span><span className="font-semibold capitalize">{boostAudience}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Daily budget</span><span className="font-semibold">${boostBudget} CAD</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Duration</span><span className="font-semibold">{boostDays} day{boostDays>1?'s':''}</span></div>
                  <div className="flex justify-between border-t border-gray-200 pt-2"><span className="font-bold">Total</span><span className="font-black text-purple-700">${(boostBudget*boostDays).toFixed(2)} CAD</span></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>setBoostStep('budget')} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl py-3 transition-colors">← Back</button>
                  <button onClick={()=>{toast.success('🚀 Boost submitted! Your post is being reviewed.');setShowBoostModal(false);}} className="flex-[2] bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white font-semibold rounded-xl py-3 transition-colors">Boost Now 🚀</button>
                </div>
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* ── Analytics Modal ── */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={()=>setShowAnalyticsModal(false)}/>
          <div className="relative bg-white w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-5 py-4 text-white flex items-center justify-between">
              <div><h3 className="font-bold text-base">Post Analytics</h3><p className="text-blue-200 text-xs">Performance overview</p></div>
              <button onClick={()=>setShowAnalyticsModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[{label:'Views',value:(localPost.likes||[]).length*12+47,icon:'👁️'},{label:'Likes',value:(localPost.likes||[]).length,icon:'❤️'},{label:'Comments',value:commentCount,icon:'💬'}].map(stat=>(
                  <div key={stat.label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <span className="text-xl">{stat.icon}</span>
                    <p className="text-lg font-black text-gray-900 mt-1">{stat.value}</p>
                    <p className="text-[10px] text-gray-400 font-medium uppercase">{stat.label}</p>
                  </div>
                ))}
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-blue-600"/><p className="text-xs font-semibold text-blue-700">Engagement rate</p></div>
                <div className="w-full bg-blue-100 rounded-full h-2"><div className="bg-blue-600 h-2 rounded-full" style={{width:'34%'}}/></div>
                <p className="text-xs text-blue-600 font-bold mt-1">34% · Above average</p>
              </div>
              <button onClick={()=>{setShowAnalyticsModal(false);setBoostStep('goal');setShowBoostModal(true);}} className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-700 text-white font-semibold rounded-xl py-3">
                <Zap className="w-4 h-4"/> Boost this post
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Full-screen media lightbox ────────────────────────────────────
interface LightboxProps {
  post: Post;
  type: 'image' | 'video' | 'audio';
  index: number;
  onClose: () => void;
}
function MediaLightbox({ post, type, index: initialIndex, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(initialIndex);
  const _arr = (v: any): string[] => Array.isArray(v) ? v : (typeof v === 'string' && v ? [v] : []);
  const items = type === 'image' ? _arr(post.images)
    : type === 'video' ? _arr(post.videos)
    : _arr((post as any).audios);
  const hasPrev = idx > 0;
  const hasNext = idx < items.length - 1;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) setIdx(i => i - 1);
      if (e.key === 'ArrowRight' && hasNext) setIdx(i => i + 1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [hasPrev, hasNext, onClose]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center" onClick={onClose}>
      <button className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors z-10" onClick={onClose}>
        <X className="w-5 h-5" />
      </button>
      {items.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-medium z-10">{idx + 1} / {items.length}</div>
      )}
      {hasPrev && (
        <button className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors z-10"
          onClick={e => { e.stopPropagation(); setIdx(i => i - 1); }}>
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {hasNext && (
        <button className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors z-10"
          onClick={e => { e.stopPropagation(); setIdx(i => i + 1); }}>
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
      <div className="max-w-4xl w-full max-h-[85vh] flex items-center justify-center px-14" onClick={e => e.stopPropagation()}>
        {type === 'image' && <img src={items[idx]} alt="" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />}
        {type === 'video' && <video src={items[idx]} controls autoPlay className="max-w-full max-h-[85vh] rounded-xl shadow-2xl bg-black" />}
        {type === 'audio' && (
          <div className="bg-white/10 backdrop-blur rounded-3xl p-10 flex flex-col items-center gap-6 w-full max-w-sm">
            <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center"><Music className="w-12 h-12 text-white" /></div>
            <p className="text-white font-semibold text-center">{post.audioNames?.[idx] || `Audio ${idx + 1}`}</p>
            <audio src={items[idx]} controls className="w-full" autoPlay />
          </div>
        )}
      </div>
      {post.content && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-lg w-full px-4" onClick={e => e.stopPropagation()}>
          <div className="bg-black/60 backdrop-blur rounded-2xl px-4 py-2.5">
            <p className="text-white/90 text-sm text-center leading-relaxed line-clamp-2">{post.content}</p>
          </div>
        </div>
      )}
    </div>
  );
}