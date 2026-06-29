import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { authApi, socialApi } from '../lib/api';
import { UserAvatar } from '../components/AccountTypeBadge';
import { AddPortfolioItemSheet } from '../components/AddPortfolioItemSheet';
import { ShareSheet } from '../components/ShareSheet';
import { CreateAlbumSheet } from '../components/CreateAlbumSheet';
import {
  getPortfolioItems, deletePortfolioItem, toggleFeatured,
  getAlbums, getAlbumItems, addItemToAlbum, deleteAlbum,
  type PortfolioItem, type WorkType, type PortfolioAlbum,
} from '../lib/portfolioApi';
import { supabase } from '../../lib/supabase';
import type { User } from '../types';
import { toast } from 'sonner';
import {
  Star, StarOff, MapPin, Film, Music2, FileText,
  Link as LinkIcon, MoreVertical, Trash2, ExternalLink,
  Plus, Loader2, ChevronLeft, ChevronRight, X, Share2,
  Play, CheckCircle2, Users, MessageSquare, Briefcase,
  Grid3X3, AlignJustify, Layers, LayoutList, Monitor,
  FolderOpen, Search, UserCheck, FolderPlus, Edit2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type Template    = 'masonry' | 'grid' | 'cinematic' | 'service' | 'minimal';
type TabType     = 'all' | 'photos' | 'videos' | 'reels' | 'audio' | 'projects' | 'case_studies' | 'bts' | 'albums';
type ShareTarget =
  | { type: 'portfolio' }
  | { type: 'album'; album: PortfolioAlbum }
  | { type: 'item'; item: PortfolioItem };

const TEMPLATES: { id: Template; label: string; Icon: any }[] = [
  { id: 'masonry',   label: 'Masonry',   Icon: Layers },
  { id: 'grid',      label: 'Grid',      Icon: Grid3X3 },
  { id: 'cinematic', label: 'Cinematic', Icon: Monitor },
  { id: 'service',   label: 'Service',   Icon: LayoutList },
  { id: 'minimal',   label: 'Minimal',   Icon: AlignJustify },
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
  const [search,      setSearch]      = useState('');
  const [users,       setUsers]       = useState<any[]>([]);
  const [meFollowing, setMeFollowing] = useState<Set<string>>(new Set());
  const [loading,     setLoading]     = useState(true);
  const [toggling,    setToggling]    = useState<string | null>(null);

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

    if (!rows?.length) { setLoading(false); return; }

    const ids = rows.map((r: any) => r[idCol]);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, username, avatar, primary_role, is_verified')
      .in('id', ids);

    setUsers(profiles ?? []);

    if (meId) {
      const { data: myFollows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', meId)
        .in('following_id', ids);
      setMeFollowing(new Set((myFollows ?? []).map((r: any) => r.following_id)));
    }
    setLoading(false);
  };

  const handleToggle = async (targetId: string) => {
    if (!meId) { navigate('/login'); return; }
    setToggling(targetId);
    try {
      if (meFollowing.has(targetId)) {
        await socialApi.unfollow(targetId);
        setMeFollowing(prev => { const s = new Set(prev); s.delete(targetId); return s; });
      } else {
        await socialApi.follow(targetId);
        setMeFollowing(prev => new Set([...prev, targetId]));
      }
    } catch {
      toast.error('Could not update follow status');
    } finally {
      setToggling(null);
    }
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
                const isFoll = meFollowing.has(u.id);
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
                        disabled={toggling === u.id}
                        className={`shrink-0 flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl transition-all disabled:opacity-50 ${
                          isFoll
                            ? 'bg-gray-100 text-gray-600 border border-gray-200'
                            : 'text-white bg-blue-600'
                        }`}
                      >
                        {toggling === u.id
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
  items, startIndex, onClose,
}: { items: PortfolioItem[]; startIndex: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIndex);
  const touchX = useRef(0);
  const item = items[idx];

  const prev = useCallback(() => setIdx(i => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIdx(i => Math.min(items.length - 1, i + 1)), [items.length]);

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
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 font-bold">
            <ExternalLink className="w-3.5 h-3.5" /> View full project
          </a>
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

function ItemCard({
  item, isOwner, onTap, onToggle, onDelete, onShare, onAddToAlbum, className = '', style,
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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos,  setMenuPos]  = useState<{ bottom: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const thumb   = item.thumbnail_url || item.media_url;
  const wt      = item.work_type;
  const isAudio = wt === 'audio' || item.media_type === 'audio';
  const isLink  = wt === 'link'  || item.media_type === 'link';
  const isVideo = wt === 'video' || wt === 'reel' || item.media_type === 'video';

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setMenuPos({ bottom: window.innerHeight - r.top + 4, right: window.innerWidth - r.right });
    }
    setMenuOpen(v => !v);
  };

  const closeMenu = () => { setMenuOpen(false); setMenuPos(null); };

  return (
    <div
      className={`relative rounded-2xl bg-gray-100 cursor-pointer group ${className}`}
      style={style}
      onClick={onTap}
    >
      {/* Media — clipped inside its own overflow-hidden layer */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden">
        {thumb && !isAudio && !isLink ? (
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

      {/* Three-dot button — portal-rendered dropdown escapes all stacking contexts */}
      {isOwner && (
        <div className="absolute bottom-2 right-2 z-[10]" onClick={e => e.stopPropagation()}>
          <button
            ref={btnRef}
            onClick={openMenu}
            className="w-7 h-7 rounded-full bg-black/55 flex items-center justify-center"
          >
            <MoreVertical className="w-4 h-4 text-white" />
          </button>

          {menuOpen && menuPos && createPortal(
            <>
              <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={closeMenu} />
              <div
                style={{ position: 'fixed', bottom: menuPos.bottom, right: menuPos.right, zIndex: 9999 }}
                className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-w-[170px]"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => { closeMenu(); onToggle(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-800 hover:bg-gray-50"
                >
                  {item.is_featured
                    ? <><StarOff className="w-3.5 h-3.5 text-gray-400" /> Unfeature</>
                    : <><Star    className="w-3.5 h-3.5 text-amber-500" /> Feature</>}
                </button>
                <button
                  onClick={() => { closeMenu(); onShare(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-800 hover:bg-gray-50"
                >
                  <Share2 className="w-3.5 h-3.5 text-gray-500" /> Share
                </button>
                <button
                  onClick={() => { closeMenu(); onAddToAlbum(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-800 hover:bg-gray-50"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-gray-500" /> Add to Album
                </button>
                <div className="border-t border-gray-50" />
                <button
                  onClick={() => {
                    closeMenu();
                    if (window.confirm('Delete this portfolio item? This action cannot be undone.')) onDelete();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </>,
            document.body,
          )}
        </div>
      )}
    </div>
  );
}

// ── Layouts ───────────────────────────────────────────────────────────────────
function MasonryLayout({ items, isOwner, onTap, onToggle, onDelete, onShare, onAddToAlbum }: CardProps) {
  return (
    <div className="columns-2 sm:columns-3 lg:columns-4 gap-2">
      {items.map((item, i) => {
        const ar = item.aspect_ratio ?? (
          item.work_type === 'case_study' ? 3 / 4  :
          item.work_type === 'reel'       ? 9 / 16 :
          item.work_type === 'video'      ? 16 / 9 :
          i % 5 === 0                     ? 4 / 5  :
          i % 5 === 2                     ? 3 / 4  : 1
        );
        return (
          <div key={item.id} className="break-inside-avoid mb-2">
            <ItemCard
              item={item}
              isOwner={isOwner}
              style={{ aspectRatio: ar }}
              onTap={() => onTap(item, i)}
              onToggle={() => onToggle(item)}
              onDelete={() => onDelete(item.id)}
              onShare={() => onShare(item)}
              onAddToAlbum={() => onAddToAlbum(item)}
            />
          </div>
        );
      })}
    </div>
  );
}

function GridLayout({ items, isOwner, onTap, onToggle, onDelete, onShare, onAddToAlbum }: CardProps) {
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
        />
      ))}
    </div>
  );
}

function CinematicLayout({ items, isOwner, onTap, onToggle, onDelete, onShare, onAddToAlbum }: CardProps) {
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
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-100"
      >
        <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[40]" onClick={e => { e.stopPropagation(); setOpen(false); }} />
          <div
            className="absolute right-0 top-8 z-[50] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-w-[170px]"
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => { setOpen(false); onToggle(); }} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-800 hover:bg-gray-50">
              {item.is_featured ? <><StarOff className="w-3.5 h-3.5 text-gray-400" /> Unfeature</> : <><Star className="w-3.5 h-3.5 text-amber-500" /> Feature</>}
            </button>
            <button onClick={() => { setOpen(false); onShare(); }} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-800 hover:bg-gray-50">
              <Share2 className="w-3.5 h-3.5 text-gray-500" /> Share
            </button>
            <button onClick={() => { setOpen(false); onAddToAlbum(); }} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-800 hover:bg-gray-50">
              <FolderPlus className="w-3.5 h-3.5 text-gray-500" /> Add to Album
            </button>
            <div className="border-t border-gray-50" />
            <button
              onClick={() => { setOpen(false); if (window.confirm('Delete this portfolio item? This action cannot be undone.')) onDelete(); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-500 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ServiceLayout({ items, isOwner, onTap, onToggle, onDelete, onShare, onAddToAlbum }: CardProps) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const thumb   = item.thumbnail_url || item.media_url;
        const isAudio = item.work_type === 'audio' || item.media_type === 'audio';
        const isLink  = item.work_type === 'link'  || item.media_type === 'link';
        return (
          <div
            key={item.id}
            className="flex gap-3 bg-white rounded-2xl p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onTap(item, i)}
          >
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
                  {isOwner && (
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

function MinimalLayout({ items, isOwner, onTap, onToggle, onDelete, onShare, onAddToAlbum }: CardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {items.map((item, i) => {
        const thumb   = item.thumbnail_url || item.media_url;
        const isAudio = item.work_type === 'audio' || item.media_type === 'audio';
        const isLink  = item.work_type === 'link'  || item.media_type === 'link';
        return (
          <div
            key={item.id}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}
            onClick={() => onTap(item, i)}
          >
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
              {isOwner && (
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

// ── Main page ─────────────────────────────────────────────────────────────────
export function Portfolio() {
  const { userId: paramUserId } = useParams<{ userId?: string }>();
  const { user: me } = useAuth();
  const navigate = useNavigate();

  const [profile,  setProfile]  = useState<User | null>(null);
  const [items,    setItems]    = useState<PortfolioItem[]>([]);
  const [albums,   setAlbums]   = useState<PortfolioAlbum[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [followerCount,  setFollowerCount]  = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [following,      setFollowing]      = useState(false);
  const [followLoading,  setFollowLoading]  = useState(false);

  const [template,        setTemplate]        = useState<Template>(
    () => (localStorage.getItem('filmons_portfolio_template') as Template) ?? 'masonry',
  );

  // Owner-configured display preferences (set in PortfolioSettings, stored in localStorage)
  const showStats   = localStorage.getItem('filmons_portfolio_show_stats')   !== 'false';
  const showHire    = localStorage.getItem('filmons_portfolio_show_hire')     !== 'false';
  const showMessage = localStorage.getItem('filmons_portfolio_show_message')  !== 'false';
  const [activeTab,       setActiveTab]       = useState<TabType>('all');
  const [viewer,          setViewer]          = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [showAdd,         setShowAdd]         = useState(false);
  const [showFollowSheet, setShowFollowSheet] = useState<null | 'followers' | 'following'>(null);

  // Albums
  const [activeAlbum,      setActiveAlbum]      = useState<PortfolioAlbum | null>(null);
  const [albumItems,       setAlbumItems]       = useState<PortfolioItem[]>([]);
  const [albumLoading,     setAlbumLoading]     = useState(false);
  const [showCreateAlbum,  setShowCreateAlbum]  = useState(false);
  const [albumMenuId,      setAlbumMenuId]      = useState<string | null>(null);

  // Share + add-to-album
  const [shareTarget,      setShareTarget]      = useState<ShareTarget | null>(null);
  const [addToAlbumTarget, setAddToAlbumTarget] = useState<PortfolioItem | null>(null);

  const targetId = paramUserId ?? me?.id;
  const isOwner  = !!me && !!targetId && me.id === targetId;

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
      const [hostData, portfolioData, albumData] = await Promise.all([
        authApi.getUserById(uid),
        getPortfolioItems(uid),
        getAlbums(uid),
      ]);
      if (hostData?.avatar) {
        const base = hostData.avatar.split('?')[0];
        hostData.avatar = `${base}?t=${Date.now()}`;
      }
      setProfile(hostData);
      setItems(portfolioData);
      setAlbums(albumData);

      const followQueries: Promise<any>[] = [
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid),
      ];
      if (me?.id && me.id !== uid) {
        followQueries.push(
          supabase.from('follows').select('*', { count: 'exact', head: true })
            .eq('follower_id', me.id).eq('following_id', uid),
        );
      }
      const [fcRes, fgRes, amFollowingRes] = await Promise.all(followQueries);
      setFollowerCount(fcRes.count ?? null);
      setFollowingCount(fgRes.count ?? null);
      if (amFollowingRes !== undefined) setFollowing((amFollowingRes.count ?? 0) > 0);
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
    if (target.type === 'portfolio') return base;
    if (target.type === 'album')     return `${base}?album=${target.album.id}`;
    return `${base}?item=${target.item.id}`;
  };

  const getShareDisplayUrl = (target: ShareTarget): string => {
    const uname = profile?.username ? `@${profile.username}` : targetId;
    const base  = `filmons.com/${uname}/portfolio`;
    if (target.type === 'portfolio') return base;
    if (target.type === 'album')     return `${base}/albums/${target.album.title.toLowerCase().replace(/\s+/g, '-')}`;
    return `${base}/${(target as { type: 'item'; item: PortfolioItem }).item.title.toLowerCase().replace(/\s+/g, '-')}`;
  };

  const getShareHeading = (target: ShareTarget): string => {
    if (target.type === 'portfolio') return 'Share Portfolio';
    if (target.type === 'album')     return `Share "${target.album.title}"`;
    return `Share "${(target as { type: 'item'; item: PortfolioItem }).item.title}"`;
  };

  const handleFollow = async () => {
    if (!me) { navigate('/login'); return; }
    setFollowLoading(true);
    try {
      if (following) {
        await socialApi.unfollow(profile!.id);
        setFollowing(false);
        setFollowerCount(c => (c !== null ? Math.max(0, c - 1) : null));
      } else {
        await socialApi.follow(profile!.id);
        setFollowing(true);
        setFollowerCount(c => (c !== null ? c + 1 : null));
      }
    } catch {
      toast.error('Unable to update follow status. Please try again.');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleToggle = async (item: PortfolioItem) => {
    await toggleFeatured(item.id, item.is_featured);
    setItems(prev => prev.map(p => p.id === item.id ? { ...p, is_featured: !p.is_featured } : p));
  };

  const handleDelete = async (id: string) => {
    await deletePortfolioItem(id);
    setItems(prev => prev.filter(p => p.id !== id));
  };

  const changeTemplate = (t: Template) => {
    setTemplate(t);
    localStorage.setItem('filmons_portfolio_template', t);
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
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
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

  // ── Album detail view ─────────────────────────────────────────────────────
  const showAlbumDetail = activeTab === 'albums' && activeAlbum;

  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* ── Cover photo ── */}
      <div className="relative z-0">
        <div className="h-48 overflow-hidden">
          {profile.coverPhoto ? (
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

        {/* Stats + action buttons — same horizontal level */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">

          {/* Stats row (conditional) */}
          {showStats && (
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
              {items.length > 0 && (
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
          )}

          {/* Visitor action buttons */}
          {!isOwner && me && (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleFollow}
                disabled={followLoading}
                className={`flex items-center gap-1.5 text-sm font-black px-4 py-2 rounded-2xl transition-all active:scale-95 disabled:opacity-60 ${
                  following ? 'bg-gray-100 text-gray-700 border border-gray-200' : 'text-white'
                }`}
                style={following ? {} : { background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}
              >
                {followLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                {following ? 'Following' : 'Follow'}
              </button>
              <button
                onClick={() => setShareTarget({ type: 'portfolio' })}
                className="w-9 h-9 rounded-2xl border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50 active:scale-95 transition-all"
              >
                <Share2 className="w-4 h-4" />
              </button>
              {showMessage && (
                <button
                  onClick={() => navigate(`/inbox?userId=${profile.id}`)}
                  className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-2xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Message
                </button>
              )}
              {showHire && (
                <button
                  onClick={() => navigate(`/search?host=${profile.id}`)}
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
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 text-white text-sm font-black px-4 py-2 rounded-2xl active:scale-95 transition-all"
                style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}
              >
                <Plus className="w-4 h-4" /> Add Work
              </button>
              <button
                onClick={() => setShareTarget({ type: 'portfolio' })}
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
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => changeTemplate(t.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  template === t.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                }`}
              >
                <t.Icon className="w-3 h-3" />
                {t.label}
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
                                {album.visibility !== 'public' && `${album.visibility} · `}album
                              </p>
                            </div>
                          </div>

                          {/* three-dot menu — outside clip */}
                          {isOwner && (
                            <div className="absolute top-2 right-2 z-10" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => setAlbumMenuId(menuOpen ? null : album.id)}
                                className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center"
                              >
                                <MoreVertical className="w-3.5 h-3.5 text-white" />
                              </button>
                              {menuOpen && (
                                <>
                                  <div className="fixed inset-0 z-[19]" onClick={() => setAlbumMenuId(null)} />
                                  <div className="absolute top-8 right-0 z-[20] bg-white rounded-2xl shadow-xl border border-gray-100 min-w-[160px] py-1.5 overflow-hidden">
                                    <button
                                      onClick={() => { setAlbumMenuId(null); toast('Edit album coming soon'); }}
                                      className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700 text-left"
                                    >
                                      <Edit2 className="w-3.5 h-3.5 text-gray-400" /> Edit Album
                                    </button>
                                    <button
                                      onClick={() => { setAlbumMenuId(null); setShareTarget({ type: 'album', album }); }}
                                      className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700 text-left"
                                    >
                                      <Share2 className="w-3.5 h-3.5 text-gray-400" /> Share Album
                                    </button>
                                    <div className="h-px bg-gray-100 my-1" />
                                    <button
                                      onClick={() => handleDeleteAlbum(album.id)}
                                      className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-red-50 text-sm text-red-500 text-left"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" /> Delete Album
                                    </button>
                                  </div>
                                </>
                              )}
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
            template === 'masonry'   ? <MasonryLayout  {...cardProps} /> :
            template === 'grid'      ? <GridLayout      {...cardProps} /> :
            template === 'cinematic' ? <CinematicLayout {...cardProps} /> :
            template === 'service'   ? <ServiceLayout   {...cardProps} /> :
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
        />
      )}

      {/* ── Add item sheet (owner only) ── */}
      {showAdd && isOwner && (
        <AddPortfolioItemSheet
          onClose={() => setShowAdd(false)}
          onAdded={item => setItems(prev => [item, ...prev])}
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

      {/* ── Share sheet ── */}
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
    </div>
  );
}
