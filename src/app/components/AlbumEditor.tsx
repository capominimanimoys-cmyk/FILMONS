// Unified Create Album / Edit Album -- one component, mode="create"|"edit",
// per the user's explicit ask that Create Album and Edit Album never drift
// into two different UX. Replaces the Phase-1 AlbumEditorPage.tsx
// (create-only, bottom-sheet sub-pickers) and the legacy EditAlbumScreen.tsx
// -- both retired. Structured like WorkEditor: cover, title/description,
// WORKS grid (drag-reorder), then Category/Location/Hashtags/Visibility as
// attached-page selectors (EditProfileFieldPanel, shared with WorkEditor
// via PortfolioFieldSelectors.tsx), Credits (edit mode only -- needs a
// real album id to attach to), and (edit mode only) Delete Album.
//
// Save-model (already resolved with the user): cover/remove/reorder commit
// immediately once the album exists (edit mode); only the text-field form
// is staged and reverted by "Discard changes?". Create mode has nothing to
// commit until Create is tapped, since the album doesn't exist yet.
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  X, Loader2, ImagePlus, Play, GripVertical, MoreVertical, Upload, FolderOpen, Trash2,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  createAlbum, updateAlbum, deleteAlbum, getAlbumItems, getAlbumCredits,
  addItemToAlbum, removeItemFromAlbum, setAlbumCoverFromItem, updateItemsOrder,
  uploadPortfolioMedia, readImageDimensions, readVideoDimensions, createPortfolioItem,
  type PortfolioAlbum, type PortfolioItem, type AlbumCredit, type MediaType,
} from '../lib/portfolioApi';
import { logActivityEvent } from '../lib/activityApi';
import { PortfolioContentPicker } from './PortfolioContentPicker';
import { AlbumCreditsSection } from './AlbumCreditsSection';
import { BottomSheet } from './BottomSheet';
import {
  CategoryPanel, TextFieldPanel, TagsPanel, VisibilityPanel, FieldRow, VISIBILITY_OPTIONS, type ItemVisibility,
} from './PortfolioFieldSelectors';

type PanelId = 'category' | 'location' | 'hashtags' | 'visibility';

interface NewMediaDraft {
  localId: string; file: File; previewUrl?: string;
  status: 'pending' | 'uploading' | 'done' | 'error'; progress: number;
  mediaType: MediaType; url?: string; thumbnailUrl?: string;
  width?: number; height?: number; aspect_ratio?: number;
}
type SelectedEntry =
  | { key: string; kind: 'existing'; item: PortfolioItem }
  | { key: string; kind: 'new'; draft: NewMediaDraft };

