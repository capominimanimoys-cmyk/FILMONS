// Unified Album creation flow -- full-height slide-up page (mobile) that
// EVERY "Add Album" entry point now opens (Portfolio's main action row,
// the Albums-tab dashed button, the empty-albums state, and the bulk-
// select "Create Album" flow via initialSelectedItems), replacing
// CreateAlbumSheet.tsx's small 2-step bottom sheet -- per spec: "All
// entry points must use one shared creation component and state."
//
// Content can come from two places, combinable: "From Portfolio"
// (PortfolioContentPicker -- reference only, never uploads/duplicates)
// and "New Media" (the ordinary upload flow, same per-file pattern
// AddPortfolioItemSheet's own multi-file album path already uses).
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  X, Globe, Lock, Users, Loader2, Check, Plus, ChevronDown,
  GripVertical, MoreVertical, ImagePlus, MapPin, Play, Upload, FolderOpen,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../context/AuthContext';
import {
  createAlbum, addItemToAlbum, uploadPortfolioMedia, readImageDimensions, readVideoDimensions,
  createPortfolioItem, updateItemsOrder, setAlbumCoverFromItem, updateAlbum,
  type PortfolioAlbum, type PortfolioItem, type MediaType,
} from '../lib/portfolioApi';
import { logActivityEvent } from '../lib/activityApi';
import { PortfolioContentPicker } from './PortfolioContentPicker';
import { BottomSheet } from './BottomSheet';

type Visibility = 'public' | 'connections' | 'private';

const VIS_OPTIONS: { id: Visibility; label: string; sub: string; Icon: any }[] = [
  { id: 'public',      label: 'Public',      sub: 'Anyone can view',       Icon: Globe },
  { id: 'connections', label: 'Connections', sub: 'Your connections only', Icon: Users },
  { id: 'private',     label: 'Private',     sub: 'Only you',              Icon: Lock  },
];

interface NewMediaDraft {
  localId: string; file: File; previewUrl?: string;
  status: 'pending' | 'uploading' | 'done' | 'error'; progress: number;
  mediaType: MediaType; url?: string; thumbnailUrl?: string;
  width?: number; height?: number; aspect_ratio?: number;
}

type SelectedEntry =
  | { key: string; kind: 'existing'; item: PortfolioItem }
  | { key: string; kind: 'new'; draft: NewMediaDraft };

