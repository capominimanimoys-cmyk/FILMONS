import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useFollow } from '../context/FollowContext';
import { useFollowCounts } from '../lib/useFollowCounts';
import { authApi, socialApi } from '../lib/api';
import { UserAvatar } from '../components/AccountTypeBadge';
import { AddPortfolioItemSheet } from '../components/AddPortfolioItemSheet';
import { ShareSheet } from '../components/ShareSheet';
import { CreateAlbumSheet } from '../components/CreateAlbumSheet';
import { HireFlowSheet } from '../components/HireFlowSheet';
import { ItemActionsSheet } from '../components/ItemActionsSheet';
import { AlbumActionsSheet, type EditAlbumSection } from '../components/AlbumActionsSheet';
import { EditAlbumScreen } from '../components/EditAlbumScreen';
import FilmonsLoader from '../components/FilmonsLoader';
import {
  getPortfolioItems, deletePortfolioItem, toggleFeatured,
  getAlbums, getAlbumItems, addItemToAlbum, deleteAlbum, createAlbum,
  getPortfolioSettings, upsertPortfolioSettings, DEFAULT_PORTFOLIO_SETTINGS,
  isItemLiked, toggleItemLike, getItemComments, addItemComment,
  incrementItemView,
  type PortfolioItem, type WorkType, type PortfolioAlbum,
  type PortfolioSettings, type PortfolioLayout, type PortfolioComment,
} from '../lib/portfolioApi';
import { supabase } from '../../lib/supabase';
import type { User } from '../types';
import { toast } from 'sonner';
import {
  Star, MapPin, Film, Music2, FileText,
  Link as LinkIcon, MoreVertical, ExternalLink,
  Plus, Loader2, ChevronLeft, ChevronRight, X, Share2,
  Play, Pause, CheckCircle2, Users, MessageSquare, Briefcase,
  Grid3X3, AlignJustify, LayoutList, Monitor,
  FolderOpen, Search, UserCheck, Check, CheckSquare, FolderPlus,
  Heart, MessageCircle, Download, Eye, Lock, Send, Trash2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type TabType     = 'all' | 'photos' | 'videos' | 'reels' | 'audio' | 'projects' | 'case_studies' | 'bts' | 'albums';
type ShareTarget =
  | { type: 'album'; album: PortfolioAlbum }
  | { type: 'item'; item: PortfolioItem };

const LAYOUTS: { id: PortfolioLayout; label: string; Icon: any }[] = [
  { id: 'grid',        label: 'Grid',        Icon: Grid3X3 },
  { id: 'large_cards', label: 'Large cards', Icon: Monitor },
  { id: 'editorial',   label: 'Editorial',   Icon: LayoutList },
  { id: 'minimal',     label: 'Minimal',     Icon: AlignJustify },
];

const TABS: { id: TabType; label: string }[] = [
  { id: 'all',          label: 'All'          },
  { id: 'photos',       label: 'Photos'       },
  { id: 'videos',       label: 'Videos'       },
  { id: 'reels',        label: 'Reels'        },
  { id: 'audio',        label: 'Audio'        },
  { id: 'projects',     label: 'Projects'     },
  { id: 'case_studies', label: 'Case Studies' },
  { id: 'bts',          label: 'BTS'          },
  { id: 'albums',       label: 'Albums'       },
];

function filterByTab(item: PortfolioItem, tab: TabType): boolean {
  if (tab === 'all' || tab === 'albums') return true;
  const wt = item.work_type;
  const mt = item.media_type;
  if (tab === 'photos')       return wt === 'photo'      || (!wt && mt === 'image');
  if (tab === 'videos')       return wt === 'video'      || (!wt && mt === 'video');
  if (tab === 'reels')        return wt === 'reel';
  if (tab === 'audio')        return wt === 'audio'      || (!wt && mt === 'audio');
  if (tab === 'projects')     return wt === 'project';
  if (tab === 'case_studies') return wt === 'case_study';
  if (tab === 'bts')          return wt === 'bts';
  return true;
}

function sortItems(items: PortfolioItem[], order: PortfolioSettings['sort_order']): PortfolioItem[] {
  const sorted = [...items].sort((a, b) => {
    if (order === 'oldest')           return +new Date(a.created_at) - +new Date(b.created_at);
    if (order === 'recently_updated') return +new Date(b.updated_at ?? b.created_at) - +new Date(a.updated_at ?? a.created_at);
    if (order === 'custom')           return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    return +new Date(b.created_at) - +new Date(a.created_at); // newest
  });
  // Featured work always surfaces first, regardless of chosen order.
  return sorted.sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));
}

