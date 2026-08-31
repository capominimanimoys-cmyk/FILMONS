import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Globe, Lock, Users, Upload, Copy, Share2, ExternalLink,
  Grid3X3, LayoutGrid, Minus, Newspaper, ChevronUp, ChevronDown, X,
  Image as ImageIcon, Trash2, RotateCcw, AlertTriangle, GripVertical,
  Loader2, Check, Plus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { consumeSettingsReturnTo } from '../lib/settingsReturnTo';
import {
  getPortfolioSettings, upsertPortfolioSettings, resetPortfolioSettings,
  uploadPortfolioCover, getPortfolioItems, updateItemsOrder, setItemDownloadAllowed,
  getAlbums, updateAlbum, deleteAlbum, deleteAlbumCascadeItems, reorderAlbums,
  deletePortfolioItem,
  DEFAULT_PORTFOLIO_SETTINGS,
  type PortfolioSettings, type PortfolioLayout, type PortfolioSortOrder,
  type PortfolioVisibility, type PortfolioDownloads, type PortfolioItem, type PortfolioAlbum,
} from '../lib/portfolioApi';

// ── Shared row components (mirrors PrivacySettings.tsx conventions) ───────────
function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: () => void; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-3 px-4">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{sub}</p>}
      </div>
      <button onClick={onChange}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${on ? 'bg-blue-600' : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200 ${on ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="mx-4">
      <div className="mb-2 px-1">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
        {children}
      </div>
    </div>
  );
}

const VIS_OPTIONS: { id: PortfolioVisibility; label: string; sub: string; Icon: any }[] = [
  { id: 'public',    label: 'Public',    sub: 'Anyone can view the portfolio through the creator profile or shared link.', Icon: Globe },
  { id: 'followers', label: 'Followers only', sub: 'Only approved followers can view the portfolio.', Icon: Users },
  { id: 'private',   label: 'Private',   sub: 'Only the creator can view the portfolio.', Icon: Lock },
];

const LAYOUT_OPTIONS: { id: PortfolioLayout; label: string; Icon: any }[] = [
  { id: 'grid',        label: 'Grid',        Icon: Grid3X3 },
  { id: 'large_cards',  label: 'Large cards', Icon: LayoutGrid },
  { id: 'minimal',      label: 'Minimal',     Icon: Minus },
  { id: 'editorial',    label: 'Editorial',   Icon: Newspaper },
];

const SORT_OPTIONS: { id: PortfolioSortOrder; label: string }[] = [
  { id: 'newest',           label: 'Newest first' },
  { id: 'oldest',           label: 'Oldest first' },
  { id: 'recently_updated', label: 'Recently updated' },
  { id: 'custom',           label: 'Custom order' },
];

const DOWNLOAD_OPTIONS: { id: PortfolioDownloads; label: string; sub: string }[] = [
  { id: 'off',        label: 'Off',                       sub: 'Visitors cannot download your work' },
  { id: 'individual', label: 'Allow individual images',    sub: 'Any image can be downloaded' },
  { id: 'selected',   label: 'Allow selected projects',    sub: 'Choose exactly which work can be downloaded' },
];

type Settings = Omit<PortfolioSettings, 'id' | 'user_id' | 'updated_at'> & { updated_at?: string };