export function AlbumEditorPage({ initialSelectedItems, onClose, onCreated }: {
  /** Pre-seeded selection -- Portfolio's bulk-select "Create Album" flow
   * hands its already-picked items in here rather than maintaining a
   * second, simpler creation UI. */
  initialSelectedItems?: PortfolioItem[];
  onClose: () => void;
  onCreated: (album: PortfolioAlbum) => void;
}) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let t: number;
    const outer = requestAnimationFrame(() => { t = requestAnimationFrame(() => setVisible(true)); });
    window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: true } }));
    return () => {
      cancelAnimationFrame(outer); cancelAnimationFrame(t);
      window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: false } }));
    };
  }, []);
  const close = () => { setVisible(false); setTimeout(onClose, 300); };

  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [location,    setLocation]    = useState('');
  const [tags,        setTags]        = useState<string[]>([]);
  const [tagInput,    setTagInput]    = useState('');
  const [visibility,  setVisibility]  = useState<Visibility>('public');
  const [showVisSheet,setShowVisSheet]= useState(false);

  const [coverPreview,   setCoverPreview]   = useState('');
  const [coverUrl,       setCoverUrl]       = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  // Points at a selected entry to use ITS thumbnail as cover instead of a
  // separately uploaded one -- the "Set as cover" action on a selected
  // item below.
  const [coverKey, setCoverKey] = useState<string | undefined>(undefined);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const [entries, setEntries] = useState<SelectedEntry[]>(() =>
    (initialSelectedItems ?? []).map(item => ({ key: item.id, kind: 'existing' as const, item })));
  const [showPicker,   setShowPicker]   = useState(false);
  const [itemMenuKey,  setItemMenuKey]  = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);

  const canCreate = title.trim().length > 0 && !saving;

  const handleCoverFile = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith('image/')) { toast.error('Images only'); return; }
    setCoverPreview(URL.createObjectURL(file));
    setCoverKey(undefined);
    setCoverUploading(true);
    const result = await uploadPortfolioMedia(user.id, file);
    setCoverUploading(false);
    if (result) setCoverUrl(result.url);
    else { toast.error('Cover upload failed'); setCoverPreview(''); }
  };

  const handlePickedFromPortfolio = (items: PortfolioItem[]) => {
    setEntries(prev => [
      ...prev,
      ...items.filter(i => !prev.some(e => e.key === i.id)).map(item => ({ key: item.id, kind: 'existing' as const, item })),
    ]);
    setShowPicker(false);
  };

  const mediaTypeOf = (file: File): MediaType =>
    file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';

  const uploadDraft = async (localId: string, file: File) => {
    if (!user) return;
    setEntries(prev => prev.map(e => e.kind === 'new' && e.draft.localId === localId ? { ...e, draft: { ...e.draft, status: 'uploading' } } : e));
    const mediaType = mediaTypeOf(file);
    const dims = mediaType === 'video' ? await readVideoDimensions(file) : mediaType === 'image' ? await readImageDimensions(file) : null;
    const result = await uploadPortfolioMedia(user.id, file, pct =>
      setEntries(prev => prev.map(e => e.kind === 'new' && e.draft.localId === localId ? { ...e, draft: { ...e.draft, progress: pct } } : e)));
    if (!result) {
      setEntries(prev => prev.map(e => e.kind === 'new' && e.draft.localId === localId ? { ...e, draft: { ...e.draft, status: 'error' } } : e));
      toast.error(`Could not upload ${file.name}`);
      return;
    }
    setEntries(prev => prev.map(e => e.kind === 'new' && e.draft.localId === localId ? {
      ...e,
      draft: {
        ...e.draft, status: 'done', url: result.url, thumbnailUrl: result.thumbnailUrl || result.url,
        width: dims?.width, height: dims?.height, aspect_ratio: dims?.aspect_ratio,
      },
    } : e));
  };

  const handleFiles = (fileList: FileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    const drafts: SelectedEntry[] = files.map(f => {
      const localId = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return {
        key: localId, kind: 'new' as const,
        draft: {
          localId, file: f, status: 'pending', progress: 0, mediaType: mediaTypeOf(f),
          previewUrl: f.type.startsWith('audio/') ? undefined : URL.createObjectURL(f),
        },
      };
    });
    setEntries(prev => [...prev, ...drafts]);
    drafts.forEach(d => { if (d.kind === 'new') uploadDraft(d.draft.localId, d.draft.file); });
  };

  const removeEntry = (key: string) => {
    setEntries(prev => {
      const removed = prev.find(e => e.key === key);
      if (removed?.kind === 'new' && removed.draft.previewUrl) URL.revokeObjectURL(removed.draft.previewUrl);
      return prev.filter(e => e.key !== key);
    });
    if (coverKey === key) setCoverKey(undefined);
    setItemMenuKey(null);
  };

  const setEntryAsCover = (key: string) => {
    setCoverKey(key);
    setCoverUrl(''); setCoverPreview('');
    setItemMenuKey(null);
  };

  const moveEntry = (key: string, dir: -1 | 1) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.key === key);
      const swapWith = idx + dir;
      if (idx === -1 || swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
    setItemMenuKey(null);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setEntries(prev => {
      const oldIdx = prev.findIndex(x => x.key === active.id);
      const newIdx = prev.findIndex(x => x.key === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const entryThumb = (e: SelectedEntry): string | undefined =>
    e.kind === 'existing' ? (e.item.thumbnail_url || e.item.media_url) : (e.draft.thumbnailUrl || e.draft.previewUrl);
  const entryIsVideo = (e: SelectedEntry): boolean =>
    e.kind === 'existing' ? e.item.media_type === 'video' : e.draft.mediaType === 'video';
  const entryIsProject = (e: SelectedEntry): boolean =>
    e.kind === 'existing' && (e.item.work_type === 'project' || e.item.work_type === 'case_study');

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
  };

  const handleCreate = async () => {
    if (!user || !title.trim()) { toast.error('Add a title'); return; }
    if (entries.some(e => e.kind === 'new' && (e.draft.status === 'uploading' || e.draft.status === 'pending'))) {
      toast.error('Wait for uploads to finish'); return;
    }
    setSaving(true);
    const album = await createAlbum(user.id, {
      title: title.trim(), description: description.trim() || undefined, visibility,
      cover_url: coverUrl || undefined,
    });
    if (!album) { setSaving(false); toast.error('Could not create album'); return; }

    const resolvedItemIds: string[] = [];
    let coverItemId: string | undefined;
    for (const e of entries) {
      if (e.kind === 'existing') {
        await addItemToAlbum(album.id, e.item.id);
        resolvedItemIds.push(e.item.id);
        if (coverKey === e.key) coverItemId = e.item.id;
      } else {
        if (e.draft.status !== 'done' || !e.draft.url) continue;
        const item = await createPortfolioItem(user.id, {
          work_type:     e.draft.mediaType === 'video' ? 'video' : 'photo',
          title:         title.trim(),
          description:   description.trim() || undefined,
          category:      '',
          media_type:    e.draft.mediaType,
          media_url:     e.draft.url,
          thumbnail_url: e.draft.thumbnailUrl,
          is_featured:   false,
          width:         e.draft.width,
          height:        e.draft.height,
          aspect_ratio:  e.draft.aspect_ratio,
          visibility:    'public',
          location:      location.trim() || undefined,
          tags:          tags.length ? tags : undefined,
        });
        if (item) {
          await addItemToAlbum(album.id, item.id);
          resolvedItemIds.push(item.id);
          if (coverKey === e.key) coverItemId = item.id;
        }
      }
    }

    if (resolvedItemIds.length) await updateItemsOrder(resolvedItemIds.map((id, i) => ({ id, sort_order: i })));
    if (coverItemId) await setAlbumCoverFromItem(album.id, coverItemId);
    if (location.trim() || tags.length) {
      await updateAlbum(album.id, { location: location.trim() || undefined, tags: tags.length ? tags : undefined });
    }

    if (visibility === 'public') {
      logActivityEvent({
        actorId: user.id, activityType: 'portfolio_album_published',
        targetType: 'portfolio_album', targetId: album.id, title: album.title || null,
      });
    }

    setSaving(false);
    toast.success('Album created ✓');
    onCreated(album);
  };

  if (!user) return null;

  return createPortal((
    <div
      className="fixed inset-0 z-[92] bg-gray-50 flex flex-col"
      style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white shrink-0" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={close} className="text-sm font-bold text-gray-500">Cancel</button>
        <p className="text-sm font-black text-gray-900">New Album</p>
        <button onClick={handleCreate} disabled={!canCreate} className="text-sm font-black text-blue-600 disabled:text-gray-300">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-10 space-y-5">
        {/* ── Cover ── */}
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Album Cover</label>
          <input ref={coverFileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverFile(f); e.target.value = ''; }} />
          {(() => {
            const coverEntry = coverKey ? entries.find(en => en.key === coverKey) : undefined;
            const shownCover = coverPreview || coverUrl || (coverEntry ? entryThumb(coverEntry) : '');
            return shownCover ? (
              <div className="relative w-full rounded-2xl overflow-hidden bg-gray-100 aspect-video">
                <img src={shownCover} alt="Cover" className="w-full h-full object-cover" />
                {coverUploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                  </div>
                )}
                <button onClick={() => coverFileRef.current?.click()} className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors group">
                  <span className="opacity-0 group-hover:opacity-100 text-xs font-black text-white bg-black/60 px-3 py-1.5 rounded-full transition-opacity">Change cover</span>
                </button>
                <button onClick={() => { setCoverPreview(''); setCoverUrl(''); setCoverKey(undefined); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ) : (
              <button onClick={() => coverFileRef.current?.click()} className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left" style={{ background: '#f9fafb', border: '1.5px dashed #d1d5db' }}>
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <ImagePlus className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-700">Upload cover</p>
                  <p className="text-xs text-gray-400 mt-0.5">Optional — or set one from your content below</p>
                </div>
              </button>
            );
          })()}
        </div>

        {/* ── Title / Description / Location / Hashtags ── */}
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Vancouver Shoot" maxLength={60}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-white" />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this album about?" rows={3} maxLength={300}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-white resize-none" />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Location</label>
          <div className="flex items-center gap-2 border border-gray-200 rounded-2xl px-4 py-3 bg-white">
            <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Add a location" className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent" />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Hashtags</label>
          <div className="flex flex-wrap gap-2 border border-gray-200 rounded-2xl px-3 py-2.5 bg-white">
            {tags.map(t => (
              <span key={t} className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                #{t}
                <button onClick={() => setTags(prev => prev.filter(x => x !== t))}><X className="w-3 h-3" /></button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
              onBlur={addTag}
              placeholder={tags.length ? '' : 'Add hashtags…'}
              className="flex-1 min-w-[100px] text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent py-1"
            />
          </div>
        </div>

        {/* ── Visibility ── */}
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Visibility</label>
          <button onClick={() => setShowVisSheet(true)} className="w-full flex items-center justify-between border border-gray-200 rounded-2xl px-4 py-3 bg-white">
            <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
              {(() => { const opt = VIS_OPTIONS.find(o => o.id === visibility)!; return (<><opt.Icon className="w-4 h-4 text-gray-500" />{opt.label}</>); })()}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* ── Add to this album ── */}
        <div className="pt-2">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Add to this album</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setShowPicker(true)} className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl border-2 border-dashed border-gray-200 hover:border-purple-300 transition-colors">
              <FolderOpen className="w-6 h-6 text-purple-500" />
              <span className="text-sm font-bold text-gray-700">From Portfolio</span>
            </button>
            <button onClick={() => fileRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl border-2 border-dashed border-gray-200 hover:border-blue-300 transition-colors">
              <Upload className="w-6 h-6 text-blue-500" />
              <span className="text-sm font-bold text-gray-700">New Media</span>
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {/* ── Selected content ── */}
        {entries.length > 0 && (
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Selected content <span className="text-gray-300">·</span> {entries.length}
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={entries.map(e => e.key)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-3 gap-2">
                  {entries.map(e => (
                    <SortableEntryTile
                      key={e.key}
                      entryKey={e.key}
                      thumb={entryThumb(e)}
                      isVideo={entryIsVideo(e)}
                      isProject={entryIsProject(e)}
                      isCover={coverKey === e.key}
                      status={e.kind === 'new' ? e.draft.status : 'done'}
                      progress={e.kind === 'new' ? e.draft.progress : 100}
                      onOpenMenu={() => setItemMenuKey(e.key)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      {showPicker && (
        <PortfolioContentPicker
          userId={user.id}
          excludeItemIds={entries.filter((e): e is Extract<SelectedEntry, { kind: 'existing' }> => e.kind === 'existing').map(e => e.item.id)}
          onClose={() => setShowPicker(false)}
          onAdd={handlePickedFromPortfolio}
        />
      )}

      {showVisSheet && (
        <BottomSheet onClose={() => setShowVisSheet(false)}>
          <div className="px-2 py-2">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest px-4 pb-2">Visibility</p>
            {VIS_OPTIONS.map(opt => (
              <button key={opt.id} onClick={() => { setVisibility(opt.id); setShowVisSheet(false); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <opt.Icon className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-400">{opt.sub}</p>
                </div>
                {visibility === opt.id && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {itemMenuKey && (
        <BottomSheet onClose={() => setItemMenuKey(null)}>
          <div className="px-2 py-2">
            <button onClick={() => setEntryAsCover(itemMenuKey)} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl">
              <ImagePlus className="w-4 h-4 text-gray-400" /> Set as cover
            </button>
            <button onClick={() => moveEntry(itemMenuKey, -1)} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl">
              <GripVertical className="w-4 h-4 text-gray-400" /> Move earlier
            </button>
            <button onClick={() => moveEntry(itemMenuKey, 1)} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl">
              <GripVertical className="w-4 h-4 text-gray-400" /> Move later
            </button>
            <button onClick={() => removeEntry(itemMenuKey)} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 rounded-xl">
              <X className="w-4 h-4" /> Remove from album
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  ), document.body);
}

function SortableEntryTile({ entryKey, thumb, isVideo, isProject, isCover, status, progress, onOpenMenu }: {
  entryKey: string; thumb?: string; isVideo: boolean; isProject: boolean; isCover: boolean;
  status: 'pending' | 'uploading' | 'done' | 'error'; progress: number;
  onOpenMenu: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entryKey });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="relative aspect-square rounded-xl overflow-hidden bg-gray-100"
    >
      {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gray-200" />}
      {isVideo && (
        <div className="absolute bottom-1.5 left-1.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
          <Play className="w-2.5 h-2.5 text-white fill-white" />
        </div>
      )}
      {isProject && (
        <span className="absolute bottom-1.5 left-1.5 text-[9px] font-black text-white bg-black/60 px-1.5 py-0.5 rounded-full">Project</span>
      )}
      {isCover && (
        <span className="absolute top-1.5 left-1.5 text-[9px] font-black text-white bg-blue-600 px-1.5 py-0.5 rounded-full">Cover</span>
      )}
      {status === 'uploading' && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-white" />
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 bg-red-500/40 flex items-center justify-center">
          <span className="text-[10px] font-black text-white">Failed</span>
        </div>
      )}
      <div {...attributes} {...listeners} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
      <button onClick={e => { e.stopPropagation(); onOpenMenu(); }} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
        <MoreVertical className="w-3.5 h-3.5 text-white" />
      </button>
    </div>
  );
}
