import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { UserAvatar } from '../components/AccountTypeBadge';
import { AddPortfolioItemSheet } from '../components/AddPortfolioItemSheet';
import {
  getPortfolioItems,
  deletePortfolioItem,
  toggleFeatured,
  type PortfolioItem,
} from '../lib/portfolioApi';
import {
  Star, StarOff, MapPin, Film, Music2, FileText,
  Link as LinkIcon, MoreVertical, Trash2, ExternalLink,
  Plus, Loader2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type Template = 'masonry' | 'grid' | 'cinematic' | 'service' | 'minimal';
type TabType  = 'all' | 'photos' | 'videos' | 'audio' | 'projects';

const TEMPLATES: { id: Template; label: string }[] = [
  { id: 'masonry',   label: 'Masonry'    },
  { id: 'grid',      label: 'Clean Grid' },
  { id: 'cinematic', label: 'Cinematic'  },
  { id: 'service',   label: 'Service'    },
  { id: 'minimal',   label: 'Minimal'    },
];

const TABS: { id: TabType; label: string }[] = [
  { id: 'all',      label: 'All'      },
  { id: 'photos',   label: 'Photos'   },
  { id: 'videos',   label: 'Videos'   },
  { id: 'audio',    label: 'Audio'    },
  { id: 'projects', label: 'Projects' },
];

// ── Shared card props ─────────────────────────────────────────────────────────
interface CardProps {
  items:    PortfolioItem[];
  isOwner:  boolean;
  onTap:    (item: PortfolioItem) => void;
  onToggle: (item: PortfolioItem) => void;
  onDelete: (id: string) => void;
}

// ── Portfolio item card ───────────────────────────────────────────────────────
function PortfolioItemCard({
  item, isOwner, onTap, onToggleFeatured, onDelete, aspectClass,
}: {
  item:             PortfolioItem;
  isOwner:          boolean;
  onTap:            () => void;
  onToggleFeatured: () => void;
  onDelete:         () => void;
  aspectClass?:     string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const thumb   = item.thumbnail_url || item.media_url;
  const isVideo = item.media_type === 'video';
  const isAudio = item.media_type === 'audio';
  const isLink  = item.media_type === 'link';

  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-gray-100 cursor-pointer group ${aspectClass ?? 'aspect-square'}`}
      onClick={onTap}
    >
      {/* Thumbnail */}
      {thumb && !isAudio && !isLink ? (
        <img src={thumb} alt={item.title} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ background: isAudio ? 'linear-gradient(135deg,#1e1040,#312e81)' : 'linear-gradient(135deg,#f0f4ff,#e0e7ff)' }}
        >
          {isAudio  ? <Music2   className="w-10 h-10 text-purple-300" />
           : isLink ? <LinkIcon className="w-10 h-10 text-indigo-400" />
           :          <FileText className="w-10 h-10 text-indigo-300" />}
        </div>
      )}

      {/* Video play badge */}
      {isVideo && (
        <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
      )}

      {/* Featured star */}
      {item.is_featured && (
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center">
          <Star className="w-3 h-3 fill-white text-white" />
        </div>
      )}

      {/* Bottom gradient + title */}
      <div
        className="absolute inset-x-0 bottom-0 p-2.5"
        style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.75) 0%,transparent 100%)' }}
      >
        <p className="text-white text-[11px] font-black truncate">{item.title}</p>
        {item.category && <p className="text-white/60 text-[9px] truncate">{item.category}</p>}
      </div>

      {/* Owner context menu */}
      {isOwner && (
        <>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 hidden group-hover:flex items-center justify-center z-10"
          >
            <MoreVertical className="w-4 h-4 text-white" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setMenuOpen(false); }} />
              <div
                className="absolute top-10 right-2 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-w-[140px]"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => { setMenuOpen(false); onToggleFeatured(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-800 hover:bg-gray-50"
                >
                  {item.is_featured
                    ? <><StarOff className="w-3.5 h-3.5 text-gray-400" /> Unfeature</>
                    : <><Star    className="w-3.5 h-3.5 text-amber-500" /> Feature</>
                  }
                </button>
                <button
                  onClick={() => { setMenuOpen(false); if (window.confirm('Delete this item?')) onDelete(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Detail lightbox ───────────────────────────────────────────────────────────
function DetailSheet({ item, onClose }: { item: PortfolioItem; onClose: () => void }) {
  const isVideo = item.media_type === 'video';
  const isAudio = item.media_type === 'audio';
  const isLink  = item.media_type === 'link';

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/70" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[61] bg-white rounded-t-3xl overflow-hidden"
        style={{ maxHeight: '92vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {isVideo && item.media_url && (
          <video src={item.media_url} controls playsInline className="w-full max-h-64 bg-black object-contain" />
        )}
        {!isVideo && !isAudio && !isLink && (item.thumbnail_url || item.media_url) && (
          <img src={item.thumbnail_url || item.media_url} alt={item.title} className="w-full max-h-72 object-cover" />
        )}
        {isAudio && item.media_url && (
          <div
            className="px-4 py-6 flex flex-col items-center gap-3"
            style={{ background: 'linear-gradient(135deg,#1e1040,#312e81)' }}
          >
            <Music2 className="w-12 h-12 text-purple-300" />
            <audio controls src={item.media_url} className="w-full" />
          </div>
        )}

        <div className="px-4 pt-4 pb-6 space-y-3 overflow-y-auto" style={{ maxHeight: '50vh' }}>
          {item.is_featured && (
            <span className="flex items-center gap-1 text-xs font-black text-amber-500">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> Featured Work
            </span>
          )}
          <h2 className="text-xl font-black text-gray-900">{item.title}</h2>
          {item.description && <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>}

          <div className="flex flex-wrap gap-2">
            {item.category && (
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full">{item.category}</span>
            )}
            {item.role && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{item.role}</span>
            )}
            {item.year && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{item.year}</span>
            )}
          </div>

          {(isLink || item.external_link) && item.external_link && (
            <a
              href={item.external_link}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 px-4 py-3 rounded-2xl"
            >
              <ExternalLink className="w-4 h-4" /> Open Link
            </a>
          )}
        </div>
      </div>
    </>
  );
}

// ── Grid layouts ──────────────────────────────────────────────────────────────
function MasonryLayout({ items, isOwner, onTap, onToggle, onDelete }: CardProps) {
  return (
    <div className="columns-2 sm:columns-3 gap-2">
      {items.map(item => (
        <div key={item.id} className="break-inside-avoid mb-2">
          <PortfolioItemCard
            item={item}
            isOwner={isOwner}
            onTap={() => onTap(item)}
            onToggleFeatured={() => onToggle(item)}
            onDelete={() => onDelete(item.id)}
          />
        </div>
      ))}
    </div>
  );
}

function GridLayout({ items, isOwner, onTap, onToggle, onDelete }: CardProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {items.map(item => (
        <PortfolioItemCard
          key={item.id}
          item={item}
          isOwner={isOwner}
          onTap={() => onTap(item)}
          onToggleFeatured={() => onToggle(item)}
          onDelete={() => onDelete(item.id)}
        />
      ))}
    </div>
  );
}

function CinematicLayout({ items, isOwner, onTap, onToggle, onDelete }: CardProps) {
  const [first, ...rest] = items;
  return (
    <div className="space-y-2">
      {first && (
        <PortfolioItemCard
          item={first}
          isOwner={isOwner}
          aspectClass="aspect-video"
          onTap={() => onTap(first)}
          onToggleFeatured={() => onToggle(first)}
          onDelete={() => onDelete(first.id)}
        />
      )}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {rest.map(item => (
            <PortfolioItemCard
              key={item.id}
              item={item}
              isOwner={isOwner}
              onTap={() => onTap(item)}
              onToggleFeatured={() => onToggle(item)}
              onDelete={() => onDelete(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceLayout({ items, isOwner, onTap, onToggle, onDelete }: CardProps) {
  return (
    <div className="space-y-2">
      {items.map(item => {
        const thumb = item.thumbnail_url || item.media_url;
        const isAudio = item.media_type === 'audio';
        const isLink  = item.media_type === 'link';
        return (
          <div
            key={item.id}
            className="flex gap-3 bg-white rounded-2xl p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onTap(item)}
          >
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 shrink-0">
              {thumb && !isAudio && !isLink ? (
                <img src={thumb} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ background: isAudio ? 'linear-gradient(135deg,#1e1040,#312e81)' : 'linear-gradient(135deg,#f0f4ff,#e0e7ff)' }}
                >
                  {isAudio  ? <Music2   className="w-7 h-7 text-purple-300" />
                   : isLink ? <LinkIcon className="w-7 h-7 text-indigo-400" />
                   :          <FileText className="w-7 h-7 text-indigo-300" />}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 py-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{item.title}</p>
                  {item.category && (
                    <p className="text-xs text-blue-600 font-semibold mt-0.5">{item.category}</p>
                  )}
                  {item.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.is_featured && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-300" />}
                  {isOwner && (
                    <ServiceMenu item={item} onToggle={() => onToggle(item)} onDelete={() => onDelete(item.id)} />
                  )}
                </div>
              </div>
              {item.year && (
                <p className="text-xs text-gray-400 mt-1.5">{item.year}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ServiceMenu({ item, onToggle, onDelete }: { item: PortfolioItem; onToggle: () => void; onDelete: () => void }) {
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
          <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setOpen(false); }} />
          <div
            className="absolute right-0 top-8 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-w-[140px]"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => { setOpen(false); onToggle(); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-800 hover:bg-gray-50"
            >
              {item.is_featured
                ? <><StarOff className="w-3.5 h-3.5 text-gray-400" /> Unfeature</>
                : <><Star    className="w-3.5 h-3.5 text-amber-500" /> Feature</>
              }
            </button>
            <button
              onClick={() => { setOpen(false); if (window.confirm('Delete this item?')) onDelete(); }}
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

function MinimalLayout({ items, isOwner, onTap, onToggle, onDelete }: CardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {items.map((item, i) => {
        const thumb = item.thumbnail_url || item.media_url;
        const isAudio = item.media_type === 'audio';
        const isLink  = item.media_type === 'link';
        return (
          <div
            key={item.id}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}
            onClick={() => onTap(item)}
          >
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0">
              {thumb && !isAudio && !isLink ? (
                <img src={thumb} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ background: isAudio ? 'linear-gradient(135deg,#1e1040,#312e81)' : 'linear-gradient(135deg,#f0f4ff,#e0e7ff)' }}
                >
                  {isAudio  ? <Music2   className="w-4 h-4 text-purple-300" />
                   : isLink ? <LinkIcon className="w-4 h-4 text-indigo-400" />
                   :          <FileText className="w-4 h-4 text-indigo-300" />}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{item.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {[item.year, item.category].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {item.is_featured && <Star className="w-4 h-4 text-amber-400 fill-amber-300" />}
              {isOwner && (
                <ServiceMenu item={item} onToggle={() => onToggle(item)} onDelete={() => onDelete(item.id)} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Portfolio() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [items,     setItems]     = useState<PortfolioItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [template,  setTemplate]  = useState<Template>(() =>
    (localStorage.getItem('filmons_portfolio_template') as Template) ?? 'masonry'
  );
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [showAdd,   setShowAdd]   = useState(false);
  const [detail,    setDetail]    = useState<PortfolioItem | null>(null);

  useEffect(() => {
    if (!user?.id) {
      if (!isAuthenticated) navigate('/login', { replace: true });
      return;
    }
    getPortfolioItems(user.id)
      .then(data => setItems(data))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const changeTemplate = (t: Template) => {
    setTemplate(t);
    localStorage.setItem('filmons_portfolio_template', t);
  };

  const filtered = items.filter(item => {
    if (activeTab === 'all')      return true;
    if (activeTab === 'photos')   return item.media_type === 'image';
    if (activeTab === 'videos')   return item.media_type === 'video';
    if (activeTab === 'audio')    return item.media_type === 'audio';
    if (activeTab === 'projects') return !!item.external_link || item.media_type === 'link';
    return true;
  });

  const handleToggle = async (item: PortfolioItem) => {
    await toggleFeatured(item.id, item.is_featured);
    setItems(prev => prev.map(p => p.id === item.id ? { ...p, is_featured: !p.is_featured } : p));
  };

  const handleDelete = async (id: string) => {
    await deletePortfolioItem(id);
    setItems(prev => prev.filter(p => p.id !== id));
  };

  if (!user) return null;

  const cardProps: CardProps = {
    items:    filtered,
    isOwner:  true,
    onTap:    item => setDetail(item),
    onToggle: handleToggle,
    onDelete: handleDelete,
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* ── Cover + profile header ── */}
      <div className="relative mb-1">
        {/* Cover photo */}
        <div className="h-44 relative overflow-hidden">
          {user.coverPhoto ? (
            <img src={user.coverPhoto} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)' }}
            />
          )}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom,transparent 40%,rgba(0,0,0,0.35) 100%)' }} />
        </div>

        {/* Avatar + info row */}
        <div className="max-w-lg mx-auto px-4">
          <div className="flex items-end gap-3 -mt-11 mb-3">
            <div className="border-[3px] border-white rounded-full shadow-xl shrink-0">
              <UserAvatar user={user} size={76} />
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <h1 className="font-black text-gray-900 text-lg leading-tight truncate">
                {user.name || user.username}
              </h1>
              {user.username && (
                <p className="text-sm text-gray-400 leading-tight">@{user.username}</p>
              )}
              {user.primaryRole && (
                <p className="text-xs font-bold text-blue-600 mt-0.5">{user.primaryRole}</p>
              )}
            </div>
          </div>

          {user.bio && (
            <p className="text-sm text-gray-600 mb-2 leading-relaxed line-clamp-2">{user.bio}</p>
          )}

          <div className="flex items-center gap-4 mb-3 flex-wrap">
            {(user.city || (user as any).location) && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {(user as any).location || [user.city, user.province].filter(Boolean).join(', ')}
              </span>
            )}
            <span className="text-xs text-gray-500">
              <span className="font-bold text-gray-800">{items.length}</span>
              {' '}work{items.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Owner actions */}
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-white text-sm font-black px-4 py-2.5 rounded-2xl transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)', boxShadow: '0 4px 14px rgba(59,130,246,0.35)' }}
            >
              <Plus className="w-4 h-4" /> Add Work
            </button>
            <button
              onClick={() => navigate('/settings/portfolio')}
              className="flex items-center text-gray-600 text-sm font-semibold px-4 py-2.5 rounded-2xl border border-gray-200 bg-white transition-all active:scale-95 hover:bg-gray-50"
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* ── Template selector ── */}
      <div className="max-w-lg mx-auto px-4 mb-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => changeTemplate(t.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                template === t.id
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="max-w-lg mx-auto px-4 mb-4">
        <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-gray-100 overflow-x-auto no-scrollbar gap-0.5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 shrink-0 py-2 px-1 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
              {t.id !== 'all' && items.filter(i =>
                t.id === 'photos'   ? i.media_type === 'image'
                : t.id === 'videos' ? i.media_type === 'video'
                : t.id === 'audio'  ? i.media_type === 'audio'
                : !!i.external_link || i.media_type === 'link'
              ).length > 0 && (
                <span className={`ml-1 text-[10px] ${activeTab === t.id ? 'text-blue-200' : 'text-gray-400'}`}>
                  {items.filter(i =>
                    t.id === 'photos'   ? i.media_type === 'image'
                    : t.id === 'videos' ? i.media_type === 'video'
                    : t.id === 'audio'  ? i.media_type === 'audio'
                    : !!i.external_link || i.media_type === 'link'
                  ).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-lg mx-auto px-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm text-center py-16 px-6">
            <Film className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="font-black text-gray-900 mb-1 text-lg">
              {activeTab === 'all' ? 'Build your creative portfolio' : `No ${activeTab} yet`}
            </p>
            <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
              {activeTab === 'all'
                ? 'Upload photos, videos, audio samples, or link to your best projects.'
                : `Add your first ${activeTab === 'projects' ? 'project' : activeTab.slice(0, -1)} to get started.`}
            </p>
            {activeTab === 'all' && (
              <button
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-black px-5 py-3 rounded-2xl transition-all active:scale-95"
                style={{ boxShadow: '0 6px 20px rgba(59,130,246,0.3)' }}
              >
                <Plus className="w-4 h-4" /> Add your first portfolio item
              </button>
            )}
          </div>
        ) : (
          template === 'masonry'   ? <MasonryLayout   {...cardProps} /> :
          template === 'grid'      ? <GridLayout       {...cardProps} /> :
          template === 'cinematic' ? <CinematicLayout  {...cardProps} /> :
          template === 'service'   ? <ServiceLayout    {...cardProps} /> :
                                     <MinimalLayout    {...cardProps} />
        )}
      </div>

      {/* ── Detail lightbox ── */}
      {detail && <DetailSheet item={detail} onClose={() => setDetail(null)} />}

      {/* ── Add item sheet ── */}
      {showAdd && (
        <AddPortfolioItemSheet
          onClose={() => setShowAdd(false)}
          onAdded={item => setItems(prev => [item, ...prev])}
        />
      )}
    </div>
  );
}