// ── Followers / Following sheet ───────────────────────────────────────────────
function FollowSheet({
  userId, type, meId, onClose,
}: {
  userId: string;
  type:   'followers' | 'following';
  meId?:  string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { isFollowing, isPending, follow, unfollow } = useFollow();
  const [search,      setSearch]      = useState('');
  const [users,       setUsers]       = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    load();
  }, [userId, type]); // eslint-disable-line

  const load = async () => {
    setLoading(true);
    const idCol    = type === 'followers' ? 'follower_id'  : 'following_id';
    const filterCol = type === 'followers' ? 'following_id' : 'follower_id';

    const { data: rows } = await supabase
      .from('follows')
      .select(idCol)
      .eq(filterCol, userId);

    if (!rows?.length) { setUsers([]); setLoading(false); return; }

    const ids = rows.map((r: any) => r[idCol]);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, username, avatar, primary_role, is_verified')
      .in('id', ids);

    setUsers(profiles ?? []);
    setLoading(false);
  };

  const handleToggle = (targetId: string) => {
    if (!meId) { navigate('/login'); return; }
    if (isFollowing(targetId)) unfollow(targetId);
    else follow(targetId);
  };

  const filtered = users.filter(u =>
    !search ||
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <style>{`
        @keyframes fsSlideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
      <div className="fixed inset-0 z-[70] bg-black/50" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[71] bg-white rounded-t-3xl flex flex-col"
        style={{ maxHeight: '80vh', animation: 'fsSlideUp 0.28s cubic-bezier(0.32,0.72,0,1)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <h3 className="text-base font-black text-gray-900 capitalize">{type}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>
        {/* Search */}
        <div className="px-4 py-2 shrink-0">
          <div className="flex items-center gap-2 bg-gray-100 rounded-2xl px-3 py-2.5">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder-gray-400"
            />
          </div>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">{search ? 'No results' : `No ${type} yet`}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map(u => {
                const isMe   = u.id === meId;
                const isFoll = isFollowing(u.id);
                return (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 py-2.5 rounded-2xl hover:bg-gray-50 px-2 cursor-pointer"
                    onClick={() => { onClose(); navigate(`/host/${u.id}`); }}
                  >
                    <div className="shrink-0">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.name} className="w-11 h-11 rounded-full object-cover" />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center">
                          <span className="text-white font-black text-sm">{u.name?.[0]?.toUpperCase() ?? '?'}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-bold text-gray-900 truncate">{u.name}</p>
                        {u.is_verified && <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 fill-blue-500 shrink-0" />}
                      </div>
                      {u.username && <p className="text-xs text-gray-400 truncate">@{u.username}</p>}
                      {u.primary_role && <p className="text-[11px] text-blue-600 truncate">{u.primary_role}</p>}
                    </div>
                    {!isMe && meId && (
                      <button
                        onClick={e => { e.stopPropagation(); handleToggle(u.id); }}
                        disabled={isPending(u.id)}
                        className={`shrink-0 flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl transition-all disabled:opacity-50 ${
                          isFoll
                            ? 'bg-gray-100 text-gray-600 border border-gray-200'
                            : 'text-white bg-blue-600'
                        }`}
                      >
                        {isPending(u.id)
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : isFoll
                          ? <><UserCheck className="w-3 h-3" /> Following</>
                          : <>+ Follow</>
                        }
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Full-screen item viewer ───────────────────────────────────────────────────
function PortfolioViewer({
  items, startIndex, onClose, settings, meId,
}: {
  items: PortfolioItem[]; startIndex: number; onClose: () => void;
  settings: PortfolioSettings; meId?: string;
}) {
  const [idx, setIdx] = useState(startIndex);
  const touchX = useRef(0);
  const item = items[idx];

  const [liked,       setLiked]       = useState(false);
  const [likesCount,  setLikesCount]  = useState(0);
  const [viewsCount,  setViewsCount]  = useState(0);
  const [showComments,setShowComments]= useState(false);
  const [comments,    setComments]    = useState<PortfolioComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const viewedRef = useRef<Set<string>>(new Set());

  const prev = useCallback(() => setIdx(i => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIdx(i => Math.min(items.length - 1, i + 1)), [items.length]);

  useEffect(() => {
    if (!item) return;
    setLikesCount(item.likes_count ?? 0);
    setViewsCount(item.views_count ?? 0);
    setShowComments(false);
    setComments([]);
    setLiked(false);
    if (settings.allow_likes && meId) isItemLiked(item.id, meId).then(setLiked);
    if (!viewedRef.current.has(item.id)) {
      viewedRef.current.add(item.id);
      incrementItemView(item.id);
      setViewsCount(v => v + 1);
    }
  }, [item?.id]); // eslint-disable-line

  const handleLike = async () => {
    if (!meId) { toast.error('Log in to like this'); return; }
    const next = !liked;
    setLiked(next);
    setLikesCount(c => Math.max(0, c + (next ? 1 : -1)));
    const ok = await toggleItemLike(item.id, meId, liked);
    if (!ok) { setLiked(!next); setLikesCount(c => Math.max(0, c + (next ? -1 : 1))); }
  };

  const openComments = async () => {
    setShowComments(v => !v);
    if (!showComments && comments.length === 0) setComments(await getItemComments(item.id));
  };

  const submitComment = async () => {
    if (!meId) { toast.error('Log in to comment'); return; }
    const body = commentText.trim();
    if (!body) return;
    setCommentText('');
    const created = await addItemComment(item.id, meId, body);
    if (created) setComments(prev => [...prev, created]);
  };

  const canDownload = settings.allow_downloads === 'individual'
    || (settings.allow_downloads === 'selected' && !!item?.download_allowed);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowLeft')   prev();
      if (e.key === 'ArrowRight')  next();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!item) return null;

  const wt      = item.work_type;
  const isVideo = wt === 'video' || wt === 'reel' || (!wt && item.media_type === 'video');
  const isAudio = wt === 'audio'                  || (!wt && item.media_type === 'audio');
  const isLink  = wt === 'link'                   || (!wt && item.media_type === 'link');
  const thumb   = item.thumbnail_url || item.media_url;

  const workTypeLabel: Record<WorkType, string> = {
    photo: 'Photo', video: 'Video', reel: 'Reel', audio: 'Audio',
    project: 'Project', case_study: 'Case Study', bts: 'BTS', link: 'Link',
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black"
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        const dx = touchX.current - e.changedTouches[0].clientX;
        if (Math.abs(dx) > 50) { dx > 0 ? next() : prev(); }
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 z-10">
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white"
        >
          <X className="w-5 h-5" />
        </button>
        <span className="text-white/50 text-xs font-semibold tabular-nums">
          {idx + 1} / {items.length}
        </span>
        <div className="flex items-center gap-2">
          {canDownload && item.media_url && (
            <a
              href={item.media_url}
              download
              target="_blank"
              rel="noreferrer"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white"
            >
              <Download className="w-5 h-5" />
            </a>
          )}
          <button
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white"
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: item.title, url: window.location.href }).catch(() => {});
              } else {
                navigator.clipboard.writeText(window.location.href);
                toast.success('Link copied');
              }
            }}
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Media */}
      <div className="flex-1 flex items-center justify-center relative min-h-0 px-4">
        {idx > 0 && (
          <button
            onClick={prev}
            className="absolute left-2 z-10 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <div className="w-full h-full flex items-center justify-center">
          {isVideo && item.media_url ? (
            <video src={item.media_url} controls playsInline autoPlay className="max-w-full max-h-full rounded-xl object-contain" />
          ) : isAudio ? (
            <div className="w-full max-w-xs flex flex-col items-center gap-5">
              <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center shadow-2xl">
                {thumb
                  ? <img src={thumb} alt="" className="w-full h-full object-cover rounded-3xl" />
                  : <Music2 className="w-14 h-14 text-white/80" />
                }
              </div>
              {item.media_url && <audio controls src={item.media_url} className="w-full" />}
            </div>
          ) : isLink ? (
            <div className="flex flex-col items-center gap-6">
              {thumb ? (
                <img src={thumb} alt="" className="max-w-full max-h-[40vh] rounded-xl object-contain" />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-white/10 flex items-center justify-center">
                  <LinkIcon className="w-12 h-12 text-white/40" />
                </div>
              )}
              {item.external_link && (
                <a href={item.external_link} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold text-sm">
                  <ExternalLink className="w-4 h-4" /> Open Link
                </a>
              )}
            </div>
          ) : thumb ? (
            <img src={thumb} alt={item.title} className="max-w-full max-h-full rounded-xl object-contain" />
          ) : (
            <div className="w-32 h-32 rounded-3xl bg-white/5 flex items-center justify-center">
              <FileText className="w-14 h-14 text-white/20" />
            </div>
          )}
        </div>

        {idx < items.length - 1 && (
          <button
            onClick={next}
            className="absolute right-2 z-10 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Info panel */}
      <div
        className="shrink-0 bg-white rounded-t-3xl px-5 pt-5 pb-8"
        style={{ maxHeight: '42vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        <div className="flex items-center gap-2 mb-2">
          {wt && (
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
              {workTypeLabel[wt] ?? wt}
            </span>
          )}
          {item.is_featured && (
            <span className="flex items-center gap-1 text-[10px] font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
              <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Featured
            </span>
          )}
        </div>

        <h2 className="font-black text-gray-900 text-xl leading-tight mb-2">{item.title}</h2>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {item.category && (
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-semibold">{item.category}</span>
          )}
          {item.role && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{item.role}</span>
          )}
          {item.client_name && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{item.client_name}</span>
          )}
          {item.year && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{item.year}</span>
          )}
        </div>

        {item.description && (
          <p className="text-sm text-gray-600 leading-relaxed mb-3">{item.description}</p>
        )}

        {item.tools && item.tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {item.tools.map(t => (
              <span key={t} className="text-[11px] bg-gray-900 text-white px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        )}

        {item.external_link && !isLink && (
          <a href={item.external_link} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 font-bold mb-3">
            <ExternalLink className="w-3.5 h-3.5" /> View full project
          </a>
        )}

        {/* Engagement row */}
        {(settings.allow_likes || settings.allow_comments || settings.show_view_count) && (
          <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
            {settings.allow_likes && (
              <button onClick={handleLike} className="flex items-center gap-1.5">
                <Heart className={`w-5 h-5 ${liked ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                <span className="text-sm font-bold text-gray-700">{likesCount}</span>
              </button>
            )}
            {settings.allow_comments && (
              <button onClick={openComments} className="flex items-center gap-1.5">
                <MessageCircle className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-bold text-gray-700">{comments.length || item.comments_count || ''}</span>
              </button>
            )}
            {settings.show_view_count && (
              <span className="flex items-center gap-1.5 ml-auto text-gray-400">
                <Eye className="w-4 h-4" />
                <span className="text-xs font-semibold">{viewsCount}</span>
              </span>
            )}
          </div>
        )}

        {settings.allow_comments && showComments && (
          <div className="pt-3 space-y-3">
            {comments.length === 0 && <p className="text-xs text-gray-400">No comments yet.</p>}
            {comments.map(c => (
              <p key={c.id} className="text-sm text-gray-700"><span className="font-bold">{c.user_id === meId ? 'You' : 'User'}</span> — {c.body}</p>
            ))}
            <div className="flex items-center gap-2">
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitComment(); }}
                placeholder="Add a comment…"
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-300"
              />
              <button onClick={submitComment} className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Portfolio card ────────────────────────────────────────────────────────────