export function PortfolioSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading,  setLoading]  = useState(true);
  const [saved,    setSaved]    = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_PORTFOLIO_SETTINGS);
  const [items,    setItems]    = useState<PortfolioItem[]>([]);
  const [albums,   setAlbums]   = useState<PortfolioAlbum[]>([]);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [editingAlbumId,  setEditingAlbumId]  = useState<string | null>(null);
  const [editingTitle,    setEditingTitle]    = useState('');
  const [deleteAlbumTarget, setDeleteAlbumTarget] = useState<PortfolioAlbum | null>(null);
  const [showResetConfirm,  setShowResetConfirm]  = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [s, i, a] = await Promise.all([
        getPortfolioSettings(user.id),
        getPortfolioItems(user.id),
        getAlbums(user.id),
      ]);
      if (s) setSettings(s);
      setItems(i);
      setAlbums(a);
      setLoading(false);
    })();
  }, [user?.id]);

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 1800); };

  const save = async (updates: Partial<Settings>) => {
    if (!user?.id) return;
    setSettings(prev => ({ ...prev, ...updates }));
    const result = await upsertPortfolioSettings(user.id, updates);
    if (!result) { toast.error('Could not save — run migration 20240209 in Supabase'); return; }
    setSettings(prev => ({ ...prev, updated_at: result.updated_at }));
    flashSaved();
  };

  // Must match the actual route (portfolio/:userId in routes.tsx, which
  // resolves strictly by user id -- see Portfolio.tsx's loadPage/getUserById,
  // no username lookup exists). The old `@username/portfolio` shape wasn't a
  // real route at all -- copying/sharing it produced a dead link.
  const portfolioUrl = user?.id ? `${window.location.origin}/portfolio/${user.id}` : '';

  const handleCoverFile = async (file: File) => {
    if (!user?.id || !file.type.startsWith('image/')) { toast.error('Images only'); return; }
    setUploadingCover(true);
    const url = await uploadPortfolioCover(user.id, file);
    setUploadingCover(false);
    if (!url) { toast.error('Cover upload failed'); return; }
    save({ cover_path: url });
  };

  // ── Custom work order ──
  const moveItem = (index: number, dir: -1 | 1) => {
    const next = [...items];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setItems(next);
    updateItemsOrder(next.map((it, idx) => ({ id: it.id, sort_order: next.length - idx })));
  };

  // ── Featured work ──
  const featuredCount = items.filter(i => i.is_featured).length;

  // ── Downloads ──
  const toggleItemDownload = async (item: PortfolioItem) => {
    const next = !item.download_allowed;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, download_allowed: next } : i));
    const ok = await setItemDownloadAllowed(item.id, next);
    if (!ok) setItems(prev => prev.map(i => i.id === item.id ? { ...i, download_allowed: !next } : i));
  };

  // ── Albums ──
  const startRename = (album: PortfolioAlbum) => { setEditingAlbumId(album.id); setEditingTitle(album.title); };
  const commitRename = async (album: PortfolioAlbum) => {
    const title = editingTitle.trim();
    setEditingAlbumId(null);
    if (!title || title === album.title) return;
    const ok = await updateAlbum(album.id, { title });
    if (ok) setAlbums(prev => prev.map(a => a.id === album.id ? { ...a, title } : a));
  };
  const changeAlbumVisibility = async (album: PortfolioAlbum, visibility: PortfolioVisibility) => {
    const ok = await updateAlbum(album.id, { visibility });
    if (ok) setAlbums(prev => prev.map(a => a.id === album.id ? { ...a, visibility } : a));
  };
  const moveAlbum = (index: number, dir: -1 | 1) => {
    const next = [...albums];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setAlbums(next);
    reorderAlbums(next.map((a, idx) => ({ id: a.id, sort_order: idx })));
  };
  const handleAlbumCoverFile = async (album: PortfolioAlbum, file: File) => {
    if (!user?.id || !file.type.startsWith('image/')) { toast.error('Images only'); return; }
    const url = await uploadPortfolioCover(user.id, file);
    if (!url) { toast.error('Cover upload failed'); return; }
    const ok = await updateAlbum(album.id, { cover_url: url });
    if (ok) setAlbums(prev => prev.map(a => a.id === album.id ? { ...a, cover_url: url } : a));
  };
  const confirmDeleteAlbum = async (removeWork: boolean) => {
    if (!deleteAlbumTarget) return;
    const album = deleteAlbumTarget;
    setDeleteAlbumTarget(null);
    const ok = removeWork ? await deleteAlbumCascadeItems(album.id) : await deleteAlbum(album.id);
    if (!ok) { toast.error('Could not delete album'); return; }
    setAlbums(prev => prev.filter(a => a.id !== album.id));
    if (removeWork) {
      const remaining = await getPortfolioItems(user!.id);
      setItems(remaining);
    }
    toast.success('Album deleted');
  };

  // ── Danger zone ──
  const handleReset = async () => {
    if (!user?.id) return;
    setShowResetConfirm(false);
    const result = await resetPortfolioSettings(user.id);
    if (result) { setSettings(result); toast.success('Portfolio layout reset'); }
  };
  const handleDeleteContent = async () => {
    if (!user?.id) return;
    setShowDeleteConfirm(false);
    await Promise.all(items.map(i => deletePortfolioItem(i.id)));
    await Promise.all(albums.map(a => deleteAlbum(a.id)));
    setItems([]);
    setAlbums([]);
    toast.success('Portfolio content deleted');
  };

  const lastUpdatedLabel = settings.updated_at
    ? new Date(settings.updated_at).toLocaleDateString()
    : 'today';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverFile(f); e.target.value = ''; }}
      />

      {/* Header */}
      <div className="sticky top-14 lg:top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(consumeSettingsReturnTo() || '/settings')}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <h1 className="text-base font-black text-gray-900 flex-1">Portfolio Settings</h1>
        {saved && (
          <span className="text-xs font-bold text-green-600 flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>

      <div className="max-w-lg mx-auto pt-4 space-y-5">

        {/* Portfolio status */}
        <div className="mx-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl px-5 py-4 text-white">
          <p className="text-xs font-bold text-blue-100 uppercase tracking-wide mb-2">Portfolio status</p>
          {items.length === 0 ? (
            <>
              <p className="font-black mb-2">Your portfolio is empty</p>
              <button onClick={() => navigate('/portfolio')} className="text-xs font-black bg-white/15 hover:bg-white/25 rounded-xl px-3 py-2 transition-colors">
                Add your first work
              </button>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold">
              <span className="capitalize">{settings.visibility}</span>
              <span>{items.length} work{items.length === 1 ? '' : 's'}</span>
              <span>{albums.length} album{albums.length === 1 ? '' : 's'}</span>
              <span className="text-blue-200 font-medium">Last updated {lastUpdatedLabel}</span>
            </div>
          )}
        </div>

        {/* 1. Visibility */}
        <Section title="Portfolio visibility">
          {VIS_OPTIONS.map(v => (
            <button key={v.id} onClick={() => save({ visibility: v.id })}
              className={`w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-gray-50 transition-colors ${settings.visibility === v.id ? 'bg-blue-50' : ''}`}>
              <v.Icon className={`w-5 h-5 shrink-0 ${settings.visibility === v.id ? 'text-blue-600' : 'text-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{v.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{v.sub}</p>
              </div>
              {settings.visibility === v.id && (
                <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </Section>
        {settings.visibility === 'private' && (
          <div className="mx-4 -mt-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <p className="text-xs text-amber-700 font-semibold">Your portfolio is currently private and cannot be viewed by other users.</p>
          </div>
        )}

        {/* 2. Portfolio link */}
        <Section title="Portfolio link">
          <div className="px-4 py-3">
            <p className="text-sm font-mono text-gray-700 break-all">{portfolioUrl}</p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-50">
            <button
              disabled={settings.visibility === 'private'}
              onClick={() => { navigator.clipboard.writeText(portfolioUrl); toast.success('Link copied!'); }}
              className="flex flex-col items-center gap-1 py-3 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-white transition-colors">
              <Copy className="w-4 h-4" /> Copy
            </button>
            <button
              disabled={settings.visibility === 'private'}
              onClick={() => {
                if (navigator.share) navigator.share({ url: portfolioUrl }).catch(() => {});
                else { navigator.clipboard.writeText(portfolioUrl); toast.success('Link copied!'); }
              }}
              className="flex flex-col items-center gap-1 py-3 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-white transition-colors">
              <Share2 className="w-4 h-4" /> Share
            </button>
            <button onClick={() => navigate('/portfolio')}
              className="flex flex-col items-center gap-1 py-3 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">
              <ExternalLink className="w-4 h-4" /> Preview
            </button>
          </div>
          {settings.visibility === 'private' && (
            <div className="px-4 py-2.5 bg-gray-50">
              <p className="text-[11px] text-gray-400">Sharing is disabled while your portfolio is private.</p>
            </div>
          )}
        </Section>

        {/* 3. Cover */}
        <Section title="Portfolio cover">
          <div className="p-4 space-y-3">
            <div className="relative w-full aspect-[3/1] rounded-2xl overflow-hidden bg-gray-100">
              {settings.cover_path ? (
                <img src={settings.cover_path} alt="Cover" className="w-full h-full object-cover"
                  style={{ objectPosition: `50% ${settings.cover_position_y}%` }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-gray-300" />
                </div>
              )}
              {uploadingCover && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                </div>
              )}
            </div>
            {settings.cover_path && (
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Reposition</label>
                <input
                  type="range" min={0} max={100} value={settings.cover_position_y}
                  onChange={e => setSettings(s => ({ ...s, cover_position_y: Number(e.target.value) }))}
                  onMouseUp={() => save({ cover_position_y: settings.cover_position_y })}
                  onTouchEnd={() => save({ cover_position_y: settings.cover_position_y })}
                  className="w-full accent-blue-600"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => fileRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50">
                <Upload className="w-3.5 h-3.5" /> {settings.cover_path ? 'Change' : 'Upload'} cover
              </button>
              {settings.cover_path && (
                <button onClick={() => save({ cover_path: null, cover_position_y: 50 })}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-red-500 hover:bg-red-50">
                  <X className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </div>
          </div>
        </Section>

        {/* 4. Layout */}
        <Section title="Portfolio layout">
          <div className="grid grid-cols-2 gap-2 p-4">
            {LAYOUT_OPTIONS.map(l => (
              <button key={l.id} onClick={() => save({ layout: l.id })}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${settings.layout === l.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                <l.Icon className={`w-6 h-6 ${settings.layout === l.id ? 'text-blue-600' : 'text-gray-400'}`} />
                <p className={`text-xs font-bold ${settings.layout === l.id ? 'text-blue-700' : 'text-gray-700'}`}>{l.label}</p>
              </button>
            ))}
          </div>
        </Section>

        {/* 5. Work order */}
        <Section title="Work display order">
          {SORT_OPTIONS.map(o => (
            <button key={o.id} onClick={() => save({ sort_order: o.id })}
              className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors ${settings.sort_order === o.id ? 'bg-blue-50' : ''}`}>
              <p className={`text-sm font-semibold ${settings.sort_order === o.id ? 'text-blue-700' : 'text-gray-900'}`}>{o.label}</p>
              {settings.sort_order === o.id && <Check className="w-4 h-4 text-blue-600" />}
            </button>
          ))}
          {settings.sort_order === 'custom' && (
            <div className="p-2 space-y-1 bg-gray-50">
              {items.length === 0 && <p className="text-xs text-gray-400 px-2 py-2">No work to reorder yet.</p>}
              {items.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-gray-100">
                  <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  <p className="text-xs font-semibold text-gray-700 flex-1 truncate">{item.title}</p>
                  <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="w-6 h-6 flex items-center justify-center text-gray-400 disabled:opacity-20"><ChevronUp className="w-4 h-4" /></button>
                  <button onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} className="w-6 h-6 flex items-center justify-center text-gray-400 disabled:opacity-20"><ChevronDown className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 6. Featured work */}
        <Section title="Featured work" sub="Featured projects appear first, or in a dedicated section depending on layout. New uploads are never auto-featured.">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-bold text-gray-900">{featuredCount} featured</p>
              <p className="text-xs text-gray-400 mt-0.5">Star items from your portfolio to feature them</p>
            </div>
            <button onClick={() => navigate('/portfolio')} className="text-xs font-black text-blue-600 flex items-center gap-1">
              Manage <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Maximum featured</p>
            <div className="flex items-center gap-3">
              <button onClick={() => save({ max_featured: Math.max(3, settings.max_featured - 1) })}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold disabled:opacity-30" disabled={settings.max_featured <= 3}>−</button>
              <span className="text-sm font-black text-gray-900 w-4 text-center">{settings.max_featured}</span>
              <button onClick={() => save({ max_featured: Math.min(6, settings.max_featured + 1) })}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold disabled:opacity-30" disabled={settings.max_featured >= 6}>+</button>
            </div>
          </div>
        </Section>

        {/* 7. Albums */}
        <Section title="Albums">
          {albums.length === 0 && <p className="text-xs text-gray-400 px-4 py-4">No albums yet — create one from your Portfolio page.</p>}
          {albums.map((album, idx) => (
            <div key={album.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                  {album.cover_url && <img src={album.cover_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  {editingAlbumId === album.id ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={e => setEditingTitle(e.target.value)}
                      onBlur={() => commitRename(album)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(album); if (e.key === 'Escape') setEditingAlbumId(null); }}
                      className="text-sm font-bold text-gray-900 border-b border-blue-300 outline-none w-full"
                    />
                  ) : (
                    <button onClick={() => startRename(album)} className="text-sm font-bold text-gray-900 text-left truncate block w-full">
                      {album.title}
                    </button>
                  )}
                  <select
                    value={album.visibility}
                    onChange={e => changeAlbumVisibility(album, e.target.value as PortfolioVisibility)}
                    className="text-xs text-gray-400 capitalize bg-transparent outline-none -ml-0.5"
                  >
                    <option value="public">Public</option>
                    <option value="followers">Followers</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => moveAlbum(idx, -1)} disabled={idx === 0} className="w-7 h-7 flex items-center justify-center text-gray-400 disabled:opacity-20"><ChevronUp className="w-4 h-4" /></button>
                  <button onClick={() => moveAlbum(idx, 1)} disabled={idx === albums.length - 1} className="w-7 h-7 flex items-center justify-center text-gray-400 disabled:opacity-20"><ChevronDown className="w-4 h-4" /></button>
                  <label className="w-7 h-7 flex items-center justify-center text-gray-400 cursor-pointer">
                    <ImageIcon className="w-4 h-4" />
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleAlbumCoverFile(album, f); e.target.value = ''; }} />
                  </label>
                  <button onClick={() => setDeleteAlbumTarget(album)} className="w-7 h-7 flex items-center justify-center text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => navigate('/portfolio')}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-black text-blue-600 hover:bg-blue-50">
            <Plus className="w-3.5 h-3.5" /> Create album
          </button>
        </Section>

        {/* 8. About */}
        <Section title="About section">
          <Toggle
            on={settings.show_about}
            onChange={() => save({ show_about: !settings.show_about })}
            label="Show About on portfolio"
            sub="Displays your role, bio, skills, location, experience, education and collaboration interests. Never shows email, phone, address or verification documents."
          />
        </Section>

        {/* 9. Contact & collaboration */}
        <Section title="Contact options">
          <Toggle on={settings.show_message_button} onChange={() => save({ show_message_button: !settings.show_message_button })}
            label="Message me" sub="Visitors can message you from your portfolio" />
          <Toggle on={settings.show_hire_button} onChange={() => save({ show_hire_button: !settings.show_hire_button })}
            label="Hire me" sub="Visitors can tap Hire to find your listings" />
        </Section>

        {/* 10. Sharing */}
        <Section title="Sharing">
          <button
            disabled={settings.visibility === 'private'}
            onClick={() => { navigator.clipboard.writeText(portfolioUrl); toast.success('Link copied!'); }}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 disabled:opacity-40 transition-colors">
            <span className="text-sm font-semibold text-gray-900">Copy portfolio link</span>
            <Copy className="w-4 h-4 text-gray-400" />
          </button>
          <button onClick={() => navigate('/share-card')}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
            <span className="text-sm font-semibold text-gray-900">Generate portfolio share card</span>
            <ChevronDown className="w-4 h-4 text-gray-400 -rotate-90" />
          </button>
          <button
            disabled={settings.visibility === 'private'}
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(portfolioUrl)}`)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 disabled:opacity-40 transition-colors">
            <span className="text-sm font-semibold text-gray-900">Share to WhatsApp</span>
            <Share2 className="w-4 h-4 text-gray-400" />
          </button>
        </Section>

        {/* 11. Downloads */}
        <Section title="Allow portfolio downloads">
          {DOWNLOAD_OPTIONS.map(o => (
            <button key={o.id} onClick={() => save({ allow_downloads: o.id })}
              className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors ${settings.allow_downloads === o.id ? 'bg-blue-50' : ''}`}>
              <div>
                <p className={`text-sm font-semibold ${settings.allow_downloads === o.id ? 'text-blue-700' : 'text-gray-900'}`}>{o.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{o.sub}</p>
              </div>
              {settings.allow_downloads === o.id && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
            </button>
          ))}
          {settings.allow_downloads === 'selected' && (
            <div className="p-2 space-y-1 bg-gray-50">
              {items.length === 0 && <p className="text-xs text-gray-400 px-2 py-2">No work to choose from yet.</p>}
              {items.map(item => (
                <Toggle
                  key={item.id}
                  on={!!item.download_allowed}
                  onChange={() => toggleItemDownload(item)}
                  label={item.title}
                />
              ))}
            </div>
          )}
        </Section>

        {/* 12. Engagement */}
        <Section title="Portfolio engagement">
          <Toggle on={settings.allow_likes} onChange={() => save({ allow_likes: !settings.allow_likes })} label="Allow likes" />
          <Toggle on={settings.allow_comments} onChange={() => save({ allow_comments: !settings.allow_comments })} label="Allow comments" />
          <Toggle on={settings.show_view_count} onChange={() => save({ show_view_count: !settings.show_view_count })} label="Show view count" />
        </Section>

        {/* 14. Portfolio management */}
        <div className="mx-4">
          <div className="mb-2 px-1">
            <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Portfolio management</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden divide-y divide-red-50">
            <button onClick={() => setShowResetConfirm(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-red-50 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <RotateCcw className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-sm font-semibold text-red-600">Reset portfolio layout</p>
            </button>
            <button onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-red-50 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-red-600">Delete portfolio content</p>
                <p className="text-[11px] text-red-300">Removes all work and albums. Your account is never deleted.</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Delete album modal */}
      {deleteAlbumTarget && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setDeleteAlbumTarget(null)} />
          <div className="fixed inset-x-4 bottom-6 z-[61] bg-white rounded-3xl p-5 max-w-sm mx-auto">
            <p className="font-black text-gray-900 mb-1">Delete this album?</p>
            <p className="text-xs text-gray-400 mb-4">"{deleteAlbumTarget.title}" — choose what happens to the work inside it.</p>
            <div className="space-y-2">
              <button onClick={() => confirmDeleteAlbum(false)}
                className="w-full py-3 rounded-2xl border border-gray-200 text-sm font-bold text-gray-800 hover:bg-gray-50">
                Delete album only, keep the work
              </button>
              <button onClick={() => confirmDeleteAlbum(true)}
                className="w-full py-3 rounded-2xl bg-red-50 border border-red-200 text-sm font-bold text-red-600 hover:bg-red-100">
                Delete album and remove its work
              </button>
              <button onClick={() => setDeleteAlbumTarget(null)}
                className="w-full py-2.5 text-sm font-semibold text-gray-400">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* Reset confirm */}
      {showResetConfirm && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setShowResetConfirm(false)} />
          <div className="fixed inset-x-4 bottom-6 z-[61] bg-white rounded-3xl p-5 max-w-sm mx-auto text-center">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <p className="font-black text-gray-900 mb-1">Reset portfolio layout?</p>
            <p className="text-xs text-gray-400 mb-4">Visibility, layout, order and all display settings return to defaults. Your work and albums are not affected.</p>
            <div className="space-y-2">
              <button onClick={handleReset} className="w-full py-3 rounded-2xl bg-red-600 text-white text-sm font-bold hover:bg-red-700">Reset settings</button>
              <button onClick={() => setShowResetConfirm(false)} className="w-full py-2.5 text-sm font-semibold text-gray-400">Cancel</button>
            </div>
          </div>
        </>
      )}

      {/* Delete content confirm */}
      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setShowDeleteConfirm(false)} />
          <div className="fixed inset-x-4 bottom-6 z-[61] bg-white rounded-3xl p-5 max-w-sm mx-auto text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="font-black text-gray-900 mb-1">Delete all portfolio content?</p>
            <p className="text-xs text-gray-400 mb-4">This permanently deletes all {items.length} work item{items.length === 1 ? '' : 's'} and {albums.length} album{albums.length === 1 ? '' : 's'}. Your Filmons account is never deleted. This cannot be undone.</p>
            <div className="space-y-2">
              <button onClick={handleDeleteContent} className="w-full py-3 rounded-2xl bg-red-600 text-white text-sm font-bold hover:bg-red-700">Delete everything</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="w-full py-2.5 text-sm font-semibold text-gray-400">Cancel</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
