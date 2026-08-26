import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  ChevronLeft, X, Check, Globe, Lock, Users, Loader2, Plus, Trash2,
  GripVertical, Search, Image as ImageIcon, Upload, FolderOpen, MoreVertical,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getAlbumItems, getAlbumCredits, addAlbumCredit, deleteAlbumCredit,
  updateAlbum, setAlbumCoverFromItem, uploadPortfolioMedia, replaceItemMedia,
  updateItemsOrder, removeItemFromAlbum, moveItemBetweenAlbums, addItemToAlbum,
  updatePortfolioItem, deletePortfolioItem, PORTFOLIO_CATEGORIES,
  type PortfolioAlbum, type PortfolioItem, type AlbumCredit,
} from '../lib/portfolioApi';
import { searchProfiles, type ProfileResult } from '../lib/mentionsApi';
import { supabase } from '../../lib/supabase';
import { AddPortfolioItemSheet } from './AddPortfolioItemSheet';
import { ItemActionsSheet } from './ItemActionsSheet';
import { BottomSheet, SheetAction } from './BottomSheet';
import type { EditAlbumSection } from './AlbumActionsSheet';

type Visibility = 'public' | 'followers' | 'private';

const VIS_OPTIONS: { id: Visibility; label: string; sub: string; Icon: any }[] = [
  { id: 'public',    label: 'Public',    sub: 'Anyone can view',     Icon: Globe },
  { id: 'followers', label: 'Followers', sub: 'Your followers only', Icon: Users },
  { id: 'private',   label: 'Private',   sub: 'Only you',            Icon: Lock  },
];

interface Props {
  album:        PortfolioAlbum;
  focusSection?: EditAlbumSection;
  userId:       string;
  albums:       PortfolioAlbum[];
  onClose:      () => void;
  onSaved:      (updated: PortfolioAlbum) => void;
}

// ── Small shared bits ───────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function ChipInput({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState('');
  const add = (v: string) => { const t = v.trim(); if (t && !items.includes(t)) onChange([...items, t]); setInput(''); };
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map(it => (
            <span key={it} className="flex items-center gap-1 text-xs font-semibold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
              {it} <button type="button" onClick={() => onChange(items.filter(x => x !== it))}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(input); } }}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 bg-gray-50"
        />
        <button type="button" onClick={() => add(input)} className="px-4 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold shrink-0">Add</button>
      </div>
    </div>
  );
}

