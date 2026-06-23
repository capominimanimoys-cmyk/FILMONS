/**
 * Filmons — AddPortfolioItemSheet
 * 3-step bottom sheet: Category → Details → Media
 */
import { useState, useRef } from 'react';
import { X, ChevronLeft, Upload, Link as LinkIcon, Star, Play, Music2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  PORTFOLIO_CATEGORIES, createPortfolioItem, uploadPortfolioMedia,
  type MediaType, type PortfolioItem,
} from '../lib/portfolioApi';

type Step = 'category' | 'details' | 'media';

const CATEGORY_ICONS: Record<string, string> = {
  'Film & Video':      '🎬',
  'Photography':       '📸',
  'Modeling':          '💃',
  'Gaming':            '🎮',
  'Music & Audio':     '🎵',
  'Design & Creative': '🎨',
  'Other':             '✨',
};

interface Props {
  onClose:  () => void;
  onAdded:  (item: PortfolioItem) => void;
}

export function AddPortfolioItemSheet({ onClose, onAdded }: Props) {
  const { user } = useAuth();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [step,        setStep]        = useState<Step>('category');
  const [saving,      setSaving]      = useState(false);
  const [uploading,   setUploading]   = useState(false);

  // Form state
  const [category,    setCategory]    = useState('');
  const [title,       setTitle]       = useState('');
  const [description, setDesc]        = useState('');
  const [role,        setRole]        = useState('');
  const [year,        setYear]        = useState(new Date().getFullYear().toString());
  const [isFeatured,  setIsFeatured]  = useState(false);

  // Media state
  const [mediaType,   setMediaType]   = useState<MediaType>('image');
  const [mediaUrl,    setMediaUrl]    = useState('');
  const [thumbnailUrl,setThumbnailUrl]= useState('');
  const [externalLink,setExtLink]     = useState('');
  const [filePreview, setFilePreview] = useState('');
  const [fileName,    setFileName]    = useState('');

  // ── File pick ─────────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    const type: MediaType = file.type.startsWith('video/') ? 'video'
      : file.type.startsWith('audio/') ? 'audio' : 'image';
    setMediaType(type);
    setFileName(file.name);
    if (type === 'image') setFilePreview(URL.createObjectURL(file));
    else setFilePreview('');

    setUploading(true);
    const result = await uploadPortfolioMedia(user!.id, file);
    setUploading(false);
    if (!result) { toast.error('Upload failed — try again'); return; }
    setMediaUrl(result.url);
    if (result.thumbnailUrl) { setThumbnailUrl(result.thumbnailUrl); setFilePreview(result.thumbnailUrl); }
    toast.success('Media uploaded');
  };

  // ── Publish ───────────────────────────────────────────────────────────────
  const publish = async () => {
    if (!user) return;
    if (!title.trim()) { toast.error('Add a title'); return; }
    if (!mediaUrl && !externalLink) { toast.error('Add media or a link'); return; }

    setSaving(true);
    const item = await createPortfolioItem(user.id, {
      title:         title.trim(),
      description:   description.trim() || undefined,
      category,
      role:          role.trim()  || undefined,
      year:          year ? parseInt(year) : undefined,
      media_type:    externalLink ? 'link' : mediaType,
      media_url:     mediaUrl  || undefined,
      thumbnail_url: thumbnailUrl || undefined,
      external_link: externalLink || undefined,
      is_featured:   isFeatured,
    });
    setSaving(false);

    if (!item) { toast.error('Could not save item — check if the portfolio_items table exists in Supabase'); return; }
    toast.success('Portfolio item added!');
    onAdded(item);
    onClose();
  };

  // ── Back ──────────────────────────────────────────────────────────────────
  const back = () => {
    if (step === 'category') onClose();
    if (step === 'details')  setStep('category');
    if (step === 'media')    setStep('details');
  };

  const STEP_TITLES: Record<Step, string> = {
    category: 'Category',
    details:  'Details',
    media:    'Add Media',
  };

  return (
    <>
      <style>{`
        @keyframes apiSlideUp {
          from { transform: translateY(100%); opacity: 0.7; }
          to   { transform: translateY(0);    opacity: 1;   }
        }
      `}</style>

      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[61] bg-white rounded-t-3xl flex flex-col"
        style={{
          maxHeight: '92vh',
          animation: 'apiSlideUp 0.32s cubic-bezier(0.32,0.72,0,1)',
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
            {step === 'category'
              ? <X className="w-4 h-4 text-gray-600" />
              : <ChevronLeft className="w-4 h-4 text-gray-600" />}
          </button>
          <p className="text-sm font-black text-gray-900">{STEP_TITLES[step]}</p>
          {step !== 'category' && step !== 'media' && (
            <button
              onClick={() => setStep(step === 'details' ? 'media' : 'details')}
              disabled={step === 'details' && !title.trim()}
              className="text-sm font-black text-blue-600 disabled:text-gray-300"
            >
              Next
            </button>
          )}
          {step === 'media' && (
            <button onClick={publish} disabled={saving}
              className="text-sm font-black text-blue-600 disabled:text-gray-300">
              {saving ? 'Saving…' : 'Add'}
            </button>
          )}
          {step === 'category' && <div className="w-9" />}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── STEP: CATEGORY ── */}
          {step === 'category' && (
            <div className="px-4 pt-4 pb-8 space-y-2">
              <p className="text-xs text-gray-400 mb-4">What type of work are you adding?</p>
              {PORTFOLIO_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => { setCategory(cat); setStep('details'); }}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all active:scale-[0.98]"
                  style={{ background: '#f9fafb', border: '1px solid #f0f0f0' }}
                >
                  <span className="text-2xl w-8 text-center shrink-0">{CATEGORY_ICONS[cat] || '✨'}</span>
                  <span className="text-sm font-black text-gray-900">{cat}</span>
                  <svg className="w-4 h-4 text-gray-300 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6"/>
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* ── STEP: DETAILS ── */}
          {step === 'details' && (
            <div className="px-4 pt-4 pb-8 space-y-4">
              {/* Category chip */}
              <div className="flex items-center gap-2">
                <span className="text-lg">{CATEGORY_ICONS[category] || '✨'}</span>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">{category}</span>
                <button onClick={() => setStep('category')} className="text-xs text-gray-400 underline ml-auto">Change</button>
              </div>

              {/* Title */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Title *</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Nike Campaign"
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
                  maxLength={300}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50 resize-none"
                />
              </div>

              {/* Role + Year */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">My Role</label>
                  <input
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    placeholder="e.g. Lead Model"
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50"
                  />
                </div>
                <div className="w-24">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Year</label>
                  <input
                    value={year}
                    onChange={e => setYear(e.target.value)}
                    placeholder="2026"
                    maxLength={4}
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50"
                  />
                </div>
              </div>

              {/* Featured toggle */}
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

              {/* Upload options */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*,audio/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
              />

              {/* Preview area */}
              {filePreview && (
                <div className="relative w-full aspect-video bg-gray-100 rounded-2xl overflow-hidden">
                  <img src={filePreview} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => { setFilePreview(''); setMediaUrl(''); setThumbnailUrl(''); setFileName(''); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              )}

              {uploading && (
                <div className="flex items-center gap-3 bg-blue-50 rounded-2xl px-4 py-3.5">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
                  <p className="text-sm text-blue-700">Uploading…</p>
                </div>
              )}

              {fileName && !uploading && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
                  {mediaType === 'image' ? <ImageIcon className="w-4 h-4 text-green-600 shrink-0" />
                    : mediaType === 'video' ? <Play className="w-4 h-4 text-green-600 shrink-0" />
                    : <Music2 className="w-4 h-4 text-green-600 shrink-0" />}
                  <p className="text-xs font-semibold text-green-700 truncate">{fileName}</p>
                </div>
              )}

              {/* Upload button */}
              {!mediaUrl && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all active:scale-[0.98]"
                  style={{ background: '#f9fafb', border: '1.5px dashed #d1d5db' }}
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-gray-900">Upload File</p>
                    <p className="text-xs text-gray-400 mt-0.5">Images, Videos, Audio</p>
                  </div>
                </button>
              )}

              {/* OR divider */}
              {!mediaUrl && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400 font-semibold">or</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              )}

              {/* External link */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block flex items-center gap-1.5">
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

              {/* Save button */}
              <button
                onClick={publish}
                disabled={saving || uploading || (!mediaUrl && !externalLink)}
                className="w-full py-4 rounded-2xl font-black text-white text-sm transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
              >
                {saving ? 'Adding…' : 'Add to Portfolio'}
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