export function AlbumEditor({ mode, album, initialWorks, initialFiles, onClose, onCreated, onSaved, onDeleted }: {
  mode: 'create' | 'edit';
  album?: PortfolioAlbum;
  initialWorks?: PortfolioItem[];
  /** WorkEditor hands 2+ files picked at once here instead of trying to
   * cram them into one work -- pre-seeded as uploading 'new' entries. */
  initialFiles?: File[];
  onClose: () => void;
  onCreated?: (album: PortfolioAlbum) => void;
  onSaved?: (album: PortfolioAlbum) => void;
  onDeleted?: () => void;
}) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

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

  const [loading, setLoading] = useState(mode === 'edit');
  const [title,       setTitle]       = useState(album?.title ?? '');
  const [description, setDescription] = useState(album?.description ?? '');
  const [location,    setLocation]    = useState(album?.location ?? '');
  const [category,    setCategory]    = useState(album?.category ?? '');
  const [tags,        setTags]        = useState<string[]>(album?.tags ?? []);
  const [visibility,  setVisibility]  = useState<ItemVisibility>((album?.visibility as ItemVisibility) ?? 'public');

  const initialFormSnapshot = useRef('');
  const snapshot = () => JSON.stringify({ title, description, location, category, tags, visibility });

  const [coverPreview,   setCoverPreview]   = useState('');
  const [coverUrl,       setCoverUrl]       = useState(album?.cover_url ?? '');
  const [coverItemId,    setCoverItemId]    = useState(album?.cover_item_id);
  const [coverUploading, setCoverUploading] = useState(false);
  const [showCoverPicker,setShowCoverPicker]= useState(false);

  const [entries, setEntries] = useState<SelectedEntry[]>(() =>
    (initialWorks ?? []).map(item => ({ key: item.id, kind: 'existing' as const, item })));
  const [credits, setCredits] = useState<AlbumCredit[]>([]);
  const [creditProfiles, setCreditProfiles] = useState<Record<string, { name: string; username: string }>>({});

  const [showAddChoice, setShowAddChoice] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [itemMenuKey, setItemMenuKey] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (mode !== 'edit' || !album) return;
    (async () => {
      const [items, albumCredits] = await Promise.all([getAlbumItems(album.id), getAlbumCredits(album.id)]);
      setEntries(items.map(item => ({ key: item.id, kind: 'existing' as const, item })));
      setCredits(albumCredits);
      const ids = albumCredits.map(c => c.creator_user_id).filter((v): v is string => !!v);
      if (ids.length) {
        const { data } = await supabase
          .from('profiles').select('id, name, username').in('id', ids);
        const map: Record<string, { name: string; username: string }> = {};
        (data ?? []).forEach((p: any) => { map[p.id] = { name: p.name, username: p.username }; });
        setCreditProfiles(map);
      }
      setLoading(false);
      initialFormSnapshot.current = snapshot();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album?.id, mode]);

  const isDirty = () => mode === 'edit' && snapshot() !== initialFormSnapshot.current;
  const handleClose = () => {
    if (isDirty() && !window.confirm('Discard your changes?')) return;
    close();
  };

  const canSave = title.trim().length > 0 && !saving &&
    !entries.some(e => e.kind === 'new' && (e.draft.status === 'uploading' || e.draft.status === 'pending'));

  // ── Cover ──────────────────────────────────────────────────────────────
  const entryThumb = (e: SelectedEntry): string | undefined =>
    e.kind === 'existing' ? (e.item.thumbnail_url || e.item.media_url) : (e.draft.thumbnailUrl || e.draft.previewUrl);

  const coverItemThumb = coverItemId
    ? entries.find((e): e is Extract<SelectedEntry, { kind: 'existing' }> => e.kind === 'existing' && e.item.id === coverItemId)?.item.thumbnail_url
    : undefined;
  const resolvedCover = coverPreview || coverUrl || coverItemThumb || (entries[0] ? entryThumb(entries[0]) : undefined);

  const handleCoverFile = async (file: File) => {
    if (!user || !file.type.startsWith('image/')) { toast.error('Images only'); return; }
    setCoverPreview(URL.createObjectURL(file));
    setCoverItemId(undefined);
    setCoverUploading(true);
    const result = await uploadPortfolioMedia(user.id, file);
    setCoverUploading(false);
    if (!result) { toast.error('Cover upload failed'); setCoverPreview(''); return; }
    setCoverUrl(result.url);
    if (mode === 'edit' && album) await updateAlbum(album.id, { cover_url: result.url, cover_item_id: undefined });
    setShowCoverPicker(false);
  };

  const handleSetCoverFromEntry = async (key: string) => {
    const e = entries.find(en => en.key === key);
    if (!e) return;
    setCoverPreview(''); setCoverUrl('');
    if (e.kind === 'existing') {
      setCoverItemId(e.item.id);
      if (mode === 'edit' && album) await setAlbumCoverFromItem(album.id, e.item.id);
    }
    setShowCoverPicker(false);
    setItemMenuKey(null);
  };

  // ── Add content ──────────────────────────────────────────────────────────
  const handlePickedFromPortfolio = async (items: PortfolioItem[]) => {
    setEntries(prev => [...prev, ...items.filter(i => !prev.some(e => e.key === i.id)).map(item => ({ key: item.id, kind: 'existing' as const, item }))]);
    setShowPicker(false);
    if (mode === 'edit' && album) {
      await Promise.all(items.map(i => addItemToAlbum(album.id, i.id)));
      toast.success(items.length === 1 ? 'Added to album' : `${items.length} works added`);
    }
  };

  const mediaTypeOf = (f: File): MediaType => f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : 'image';

  const uploadDraft = async (localId: string, file: File) => {
    if (!user) return;
    setEntries(prev => prev.map(e => e.kind === 'new' && e.draft.localId === localId ? { ...e, draft: { ...e.draft, status: 'uploading' } } : e));
    const mt = mediaTypeOf(file);
    const dims = mt === 'video' ? await readVideoDimensions(file) : mt === 'image' ? await readImageDimensions(file) : null;
    const result = await uploadPortfolioMedia(user.id, file, pct =>
      setEntries(prev => prev.map(e => e.kind === 'new' && e.draft.localId === localId ? { ...e, draft: { ...e.draft, progress: pct } } : e)));
    if (!result) {
      setEntries(prev => prev.map(e => e.kind === 'new' && e.draft.localId === localId ? { ...e, draft: { ...e.draft, status: 'error' } } : e));
      toast.error(`Could not upload ${file.name}`);
      return;
    }
    const draftDone: NewMediaDraft = {
      localId, file, mediaType: mt, status: 'done', progress: 100,
      url: result.url, thumbnailUrl: result.thumbnailUrl || result.url,
      width: dims?.width, height: dims?.height, aspect_ratio: dims?.aspect_ratio,
    };
    if (mode === 'edit' && album && user) {
      const item = await createPortfolioItem(user.id, {
        work_type: mt === 'video' ? 'video' : 'photo', title: title.trim() || file.name,
        category: '', media_type: mt, media_url: result.url, thumbnail_url: result.thumbnailUrl || result.url,
        is_featured: false, width: dims?.width, height: dims?.height, aspect_ratio: dims?.aspect_ratio, visibility: 'public',
      } as any);
      if (item) {
        await addItemToAlbum(album.id, item.id);
        setEntries(prev => prev.map(e => e.kind === 'new' && e.draft.localId === localId ? { key: item.id, kind: 'existing', item } : e));
        return;
      }
    }
    setEntries(prev => prev.map(e => e.kind === 'new' && e.draft.localId === localId ? { ...e, draft: draftDone } : e));
  };

  const handleFiles = (fileList: FileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    const drafts: SelectedEntry[] = files.map(f => {
      const localId = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return {
        key: localId, kind: 'new' as const,
        draft: { localId, file: f, status: 'pending', progress: 0, mediaType: mediaTypeOf(f), previewUrl: f.type.startsWith('audio/') ? undefined : URL.createObjectURL(f) },
      };
    });
    setEntries(prev => [...prev, ...drafts]);
    drafts.forEach(d => { if (d.kind === 'new') uploadDraft(d.draft.localId, d.draft.file); });
  };

  const seededFilesRef = useRef(false);
  useEffect(() => {
    if (seededFilesRef.current || !initialFiles?.length) return;
    seededFilesRef.current = true;
    // DataTransfer is the simplest way to build a real FileList (handleFiles'
    // own param type) from an already-in-memory File[] without reimplementing
    // its logic for this one seed path.
    const dt = new DataTransfer();
    initialFiles.forEach(f => dt.items.add(f));
    handleFiles(dt.files);
  }, [initialFiles]);

  const removeEntry = async (key: string) => {
    const e = entries.find(en => en.key === key);
    if (!e) return;
    if (mode === 'edit' && album) {
      if (!window.confirm('Remove this work from the album? It stays in your portfolio.')) { setItemMenuKey(null); return; }
      if (e.kind === 'existing') await removeItemFromAlbum(album.id, e.item.id);
    }
    setEntries(prev => {
      if (e.kind === 'new' && e.draft.previewUrl) URL.revokeObjectURL(e.draft.previewUrl);
      return prev.filter(en => en.key !== key);
    });
    if (coverItemId === (e.kind === 'existing' ? e.item.id : undefined)) setCoverItemId(undefined);
    setItemMenuKey(null);
  };

  // ── Reorder ──────────────────────────────────────────────────────────────
  const [reorderMode, setReorderMode] = useState(false);
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
  const handleDoneReorder = async () => {
    setReorderMode(false);
    if (mode === 'edit' && album) {
      const ids = entries.filter((e): e is Extract<SelectedEntry, { kind: 'existing' }> => e.kind === 'existing').map(e => e.item.id);
      await updateItemsOrder(ids.map((id, i) => ({ id, sort_order: i })));
      toast.success('Order updated');
    }
  };

  // ── Save / Create ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!user || !canSave) return;
    setSaving(true);
    const album2 = await createAlbum(user.id, { title: title.trim(), description: description.trim() || undefined, visibility, cover_url: coverUrl || undefined });
    if (!album2) { setSaving(false); toast.error('Could not create album'); return; }

    const resolvedIds: string[] = [];
    let coverItemIdResolved: string | undefined;
    for (const e of entries) {
      if (e.kind === 'existing') {
        await addItemToAlbum(album2.id, e.item.id);
        resolvedIds.push(e.item.id);
        if (coverItemId === e.item.id) coverItemIdResolved = e.item.id;
      } else if (e.draft.status === 'done' && e.draft.url) {
        const item = await createPortfolioItem(user.id, {
          work_type: e.draft.mediaType === 'video' ? 'video' : 'photo', title: title.trim(),
          category: '', media_type: e.draft.mediaType, media_url: e.draft.url, thumbnail_url: e.draft.thumbnailUrl,
          is_featured: false, width: e.draft.width, height: e.draft.height, aspect_ratio: e.draft.aspect_ratio,
          visibility: 'public', location: location.trim() || undefined,
        } as any);
        if (item) { await addItemToAlbum(album2.id, item.id); resolvedIds.push(item.id); }
      }
    }
    if (resolvedIds.length) await updateItemsOrder(resolvedIds.map((id, i) => ({ id, sort_order: i })));
    if (coverItemIdResolved) await setAlbumCoverFromItem(album2.id, coverItemIdResolved);
    if (location.trim() || tags.length || category) {
      await updateAlbum(album2.id, { location: location.trim() || undefined, tags: tags.length ? tags : undefined, category: category || undefined });
    }
    if (visibility === 'public') {
      logActivityEvent({ actorId: user.id, activityType: 'portfolio_album_published', targetType: 'portfolio_album', targetId: album2.id, title: album2.title || null });
    }
    setSaving(false);
    toast.success('Album created ✓');
    onCreated?.(album2);
  };

  const handleSave = async () => {
    if (!album || !title.trim()) { toast.error('Add a title'); return; }
    setSaving(true);
    const ok = await updateAlbum(album.id, {
      title: title.trim(), description: description.trim() || undefined, visibility,
      category: category || undefined, tags, location: location.trim() || undefined,
    });
    setSaving(false);
    if (!ok) { toast.error('Could not save'); return; }
    toast.success('Changes saved ✓');
    onSaved?.({ ...album, title: title.trim(), description: description.trim() || undefined, visibility: visibility as any, category: category || undefined, tags, location: location.trim() || undefined, cover_item_id: coverItemId, cover_url: coverUrl || undefined });
  };

  const handleDelete = async () => {
    if (!album) return;
    setDeleting(true);
    const ok = await deleteAlbum(album.id);
    setDeleting(false);
    if (!ok) { toast.error('Could not delete album'); return; }
    toast.success('Album deleted');
    onDeleted?.();
    onClose();
  };

  if (!user || loading) {
    return createPortal((
      <div className="fixed inset-0 z-[92] bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    ), document.body);
  }

  const entryIsVideo = (e: SelectedEntry) => e.kind === 'existing' ? e.item.media_type === 'video' : e.draft.mediaType === 'video';
  const entryIsProject = (e: SelectedEntry) => e.kind === 'existing' && (e.item.work_type === 'project' || e.item.work_type === 'case_study');

  return (
    <div
      className="fixed inset-0 z-[92] bg-gray-50 flex flex-col"
      style={{ transform: visible ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white shrink-0" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={mode === 'edit' ? handleClose : close} className="text-sm font-bold text-gray-500">
          {mode === 'edit' ? 'Back' : 'Cancel'}
        </button>
        <p className="text-sm font-black text-gray-900">{mode === 'edit' ? 'Edit Album' : 'New Album'}</p>
        <button onClick={mode === 'edit' ? handleSave : handleCreate} disabled={!canSave} className="text-sm font-black text-blue-600 disabled:text-gray-300">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'edit' ? 'Save' : 'Create'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-10 space-y-5">
        {/* Cover */}
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Album Cover</label>
          <input ref={coverFileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverFile(f); e.target.value = ''; }} />
          {resolvedCover ? (
            <div className="relative w-full rounded-2xl overflow-hidden bg-gray-100 aspect-video">
              <img src={resolvedCover} alt="Cover" className="w-full h-full object-cover" />
              {coverUploading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>}
              <button onClick={() => setShowCoverPicker(true)} className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors group">
                <span className="opacity-0 group-hover:opacity-100 text-xs font-black text-white bg-black/60 px-3 py-1.5 rounded-full transition-opacity">Change cover</span>
              </button>
            </div>
          ) : (
            <button onClick={() => coverFileRef.current?.click()} className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left" style={{ background: '#f9fafb', border: '1.5px dashed #d1d5db' }}>
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><ImagePlus className="w-5 h-5 text-blue-400" /></div>
              <div>
                <p className="text-sm font-bold text-gray-700">Upload cover</p>
                <p className="text-xs text-gray-400 mt-0.5">Optional — defaults to your first work</p>
              </div>
            </button>
          )}
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Album title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Give your album a title" maxLength={80}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-white" />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell people about this album..." rows={3} maxLength={500}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-white resize-none" />
        </div>

        {/* Works */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Works · {entries.length}</p>
            {entries.length > 1 && (
              <button onClick={() => reorderMode ? handleDoneReorder() : setReorderMode(true)} className="text-xs font-bold text-blue-600">
                {reorderMode ? 'Done' : 'Reorder'}
              </button>
            )}
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderMode ? handleDragEnd : () => {}}>
            <SortableContext items={entries.map(e => e.key)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 gap-2">
                {entries.map(e => (
                  <SortableWorkTile
                    key={e.key} entryKey={e.key} thumb={entryThumb(e)}
                    isVideo={entryIsVideo(e)} isProject={entryIsProject(e)}
                    isCover={e.kind === 'existing' && e.item.id === coverItemId}
                    status={e.kind === 'new' ? e.draft.status : 'done'}
                    reorderMode={reorderMode}
                    onOpenMenu={() => setItemMenuKey(e.key)}
                  />
                ))}
                {!reorderMode && (
                  <button onClick={() => setShowAddChoice(true)} className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-300 hover:text-blue-500">
                    <ImagePlus className="w-5 h-5" />
                    <span className="text-[10px] font-bold">Add Work</span>
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <FieldRow label="Category" placeholder="Select category" value={category} onClick={() => setActivePanel('category')} />
        <FieldRow label="Location" placeholder="Add location" value={location} onClick={() => setActivePanel('location')} />
        <FieldRow label="Hashtags" placeholder="Add hashtags" value={tags.map(t => `#${t}`).join(' ')} onClick={() => setActivePanel('hashtags')} />
        <FieldRow label="Visibility" placeholder="Public" value={VISIBILITY_OPTIONS.find(o => o.id === visibility)?.label} onClick={() => setActivePanel('visibility')} />

        {mode === 'edit' && album && (
          <AlbumCreditsSection albumId={album.id} credits={credits} setCredits={setCredits} creditProfiles={creditProfiles} setCreditProfiles={setCreditProfiles} />
        )}

        {mode === 'edit' && (
          <div className="pt-4 border-t border-gray-100">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Album settings</p>
            <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 text-sm font-bold text-red-600 py-2">
              <Trash2 className="w-4 h-4" /> Delete album
            </button>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden"
        onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }} />

      {showAddChoice && (
        <BottomSheet onClose={() => setShowAddChoice(false)} title="Add to album">
          <div className="px-2 py-2">
            <button onClick={() => { setShowAddChoice(false); setShowPicker(true); }} className="flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-gray-50 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center shrink-0"><FolderOpen className="w-4 h-4 text-purple-500" /></div>
              <div><p className="text-sm font-bold text-gray-900">From Portfolio</p><p className="text-xs text-gray-400">Choose existing works or media</p></div>
            </button>
            <button onClick={() => { setShowAddChoice(false); fileRef.current?.click(); }} className="flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-gray-50 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0"><Upload className="w-4 h-4 text-blue-500" /></div>
              <div><p className="text-sm font-bold text-gray-900">New Media</p><p className="text-xs text-gray-400">Upload new photos or videos</p></div>
            </button>
          </div>
        </BottomSheet>
      )}

      {showPicker && user && (
        <PortfolioContentPicker
          userId={user.id}
          excludeItemIds={entries.filter((e): e is Extract<SelectedEntry, { kind: 'existing' }> => e.kind === 'existing').map(e => e.item.id)}
          onClose={() => setShowPicker(false)}
          onAdd={handlePickedFromPortfolio}
        />
      )}

      {showCoverPicker && (
        <BottomSheet onClose={() => setShowCoverPicker(false)} title="Change cover">
          <div className="px-4 pb-4">
            <button onClick={() => coverFileRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-gray-100 mb-3 text-left">
              <ImagePlus className="w-4 h-4 text-blue-500 shrink-0" /><span className="text-sm font-bold text-gray-900">Upload new</span>
            </button>
            {entries.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {entries.filter(e => e.kind === 'existing').map(e => (
                  <button key={e.key} onClick={() => handleSetCoverFromEntry(e.key)} className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                    {entryThumb(e) && <img src={entryThumb(e)} className="w-full h-full object-cover" alt="" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </BottomSheet>
      )}

      {itemMenuKey && (
        <BottomSheet onClose={() => setItemMenuKey(null)}>
          <div className="px-2 py-2">
            <button onClick={() => handleSetCoverFromEntry(itemMenuKey)} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl">
              <ImagePlus className="w-4 h-4 text-gray-400" /> Set as cover
            </button>
            <button onClick={() => removeEntry(itemMenuKey)} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 rounded-xl">
              <X className="w-4 h-4" /> Remove from album
            </button>
          </div>
        </BottomSheet>
      )}

      {activePanel === 'category' && (
        <CategoryPanel category={category} subcategory="" onSave={c => { setCategory(c); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'location' && (
        <TextFieldPanel title="Location" placeholder="Add location" value={location}
          onSave={v => { setLocation(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'hashtags' && (
        <TagsPanel title="Hashtags" placeholder="Add hashtags" values={tags} onSave={v => { setTags(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'visibility' && (
        <VisibilityPanel value={visibility} onSave={v => { setVisibility(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}

      {showDeleteConfirm && (
        <BottomSheet onClose={() => setShowDeleteConfirm(false)} title="Delete this album?">
          <div className="px-4 pb-4">
            <p className="text-sm text-gray-500 mb-4">The album will be permanently deleted. Projects and media originally stored in your Portfolio will not be deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-sm">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-black text-sm disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete Album'}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function SortableWorkTile({ entryKey, thumb, isVideo, isProject, isCover, status, reorderMode, onOpenMenu }: {
  entryKey: string; thumb?: string; isVideo: boolean; isProject: boolean; isCover: boolean;
  status: 'pending' | 'uploading' | 'done' | 'error'; reorderMode: boolean;
  onOpenMenu: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entryKey, disabled: !reorderMode });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
      {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gray-200" />}
      {isVideo && <div className="absolute bottom-1.5 left-1.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"><Play className="w-2.5 h-2.5 text-white fill-white" /></div>}
      {isProject && <span className="absolute bottom-1.5 left-1.5 text-[9px] font-black text-white bg-black/60 px-1.5 py-0.5 rounded-full">Project</span>}
      {isCover && <span className="absolute top-1.5 left-1.5 text-[9px] font-black text-white bg-blue-600 px-1.5 py-0.5 rounded-full">Cover</span>}
      {status === 'uploading' && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-white" /></div>}
      {status === 'error' && <div className="absolute inset-0 bg-red-500/40 flex items-center justify-center"><span className="text-[10px] font-black text-white">Failed</span></div>}
      {reorderMode ? (
        <div {...attributes} {...listeners} className="absolute inset-0 cursor-grab active:cursor-grabbing flex items-center justify-center bg-black/20">
          <GripVertical className="w-5 h-5 text-white" />
        </div>
      ) : (
        <button onClick={e => { e.stopPropagation(); onOpenMenu(); }} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
          <MoreVertical className="w-3.5 h-3.5 text-white" />
        </button>
      )}
    </div>
  );
}
