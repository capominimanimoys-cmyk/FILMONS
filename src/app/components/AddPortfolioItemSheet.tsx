/**
 * Filmons — AddPortfolioItemSheet
 * 3-step bottom sheet: Work Type → Details → Media
 */
import { useState, useRef } from 'react';
import {
  X, ChevronLeft, Upload, Link as LinkIcon, Star, Play, Music2,
  Image as ImageIcon, Loader2, Film, Aperture, Layers, FileText,
  Video, Clapperboard,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  PORTFOLIO_CATEGORIES, createPortfolioItem, uploadPortfolioMedia,
  readImageDimensions, workTypeToMediaType, type WorkType, type PortfolioItem,
} from '../lib/portfolioApi';

type Step = 'type' | 'details' | 'media';

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

  // Work type
  const [workType,    setWorkType]    = useState<WorkType>('photo');

  // Details fields
  const [title,       setTitle]       = useState('');
  const [description, setDesc]        = useState('');
  const [category,    setCategory]    = useState('');
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

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    const isImg = file.type.startsWith('image/');
    setFileName(file.name);
    if (isImg) setFilePreview(URL.createObjectURL(file));
    else setFilePreview('');

    if (isImg) {
      readImageDimensions(file).then(d => {
        setImgWidth(d.width);
        setImgHeight(d.height);
        setImgAr(d.aspect_ratio);
      });
    }

    setUploading(true);
    const result = await uploadPortfolioMedia(user!.id, file);
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
    toast.success('Added to portfolio!');
    onAdded(item);
    onClose();
  };

  const back = () => {
    if (step === 'type')    onClose();
    if (step === 'details') setStep('type');
    if (step === 'media')   setStep('details');
  };

  const STEP_LABELS: Record<Step, string> = {
    type:    'Choose Type',
    details: 'Details',
    media:   'Add Media',
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
                  onChange={e => setCategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-400 bg-gray-50"
                >
                  <option value="">Select a category…</option>
                  {PORTFOLIO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

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
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
              />

              {/* Preview */}
              {filePreview && (
                <div className="relative w-full aspect-video bg-gray-100 rounded-2xl overflow-hidden">
                  <img src={filePreview} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => { setFilePreview(''); setMediaUrl(''); setThumbUrl(''); setFileName(''); }}
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
                       'Images, Videos, Audio'}
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

        </div>
      </div>
    </>
  );
}
