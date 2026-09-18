/**
 * Filmons — AddPortfolioItemSheet
 * 3-step bottom sheet: Work Type → Details → Media
 */
import { useState, useRef } from 'react';
import {
  X, ChevronLeft, Upload, Link as LinkIcon, Star, Play, Music2,
  Image as ImageIcon, Loader2, Film, Aperture, Layers, FileText,
  Video, Clapperboard, Trash2, RefreshCw, ChevronUp, ChevronDown, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { logActivityEvent } from '../lib/activityApi';
import { notifyEvent } from '../lib/notifyEvent';
import {
  PORTFOLIO_CATEGORIES, PORTFOLIO_SUBCATEGORIES, createPortfolioItem, uploadPortfolioMedia,
  readImageDimensions, readVideoDimensions, workTypeToMediaType, createAlbum, updateAlbum, addItemToAlbum,
  type WorkType, type PortfolioItem, type MediaType,
} from '../lib/portfolioApi';

type Step = 'type' | 'details' | 'media' | 'album';

interface AlbumDraftItem {
  id:           string; // local key, not a DB id
  file:         File;
  previewUrl?:  string; // local object URL, created once at selection time
  status:       'pending' | 'uploading' | 'done' | 'error';
  progress:     number;
  mediaType:    MediaType;
  url?:         string;
  thumbnailUrl?:string;
  width?:       number;
  height?:      number;
  aspect_ratio?:number;
}

interface WorkTypeOption {
  id:     WorkType;
  label:  string;
  desc:   string;
  Icon:   React.ComponentType<{ className?: string }>;
  color:  string;
}

const WORK_TYPES: WorkTypeOption[] = [
  { id: 'photo',      label: 'Photo',          desc: 'Images, portraits, stills',     Icon: Aperture,    color: '#3b82f6' },
  { id: 'video',      label: 'Video',          desc: 'Films, commercials, clips',     Icon: Film,        color: '#8b5cf6' },
  { id: 'reel',       label: 'Reel',           desc: 'Short-form vertical video',     Icon: Video,       color: '#ec4899' },
  { id: 'audio',      label: 'Audio',          desc: 'Music, sound design, podcasts', Icon: Music2,      color: '#f59e0b' },
  { id: 'project',    label: 'Project',        desc: 'Full creative project',         Icon: Layers,      color: '#10b981' },
  { id: 'case_study', label: 'Case Study',     desc: 'Process & outcome breakdown',   Icon: FileText,    color: '#06b6d4' },
  { id: 'bts',        label: 'Behind the Scenes', desc: 'Making-of content',          Icon: Clapperboard, color: '#f97316' },
  { id: 'link',       label: 'External Link',  desc: 'YouTube, Vimeo, Behance…',     Icon: LinkIcon,    color: '#64748b' },
];

interface Props {
  onClose: () => void;
  onAdded: (item: PortfolioItem) => void;
}

export function AddPortfolioItemSheet({ onClose, onAdded }: Props) {
  const { user } = useAuth();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [step,        setStep]        = useState<Step>('type');
  const [saving,      setSaving]      = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [uploadPct,   setUploadPct]   = useState(0);

  // Work type
  const [workType,    setWorkType]    = useState<WorkType>('photo');

  // Details fields
  const [title,       setTitle]       = useState('');
  const [description, setDesc]        = useState('');
  const [category,    setCategory]    = useState('');
  const [subcategory, setSubcategory] = useState('');
  const availableSubcategories = PORTFOLIO_SUBCATEGORIES[category] ?? [];
  const [role,        setRole]        = useState('');
  const [clientName,  setClientName]  = useState('');
  const [year,        setYear]        = useState(new Date().getFullYear().toString());
  const [isFeatured,  setIsFeatured]  = useState(false);

  // Media
  const [mediaUrl,    setMediaUrl]    = useState('');
  const [thumbnailUrl,setThumbUrl]    = useState('');
  const [externalLink,setExtLink]     = useState('');
  const [filePreview, setFilePreview] = useState('');
  const [fileName,    setFileName]    = useState('');
  const [imgWidth,    setImgWidth]    = useState<number | undefined>(undefined);
  const [imgHeight,   setImgHeight]   = useState<number | undefined>(undefined);
  const [imgAr,       setImgAr]       = useState<number | undefined>(undefined);

  // Album mode -- entered automatically when 2+ files are picked at once
  // ("1 media = Work, 2+ media = Album", per spec). Reuses the title/
  // description/category/etc. already collected in the Details step as
  // the album's own metadata -- the creator never has to re-enter it.
  const [albumItems,   setAlbumItems]   = useState<AlbumDraftItem[]>([]);
  const [coverId,      setCoverId]      = useState<string | undefined>(undefined);
  const [publishingAlbum, setPublishingAlbum] = useState(false);
  const [showContinueAsWork, setShowContinueAsWork] = useState(false);

  const mediaTypeOf = (file: File): MediaType =>
    file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';

  const uploadAlbumItem = async (draft: AlbumDraftItem) => {
    setAlbumItems(prev => prev.map(d => d.id === draft.id ? { ...d, status: 'uploading', progress: 0 } : d));
    const dims = draft.mediaType === 'video' ? await readVideoDimensions(draft.file)
      : draft.mediaType === 'image' ? await readImageDimensions(draft.file) : null;
    const result = await uploadPortfolioMedia(user!.id, draft.file, pct =>
      setAlbumItems(prev => prev.map(d => d.id === draft.id ? { ...d, progress: pct } : d)));
    if (!result) {
      setAlbumItems(prev => prev.map(d => d.id === draft.id ? { ...d, status: 'error' } : d));
      return;
    }
    setAlbumItems(prev => prev.map(d => d.id === draft.id ? {
      ...d, status: 'done', url: result.url, thumbnailUrl: result.thumbnailUrl || result.url,
      width: dims?.width, height: dims?.height, aspect_ratio: dims?.aspect_ratio,
    } : d));
  };

  const handleFiles = (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    if (files.length === 1) { handleFile(files[0]); return; }
    const drafts: AlbumDraftItem[] = files.map(f => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f, status: 'pending', progress: 0, mediaType: mediaTypeOf(f),
      previewUrl: f.type.startsWith('audio/') ? undefined : URL.createObjectURL(f),
    }));
    setAlbumItems(prev => [...prev, ...drafts]);
    setStep('album');
    drafts.forEach(d => uploadAlbumItem(d));
  };

  const removeAlbumItem = (id: string) => {
    setAlbumItems(prev => {
      const removed = prev.find(d => d.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      const next = prev.filter(d => d.id !== id);
      if (next.length === 1) setShowContinueAsWork(true);
      return next;
    });
    if (coverId === id) setCoverId(undefined);
  };

  const moveAlbumItem = (id: string, dir: -1 | 1) => {
    setAlbumItems(prev => {
      const idx = prev.findIndex(d => d.id === id);
      const swapWith = idx + dir;
      if (idx === -1 || swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  };

  // "Only one item remains -- continue as a Portfolio Work instead?" --
  // hands the one remaining (already-uploaded) file's data over to the
  // ORIGINAL single-item state/publish path rather than a second
  // publish implementation, so it behaves exactly like picking one file
  // from the start.
  const continueAsWork = () => {
    const remaining = albumItems[0];
    setShowContinueAsWork(false);
    if (!remaining) { setStep('media'); return; }
    if (remaining.status === 'done') {
      setMediaUrl(remaining.url || '');
      setThumbUrl(remaining.thumbnailUrl || '');
      setFilePreview(remaining.thumbnailUrl || remaining.url || '');
      setImgWidth(remaining.width);
      setImgHeight(remaining.height);
      setImgAr(remaining.aspect_ratio);
      setFileName(remaining.file.name);
    } else {
      // Still uploading/failed -- fall back to letting the single-item
      // flow upload it fresh rather than publishing incomplete data.
      handleFile(remaining.file);
    }
    setAlbumItems([]);
    setStep('media');
  };

  const addMoreToAlbum = () => {
    setShowContinueAsWork(false);
    fileRef.current?.click();
  };

  const publishAlbum = async () => {
    if (!user) return;
    if (!title.trim()) { toast.error('Add a title'); return; }
    if (albumItems.some(d => d.status === 'uploading' || d.status === 'pending')) {
      toast.error('Wait for uploads to finish');
      return;
    }
    const doneItems = albumItems.filter(d => d.status === 'done');
    if (doneItems.length < 2) { toast.error('Remove or retry the failed item(s) first'); return; }

    setPublishingAlbum(true);
    const album = await createAlbum(user.id, {
      title: title.trim(), description: description.trim() || undefined, visibility: 'public',
    });
    if (!album) {
      setPublishingAlbum(false);
      toast.error('Could not create album — run migration 20240127 in Supabase');
      return;
    }

    const createdItems: PortfolioItem[] = [];
    for (const d of doneItems) {
      const item = await createPortfolioItem(user.id, {
        work_type:    workType,
        title:        title.trim(),
        description:  description.trim() || undefined,
        category:     category || '',
        subcategory:  subcategory || undefined,
        role:         role.trim() || undefined,
        client_name:  clientName.trim() || undefined,
        year:         year ? parseInt(year) : undefined,
        media_type:   d.mediaType,
        media_url:    d.url,
        thumbnail_url:d.thumbnailUrl,
        is_featured:  false,
        width:        d.width,
        height:       d.height,
        aspect_ratio: d.aspect_ratio,
      });
      if (item) { createdItems.push(item); await addItemToAlbum(album.id, item.id); }
    }

    const coverDraftIdx = doneItems.findIndex(d => d.id === coverId);
    const coverItem = createdItems[coverDraftIdx >= 0 ? coverDraftIdx : 0];
    await updateAlbum(album.id, {
      category: category || undefined, location: undefined, cover_item_id: coverItem?.id,
    });

    if (createdItems.length) {
      logActivityEvent({
        actorId: user.id, activityType: 'portfolio_album_published',
        targetType: 'portfolio_album', targetId: album.id, title: album.title || null,
      });
      notifyEvent({
        type: 'new_post_portfolio', creatorId: user.id, creatorName: user.name || user.username || '',
        contentType: 'portfolio', title: album.title, contentUrl: `https://filmons.app/portfolio/${user.id}`,
      });
    }

    setPublishingAlbum(false);
    toast.success(`Album published with ${createdItems.length} item${createdItems.length === 1 ? '' : 's'}!`);
    onClose();
  };

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    const isImg = file.type.startsWith('image/');
    setFileName(file.name);
    if (isImg) setFilePreview(URL.createObjectURL(file));
    else setFilePreview('');

    const isVideo = file.type.startsWith('video/');
    if (isImg) {
      readImageDimensions(file).then(d => {
        setImgWidth(d.width);
        setImgHeight(d.height);
        setImgAr(d.aspect_ratio);
      });
    } else if (isVideo) {
      // Portfolio cards need a video's OWN orientation (vertical,
      // widescreen, square) rather than a fixed 16:9 default -- this was
      // previously never captured at all for video uploads, only images.
      readVideoDimensions(file).then(d => {
        if (d.width && d.height) { setImgWidth(d.width); setImgHeight(d.height); }
        setImgAr(d.aspect_ratio);
      });
    }

    setUploading(true);
    setUploadPct(0);
    const result = await uploadPortfolioMedia(user!.id, file, setUploadPct);
    setUploading(false);
    if (!result) { toast.error('Upload failed — try again'); return; }
    setMediaUrl(result.url);
    if (result.thumbnailUrl) { setThumbUrl(result.thumbnailUrl); setFilePreview(result.thumbnailUrl); }
    toast.success('Uploaded');
  };

  // ── Publish ───────────────────────────────────────────────────────────────
  const publish = async () => {
    if (!user) return;
    if (!title.trim()) { toast.error('Add a title'); return; }
    if (workType !== 'link' && !mediaUrl && !externalLink) {
      toast.error('Add media or a link');
      return;
    }

    const mediaType = workType === 'link' || externalLink ? 'link' : workTypeToMediaType(workType);

    setSaving(true);
    const item = await createPortfolioItem(user.id, {
      work_type:    workType,
      title:        title.trim(),
      description:  description.trim() || undefined,
      category:     category || '',
      subcategory:  subcategory || undefined,
      role:         role.trim() || undefined,
      client_name:  clientName.trim() || undefined,
      year:         year ? parseInt(year) : undefined,
      media_type:   mediaType,
      media_url:    mediaUrl || undefined,
      thumbnail_url: thumbnailUrl || undefined,
      external_link: externalLink || undefined,
      is_featured:  isFeatured,
      width:        imgWidth,
      height:       imgHeight,
      aspect_ratio: imgAr,
    });
    setSaving(false);

    if (!item) {
      toast.error('Could not save — run the portfolio_items migration in Supabase');
      return;
    }
    if (!(item as any).is_hidden) {
      logActivityEvent({
        actorId: user.id, activityType: 'portfolio_published',
        targetType: 'portfolio_item', targetId: item.id,
        category: item.category || null, subcategory: (item as any).subcategory || null, title: item.title || null,
      });
      notifyEvent({
        type: 'new_post_portfolio', creatorId: user.id, creatorName: user.name || user.username || '',
        contentType: 'portfolio', title: item.title, contentUrl: `https://filmons.app/portfolio/${user.id}`,
      });
    }
    toast.success('Added to portfolio!');
    onAdded(item);
    onClose();
  };

  const back = () => {
    if (step === 'type')    onClose();
    if (step === 'details') setStep('type');
    if (step === 'media')   setStep('details');
    if (step === 'album')   { setAlbumItems([]); setStep('media'); }
  };

  const STEP_LABELS: Record<Step, string> = {
    type:    'Choose Type',
    details: 'Details',
    media:   'Add Media',
    album:   'New Album',
  };

  const selectedType = WORK_TYPES.find(t => t.id === workType);

  // Accept media based on work type
  const accept = workType === 'audio' ? 'audio/*'
    : workType === 'video' || workType === 'reel' ? 'video/*,image/*'
    : workType === 'link' ? undefined
    : 'image/*,video/*,audio/*';

  return (
    <>
      <style>{`
        @keyframes apiSlideUp {
          from { transform: translateY(100%); opacity: 0.8; }
          to   { transform: translateY(0);    opacity: 1;   }
        }
      `}</style>

      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose} />

      <div
        className="fixed inset-x-0 bottom-0 z-[61] bg-white rounded-t-3xl flex flex-col"
        style={{
          maxHeight: '92vh',
          animation: 'apiSlideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <button onClick={back} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            {step === 'type'
              ? <X className="w-4 h-4 text-gray-600" />
              : <ChevronLeft className="w-4 h-4 text-gray-600" />}
          </button>
          <p className="text-sm font-black text-gray-900">{STEP_LABELS[step]}</p>
          {step === 'details' && (
            <button
              onClick={() => { if (!title.trim()) { toast.error('Add a title'); return; } setStep('media'); }}
              className="text-sm font-black text-blue-600"
            >
              Next
            </button>
          )}
          {step === 'media' && (
            <button onClick={publish} disabled={saving} className="text-sm font-black text-blue-600 disabled:text-gray-300">
              {saving ? 'Saving…' : 'Publish'}
            </button>
          )}
          {step === 'album' && (
            <button onClick={publishAlbum} disabled={publishingAlbum} className="text-sm font-black text-blue-600 disabled:text-gray-300">
              {publishingAlbum ? 'Publishing…' : 'Publish'}
            </button>
          )}
          {step === 'type' && <div className="w-9" />}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── STEP: TYPE ── */}
          {step === 'type' && (
            <div className="px-4 pt-4 pb-8 space-y-2">
              <p className="text-xs text-gray-400 mb-4">What type of work are you adding?</p>
              {WORK_TYPES.map(wt => (
                <button
                  key={wt.id}
                  onClick={() => { setWorkType(wt.id); setStep('details'); }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left transition-all active:scale-[0.98] bg-gray-50 border border-gray-100 hover:border-gray-200"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${wt.color}18` }}
                  >
                    <span style={{ color: wt.color }}><wt.Icon className="w-5 h-5" /></span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-900">{wt.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{wt.desc}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6"/>
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* ── STEP: DETAILS ── */}
          {step === 'details' && selectedType && (
            <div className="px-4 pt-4 pb-8 space-y-4">
              {/* Type chip */}
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${selectedType.color}18` }}
                >
                  <span style={{ color: selectedType.color }}><selectedType.Icon className="w-4 h-4" /></span>
                </div>
                <span className="text-sm font-black text-gray-900">{selectedType.label}</span>
                <button onClick={() => setStep('type')} className="text-xs text-gray-400 underline ml-auto">Change</button>
              </div>

              {/* Title */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Title *</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Nike Campaign Shoot"
                  maxLength={80}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="Brief description of this work…"
                  rows={3}
                  maxLength={400}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50 resize-none"
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Category</label>
                <select
                  value={category}
                  onChange={e => { setCategory(e.target.value); setSubcategory(''); }}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-400 bg-gray-50"
                >
                  <option value="">Select a category…</option>
                  {PORTFOLIO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Subcategory -- only offered where a curated list exists
                  (PORTFOLIO_SUBCATEGORIES); this is the creator's own
                  confirmation of what the work actually is ("Hip-Hop &
                  Rap", not an AI guess from the title) -- Portfolio
                  recommendations and search both use this directly rather
                  than inferring it from free text. */}
              {availableSubcategories.length > 0 && (
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Subcategory (optional)</label>
                  <select
                    value={subcategory}
                    onChange={e => setSubcategory(e.target.value)}
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-400 bg-gray-50"
                  >
                    <option value="">Select a subcategory…</option>
                    {availableSubcategories.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {/* Role + Client */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">My Role</label>
                  <input
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    placeholder="e.g. Director"
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Client / Brand</label>
                  <input
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="e.g. Nike"
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50"
                  />
                </div>
              </div>

              {/* Year */}
              <div className="w-28">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Year</label>
                <input
                  value={year}
                  onChange={e => setYear(e.target.value)}
                  placeholder="2026"
                  maxLength={4}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50"
                />
              </div>

              {/* Feature toggle */}
              <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <Star className={`w-4 h-4 ${isFeatured ? 'text-amber-500 fill-amber-500' : 'text-gray-400'}`} />
                  <div>
                    <p className="text-sm font-black text-gray-900">Feature this work</p>
                    <p className="text-[11px] text-gray-400">Shown first on your portfolio</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsFeatured(v => !v)}
                  className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${isFeatured ? 'bg-amber-400' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isFeatured ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>

              <button
                onClick={() => { if (!title.trim()) { toast.error('Add a title'); return; } setStep('media'); }}
                className="w-full py-4 rounded-2xl font-black text-white text-sm transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
              >
                Add Media →
              </button>
            </div>
          )}

          {/* ── STEP: MEDIA ── */}
          {step === 'media' && (
            <div className="px-4 pt-4 pb-8 space-y-4">
              <p className="text-xs text-gray-400">Upload your work or paste an external link.</p>

              <input
                ref={fileRef}
                type="file"
                accept={accept}
                multiple
                className="hidden"
                onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}
              />

              {/* Preview -- follows the real dimensions read off the picked
                  file (imgAr, captured in handleFile) rather than a fixed
                  16:9 box, so this matches what the published item will
                  actually look like instead of a misleading crop. */}
              {filePreview && (
                <div className="relative w-full bg-gray-100 rounded-2xl overflow-hidden" style={{ aspectRatio: imgAr || 16 / 9 }}>
                  <img src={filePreview} alt="" className="w-full h-full object-contain" />
                  <button
                    onClick={() => { setFilePreview(''); setMediaUrl(''); setThumbUrl(''); setFileName(''); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              )}

              {uploading && (
                <div className="bg-blue-50 rounded-2xl px-4 py-3.5 space-y-2">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
                    <p className="text-sm text-blue-700">Uploading… {uploadPct}%</p>
                  </div>
                  <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-150"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                </div>
              )}

              {fileName && !uploading && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
                  {workType === 'audio'
                    ? <Music2 className="w-4 h-4 text-green-600 shrink-0" />
                    : workType === 'video' || workType === 'reel'
                    ? <Play className="w-4 h-4 text-green-600 shrink-0" />
                    : <ImageIcon className="w-4 h-4 text-green-600 shrink-0" />}
                  <p className="text-xs font-semibold text-green-700 truncate">{fileName}</p>
                </div>
              )}

              {/* Upload button (not for link-only type) */}
              {!mediaUrl && workType !== 'link' && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all active:scale-[0.98] disabled:opacity-60"
                  style={{ background: '#f9fafb', border: '1.5px dashed #d1d5db' }}
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-gray-900">Upload File</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {workType === 'audio' ? 'Audio files (MP3, WAV, OGG)' :
                       workType === 'video' || workType === 'reel' ? 'Video files (MP4, MOV)' :
                       'Images, Videos, Audio'} · select multiple for an album
                    </p>
                  </div>
                </button>
              )}

              {!mediaUrl && workType !== 'link' && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400 font-semibold">or</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              )}

              {/* External link */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5 block">
                  <LinkIcon className="w-3 h-3" /> External Link
                </label>
                <input
                  value={externalLink}
                  onChange={e => setExtLink(e.target.value)}
                  placeholder="https://youtube.com/watch?v=…"
                  type="url"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50"
                />
                <p className="text-[11px] text-gray-400 mt-1.5">YouTube · Vimeo · Behance · IMDb · Website</p>
              </div>

              <button
                onClick={publish}
                disabled={saving || uploading || (workType !== 'link' && !mediaUrl && !externalLink) || (workType === 'link' && !externalLink)}
                className="w-full py-4 rounded-2xl font-black text-white text-sm transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
              >
                {saving ? 'Publishing…' : 'Publish to Portfolio'}
              </button>
            </div>
          )}

          {/* ── STEP: ALBUM -- 2+ media selected at once ── */}
          {step === 'album' && (
            <div className="px-4 pt-4 pb-8 space-y-4">
              <p className="text-xs text-gray-400">
                {albumItems.length} item{albumItems.length === 1 ? '' : 's'} selected. Reorder with the arrows, pick a cover, then publish.
              </p>

              {/* Per-item upload progress */}
              <div className="space-y-2">
                {albumItems.map((d, i) => (
                  <div key={d.id} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl p-2.5">
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-200 shrink-0">
                      {(d.thumbnailUrl || d.previewUrl) && d.mediaType !== 'audio' ? (
                        <img src={d.thumbnailUrl || d.previewUrl} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {d.mediaType === 'audio' ? <Music2 className="w-5 h-5 text-gray-400" /> : d.mediaType === 'video' ? <Play className="w-5 h-5 text-gray-400" /> : <ImageIcon className="w-5 h-5 text-gray-400" />}
                        </div>
                      )}
                      {coverId === d.id && (
                        <span className="absolute bottom-0.5 left-0.5 bg-amber-400 text-white text-[8px] font-black px-1 py-0.5 rounded">COVER</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate">{d.file.name}</p>
                      {d.status === 'pending' && <p className="text-[11px] text-gray-400">Waiting…</p>}
                      {d.status === 'uploading' && (
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mt-1">
                          <div className="h-full bg-blue-500 rounded-full transition-all duration-150" style={{ width: `${d.progress}%` }} />
                        </div>
                      )}
                      {d.status === 'done' && (
                        <button onClick={() => setCoverId(d.id)} className="text-[11px] font-bold text-blue-600 flex items-center gap-1 mt-0.5">
                          {coverId === d.id ? <><Check className="w-3 h-3" /> Cover</> : 'Set as cover'}
                        </button>
                      )}
                      {d.status === 'error' && <p className="text-[11px] text-red-500 font-semibold">Upload failed</p>}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => moveAlbumItem(d.id, -1)} disabled={i === 0} className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center disabled:opacity-30">
                        <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button onClick={() => moveAlbumItem(d.id, 1)} disabled={i === albumItems.length - 1} className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center disabled:opacity-30">
                        <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                    </div>
                    {d.status === 'error' ? (
                      <button onClick={() => uploadAlbumItem(d)} className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                      </button>
                    ) : null}
                    <button onClick={() => removeAlbumItem(d.id)} className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0">
                      <Trash2 className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-blue-600"
                style={{ background: '#eff6ff', border: '1.5px dashed #93c5fd' }}
              >
                <Upload className="w-4 h-4" /> Add More Media
              </button>

              <button
                onClick={publishAlbum}
                disabled={publishingAlbum || albumItems.some(d => d.status !== 'done')}
                className="w-full py-4 rounded-2xl font-black text-white text-sm transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
              >
                {publishingAlbum ? 'Publishing…' : `Publish Album (${albumItems.length} items)`}
              </button>
            </div>
          )}

          {/* ── Only one item remains -- offer to continue as a single Work ── */}
          {showContinueAsWork && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-8">
              <div className="bg-white rounded-2xl w-full max-w-xs shadow-xl overflow-hidden">
                <div className="px-5 py-5 text-center border-b border-gray-100">
                  <p className="font-bold text-gray-900 text-base">Only one item remains</p>
                  <p className="text-sm text-gray-500 mt-1">Albums require multiple media. Continue as a Portfolio Work instead?</p>
                </div>
                <button onClick={addMoreToAlbum}
                  className="w-full py-3.5 text-sm font-bold text-blue-600 border-b border-gray-100 hover:bg-blue-50">
                  Add More Media
                </button>
                <button onClick={continueAsWork}
                  className="w-full py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  Continue as Work
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
