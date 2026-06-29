import { useState, useRef } from 'react';
import { X, ChevronLeft, Upload, Globe, Lock, Users, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  createAlbum, addItemToAlbum, uploadPortfolioMedia,
  type PortfolioAlbum, type PortfolioItem,
} from '../lib/portfolioApi';

type Step       = 'details' | 'items';
type Visibility = 'public' | 'followers' | 'private';

interface Props {
  existingItems: PortfolioItem[];
  onCreated:     (album: PortfolioAlbum) => void;
  onClose:       () => void;
}

const VIS_OPTIONS: { id: Visibility; label: string; sub: string; Icon: any }[] = [
  { id: 'public',    label: 'Public',    sub: 'Anyone can view',        Icon: Globe },
  { id: 'followers', label: 'Followers', sub: 'Your followers only',    Icon: Users },
  { id: 'private',   label: 'Private',   sub: 'Only you',               Icon: Lock  },
];

export function CreateAlbumSheet({ existingItems, onCreated, onClose }: Props) {
  const { user }  = useAuth();
  const fileRef   = useRef<HTMLInputElement>(null);

  const [step,        setStep]        = useState<Step>('details');
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [visibility,  setVisibility]  = useState<Visibility>('public');
  const [coverPreview,setCoverPreview]= useState('');
  const [coverUrl,    setCoverUrl]    = useState('');
  const [uploading,   setUploading]   = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving,      setSaving]      = useState(false);

  const handleCoverFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Images only'); return; }
    setCoverPreview(URL.createObjectURL(file));
    setUploading(true);
    const result = await uploadPortfolioMedia(user!.id, file);
    setUploading(false);
    if (result) { setCoverUrl(result.url); }
    else { toast.error('Cover upload failed'); setCoverPreview(''); }
  };

  const toggleItem = (id: string) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const handleCreate = async () => {
    if (!user || !title.trim()) { toast.error('Add a title'); return; }
    setSaving(true);
    const album = await createAlbum(user.id, {
      title:       title.trim(),
      description: description.trim() || undefined,
      visibility,
      cover_url:   coverUrl || undefined,
    });
    if (!album) { setSaving(false); toast.error('Could not create album — run migration 20240127 in Supabase'); return; }

    // Add selected items
    for (const itemId of selectedIds) {
      await addItemToAlbum(album.id, itemId);
    }

    setSaving(false);
    toast.success('Album created!');
    onCreated(album);
    onClose();
  };

  const stepLabel = step === 'details' ? 'New Album' : 'Add Items';

  return (
    <>
      <style>{`@keyframes casUp{from{transform:translateY(100%);opacity:.8}to{transform:translateY(0);opacity:1}}`}</style>
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[61] bg-white rounded-t-3xl flex flex-col"
        style={{
          maxHeight: '92vh',
          animation: 'casUp 0.3s cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <button
            onClick={() => step === 'details' ? onClose() : setStep('details')}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
          >
            {step === 'details' ? <X className="w-4 h-4 text-gray-600" /> : <ChevronLeft className="w-4 h-4 text-gray-600" />}
          </button>
          <p className="text-sm font-black text-gray-900">{stepLabel}</p>
          {step === 'details' ? (
            <button
              onClick={() => { if (!title.trim()) { toast.error('Add a title'); return; } setStep('items'); }}
              className="text-sm font-black text-blue-600"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={saving}
              className="text-sm font-black text-blue-600 disabled:text-gray-300"
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
          )}
        </div>

        {/* ── STEP: DETAILS ── */}
        {step === 'details' && (
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 space-y-4">

            {/* Cover image */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverFile(f); e.target.value = ''; }}
            />
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Cover Photo</label>
              {coverPreview ? (
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden">
                  <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                  {uploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-white" />
                    </div>
                  )}
                  <button
                    onClick={() => { setCoverPreview(''); setCoverUrl(''); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left"
                  style={{ background: '#f9fafb', border: '1.5px dashed #d1d5db' }}
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-700">Upload Cover</p>
                    <p className="text-xs text-gray-400 mt-0.5">Optional — JPG, PNG, WebP</p>
                  </div>
                </button>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Title *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Nike Campaign"
                maxLength={60}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What's this album about?"
                rows={3}
                maxLength={300}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50 resize-none"
              />
            </div>

            {/* Visibility */}
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Visibility</label>
              <div className="space-y-2">
                {VIS_OPTIONS.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setVisibility(v.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left ${
                      visibility === v.id
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-100 bg-gray-50 hover:border-gray-200'
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
            </div>

            <button
              onClick={() => { if (!title.trim()) { toast.error('Add a title'); return; } setStep('items'); }}
              className="w-full py-4 rounded-2xl font-black text-white text-sm active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
            >
              Next: Add Items →
            </button>
          </div>
        )}

        {/* ── STEP: ITEMS ── */}
        {step === 'items' && (
          <div className="flex-1 flex flex-col min-h-0">
            <p className="text-xs text-gray-400 px-4 pt-3 pb-2 shrink-0">
              Tap items to add them to this album. You can also add items later.
            </p>
            {existingItems.length === 0 ? (
              <div className="flex-1 flex items-center justify-center px-4">
                <p className="text-sm text-gray-400 text-center">No portfolio items yet.<br />You can add items to the album after creating it.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <div className="grid grid-cols-3 gap-2">
                  {existingItems.map(item => {
                    const thumb = item.thumbnail_url || item.media_url;
                    const sel   = selectedIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer"
                      >
                        {thumb ? (
                          <img src={thumb} alt={item.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gray-200" />
                        )}
                        {/* Selection overlay */}
                        <div className={`absolute inset-0 transition-all ${sel ? 'bg-blue-600/50' : 'bg-transparent'}`} />
                        {sel && (
                          <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 p-1.5"
                          style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 100%)' }}>
                          <p className="text-white text-[9px] font-bold truncate">{item.title}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="px-4 pb-4 shrink-0 pt-2 border-t border-gray-100">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-40 active:scale-[0.98] transition-all"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
              >
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  : selectedIds.size > 0
                  ? `Create Album (${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'})`
                  : 'Create Album'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
