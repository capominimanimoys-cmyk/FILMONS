// "Add Work" rebuilt as an attached page (slides in right -> left, no
// FILMONS chrome) instead of a bottom sheet -- optimized for publishing
// ONE portfolio work, media-first since Portfolio is visual. Secondary
// fields (Category, Role, Skills & Tools, Location, Collaborators,
// Hashtags, Visibility) each open as their own EditProfileFieldPanel
// (reused as-is -- see PortfolioFieldSelectors.tsx's header comment)
// instead of an inline dropdown or bottom sheet, and return to this same
// screen with its state exactly intact, since the panel is simply removed
// (never unmounting this page underneath it).
//
// Uploaded media keeps its REAL captured ratio throughout (readImageDimensions/
// readVideoDimensions -> aspect_ratio), matching the same ratio PortfolioMedia.tsx
// renders everywhere else this work will ever appear (Portfolio grid,
// Connect card, viewer) -- never forced into a fixed box here.
//
// Picking 2+ files at once still means "this is an album, not one work"
// (existing FILMONS rule, kept) -- handed off to AlbumEditor instead of a
// second, separate multi-file path.
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { X, Loader2, ImagePlus, Play } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  createPortfolioItem, uploadPortfolioMedia, readImageDimensions, readVideoDimensions,
  type MediaType, type PortfolioItem,
} from '../lib/portfolioApi';
import {
  CategoryPanel, TextFieldPanel, TagsPanel, VisibilityPanel, FieldRow,
  VISIBILITY_OPTIONS, type ItemVisibility,
} from './PortfolioFieldSelectors';

type PanelId = 'category' | 'role' | 'skills' | 'location' | 'collaborators' | 'hashtags' | 'visibility';