interface CardProps {
  items:        PortfolioItem[];
  isOwner:      boolean;
  onTap:        (item: PortfolioItem, index: number) => void;
  onToggle:     (item: PortfolioItem) => void;
  onDelete:     (id: string) => void;
  onShare:      (item: PortfolioItem) => void;
  onAddToAlbum: (item: PortfolioItem) => void;
  selectMode?:      boolean;
  selectedIds?:     Set<string>;
  onToggleSelect?:  (id: string) => void;
}

function WorkTypeBadge({ wt }: { wt?: WorkType }) {
  if (!wt || wt === 'photo') return null;
  const labels: Record<WorkType, string> = {
    video: 'VIDEO', reel: 'REEL', audio: 'AUDIO',
    project: 'PROJECT', case_study: 'CASE', bts: 'BTS', link: 'LINK', photo: '',
  };
  return (
    <span className="absolute top-2 left-2 text-[9px] font-black bg-black/60 text-white px-1.5 py-0.5 rounded-md tracking-wide">
      {labels[wt]}
    </span>
  );
}

// Inline play/pause + seekable waveform for audio items in the grid, so
// listening doesn't require opening the full viewer first. Only the play
// button and waveform strip stop the tap from bubbling — tapping the rest
// of the tile (title area, blank gradient) still opens the viewer, same
// as every other media type.
function AudioTilePlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    const onEnded = () => { setPlaying(false); setProgress(0); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, [src]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().catch(() => {}); setPlaying(true); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  };

  const bars = Array.from({ length: 20 }, (_, i) => 6 + Math.sin(i * 0.8) * 4 + Math.cos(i * 1.6) * 3);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2.5 px-4">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={toggle}
        className="w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center active:scale-95 transition-transform shrink-0"
      >
        {playing ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
      </button>
      <div className="w-full flex items-end gap-px h-6 cursor-pointer" onClick={seek}>
        {bars.map((h, i) => (
          <div
            key={i}
            style={{ height: `${h}px`, background: progress > (i / bars.length) * 100 ? '#c4b5fd' : 'rgba(255,255,255,0.25)' }}
            className="flex-1 rounded-full"
          />
        ))}
      </div>
    </div>
  );
}

function ItemCard({
  item, isOwner, onTap, onToggle, onDelete, onShare, onAddToAlbum, className = '', style,
  selectMode = false, selected = false, onSelectToggle,
}: {
  item:          CardProps['items'][0];
  isOwner:       boolean;
  onTap:         () => void;
  onToggle:      () => void;
  onDelete:      () => void;
  onShare:       () => void;
  onAddToAlbum:  () => void;
  className?:    string;
  style?:        React.CSSProperties;
  selectMode?:      boolean;
  selected?:        boolean;
  onSelectToggle?:  () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const thumb   = item.thumbnail_url || item.media_url;
  const wt      = item.work_type;
  const isAudio = wt === 'audio' || item.media_type === 'audio';
  const isLink  = wt === 'link'  || item.media_type === 'link';
  const isVideo = wt === 'video' || wt === 'reel' || item.media_type === 'video';

  const openMenu = (e: React.MouseEvent) => { e.stopPropagation(); setMenuOpen(true); };
  const closeMenu = () => setMenuOpen(false);

  return (
    <div
      className={`relative rounded-2xl bg-gray-100 cursor-pointer group ${className} ${selectMode && selected ? 'ring-2 ring-blue-500' : ''}`}
      style={style}
      onClick={selectMode ? onSelectToggle : onTap}
    >
      {/* Media — clipped inside its own overflow-hidden layer */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden">
        {isAudio && item.media_url ? (
          <div className="w-full h-full min-h-[100px]" style={{ background: 'linear-gradient(135deg,#1e1040,#312e81)' }}>
            <AudioTilePlayer src={item.media_url} />
          </div>
        ) : thumb && !isLink ? (
          <img src={thumb} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center min-h-[100px]"
            style={{
              background: isAudio
                ? 'linear-gradient(135deg,#1e1040,#312e81)'
                : isLink
                ? 'linear-gradient(135deg,#eff6ff,#dbeafe)'
                : 'linear-gradient(135deg,#f8fafc,#e2e8f0)',
            }}
          >
            {isAudio ? <Music2   className="w-10 h-10 text-purple-300" />
             : isLink ? <LinkIcon  className="w-10 h-10 text-blue-400"  />
             :           <FileText  className="w-10 h-10 text-slate-300" />}
          </div>
        )}
      </div>

      {/* Bottom gradient + title */}
      <div
        className="absolute inset-x-0 bottom-0 p-2.5 pointer-events-none rounded-b-2xl z-[2]"
        style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.72) 0%,transparent 100%)' }}
      >
        <p className="text-white text-[11px] font-black truncate leading-tight">{item.title}</p>
        {item.category && <p className="text-white/55 text-[9px] truncate mt-0.5">{item.category}</p>}
      </div>

      <WorkTypeBadge wt={wt} />

      {isVideo && (
        <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center z-[3]">
          <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
        </div>
      )}
      {item.is_featured && !isVideo && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center z-[3]">
          <Star className="w-3 h-3 fill-white text-white" />
        </div>
      )}

      {/* Three-dot button — opens the shared bottom-sheet menu (portal-rendered) */}
      {isOwner && !selectMode && (
        <div className="absolute bottom-2 right-2 z-[10]" onClick={e => e.stopPropagation()}>
          <button
            onClick={openMenu}
            className="w-7 h-7 rounded-full bg-black/55 flex items-center justify-center"
          >
            <MoreVertical className="w-4 h-4 text-white" />
          </button>

          {createPortal(
            <ItemActionsSheet
              item={item}
              open={menuOpen}
              onClose={closeMenu}
              onToggle={onToggle}
              onShare={onShare}
              onAddToAlbum={onAddToAlbum}
              onDelete={onDelete}
            />,
            document.body,
          )}
        </div>
      )}

      {/* Selection checkbox */}
      {selectMode && (
        <div className={`absolute top-2 right-2 z-[10] w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
          selected ? 'bg-blue-600 border-blue-600' : 'bg-black/30 border-white'
        }`}>
          {selected && <Check className="w-3.5 h-3.5 text-white" />}
        </div>
      )}
    </div>
  );
}