function ToggleRow({ on, onChange, label, sub }: { on: boolean; onChange: () => void; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-bold text-gray-800">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <button
        onClick={onChange}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on ? 'bg-blue-600' : 'bg-gray-200'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${on ? 'left-5.5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function SortableItemRow({ item }: { item: PortfolioItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const thumb = item.thumbnail_url || item.media_url;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 px-3 py-2.5 mb-2"
    >
      <button {...attributes} {...listeners} className="touch-none cursor-grab active:cursor-grabbing text-gray-300 shrink-0">
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-100 shrink-0">
        {thumb && <img src={thumb} className="w-full h-full object-cover" alt={item.title} />}
      </div>
      <p className="flex-1 min-w-0 text-sm font-semibold text-gray-800 truncate">{item.title}</p>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export function EditAlbumScreen({ album, focusSection, userId, albums, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const [title,       setTitle]       = useState(album.title);
  const [description, setDescription] = useState(album.description || '');
  const [primaryRole, setPrimaryRole] = useState(album.primary_role || '');
  const [addRoles,    setAddRoles]    = useState<string[]>(album.additional_roles || []);
  const [category,    setCategory]    = useState(album.category || '');
  const [tags,        setTags]        = useState<string[]>(album.tags || []);
  const [location,    setLocation]    = useState(album.location || '');
  const [workDate,    setWorkDate]    = useState(album.work_date || '');
  const [visibility,  setVisibility]  = useState<Visibility>(album.visibility);
  const [showOnProfile, setShowOnProfile] = useState(album.show_on_profile ?? true);

  const [coverItemId, setCoverItemId] = useState<string | undefined>(album.cover_item_id);
  const [coverUrl,    setCoverUrl]    = useState<string | undefined>(album.cover_url);

  const [items,   setItems]   = useState<PortfolioItem[]>([]);
  const [credits, setCredits] = useState<AlbumCredit[]>([]);
  const [creditProfiles, setCreditProfiles] = useState<Record<string, { name: string; username: string }>>({});

  const [reorderMode, setReorderMode] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [addCreditOpen, setAddCreditOpen] = useState(false);
  const [addMediaOpen, setAddMediaOpen] = useState(false);
  const [itemMenuTarget, setItemMenuTarget] = useState<PortfolioItem | null>(null);
  const [editDetailsItem, setEditDetailsItem] = useState<PortfolioItem | null>(null);
  const [moveItemTarget, setMoveItemTarget] = useState<PortfolioItem | null>(null);

  const coverFileRef   = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const replacingItemId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRef   = useRef<HTMLDivElement>(null);

  const initialSnapshot = useRef('');

  useEffect(() => {
    (async () => {
      const [albumItems, albumCredits] = await Promise.all([getAlbumItems(album.id), getAlbumCredits(album.id)]);
      setItems(albumItems);
      setCredits(albumCredits);

      const ids = albumCredits.map(c => c.creator_user_id).filter((v): v is string => !!v);
      if (ids.length) {
        const { data } = await supabase.from('profiles').select('id, name, username').in('id', ids);
        const map: Record<string, { name: string; username: string }> = {};
        (data ?? []).forEach((p: any) => { map[p.id] = { name: p.name, username: p.username }; });
        setCreditProfiles(map);
      }

      setLoading(false);
      initialSnapshot.current = snapshot();

      if (focusSection === 'cover') setCoverPickerOpen(true);
      if (focusSection === 'reorder') setReorderMode(true);
      if (focusSection === 'media') setTimeout(() => mediaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album.id]);

  const snapshot = () => JSON.stringify({
    title, description, primaryRole, addRoles, category, tags, location, workDate, visibility, showOnProfile,
  });

  const isDirty = () => snapshot() !== initialSnapshot.current;

  const handleClose = () => {
    if (isDirty() && !window.confirm('Discard your changes?')) return;
    onClose();
  };

  const resolvedCover = coverUrl || items.find(i => i.id === coverItemId)?.thumbnail_url || items.find(i => i.id === coverItemId)?.media_url;

  // ── Cover ──────────────────────────────────────────────────────────────────
  const handleSetCoverFromItem = async (item: PortfolioItem) => {
    const ok = await setAlbumCoverFromItem(album.id, item.id);
    if (!ok) { toast.error('Could not set cover'); return; }
    setCoverItemId(item.id);
    setCoverUrl(undefined);
    setCoverPickerOpen(false);
    toast.success('Cover updated');
  };

  const handleUploadCover = async (file: File) => {
    const result = await uploadPortfolioMedia(userId, file);
    if (!result) { toast.error('Cover upload failed'); return; }
    await updateAlbum(album.id, { cover_url: result.url, cover_item_id: undefined });
    setCoverUrl(result.url);
    setCoverItemId(undefined);
    setCoverPickerOpen(false);
    toast.success('Cover updated');
  };

  // ── Media list actions ───────────────────────────────────────────────────────
  const handleReplaceMedia = (item: PortfolioItem) => {
    replacingItemId.current = item.id;
    replaceFileRef.current?.click();
  };

  const handleRemoveFromAlbum = async (item: PortfolioItem) => {
    if (!window.confirm('Remove this item from the album? It stays in your portfolio.')) return;
    const ok = await removeItemFromAlbum(album.id, item.id);
    if (ok) { setItems(prev => prev.filter(i => i.id !== item.id)); toast.success('Removed from album'); }
    else toast.error('Could not remove item');
  };

  const handleDeleteItem = async (item: PortfolioItem) => {
    await deletePortfolioItem(item.id);
    setItems(prev => prev.filter(i => i.id !== item.id));
  };

  const handleMoveTo = async (destAlbumId: string) => {
    if (!moveItemTarget) return;
    const ok = await moveItemBetweenAlbums(moveItemTarget.id, album.id, destAlbumId);
    if (ok) { setItems(prev => prev.filter(i => i.id !== moveItemTarget.id)); toast.success('Moved to album'); }
    else toast.error('Could not move item');
    setMoveItemTarget(null);
  };

  // ── Reorder ────────────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems(prev => {
      const oldIndex = prev.findIndex(i => i.id === active.id);
      const newIndex = prev.findIndex(i => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleDoneReorder = async () => {
    await updateItemsOrder(items.map((item, i) => ({ id: item.id, sort_order: i })));
    setReorderMode(false);
    toast.success('Order updated');
  };

  // ── Credits ────────────────────────────────────────────────────────────────
  const handleDeleteCredit = async (creditId: string) => {
    const ok = await deleteAlbumCredit(creditId);
    if (ok) setCredits(prev => prev.filter(c => c.id !== creditId));
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!title.trim()) { toast.error('Add a title'); return; }
    setSaving(true);
    const ok = await updateAlbum(album.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      visibility,
      primary_role: primaryRole.trim() || undefined,
      additional_roles: addRoles,
      category: category || undefined,
      tags,
      location: location.trim() || undefined,
      work_date: workDate.trim() || undefined,
      show_on_profile: showOnProfile,
    });
    setSaving(false);
    if (!ok) { toast.error('Could not save — run migration 20240320 in Supabase'); return; }
    toast.success('Album updated ✓');
    onSaved({
      ...album, title: title.trim(), description: description.trim() || undefined, visibility,
      primary_role: primaryRole.trim() || undefined, additional_roles: addRoles,
      category: category || undefined, tags, location: location.trim() || undefined,
      work_date: workDate.trim() || undefined, show_on_profile: showOnProfile,
      cover_item_id: coverItemId, cover_url: coverUrl,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white shrink-0">
        <button onClick={handleClose} className="flex items-center gap-1.5 text-gray-600">
          <ChevronLeft className="w-5 h-5" /> <span className="text-sm font-bold">Edit Album</span>
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-black text-blue-600 disabled:text-gray-300"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-6 pb-24">

          {/* Details */}
          <div className="space-y-3">
            <Field label="Album Title *">
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60}
                placeholder="e.g. Summer Editorial Campaign"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400" />
            </Field>
            <Field label="Description">
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={300}
                placeholder="Short description of the work/project"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400 resize-none" />
            </Field>
            <Field label="Primary Role">
              <input value={primaryRole} onChange={e => setPrimaryRole(e.target.value)} placeholder="e.g. Fashion Stylist"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400" />
            </Field>
            <Field label="Additional Roles">
              <ChipInput items={addRoles} onChange={setAddRoles} placeholder="e.g. Creative Director" />
            </Field>
            <Field label="Category">
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400">
                <option value="">Select a category</option>
                {PORTFOLIO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Tags / Specialties">
              <ChipInput items={tags} onChange={setTags} placeholder="e.g. Editorial" />
            </Field>
            <Field label="Location">
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Optional"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400" />
            </Field>
            <Field label="Date / Year">
              <input value={workDate} onChange={e => setWorkDate(e.target.value)} placeholder="Optional"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400" />
            </Field>
          </div>

          {/* Cover */}
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Cover</label>
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-gray-100">
              {resolvedCover ? (
                <img src={resolvedCover} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><FolderOpen className="w-10 h-10 text-gray-300" /></div>
              )}
              <button
                onClick={() => setCoverPickerOpen(true)}
                className="absolute bottom-2 right-2 bg-black/60 text-white text-xs font-bold px-3 py-2 rounded-xl"
              >
                Change Cover
              </button>
            </div>
          </div>

          {/* Media */}
          <div ref={mediaRef}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Projects / Media</label>
              {items.length > 0 && !reorderMode && (
                <button onClick={() => setReorderMode(true)} className="text-xs font-bold text-blue-600">Reorder</button>
              )}
            </div>

            {reorderMode ? (
              <>
                <p className="text-xs text-gray-400 mb-2">Press and drag to change the order.</p>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    {items.map(item => <SortableItemRow key={item.id} item={item} />)}
                  </SortableContext>
                </DndContext>
                <button onClick={handleDoneReorder} className="w-full py-3 rounded-2xl font-black text-white text-sm mt-2"
                  style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
                  Done
                </button>
              </>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {items.map(item => {
                  const thumb = item.thumbnail_url || item.media_url;
                  return (
                    <div key={item.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                      {thumb ? <img src={thumb} className="w-full h-full object-cover" alt={item.title} /> : null}
                      <button
                        onClick={() => setItemMenuTarget(item)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/55 flex items-center justify-center"
                      >
                        <MoreVertical className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={() => setAddMediaOpen(true)}
                  className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-300 hover:text-blue-500"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-[10px] font-bold">Add Media</span>
                </button>
              </div>
            )}
          </div>

          {/* Credits */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Credits</label>
              <button onClick={() => setAddCreditOpen(true)} className="text-xs font-bold text-blue-600 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Credit
              </button>
            </div>
            {credits.length === 0 ? (
              <p className="text-xs text-gray-400">No credits added yet.</p>
            ) : (
              <div className="space-y-2">
                {credits.map(c => {
                  const profile = c.creator_user_id ? creditProfiles[c.creator_user_id] : undefined;
                  const name = profile?.name || c.unlisted_name || 'Unknown';
                  return (
                    <div key={c.id} className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{name}</p>
                        <p className="text-xs text-gray-400">{c.role}</p>
                      </div>
                      <button onClick={() => handleDeleteCredit(c.id)} className="text-gray-300 hover:text-red-500 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Visibility */}
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Who can see this album?</label>
            <div className="space-y-2">
              {VIS_OPTIONS.map(v => (
                <button
                  key={v.id}
                  onClick={() => setVisibility(v.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left ${
                    visibility === v.id ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-white'
                  }`}
                >
                  <v.Icon className={`w-4 h-4 shrink-0 ${visibility === v.id ? 'text-blue-500' : 'text-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${visibility === v.id ? 'text-blue-700' : 'text-gray-800'}`}>{v.label}</p>
                    <p className="text-xs text-gray-400">{v.sub}</p>
                  </div>
                  {visibility === v.id && (
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 px-4 py-1 mt-2">
              <ToggleRow on={showOnProfile} onChange={() => setShowOnProfile(v => !v)} label="Show on Profile" sub="Keep the album without featuring it publicly" />
            </div>
          </div>
        </div>
      )}

      {/* Cover picker */}
      {coverPickerOpen && (
        <BottomSheet onClose={() => setCoverPickerOpen(false)} title="Change Cover">
          <div className="p-4">
            <input ref={coverFileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadCover(f); e.target.value = ''; }} />
            <button
              onClick={() => coverFileRef.current?.click()}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 mb-3"
            >
              <Upload className="w-4 h-4" /> <span className="text-sm font-bold">Upload New Photo</span>
            </button>
            <div className="grid grid-cols-3 gap-2">
              {items.map(item => {
                const thumb = item.thumbnail_url || item.media_url;
                return (
                  <button key={item.id} onClick={() => handleSetCoverFromItem(item)} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                    {thumb ? <img src={thumb} className="w-full h-full object-cover" alt={item.title} /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Add media */}
      {addMediaOpen && (
        <AddPortfolioItemSheet
          onClose={() => setAddMediaOpen(false)}
          onAdded={async newItem => {
            await addItemToAlbum(album.id, newItem.id);
            setItems(prev => [...prev, newItem]);
            setAddMediaOpen(false);
          }}
        />
      )}

      {/* Per-item action sheet (album context) */}
      {itemMenuTarget && (
        <ItemActionsSheet
          item={itemMenuTarget}
          open={!!itemMenuTarget}
          onClose={() => setItemMenuTarget(null)}
          onToggle={() => {}}
          onShare={() => {}}
          onAddToAlbum={() => {}}
          onDelete={() => handleDeleteItem(itemMenuTarget)}
          onEditDetails={() => setEditDetailsItem(itemMenuTarget)}
          onSetAsCover={() => handleSetCoverFromItem(itemMenuTarget)}
          onReorder={() => setReorderMode(true)}
          onMoveToAlbum={() => setMoveItemTarget(itemMenuTarget)}
          onReplaceMedia={() => handleReplaceMedia(itemMenuTarget)}
          onRemoveFromAlbum={() => handleRemoveFromAlbum(itemMenuTarget)}
        />
      )}

      <input
        ref={replaceFileRef} type="file" accept="image/*,video/*" className="hidden"
        onChange={async e => {
          const f = e.target.files?.[0];
          const id = replacingItemId.current;
          e.target.value = '';
          if (!f || !id) return;
          const ok = await replaceItemMedia(id, f);
          if (ok) { toast.success('Media replaced'); setItems(await getAlbumItems(album.id)); }
          else toast.error('Could not replace media');
        }}
      />

      {/* Edit item details */}
      {editDetailsItem && (
        <BottomSheet onClose={() => setEditDetailsItem(null)} title="Edit Details">
          <EditItemDetailsForm
            item={editDetailsItem}
            onSaved={updated => { setItems(prev => prev.map(i => i.id === updated.id ? updated : i)); setEditDetailsItem(null); }}
          />
        </BottomSheet>
      )}

      {/* Move to another album */}
      {moveItemTarget && (
        <BottomSheet onClose={() => setMoveItemTarget(null)} title="Move to Album">
          <div className="px-4 pb-4 space-y-2">
            {albums.filter(a => a.id !== album.id).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No other albums yet.</p>
            ) : (
              albums.filter(a => a.id !== album.id).map(a => (
                <button
                  key={a.id}
                  onClick={() => handleMoveTo(a.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-gray-100 text-left"
                >
                  <FolderOpen className="w-4 h-4 text-gray-400 shrink-0" />
                  <p className="text-sm font-bold text-gray-900 truncate">{a.title}</p>
                </button>
              ))
            )}
          </div>
        </BottomSheet>
      )}

      {/* Add credit */}
      {addCreditOpen && (
        <BottomSheet onClose={() => setAddCreditOpen(false)} title="Add Credit">
          <AddCreditForm
            onAdd={async credit => {
              const row = await addAlbumCredit(album.id, { ...credit, sortOrder: credits.length });
              if (row) {
                setCredits(prev => [...prev, row]);
                if (credit.creatorUserId) {
                  const { data } = await supabase.from('profiles').select('id, name, username').eq('id', credit.creatorUserId).maybeSingle();
                  if (data) setCreditProfiles(prev => ({ ...prev, [data.id]: { name: data.name, username: data.username } }));
                }
              }
              setAddCreditOpen(false);
            }}
          />
        </BottomSheet>
      )}
    </div>
  );
}

// ── Add Credit form ───────────────────────────────────────────────────────────
function AddCreditForm({
  onAdd,
}: {
  onAdd: (c: { role: string; creatorUserId?: string; unlistedName?: string }) => void;
}) {
  const [role, setRole] = useState('');
  const [unlisted, setUnlisted] = useState(false);
  const [unlistedName, setUnlistedName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [selected, setSelected] = useState<ProfileResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (q: string) => {
    setQuery(q);
    setSelected(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => setResults(await searchProfiles(q)), 250);
  };

  const canSubmit = role.trim() && (unlisted ? unlistedName.trim() : !!selected);

  return (
    <div className="px-4 pb-4 space-y-3">
      <Field label="Role">
        <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Makeup Artist"
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400" />
      </Field>

      {!unlisted ? (
        <Field label="Creator">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={query} onChange={e => handleSearch(e.target.value)} placeholder="Search Filmons member"
              className="w-full border border-gray-200 rounded-2xl pl-10 pr-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400"
            />
          </div>
          {selected ? (
            <div className="flex items-center justify-between mt-2 px-3 py-2 bg-blue-50 rounded-xl">
              <p className="text-sm font-bold text-blue-700">@{selected.username}</p>
              <button onClick={() => setSelected(null)}><X className="w-3.5 h-3.5 text-blue-400" /></button>
            </div>
          ) : results.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              {results.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setSelected(r); setResults([]); setQuery(r.username); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-gray-50 text-left"
                >
                  <p className="text-sm font-semibold text-gray-800">{r.display_name}</p>
                  <p className="text-xs text-gray-400">@{r.username}</p>
                </button>
              ))}
            </div>
          )}
        </Field>
      ) : (
        <Field label="Collaborator Name">
          <input value={unlistedName} onChange={e => setUnlistedName(e.target.value)} placeholder="Full name"
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400" />
        </Field>
      )}

      <button onClick={() => setUnlisted(v => !v)} className="text-xs font-bold text-blue-600">
        {unlisted ? 'Search Filmons members instead' : "This person isn't on Filmons"}
      </button>

      <button
        onClick={() => onAdd({ role: role.trim(), creatorUserId: selected?.id, unlistedName: unlisted ? unlistedName.trim() : undefined })}
        disabled={!canSubmit}
        className="w-full py-3.5 rounded-2xl font-black text-white text-sm disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
      >
        Add Credit
      </button>
    </div>
  );
}

// ── Edit item details form ────────────────────────────────────────────────────
function EditItemDetailsForm({
  item, onSaved,
}: {
  item: PortfolioItem;
  onSaved: (updated: PortfolioItem) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description || '');
  const [role, setRole] = useState(item.role || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Add a title'); return; }
    setSaving(true);
    const ok = await updatePortfolioItem(item.id, { title: title.trim(), description: description.trim() || undefined, role: role.trim() || undefined });
    setSaving(false);
    if (ok) onSaved({ ...item, title: title.trim(), description: description.trim() || undefined, role: role.trim() || undefined });
    else toast.error('Could not save');
  };

  return (
    <div className="px-4 pb-4 space-y-3">
      <Field label="Title">
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400" />
      </Field>
      <Field label="Description">
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400 resize-none" />
      </Field>
      <Field label="Role">
        <input value={role} onChange={e => setRole(e.target.value)}
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400" />
      </Field>
      <button onClick={handleSave} disabled={saving} className="w-full py-3.5 rounded-2xl font-black text-white text-sm disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save'}
      </button>
    </div>
  );
}