export function WorkEditor({ onClose, onCreated, onMultiFile }: {
  onClose: () => void;
  onCreated: (item: PortfolioItem) => void;
  /** 2+ files picked at once -- hand off to AlbumEditor instead of trying
   * to cram them into one work (portfolio_items has one media_url per
   * row; there's no multi-media-per-item schema). */
  onMultiFile: (files: File[]) => void;
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

  // Media
  const [previewUrl, setPreviewUrl] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('image');
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [ratio, setRatio] = useState<number | undefined>();
  const [dims, setDims] = useState<{ width?: number; height?: number }>({});

  // Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [role, setRole] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<ItemVisibility>('public');

  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = !!uploadedUrl && title.trim().length > 0 && !saving && !uploading;

  const mediaTypeOf = (f: File): MediaType =>
    f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : 'image';

  const uploadFile = async (f: File, mt: MediaType) => {
    if (!user) return;
    setUploading(true);
    const d = mt === 'video' ? await readVideoDimensions(f) : mt === 'image' ? await readImageDimensions(f) : null;
    if (d) { setRatio(d.aspect_ratio); setDims({ width: d.width, height: d.height }); }
    const result = await uploadPortfolioMedia(user.id, f);
    setUploading(false);
    if (!result) { toast.error('Upload failed'); return; }
    setUploadedUrl(result.url);
    setThumbnailUrl(result.thumbnailUrl || result.url);
  };

  const handleFiles = (fileList: FileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    if (files.length > 1) { onMultiFile(files); return; }
    const f = files[0];
    const mt = mediaTypeOf(f);
    setMediaType(mt);
    setPreviewUrl(mt === 'audio' ? '' : URL.createObjectURL(f));
    uploadFile(f, mt);
  };

  const removeMedia = () => {
    setPreviewUrl(''); setUploadedUrl(''); setThumbnailUrl(''); setRatio(undefined); setDims({});
  };

  const handleSave = async () => {
    if (!user || !canSave) return;
    setSaving(true);
    const item = await createPortfolioItem(user.id, {
      work_type:     mediaType === 'video' ? 'video' : 'photo',
      title:         title.trim(),
      description:   description.trim() || undefined,
      category:      category || '',
      subcategory:   subcategory || undefined,
      role:          role.trim() || undefined,
      tools:         tools.length ? tools : undefined,
      collaborators: collaborators.length ? collaborators : undefined,
      media_type:    mediaType,
      media_url:     uploadedUrl,
      thumbnail_url: thumbnailUrl,
      is_featured:   false,
      width:         dims.width,
      height:        dims.height,
      aspect_ratio:  ratio,
      visibility,
      location:      location.trim() || undefined,
      tags:          hashtags.length ? hashtags : undefined,
    } as any);
    setSaving(false);
    if (!item) { toast.error('Could not save work'); return; }
    toast.success('Work added ✓');
    onCreated(item);
  };

  if (!user) return null;

  return createPortal((
    <div
      className="fixed inset-0 z-[92] bg-gray-50 flex flex-col"
      style={{ transform: visible ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white shrink-0" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={close} className="text-sm font-bold text-gray-500">Cancel</button>
        <p className="text-sm font-black text-gray-900">Add Work</p>
        <button onClick={handleSave} disabled={!canSave} className="text-sm font-black text-blue-600 disabled:text-gray-300">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Work'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-10 space-y-4">
        {/* Media -- first, per spec: Portfolio is visual */}
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden"
          onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }} />
        {uploadedUrl || previewUrl ? (
          <div className="relative w-full rounded-2xl overflow-hidden bg-gray-100" style={{ aspectRatio: ratio || (mediaType === 'video' ? 16 / 9 : 4 / 5) }}>
            {mediaType === 'video' ? (
              <video src={previewUrl || uploadedUrl} className="w-full h-full object-contain" muted playsInline />
            ) : (
              <img src={previewUrl || uploadedUrl} alt="" className="w-full h-full object-contain" />
            )}
            {mediaType === 'video' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                  <Play className="w-5 h-5 text-white fill-white" />
                </div>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              </div>
            )}
            <button onClick={removeMedia} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="w-full flex flex-col items-center justify-center gap-2 py-12 rounded-2xl border-2 border-dashed border-gray-200 hover:border-blue-300 transition-colors">
            <ImagePlus className="w-7 h-7 text-blue-400" />
            <span className="text-sm font-bold text-gray-700">Add media</span>
            <span className="text-xs text-gray-400">Photo or video</span>
          </button>
        )}

        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Give your work a title" maxLength={80}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-white" />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell people about this work..." rows={3} maxLength={500}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-white resize-none" />
        </div>

        <FieldRow label="Category" placeholder="Select category" value={[category, subcategory].filter(Boolean).join(' · ')} onClick={() => setActivePanel('category')} />
        <FieldRow label="Your role" placeholder="e.g. Cinematographer" value={role} onClick={() => setActivePanel('role')} />
        <FieldRow label="Skills & tools" placeholder="Add skills or tools" value={tools.join(', ')} onClick={() => setActivePanel('skills')} />
        <FieldRow label="Location" placeholder="Add location" value={location} onClick={() => setActivePanel('location')} />
        <FieldRow label="Collaborators" placeholder="Tag collaborators" value={collaborators.join(', ')} onClick={() => setActivePanel('collaborators')} />
        <FieldRow label="Hashtags" placeholder="Add hashtags" value={hashtags.map(t => `#${t}`).join(' ')} onClick={() => setActivePanel('hashtags')} />
        <FieldRow label="Visibility" placeholder="Public" value={VISIBILITY_OPTIONS.find(o => o.id === visibility)?.label} onClick={() => setActivePanel('visibility')} />
      </div>

      {activePanel === 'category' && (
        <CategoryPanel category={category} subcategory={subcategory}
          onSave={(c, s) => { setCategory(c); setSubcategory(s); setActivePanel(null); }}
          onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'role' && (
        <TextFieldPanel title="Your role" placeholder="e.g. Cinematographer" value={role}
          onSave={v => { setRole(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'skills' && (
        <TagsPanel title="Skills & tools" placeholder="Add skills or tools" values={tools}
          onSave={v => { setTools(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'location' && (
        <TextFieldPanel title="Location" placeholder="Add location" value={location}
          onSave={v => { setLocation(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'collaborators' && (
        <TagsPanel title="Collaborators" placeholder="Tag collaborators" values={collaborators}
          onSave={v => { setCollaborators(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'hashtags' && (
        <TagsPanel title="Hashtags" placeholder="Add hashtags" values={hashtags}
          onSave={v => { setHashtags(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'visibility' && (
        <VisibilityPanel value={visibility}
          onSave={v => { setVisibility(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
    </div>
  ), document.body);
}