// ── Layouts ───────────────────────────────────────────────────────────────────
function GridLayout({ items, isOwner, onTap, onToggle, onDelete, onShare, onAddToAlbum, selectMode, selectedIds, onToggleSelect }: CardProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {items.map((item, i) => (
        <ItemCard
          key={item.id}
          item={item}
          isOwner={isOwner}
          className="aspect-square"
          onTap={() => onTap(item, i)}
          onToggle={() => onToggle(item)}
          onDelete={() => onDelete(item.id)}
          onShare={() => onShare(item)}
          onAddToAlbum={() => onAddToAlbum(item)}
          selectMode={selectMode}
          selected={selectedIds?.has(item.id)}
          onSelectToggle={() => onToggleSelect?.(item.id)}
        />
      ))}
    </div>
  );
}

function CinematicLayout({ items, isOwner, onTap, onToggle, onDelete, onShare, onAddToAlbum, selectMode, selectedIds, onToggleSelect }: CardProps) {
  const [first, ...rest] = items;
  return (
    <div className="space-y-2">
      {first && (
        <ItemCard
          item={first}
          isOwner={isOwner}
          className="aspect-video w-full"
          onTap={() => onTap(first, 0)}
          onToggle={() => onToggle(first)}
          onDelete={() => onDelete(first.id)}
          onShare={() => onShare(first)}
          onAddToAlbum={() => onAddToAlbum(first)}
          selectMode={selectMode}
          selected={selectedIds?.has(first.id)}
          onSelectToggle={() => onToggleSelect?.(first.id)}
        />
      )}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {rest.map((item, i) => (
            <ItemCard
              key={item.id}
              item={item}
              isOwner={isOwner}
              className="aspect-square"
              onTap={() => onTap(item, i + 1)}
              onToggle={() => onToggle(item)}
              onDelete={() => onDelete(item.id)}
              onShare={() => onShare(item)}
              onAddToAlbum={() => onAddToAlbum(item)}
              selectMode={selectMode}
              selected={selectedIds?.has(item.id)}
              onSelectToggle={() => onToggleSelect?.(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceItemMenu({
  item, onToggle, onDelete, onShare, onAddToAlbum,
}: {
  item: PortfolioItem;
  onToggle:     () => void;
  onDelete:     () => void;
  onShare:      () => void;
  onAddToAlbum: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(true)}
        className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-100"
      >
        <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
      </button>
      {createPortal(
        <ItemActionsSheet
          item={item}
          open={open}
          onClose={() => setOpen(false)}
          onToggle={onToggle}
          onShare={onShare}
          onAddToAlbum={onAddToAlbum}
          onDelete={onDelete}
        />,
        document.body,
      )}
    </div>
  );
}

function ServiceLayout({ items, isOwner, onTap, onToggle, onDelete, onShare, onAddToAlbum, selectMode, selectedIds, onToggleSelect }: CardProps) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const thumb   = item.thumbnail_url || item.media_url;
        const isAudio = item.work_type === 'audio' || item.media_type === 'audio';
        const isLink  = item.work_type === 'link'  || item.media_type === 'link';
        const selected = !!selectedIds?.has(item.id);
        return (
          <div
            key={item.id}
            className={`flex gap-3 bg-white rounded-2xl p-3 shadow-sm border cursor-pointer hover:shadow-md transition-shadow ${selectMode && selected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-100'}`}
            onClick={() => selectMode ? onToggleSelect?.(item.id) : onTap(item, i)}
          >
            {selectMode && (
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 self-center ${selected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>
                {selected && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
            )}
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 shrink-0">
              {thumb && !isAudio && !isLink ? (
                <img src={thumb} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ background: isAudio ? 'linear-gradient(135deg,#1e1040,#312e81)' : 'linear-gradient(135deg,#f0f4ff,#e0e7ff)' }}>
                  {isAudio ? <Music2 className="w-7 h-7 text-purple-300" /> : isLink ? <LinkIcon className="w-7 h-7 text-indigo-400" /> : <FileText className="w-7 h-7 text-indigo-300" />}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 py-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{item.title}</p>
                  {item.category && <p className="text-xs text-blue-600 font-semibold mt-0.5">{item.category}</p>}
                  {item.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.is_featured && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-300" />}
                  {isOwner && !selectMode && (
                    <ServiceItemMenu
                      item={item}
                      onToggle={() => onToggle(item)}
                      onDelete={() => onDelete(item.id)}
                      onShare={() => onShare(item)}
                      onAddToAlbum={() => onAddToAlbum(item)}
                    />
                  )}
                </div>
              </div>
              {(item.role || item.year) && (
                <p className="text-xs text-gray-400 mt-1.5">{[item.role, item.year].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MinimalLayout({ items, isOwner, onTap, onToggle, onDelete, onShare, onAddToAlbum, selectMode, selectedIds, onToggleSelect }: CardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {items.map((item, i) => {
        const thumb   = item.thumbnail_url || item.media_url;
        const isAudio = item.work_type === 'audio' || item.media_type === 'audio';
        const isLink  = item.work_type === 'link'  || item.media_type === 'link';
        const selected = !!selectedIds?.has(item.id);
        return (
          <div
            key={item.id}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''} ${selectMode && selected ? 'bg-blue-50' : ''}`}
            onClick={() => selectMode ? onToggleSelect?.(item.id) : onTap(item, i)}
          >
            {selectMode && (
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>
                {selected && <Check className="w-3 h-3 text-white" />}
              </div>
            )}
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0">
              {thumb && !isAudio && !isLink ? (
                <img src={thumb} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ background: isAudio ? 'linear-gradient(135deg,#1e1040,#312e81)' : 'linear-gradient(135deg,#f0f4ff,#e0e7ff)' }}>
                  {isAudio ? <Music2 className="w-4 h-4 text-purple-300" /> : isLink ? <LinkIcon className="w-4 h-4 text-indigo-400" /> : <FileText className="w-4 h-4 text-indigo-300" />}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{item.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{[item.year, item.category].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {item.is_featured && <Star className="w-4 h-4 text-amber-400 fill-amber-300" />}
              {isOwner && !selectMode && (
                <ServiceItemMenu
                  item={item}
                  onToggle={() => onToggle(item)}
                  onDelete={() => onDelete(item.id)}
                  onShare={() => onShare(item)}
                  onAddToAlbum={() => onAddToAlbum(item)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Add to Album sheet ────────────────────────────────────────────────────────
function AddToAlbumSheet({
  item, albums, onClose,
}: {
  item:    PortfolioItem;
  albums:  PortfolioAlbum[];
  onClose: () => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);

  const handleAdd = async (albumId: string) => {
    setAdding(albumId);
    const ok = await addItemToAlbum(albumId, item.id);
    setAdding(null);
    if (ok) { toast.success('Added to album'); onClose(); }
    else     { toast.error('Could not add to album'); }
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[71] bg-white rounded-t-3xl flex flex-col"
        style={{ maxHeight: '80vh', animation: 'casUp 0.3s cubic-bezier(0.32,0.72,0,1)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-black text-gray-900">Add to Album</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>
        {albums.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-4 py-12">
            <p className="text-sm text-gray-400 text-center">No albums yet. Create an album first.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {albums.map(album => (
              <button
                key={album.id}
                onClick={() => handleAdd(album.id)}
                disabled={!!adding}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-gray-100 active:scale-[0.98] transition-all text-left disabled:opacity-60"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                  {album.cover_url
                    ? <img src={album.cover_url} alt={album.title} className="w-full h-full object-cover" />
                    : <FolderOpen className="w-5 h-5 text-gray-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{album.title}</p>
                  <p className="text-xs text-gray-400 capitalize">{album.visibility}</p>
                </div>
                {adding === album.id && <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Create album from a multi-selection ─────────────────────────────────────
// Bulk-adds every selected item to either a brand-new album or an existing
// one. If any selected item already belongs to an album, asks which the
// user wants first rather than silently duplicating membership.
type SelectionAlbumStep = 'checking' | 'choice' | 'name' | 'pick';

function CreateAlbumFromSelectionSheet({
  selectedIds, albums, onClose, onDone, onAddedToExisting,
}: {
  selectedIds: string[];
  albums: PortfolioAlbum[];
  onClose: () => void;
  onDone: (album: PortfolioAlbum) => void;
  onAddedToExisting: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState<SelectionAlbumStep>('checking');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('portfolio_album_items')
        .select('item_id')
        .in('item_id', selectedIds);
      setStep((data ?? []).length > 0 ? 'choice' : 'name');
    })();
  }, []); // eslint-disable-line

  const handleCreate = async () => {
    if (!user || !title.trim()) { toast.error('Add an album name'); return; }
    setSaving(true);
    const album = await createAlbum(user.id, { title: title.trim(), description: description.trim() || undefined, visibility: 'public' });
    if (!album) { setSaving(false); toast.error('Could not create album'); return; }
    await Promise.all(selectedIds.map(id => addItemToAlbum(album.id, id)));
    setSaving(false);
    onDone(album);
  };

  const handleAddToExisting = async (albumId: string) => {
    setSaving(true);
    await Promise.all(selectedIds.map(id => addItemToAlbum(albumId, id)));
    setSaving(false);
    onAddedToExisting();
  };

  return (
    <>
      <style>{`@keyframes casUp{from{transform:translateY(100%);opacity:.8}to{transform:translateY(0);opacity:1}}`}</style>
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[61] bg-white rounded-t-3xl flex flex-col"
        style={{ maxHeight: '85vh', animation: 'casUp 0.3s cubic-bezier(0.32,0.72,0,1)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <p className="text-sm font-black text-gray-900">
            {step === 'pick' ? 'Add to Album' : 'Create Album'}
          </p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {step === 'checking' && (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
        )}

        {step === 'choice' && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-gray-400 px-1">
              Some of these items are already in an album. What would you like to do?
            </p>
            <button
              onClick={() => setStep('name')}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-gray-100 text-left"
            >
              <FolderPlus className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-sm font-bold text-gray-900">Create new album</span>
            </button>
            <button
              onClick={() => setStep('pick')}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-gray-100 text-left"
            >
              <FolderOpen className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-sm font-bold text-gray-900">Add to existing album</span>
            </button>
          </div>
        )}

        {step === 'name' && (
          <div className="p-4 space-y-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Album Name</label>
              <input
                value={title} onChange={e => setTitle(e.target.value)} maxLength={60}
                placeholder="My Portfolio"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Description (optional)</label>
              <textarea
                value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={300}
                placeholder="What's this album about?"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50 resize-none"
              />
            </div>
            <p className="text-xs text-gray-400">{selectedIds.length} items will be added to this album.</p>
            <button
              onClick={handleCreate}
              disabled={saving || !title.trim()}
              className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-40 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Album'}
            </button>
          </div>
        )}

        {step === 'pick' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {albums.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No albums yet.</p>
            ) : (
              albums.map(album => (
                <button
                  key={album.id}
                  onClick={() => handleAddToExisting(album.id)}
                  disabled={saving}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-gray-100 active:scale-[0.98] transition-all text-left disabled:opacity-60"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                    {album.cover_url
                      ? <img src={album.cover_url} alt={album.title} className="w-full h-full object-cover" />
                      : <FolderOpen className="w-5 h-5 text-gray-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{album.title}</p>
                    <p className="text-xs text-gray-400 capitalize">{album.visibility}</p>
                  </div>
                  {saving && <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Portfolio() {
  const { userId: paramUserId } = useParams<{ userId?: string }>();
  const { user: me } = useAuth();
  const navigate = useNavigate();

  const [profile,  setProfile]  = useState<User | null>(null);
  const [items,    setItems]    = useState<PortfolioItem[]>([]);
  const [albums,   setAlbums]   = useState<PortfolioAlbum[]>([]);
  const [albumCounts, setAlbumCounts] = useState<Record<string, number>>({});
  const [loading,  setLoading]  = useState(true);
  // First-load only — the branded loader stays mounted (fading out on its own
  // schedule) until this flips, so it never abruptly pops off screen.
  const [introDone, setIntroDone] = useState(false);

  const [hireSheetOpen,  setHireSheetOpen]  = useState(false);
  const { isFollowing, isPending, follow, unfollow } = useFollow();

  // Owner-configured display preferences — read from the DB, scoped to whoever's
  // portfolio is being viewed (previously these leaked in from the *viewer's own*
  // localStorage, so a visitor's settings overrode what they saw on other people's
  // portfolios).
  const [settings, setSettings] = useState<PortfolioSettings>({
    ...DEFAULT_PORTFOLIO_SETTINGS, id: '', user_id: '', updated_at: '',
  });
  const [activeTab,       setActiveTab]       = useState<TabType>('all');
  const [viewer,          setViewer]          = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [showAdd,         setShowAdd]         = useState(false);
  const [showFollowSheet, setShowFollowSheet] = useState<null | 'followers' | 'following'>(null);

  // Multi-select → automatic album creation
  const [selectMode,  setSelectMode]  = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAlbumFromSelection, setShowAlbumFromSelection] = useState(false);
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };

  // Albums
  const [activeAlbum,      setActiveAlbum]      = useState<PortfolioAlbum | null>(null);
  const [albumItems,       setAlbumItems]       = useState<PortfolioItem[]>([]);
  const [albumLoading,     setAlbumLoading]     = useState(false);
  const [showCreateAlbum,  setShowCreateAlbum]  = useState(false);
  const [albumMenuId,      setAlbumMenuId]      = useState<string | null>(null);
  const [editingAlbum,     setEditingAlbum]     = useState<{ album: PortfolioAlbum; focusSection?: EditAlbumSection } | null>(null);

  // Share + add-to-album
  const [shareTarget,      setShareTarget]      = useState<ShareTarget | null>(null);
  const [addToAlbumTarget, setAddToAlbumTarget] = useState<PortfolioItem | null>(null);

  const targetId = paramUserId ?? me?.id;
  const isOwner  = !!me && !!targetId && me.id === targetId;
  const { followerCount, followingCount } = useFollowCounts(targetId);

  useEffect(() => {
    if (!targetId) {
      if (!me) navigate('/login', { replace: true });
      return;
    }
    loadPage(targetId);
  }, [targetId]); // eslint-disable-line

  const loadPage = async (uid: string) => {
    setLoading(true);
    try {
      const [hostData, portfolioData, albumData, settingsData] = await Promise.all([
        authApi.getUserById(uid),
        getPortfolioItems(uid),
        getAlbums(uid),
        getPortfolioSettings(uid),
      ]);
      if (hostData?.avatar) {
        const base = hostData.avatar.split('?')[0];
        hostData.avatar = `${base}?t=${Date.now()}`;
      }
      setProfile(hostData);
      setItems(sortItems(portfolioData, settingsData?.sort_order ?? DEFAULT_PORTFOLIO_SETTINGS.sort_order));
      setAlbums(albumData);
      setSettings(settingsData ?? { ...DEFAULT_PORTFOLIO_SETTINGS, id: '', user_id: uid, updated_at: '' });

      if (albumData.length) {
        supabase
          .from('portfolio_album_items')
          .select('album_id')
          .in('album_id', albumData.map(a => a.id))
          .then(({ data }) => {
            const counts: Record<string, number> = {};
            (data ?? []).forEach((r: any) => { counts[r.album_id] = (counts[r.album_id] ?? 0) + 1; });
            setAlbumCounts(counts);
          });
      }
    } finally {
      setLoading(false);
    }
  };

  const openAlbum = async (album: PortfolioAlbum) => {
    setActiveAlbum(album);
    setAlbumLoading(true);
    const results = await getAlbumItems(album.id);
    setAlbumItems(results);
    setAlbumLoading(false);
  };

  const handleDeleteAlbum = async (albumId: string) => {
    if (!window.confirm('Delete this album? Portfolio items inside this album will not be deleted.')) return;
    setAlbumMenuId(null);
    await deleteAlbum(albumId);
    setAlbums(prev => prev.filter(a => a.id !== albumId));
    toast.success('Album deleted');
  };

  const getShareUrl = (target: ShareTarget): string => {
    const origin = window.location.origin;
    const base   = `${origin}/portfolio/${targetId}`;
    if (target.type === 'album') return `${base}?album=${target.album.id}`;
    return `${base}?item=${target.item.id}`;
  };

  const getShareDisplayUrl = (target: ShareTarget): string => {
    const uname = profile?.username ? `@${profile.username}` : targetId;
    const base  = `filmons.com/${uname}/portfolio`;
    if (target.type === 'album') return `${base}/albums/${target.album.title.toLowerCase().replace(/\s+/g, '-')}`;
    return `${base}/${target.item.title.toLowerCase().replace(/\s+/g, '-')}`;
  };

  const getShareHeading = (target: ShareTarget): string => {
    if (target.type === 'album') return `Share "${target.album.title}"`;
    return `Share "${target.item.title}"`;
  };

  const handleFollow = () => {
    if (!me) { navigate('/login'); return; }
    if (isFollowing(profile!.id)) unfollow(profile!.id);
    else follow(profile!.id);
  };

  const handleToggle = async (item: PortfolioItem) => {
    if (!item.is_featured) {
      const featuredCount = items.filter(i => i.is_featured).length;
      if (featuredCount >= settings.max_featured) {
        toast.error(`You can only feature up to ${settings.max_featured} projects. Adjust this in Portfolio Settings.`);
        return;
      }
    }
    await toggleFeatured(item.id, item.is_featured);
    setItems(prev => sortItems(prev.map(p => p.id === item.id ? { ...p, is_featured: !p.is_featured } : p), settings.sort_order));
  };

  const handleDelete = async (id: string) => {
    await deletePortfolioItem(id);
    setItems(prev => prev.filter(p => p.id !== id));
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} project${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    await Promise.all(ids.map(id => deletePortfolioItem(id)));
    setItems(prev => prev.filter(p => !selectedIds.has(p.id)));
    exitSelectMode();
    toast.success(`${ids.length} project${ids.length === 1 ? '' : 's'} deleted`);
  };

  const changeLayout = async (l: PortfolioLayout) => {
    setSettings(prev => ({ ...prev, layout: l }));
    if (me?.id) await upsertPortfolioSettings(me.id, { layout: l });
  };

  const filtered  = items.filter(item => filterByTab(item, activeTab));
  const tabCount  = (tab: TabType) => tab === 'albums' ? albums.length : items.filter(i => filterByTab(i, tab)).length;

  const cardProps: CardProps = {
    items: activeTab === 'albums' && activeAlbum ? albumItems : filtered,
    isOwner,
    onTap: (item, index) => {
      const src = activeTab === 'albums' && activeAlbum ? albumItems : items;
      const globalIndex = src.indexOf(item);
      setViewer({ open: true, index: globalIndex >= 0 ? globalIndex : index });
    },
    onToggle:     handleToggle,
    onDelete:     handleDelete,
    onShare:      item => setShareTarget({ type: 'item', item }),
    onAddToAlbum: item => setAddToAlbumTarget(item),
    selectMode,
    selectedIds,
    onToggleSelect: toggleSelect,
  };

  if (!introDone) {
    return <FilmonsLoader ready={!loading} onComplete={() => setIntroDone(true)} />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 font-medium mb-4">Portfolio not found</p>
          <button onClick={() => navigate(-1)} className="text-blue-600 font-bold text-sm">Go back</button>
        </div>
      </div>
    );
  }

  // Visitors only ever see a portfolio if it's public, or they're an approved
  // follower on a followers-only one. The owner always sees their own.
  const canView = isOwner || settings.visibility === 'public' || (settings.visibility === 'followers' && following);
  if (!canView) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center">
          <Lock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-black text-gray-900 mb-1">
            {settings.visibility === 'private' ? 'This portfolio is private' : 'Followers only'}
          </p>
          <p className="text-sm text-gray-400 max-w-xs mx-auto mb-4">
            {settings.visibility === 'private'
              ? 'Only the creator can view this portfolio.'
              : 'Only approved followers can view this portfolio.'}
          </p>
          {settings.visibility === 'followers' && !isFollowing(profile.id) && me && (
            <button onClick={handleFollow} disabled={isPending(profile.id)}
              className="text-sm font-black text-white bg-blue-600 px-5 py-2.5 rounded-2xl disabled:opacity-60">
              {isPending(profile.id) ? 'Following…' : 'Follow'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Album detail view ─────────────────────────────────────────────────────
  const showAlbumDetail = activeTab === 'albums' && activeAlbum;

  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* ── Cover photo ── */}
      <div className="relative z-0">
        <div className="h-48 overflow-hidden">
          {settings.cover_path ? (
            <img src={settings.cover_path} alt="Cover" className="w-full h-full object-cover"
              style={{ objectPosition: `50% ${settings.cover_position_y}%` }} />
          ) : profile.coverPhoto ? (
            <img src={profile.coverPhoto} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" style={{ background: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)' }} />
          )}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom,transparent 30%,rgba(0,0,0,0.45) 100%)' }} />
        </div>

        {paramUserId && (
          <button
            onClick={() => navigate(-1)}
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-white z-10"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* ── Profile header ── */}
      <div className="relative z-10 max-w-2xl mx-auto px-4">

        {/* Avatar — pulled up to overlap bottom edge of cover */}
        <div className="-mt-14 mb-3">
          <div className="relative z-20 border-[3px] border-white rounded-full shadow-xl inline-block">
            <UserAvatar user={profile} size={80} />
          </div>
        </div>

        {/* Name + role */}
        <div className="mb-1">
          <div className="flex items-center gap-1.5">
            <h1 className="font-black text-gray-900 text-xl leading-tight">{profile.name}</h1>
            {profile.isVerified && (
              <CheckCircle2 className="w-5 h-5 text-blue-500 fill-blue-500 shrink-0" />
            )}
          </div>
          {profile.username && <p className="text-sm text-gray-400">@{profile.username}</p>}
          {profile.primaryRole && <p className="text-xs font-bold text-blue-600 mt-0.5">{profile.primaryRole}</p>}
        </div>

        {profile.bio && (
          <p className="text-sm text-gray-600 leading-relaxed mb-2 line-clamp-3">{profile.bio}</p>
        )}

        {(profile.location || profile.city) && (
          <div className="flex items-center gap-1 text-xs text-gray-400 mb-3">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            {profile.location || [profile.city, profile.province].filter(Boolean).join(', ')}
          </div>
        )}

        {/* About — role/skills/experience/education/collaboration. Never shows
            email, phone, address or verification documents. */}
        {settings.show_about && (
          (profile as any).skills?.length > 0 || (profile as any).collab_prefs?.length > 0
            || (profile as any).years_exp || (profile as any).occupation
        ) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">About</p>
            {((profile as any).occupation || (profile as any).years_exp) && (
              <p className="text-sm text-gray-700">
                {(profile as any).occupation}
                {(profile as any).occupation && (profile as any).years_exp ? ' · ' : ''}
                {(profile as any).years_exp ? `${(profile as any).years_exp} yrs experience` : ''}
              </p>
            )}
            {(profile as any).skills?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(profile as any).skills.map((s: string) => (
                  <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{s}</span>
                ))}
              </div>
            )}
            {(profile as any).collab_prefs?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Open to</p>
                <div className="flex flex-wrap gap-1.5">
                  {(profile as any).collab_prefs.map((c: string) => (
                    <span key={c} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats + action buttons — same horizontal level */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">

          {/* Stats row */}
          <div className="flex items-center gap-5">
              <div className="text-center">
                <p className="text-lg font-black text-gray-900 leading-none">{items.length}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">Works</p>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <button className="text-center" onClick={() => setShowFollowSheet('followers')}>
                <p className="text-lg font-black text-gray-900 leading-none">{followerCount ?? 0}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">Followers</p>
              </button>
              <div className="w-px h-8 bg-gray-200" />
              <button className="text-center" onClick={() => setShowFollowSheet('following')}>
                <p className="text-lg font-black text-gray-900 leading-none">{followingCount ?? 0}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">Following</p>
              </button>
              {items.length > 0 && settings.show_view_count && (
                <>
                  <div className="w-px h-8 bg-gray-200" />
                  <div className="text-center">
                    <p className="text-lg font-black text-gray-900 leading-none">
                      {items.reduce((s, i) => s + (i.views_count ?? 0), 0)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">Views</p>
                  </div>
                </>
              )}
          </div>

          {/* Visitor action buttons */}
          {!isOwner && me && (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleFollow}
                disabled={isPending(profile.id)}
                className={`flex items-center gap-1.5 text-sm font-black px-4 py-2 rounded-2xl transition-all active:scale-95 disabled:opacity-60 ${
                  isFollowing(profile.id) ? 'bg-gray-100 text-gray-700 border border-gray-200' : 'text-white'
                }`}
                style={isFollowing(profile.id) ? {} : { background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}
              >
                {isPending(profile.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                {isFollowing(profile.id) ? 'Following' : 'Follow'}
              </button>
              <button
                onClick={() => navigate(`/share-card?userId=${profile.id}`)}
                className="w-9 h-9 rounded-2xl border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50 active:scale-95 transition-all"
              >
                <Share2 className="w-4 h-4" />
              </button>
              {settings.show_message_button && (
                <button
                  onClick={() => navigate(`/inbox?userId=${profile.id}`)}
                  className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-2xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Message
                </button>
              )}
              {settings.show_hire_button && (
                <button
                  onClick={() => setHireSheetOpen(true)}
                  className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-2xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
                >
                  <Briefcase className="w-3.5 h-3.5" /> Hire
                </button>
              )}
            </div>
          )}

          {/* Owner action buttons */}
          {isOwner && (
            <div className="flex gap-2 shrink-0">
              {activeTab !== 'albums' && (
                <button
                  onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                  className={`flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-2xl active:scale-95 transition-all ${
                    selectMode ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5" /> {selectMode ? 'Cancel' : 'Select'}
                </button>
              )}
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 text-white text-sm font-black px-4 py-2 rounded-2xl active:scale-95 transition-all"
                style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}
              >
                <Plus className="w-4 h-4" /> Add Work
              </button>
              <button
                onClick={() => navigate(`/share-card?userId=${profile.id}`)}
                className="w-9 h-9 rounded-2xl border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50 active:scale-95 transition-all"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/settings/portfolio')}
                className="flex items-center text-gray-600 text-sm font-semibold px-4 py-2 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 active:scale-95 transition-all"
              >
                Settings
              </button>
            </div>
          )}

        </div>

        {/* Layout selector (owner, non-albums tab) */}
        {isOwner && activeTab !== 'albums' && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 mb-3">
            {LAYOUTS.map(l => (
              <button
                key={l.id}
                onClick={() => changeLayout(l.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  settings.layout === l.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                }`}
              >
                <l.Icon className="w-3 h-3" />
                {l.label}
              </button>
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-0.5 overflow-x-auto no-scrollbar pb-1 mb-4">
          {TABS.map(t => {
            const count = tabCount(t.id);
            if (t.id !== 'all' && t.id !== 'albums' && count === 0) return null;
            if (t.id === 'albums' && count === 0 && !isOwner) return null;
            return (
              <button
                key={t.id}
                onClick={() => { setActiveTab(t.id); setActiveAlbum(null); }}
                className={`shrink-0 flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === t.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-500 border border-gray-100 hover:text-gray-800'
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className={`text-[10px] ${activeTab === t.id ? 'text-blue-200' : 'text-gray-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Albums tab content ── */}
        {activeTab === 'albums' && (
          <>
            {/* Album detail view */}
            {showAlbumDetail ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => setActiveAlbum(null)}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-black text-gray-900 text-sm truncate">{activeAlbum.title}</h2>
                    {activeAlbum.description && (
                      <p className="text-xs text-gray-400 truncate">{activeAlbum.description}</p>
                    )}
                  </div>
                </div>

                {albumLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : albumItems.length === 0 ? (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm text-center py-14 px-6">
                    <FolderOpen className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="font-black text-gray-900 mb-1">Empty album</p>
                    <p className="text-sm text-gray-400">No items in this album yet.</p>
                  </div>
                ) : (
                  <GridLayout {...cardProps} />
                )}
              </>
            ) : (
              /* Album grid */
              <>
                {isOwner && (
                  <div className="mb-4">
                    <button
                      onClick={() => setShowCreateAlbum(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> New Album
                    </button>
                  </div>
                )}

                {albums.length === 0 ? (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm text-center py-14 px-6">
                    <FolderOpen className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="font-black text-gray-900 mb-1">No albums yet</p>
                    <p className="text-sm text-gray-400 max-w-xs mx-auto">
                      {isOwner ? 'Create albums to organise your portfolio.' : 'This creator has no albums yet.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {albums.map(album => {
                      const coverItem  = items.find(i => i.id === album.cover_item_id);
                      const resolvedCover = album.cover_url || coverItem?.thumbnail_url || coverItem?.media_url;
                      const menuOpen   = albumMenuId === album.id;
                      return (
                        <div
                          key={album.id}
                          className="relative bg-gray-100 cursor-pointer aspect-square rounded-2xl"
                          onClick={() => { if (!menuOpen) openAlbum(album); }}
                        >
                          {/* media — clipped */}
                          <div className="absolute inset-0 rounded-2xl overflow-hidden">
                            {resolvedCover ? (
                              <img src={resolvedCover} alt={album.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#f1f5f9,#e2e8f0)' }}>
                                <FolderOpen className="w-12 h-12 text-gray-300" />
                              </div>
                            )}
                            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.75) 0%,transparent 55%)' }} />
                            <div className="absolute inset-x-0 bottom-0 p-3">
                              <p className="text-white font-black text-sm truncate leading-tight">{album.title}</p>
                              <p className="text-white/60 text-[10px] mt-0.5 capitalize">
                                {album.visibility !== 'public' && `${album.visibility} · `}
                                {albumCounts[album.id] ?? 0} item{(albumCounts[album.id] ?? 0) === 1 ? '' : 's'}
                              </p>
                            </div>
                          </div>

                          {/* three-dot menu — opens the shared bottom-sheet menu */}
                          {isOwner && (
                            <div className="absolute top-2 right-2 z-10" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => setAlbumMenuId(album.id)}
                                className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center"
                              >
                                <MoreVertical className="w-3.5 h-3.5 text-white" />
                              </button>
                              <AlbumActionsSheet
                                album={album}
                                open={menuOpen}
                                onClose={() => setAlbumMenuId(null)}
                                onEditAlbum={section => setEditingAlbum({ album, focusSection: section })}
                                onShare={() => setShareTarget({ type: 'album', album })}
                                onDelete={() => handleDeleteAlbum(album.id)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Work grid / list content (non-albums tabs) ── */}
        {activeTab !== 'albums' && (
          filtered.length === 0 ? (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm text-center py-16 px-6">
              <Film className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              {isOwner ? (
                <>
                  <p className="font-black text-gray-900 mb-1 text-lg">
                    {activeTab === 'all' ? 'Build your creative portfolio' : `No ${activeTab.replace('_', ' ')} yet`}
                  </p>
                  <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
                    Upload photos, videos, audio samples, or link to your best projects.
                  </p>
                  {activeTab === 'all' && (
                    <button
                      onClick={() => setShowAdd(true)}
                      className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-black px-5 py-3 rounded-2xl active:scale-95 transition-all"
                      style={{ boxShadow: '0 6px 20px rgba(59,130,246,0.3)' }}
                    >
                      <Plus className="w-4 h-4" /> Add your first work
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="font-black text-gray-900 mb-1 text-lg">
                    {activeTab === 'all' ? 'No portfolio work yet' : `No ${activeTab.replace('_', ' ')} yet`}
                  </p>
                  <p className="text-sm text-gray-400 max-w-xs mx-auto">
                    This creator hasn&apos;t added {activeTab === 'all' ? 'portfolio work' : activeTab.replace('_', ' ')} yet.
                  </p>
                </>
              )}
            </div>
          ) : (
            settings.layout === 'grid'        ? <GridLayout      {...cardProps} /> :
            settings.layout === 'large_cards' ? <CinematicLayout {...cardProps} /> :
            settings.layout === 'editorial'   ? <ServiceLayout   {...cardProps} /> :
                                                 <MinimalLayout   {...cardProps} />
          )
        )}
      </div>

      {/* ── Full-screen viewer ── */}
      {viewer.open && (
        <PortfolioViewer
          items={activeTab === 'albums' && activeAlbum ? albumItems : items}
          startIndex={viewer.index}
          onClose={() => setViewer({ open: false, index: 0 })}
          settings={settings}
          meId={me?.id}
        />
      )}

      {/* ── Add item sheet (owner only) ── */}
      {showAdd && isOwner && (
        <AddPortfolioItemSheet
          onClose={() => setShowAdd(false)}
          onAdded={item => setItems(prev => [item, ...prev])}
        />
      )}

      {/* ── Selection bar (Select mode) — replaces normal per-item actions
           while active; sticky/fixed so it stays reachable while scrolling
           through selected work. ── */}
      {selectMode && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-4 py-3 flex items-center justify-between gap-2"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center gap-2">
            <button onClick={exitSelectMode} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 shrink-0">
              <X className="w-4 h-4" />
            </button>
            <p className="text-sm font-bold text-gray-900 whitespace-nowrap">{selectedIds.size} selected</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkDelete}
              disabled={selectedIds.size < 1}
              className="flex items-center gap-1.5 text-red-600 text-sm font-bold px-3.5 py-2.5 rounded-2xl border border-red-200 disabled:opacity-40 active:scale-95 transition-all hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" /> Delete Work
            </button>
            <button
              onClick={() => setShowAlbumFromSelection(true)}
              disabled={selectedIds.size < 2}
              className="flex items-center gap-1.5 text-white text-sm font-black px-4 py-2.5 rounded-2xl disabled:opacity-40 active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}
            >
              <FolderPlus className="w-4 h-4" /> Create Album
            </button>
          </div>
        </div>
      )}

      {/* ── Create album from selection ── */}
      {showAlbumFromSelection && (
        <CreateAlbumFromSelectionSheet
          selectedIds={[...selectedIds]}
          albums={albums}
          onClose={() => setShowAlbumFromSelection(false)}
          onDone={album => {
            setAlbums(prev => [album, ...prev]);
            setShowAlbumFromSelection(false);
            exitSelectMode();
            toast.success(`Album "${album.title}" created`);
          }}
          onAddedToExisting={() => {
            setShowAlbumFromSelection(false);
            exitSelectMode();
            toast.success('Added to album');
          }}
        />
      )}

      {/* ── Followers / Following sheet ── */}
      {showFollowSheet && (
        <FollowSheet
          userId={targetId!}
          type={showFollowSheet}
          meId={me?.id}
          onClose={() => setShowFollowSheet(null)}
        />
      )}

      {/* ── Create album sheet (owner only) ── */}
      {showCreateAlbum && isOwner && (
        <CreateAlbumSheet
          existingItems={items}
          onCreated={album => setAlbums(prev => [album, ...prev])}
          onClose={() => setShowCreateAlbum(false)}
        />
      )}

      {/* ── Edit album screen (owner only) ── */}
      {editingAlbum && isOwner && me && (
        <EditAlbumScreen
          album={editingAlbum.album}
          focusSection={editingAlbum.focusSection}
          userId={me.id}
          albums={albums}
          onClose={() => setEditingAlbum(null)}
          onSaved={updated => {
            setAlbums(prev => prev.map(a => a.id === updated.id ? updated : a));
            if (activeAlbum?.id === updated.id) setActiveAlbum(updated);
          }}
        />
      )}

      {/* ── Share: album/item → ShareSheet (portfolio-level share now goes to the ShareCard page directly) ── */}
      {shareTarget && (
        <ShareSheet
          url={getShareUrl(shareTarget)}
          displayUrl={getShareDisplayUrl(shareTarget)}
          heading={getShareHeading(shareTarget)}
          onClose={() => setShareTarget(null)}
        />
      )}

      {/* ── Add to album sheet (owner only) ── */}
      {addToAlbumTarget && isOwner && (
        <AddToAlbumSheet
          item={addToAlbumTarget}
          albums={albums}
          onClose={() => setAddToAlbumTarget(null)}
        />
      )}

      {/* ── Hire From Portfolio ── */}
      {hireSheetOpen && profile && (
        <HireFlowSheet host={profile} onClose={() => setHireSheetOpen(false)} />
      )}
    </div>
  );
}
