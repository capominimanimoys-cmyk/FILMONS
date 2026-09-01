/**
 * Dedicated Create Listing flow for Opportunities (jobs/gigs/casting calls —
 * the repurposed 'talent' listing kind). Deliberately separate from
 * CreateListing.tsx's gear/service wizard — no Protection/Deposit/Pickup/
 * Delivery/Cancellation-Policy steps, none of which apply to a job posting.
 * Mirrors CreateListing.tsx's proven step-machine/draft-autosave pattern.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { listingsApi, invalidateListingsCache } from '../lib/api';
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { toast } from 'sonner';
import {
  ArrowLeft, ChevronRight, ChevronLeft, Upload, Trash2, Check, X,
  Image as ImageIcon, Video, Camera, Info, Briefcase, MapPin, Calendar,
  DollarSign, Users, MessageCircle, Loader2,
} from 'lucide-react';
import { SmartAddressInput, AddressComponents } from '../components/SmartAddressInput';
import { VideoCoverPicker } from '../components/VideoCoverPicker';
import { ListingCard } from '../components/ListingCard';
import { OpportunityLimitUpgrade } from '../components/OpportunityLimitUpgrade';
import { entitlementsApi, LimitReachedInfo } from '../lib/entitlements';
import { Listing, OpportunityDetails } from '../types';

// ── Shared UI primitives (duplicated from CreateListing.tsx's pattern —
// kept local to this file so the working gear/service wizard is never
// touched by changes here) ──────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{children}{required && <span className="text-red-400 ml-0.5">*</span>}</label>;
}
function Field({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className || ''}`}>{children}</div>;
}
function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[16px] text-gray-800 placeholder-gray-300 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all ${className || ''}`} />;
}
function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[16px] text-gray-800 placeholder-gray-300 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none ${className || ''}`} />;
}
function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2.5">
        <span className="text-indigo-500">{icon}</span>
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}
function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center justify-between w-full py-3">
      <div className="text-left">
        <p className={`text-sm font-semibold ${checked ? 'text-gray-900' : 'text-gray-700'}`}>{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-4 ${checked ? 'bg-indigo-500' : 'bg-gray-200'}`}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}
function RadioCards<T extends string>({ options, value, onChange, columns = 1 }: {
  options: { value: T; label: string; sub?: string }[]; value: T | null; onChange: (v: T) => void; columns?: number;
}) {
  return (
    <div className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`flex items-center justify-between gap-2 px-4 py-3 rounded-xl border-2 text-left transition-all ${value === o.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
          <div>
            <p className={`text-sm font-semibold ${value === o.value ? 'text-indigo-700' : 'text-gray-800'}`}>{o.label}</p>
            {o.sub && <p className="text-xs text-gray-400 mt-0.5">{o.sub}</p>}
          </div>
          {value === o.value && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
        </button>
      ))}
    </div>
  );
}
function ChipInput({ items, onChange, suggestions, placeholder }: {
  items: string[]; onChange: (items: string[]) => void; suggestions: string[]; placeholder: string;
}) {
  const [input, setInput] = useState('');
  const add = (v: string) => { const t = v.trim(); if (t && !items.includes(t)) onChange([...items, t]); setInput(''); };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map(it => (
          <span key={it} className="flex items-center gap-1 text-xs font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full">
            {it} <button type="button" onClick={() => onChange(items.filter(x => x !== it))}><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(input); } }} />
        <button type="button" onClick={() => add(input)} className="px-4 rounded-xl bg-gray-100 text-gray-600 text-sm font-bold shrink-0">Add</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.filter(s => !items.includes(s)).slice(0, 8).map(s => (
          <button key={s} type="button" onClick={() => add(s)} className="text-[11px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-full">+ {s}</button>
        ))}
      </div>
    </div>
  );
}

// ── Form state ────────────────────────────────────────────────────────────
interface OppFormState {
  opportunityType: string | null;
  title: string; categoryIndustry: string; roleNeeded: string; description: string; numPeopleNeeded: string;
  existingImages: string[]; imagePreviews: string[]; imageFiles: File[];
  existingVideos: string[]; videoPreviews: string[]; videoFiles: File[];
  coverSource: 'upload' | 'video_frame'; coverVideoUrl: string; coverTimestamp: number; coverPositionY: number;
  workArrangement: 'onsite' | 'remote' | 'hybrid';
  addressInput: string; streetAddress: string; city: string; province: string; country: string; postalCode: string;
  remoteEligibility: 'CA' | 'US' | 'CA_US' | 'ANYWHERE';
  timingType: 'one_time' | 'multiple_dates' | 'ongoing' | 'flexible';
  startDate: string; endDate: string; startTime: string; endTime: string;
  applicationDeadline: string; noDeadline: boolean; estimatedWorkDays: string;
  paid: boolean;
  compensationType: 'hourly' | 'daily' | 'fixed' | 'salary' | 'negotiable';
  compensationAmount: string; compensationMin: string; compensationMax: string;
  currency: 'CAD' | 'USD'; paymentDetails: string;
  experienceLevel: 'any' | 'beginner' | 'intermediate' | 'experienced' | 'professional';
  skills: string[]; equipmentRequirement: 'provided' | 'own' | 'either'; equipmentDetails: string;
  languages: string; certifications: string; driversLicence: boolean; portfolioRequired: boolean;
  requireProfile: boolean; requirePortfolio: boolean; requireMessage: boolean;
  requireResume: boolean; requireDemoReel: boolean; requireAvailability: boolean; requireExpectedRate: boolean;
  customQuestions: string[];
}

function defaultForm(): OppFormState {
  return {
    opportunityType: null,
    title: '', categoryIndustry: '', roleNeeded: '', description: '', numPeopleNeeded: '',
    existingImages: [], imagePreviews: [], imageFiles: [],
    existingVideos: [], videoPreviews: [], videoFiles: [],
    coverSource: 'upload', coverVideoUrl: '', coverTimestamp: 0, coverPositionY: 50,
    workArrangement: 'onsite',
    addressInput: '', streetAddress: '', city: '', province: '', country: 'Canada', postalCode: '',
    remoteEligibility: 'CA',
    timingType: 'one_time',
    startDate: '', endDate: '', startTime: '', endTime: '',
    applicationDeadline: '', noDeadline: false, estimatedWorkDays: '',
    paid: true,
    compensationType: 'daily',
    compensationAmount: '', compensationMin: '', compensationMax: '',
    currency: 'CAD', paymentDetails: '',
    experienceLevel: 'any',
    skills: [], equipmentRequirement: 'either', equipmentDetails: '',
    languages: '', certifications: '', driversLicence: false, portfolioRequired: false,
    requireProfile: true, requirePortfolio: true, requireMessage: true,
    requireResume: false, requireDemoReel: false, requireAvailability: false, requireExpectedRate: false,
    customQuestions: [],
  };
}

const OPPORTUNITY_TYPES: { value: string; label: string }[] = [
  { value: 'job', label: 'Job' },
  { value: 'paid_gig', label: 'Paid Gig' },
  { value: 'casting_call', label: 'Casting Call' },
  { value: 'crew_call', label: 'Crew Call' },
  { value: 'freelance_project', label: 'Freelance Project' },
  { value: 'collaboration', label: 'Collaboration' },
  { value: 'internship', label: 'Internship' },
  { value: 'audition', label: 'Audition' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_INDUSTRIES = ['Film & Video', 'Photography', 'Music', 'Audio', 'Content Creation', 'Events', 'Fashion', 'Advertising', 'Other'];
const ROLE_SUGGESTIONS = ['Videographer', 'Photographer', 'Camera Operator', 'Director', 'Editor', 'Sound Engineer', 'Actor', 'Model', 'Musician', 'Production Assistant', 'Lighting Technician', 'Makeup Artist', 'Stylist'];
const SKILL_SUGGESTIONS = ['Cinematography', 'Sony Cameras', 'Lighting', 'Premiere Pro', 'DaVinci Resolve', 'Photoshop', 'Live Sound', 'Drone Operation'];

const DRAFT_KEY = 'filmons_create_opportunity_draft';
const DRAFT_RECOVERED_SHOWN_KEY = 'filmons_create_opportunity_draft_recovered_shown';
function isMeaningfulDraft(data: Partial<OppFormState> & { step?: number }): boolean {
  return !!data.opportunityType || !!data.title?.trim() || !!data.description?.trim() || (data.step ?? 1) > 1;
}

const STEP_LABELS = ['Type', 'Details', 'Media', 'Location', 'Dates', 'Compensation', 'Requirements', 'Application', 'Communication', 'Review'];
const TOTAL_STEPS = 10;

// ── Step 1 — Opportunity Type ────────────────────────────────────────────
function Step1({ form, set, onNext }: { form: OppFormState; set: (f: Partial<OppFormState>) => void; onNext: () => void }) {
  const select = (v: string) => { set({ opportunityType: v }); setTimeout(onNext, 120); };
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-gray-900">What are you posting?</h2>
        <p className="text-sm text-gray-500 mt-1">Choose the type that fits best</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {OPPORTUNITY_TYPES.map(o => (
          <button key={o.value} type="button" onClick={() => select(o.value)}
            className={`flex items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all text-center active:scale-95 ${form.opportunityType === o.value ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-gray-200 bg-white hover:border-indigo-200'}`}>
            <p className={`text-sm font-bold ${form.opportunityType === o.value ? 'text-indigo-700' : 'text-gray-800'}`}>{o.label}</p>
            {form.opportunityType === o.value && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2 — Details ─────────────────────────────────────────────────────
function Step2({ form, set }: { form: OppFormState; set: (f: Partial<OppFormState>) => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-gray-900">Tell us about the opportunity</h2>
      </div>
      <SectionCard title="Opportunity Details" icon={<Info className="w-4 h-4" />}>
        <Field>
          <Label required>Opportunity Title</Label>
          <Input value={form.title} onChange={e => set({ title: e.target.value })} placeholder="Camera Operator Needed for Short Film" maxLength={80} />
        </Field>
        <Field>
          <Label required>Category / Industry</Label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORY_INDUSTRIES.map(c => (
              <button key={c} type="button" onClick={() => set({ categoryIndustry: c })}
                className={`px-3 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${form.categoryIndustry === c ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600'}`}>
                {c}
              </button>
            ))}
          </div>
        </Field>
        <Field>
          <Label required>Role Needed</Label>
          <Input value={form.roleNeeded} onChange={e => set({ roleNeeded: e.target.value })} placeholder="e.g. Camera Operator" list="role-suggestions" />
          <datalist id="role-suggestions">{ROLE_SUGGESTIONS.map(r => <option key={r} value={r} />)}</datalist>
          <div className="flex flex-wrap gap-1.5">
            {ROLE_SUGGESTIONS.filter(r => r !== form.roleNeeded).slice(0, 6).map(r => (
              <button key={r} type="button" onClick={() => set({ roleNeeded: r })} className="text-[11px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-full">{r}</button>
            ))}
          </div>
        </Field>
        <Field>
          <Label required>Description</Label>
          <Textarea rows={5} value={form.description} onChange={e => set({ description: e.target.value })} placeholder="Describe the project, role and what you're looking for..." />
        </Field>
        <Field>
          <Label>Number of people needed</Label>
          <Input type="number" min="1" inputMode="numeric" value={form.numPeopleNeeded} onChange={e => set({ numPeopleNeeded: e.target.value })} placeholder="2" />
        </Field>
      </SectionCard>
    </div>
  );
}

// ── Step 3 — Media (mirrors CreateListing.tsx's Step3 exactly) ──────────
function Step3({ form, set }: { form: OppFormState; set: (f: Partial<OppFormState>) => void }) {
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);
  const [coverPickerVideo, setCoverPickerVideo] = useState<{ url: string; isRemote: boolean } | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState<{ blob: Blob; timestamp: number; positionY: number } | null>(null);

  const handleImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const total = form.existingImages.length + form.imageFiles.length + files.length;
    if (total > 10) { toast.error('Maximum 10 images'); return; }
    const valid = files.filter(f => f.size <= 5 * 1024 * 1024 && ['image/jpeg', 'image/png', 'image/webp'].includes(f.type));
    const newPreviews: string[] = [];
    valid.forEach(f => {
      const r = new FileReader();
      r.onload = ev => { newPreviews.push(ev.target!.result as string); if (newPreviews.length === valid.length) set({ imageFiles: [...form.imageFiles, ...valid], imagePreviews: [...form.imagePreviews, ...newPreviews] }); };
      r.readAsDataURL(f);
    });
    e.target.value = '';
  };
  const handleVideos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const total = form.existingVideos.length + form.videoFiles.length + files.length;
    if (total > 5) { toast.error('Maximum 5 videos'); return; }
    const valid = files.filter(f => f.size <= 100 * 1024 * 1024);
    const newPreviews: string[] = [];
    valid.forEach(f => {
      const r = new FileReader();
      r.onload = ev => { newPreviews.push(ev.target!.result as string); if (newPreviews.length === valid.length) set({ videoFiles: [...form.videoFiles, ...valid], videoPreviews: [...form.videoPreviews, ...newPreviews] }); };
      r.readAsDataURL(f);
    });
    e.target.value = '';
  };
  const removeImage = (i: number) => {
    if (i < form.existingImages.length) set({ existingImages: form.existingImages.filter((_, j) => j !== i) });
    else { const ni = i - form.existingImages.length; set({ imageFiles: form.imageFiles.filter((_, j) => j !== ni), imagePreviews: form.imagePreviews.filter((_, j) => j !== ni) }); }
  };
  const removeVideo = (i: number) => {
    if (i < form.existingVideos.length) set({ existingVideos: form.existingVideos.filter((_, j) => j !== i) });
    else { const ni = i - form.existingVideos.length; set({ videoFiles: form.videoFiles.filter((_, j) => j !== ni), videoPreviews: form.videoPreviews.filter((_, j) => j !== ni) }); }
  };
  const allImages = [...form.existingImages, ...form.imagePreviews];
  const allVideos = [...form.existingVideos, ...form.videoPreviews];

  const applyCoverFrame = (blob: Blob, timestamp: number, positionY: number) => {
    const file = new File([blob], `cover-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const preview = URL.createObjectURL(blob);
    set({ imageFiles: [file, ...form.imageFiles], imagePreviews: [preview, ...form.imagePreviews], coverSource: 'video_frame', coverVideoUrl: coverPickerVideo?.url || '', coverTimestamp: timestamp, coverPositionY: positionY });
    setCoverPickerVideo(null); setReplaceConfirm(null);
    toast.success('Cover updated');
  };
  const handleCoverConfirm = (blob: Blob, timestamp: number, positionY: number) => {
    if (allImages.length > 0) { setReplaceConfirm({ blob, timestamp, positionY }); return; }
    applyCoverFrame(blob, timestamp, positionY);
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-6"><h2 className="text-xl font-black text-gray-900">Add media</h2></div>
      <SectionCard title="Photos" icon={<ImageIcon className="w-4 h-4" />}>
        <input ref={imgInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleImages} />
        <div className="grid grid-cols-3 gap-2.5">
          {allImages.map((src, i) => (
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
              <img src={src} alt="" className="w-full h-full object-cover" />
              {i === 0 && <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">Cover</div>}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button type="button" onClick={() => removeImage(i)} className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center"><Trash2 className="w-3.5 h-3.5 text-white" /></button>
              </div>
            </div>
          ))}
          {allImages.length < 10 && (
            <button type="button" onClick={() => imgInput.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-indigo-400 flex flex-col items-center justify-center gap-1.5">
              <Upload className="w-5 h-5 text-gray-400" /><span className="text-[11px] text-gray-400 font-medium">{allImages.length}/10</span>
            </button>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Video" icon={<Video className="w-4 h-4" />}>
        <input ref={vidInput} type="file" accept="video/mp4,video/quicktime,video/x-msvideo" multiple className="hidden" onChange={handleVideos} />
        <div className="grid grid-cols-3 gap-2.5">
          {allVideos.map((src, i) => {
            const isRemote = i < form.existingVideos.length;
            const isCoverSource = form.coverSource === 'video_frame' && form.coverVideoUrl === src;
            return (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
                <video src={src} className="w-full h-full object-cover" />
                {isCoverSource && <div className="absolute top-1 left-1 bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">Cover source</div>}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button type="button" onClick={() => setCoverPickerVideo({ url: src, isRemote })} className="w-8 h-8 bg-white rounded-full flex items-center justify-center" title="Choose cover from video"><Camera className="w-3.5 h-3.5 text-gray-700" /></button>
                  <button type="button" onClick={() => removeVideo(i)} className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center"><Trash2 className="w-3.5 h-3.5 text-white" /></button>
                </div>
              </div>
            );
          })}
          {allVideos.length < 5 && (
            <button type="button" onClick={() => vidInput.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-indigo-400 flex flex-col items-center justify-center gap-1.5">
              <Video className="w-5 h-5 text-gray-400" /><span className="text-[11px] text-gray-400 font-medium">{allVideos.length}/5</span>
            </button>
          )}
        </div>
      </SectionCard>
      {coverPickerVideo && <VideoCoverPicker videoUrl={coverPickerVideo.url} isRemote={coverPickerVideo.isRemote} onCancel={() => setCoverPickerVideo(null)} onConfirm={handleCoverConfirm} />}
      {replaceConfirm && (
        <>
          <div className="fixed inset-0 z-[92] bg-black/50" onClick={() => setReplaceConfirm(null)} />
          <div className="fixed inset-x-4 bottom-6 z-[93] bg-white rounded-3xl p-5 max-w-sm mx-auto">
            <p className="font-black text-gray-900 mb-1">Replace cover?</p>
            <div className="space-y-2 mt-4">
              <button onClick={() => applyCoverFrame(replaceConfirm.blob, replaceConfirm.timestamp, replaceConfirm.positionY)} className="w-full py-3 rounded-2xl bg-indigo-600 text-white text-sm font-bold">Replace cover</button>
              <button onClick={() => setReplaceConfirm(null)} className="w-full py-2.5 text-sm font-semibold text-gray-400">Cancel</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Step 4 — Location ─────────────────────────────────────────────────────
function Step4({ form, set }: { form: OppFormState; set: (f: Partial<OppFormState>) => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6"><h2 className="text-xl font-black text-gray-900">Where is this opportunity?</h2></div>
      <SectionCard title="Work Arrangement" icon={<MapPin className="w-4 h-4" />}>
        <RadioCards value={form.workArrangement} onChange={v => set({ workArrangement: v })} options={[
          { value: 'onsite', label: 'On-site' }, { value: 'remote', label: 'Remote' }, { value: 'hybrid', label: 'Hybrid' },
        ]} />
      </SectionCard>
      {(form.workArrangement === 'onsite' || form.workArrangement === 'hybrid') && (
        // Not a SectionCard — its overflow-hidden (for rounded corners)
        // was clipping the address suggestions dropdown, which is
        // absolutely positioned relative to this field.
        <div className="bg-white rounded-2xl shadow-sm px-5 py-4">
          <div className="flex items-center gap-2.5 mb-3 -mx-5 px-5 pb-3 border-b border-gray-50">
            <span className="text-indigo-500"><MapPin className="w-4 h-4" /></span>
            <h3 className="text-sm font-bold text-gray-800">Location</h3>
          </div>
          <Field>
            <Label required>Address</Label>
            <SmartAddressInput
              value={form.addressInput}
              onInputChange={v => set({ addressInput: v })}
              onAddressSelect={(display, parts: AddressComponents) => set({ addressInput: display, streetAddress: parts.streetAddress || '', city: parts.city || '', province: parts.province || '', postalCode: parts.postalCode || '', country: parts.country || 'Canada' })}
              mode="full" placeholder="Search address…" canadaOnly
            />
            <p className="text-[11px] text-gray-400">Only your city/province is shown publicly on the listing.</p>
          </Field>
        </div>
      )}
      {(form.workArrangement === 'remote' || form.workArrangement === 'hybrid') && (
        <SectionCard title="Who can apply?" icon={<Users className="w-4 h-4" />}>
          <RadioCards value={form.remoteEligibility} onChange={v => set({ remoteEligibility: v })} options={[
            { value: 'CA', label: 'Canada' }, { value: 'US', label: 'United States' },
            { value: 'CA_US', label: 'Canada & United States' }, { value: 'ANYWHERE', label: 'Anywhere' },
          ]} />
        </SectionCard>
      )}
    </div>
  );
}

// ── Step 5 — Dates ────────────────────────────────────────────────────────
function Step5({ form, set }: { form: OppFormState; set: (f: Partial<OppFormState>) => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6"><h2 className="text-xl font-black text-gray-900">When is it?</h2></div>
      <SectionCard title="Opportunity Timing" icon={<Calendar className="w-4 h-4" />}>
        <RadioCards value={form.timingType} onChange={v => set({ timingType: v })} options={[
          { value: 'one_time', label: 'One-time' }, { value: 'multiple_dates', label: 'Multiple dates' },
          { value: 'ongoing', label: 'Ongoing / recurring' }, { value: 'flexible', label: 'Flexible' },
        ]} />
        {form.timingType !== 'flexible' && (
          // min-w-0 on each cell -- CSS Grid items default to
          // min-width:auto, meaning they never shrink below their
          // content's intrinsic width, and a native date/time picker's
          // intrinsic width is wide enough that it was forcing each grid
          // cell (and the input inside it) wider than the 2-column
          // layout actually had room for. Also tightened padding/font on
          // just these inputs so the native widget itself renders
          // narrower instead of overflowing its cell.
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Field className="min-w-0"><Label>Start Date</Label><Input type="date" value={form.startDate} onChange={e => set({ startDate: e.target.value })} className="px-3 text-sm" /></Field>
            <Field className="min-w-0"><Label>End Date</Label><Input type="date" value={form.endDate} onChange={e => set({ endDate: e.target.value })} className="px-3 text-sm" /></Field>
            <Field className="min-w-0"><Label>Start Time</Label><Input type="time" value={form.startTime} onChange={e => set({ startTime: e.target.value })} className="px-3 text-sm" /></Field>
            <Field className="min-w-0"><Label>End Time</Label><Input type="time" value={form.endTime} onChange={e => set({ endTime: e.target.value })} className="px-3 text-sm" /></Field>
          </div>
        )}
        <Field><Label>Estimated number of work/shoot days</Label><Input type="number" min="1" value={form.estimatedWorkDays} onChange={e => set({ estimatedWorkDays: e.target.value })} placeholder="e.g. 3" /></Field>
      </SectionCard>
      <SectionCard title="Application Deadline" icon={<Calendar className="w-4 h-4" />}>
        <Toggle checked={form.noDeadline} onChange={v => set({ noDeadline: v })} label="No deadline" />
        {!form.noDeadline && <Field><Input type="date" value={form.applicationDeadline} onChange={e => set({ applicationDeadline: e.target.value })} className="px-3 text-sm" /></Field>}
      </SectionCard>
    </div>
  );
}

// ── Step 6 — Compensation ─────────────────────────────────────────────────
function Step6({ form, set }: { form: OppFormState; set: (f: Partial<OppFormState>) => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6"><h2 className="text-xl font-black text-gray-900">Compensation</h2></div>
      <SectionCard title="Is this opportunity paid?" icon={<DollarSign className="w-4 h-4" />}>
        <RadioCards value={form.paid ? 'paid' : 'unpaid'} onChange={v => set({ paid: v === 'paid' })} options={[
          { value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid / Collaboration' },
        ]} />
      </SectionCard>
      {form.paid ? (
        <SectionCard title="Compensation Details" icon={<DollarSign className="w-4 h-4" />}>
          <RadioCards columns={2} value={form.compensationType} onChange={v => set({ compensationType: v })} options={[
            { value: 'hourly', label: 'Hourly' }, { value: 'daily', label: 'Daily' },
            { value: 'fixed', label: 'Fixed project rate' }, { value: 'salary', label: 'Salary' },
            { value: 'negotiable', label: 'Negotiable' },
          ]} />
          {form.compensationType !== 'negotiable' && (
            <div className="grid grid-cols-2 gap-3">
              <Field><Label>Minimum</Label><Input type="number" min="0" value={form.compensationMin} onChange={e => set({ compensationMin: e.target.value, compensationAmount: e.target.value })} placeholder="$300" /></Field>
              <Field><Label>Maximum</Label><Input type="number" min="0" value={form.compensationMax} onChange={e => set({ compensationMax: e.target.value })} placeholder="$400" /></Field>
            </div>
          )}
          <Field>
            <Label>Currency</Label>
            <div className="flex gap-2">
              {(['CAD', 'USD'] as const).map(c => (
                <button key={c} type="button" onClick={() => set({ currency: c })} className={`px-4 py-2 rounded-xl border-2 text-xs font-bold ${form.currency === c ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600'}`}>{c}</button>
              ))}
            </div>
          </Field>
          <Field><Label>Payment details</Label><Textarea rows={2} value={form.paymentDetails} onChange={e => set({ paymentDetails: e.target.value })} placeholder="Paid after each shoot day." /></Field>
        </SectionCard>
      ) : (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm text-gray-600">
          This opportunity will be clearly labeled <span className="font-bold">Unpaid / Collaboration</span> — it will never be shown with a compensation figure.
        </div>
      )}
    </div>
  );
}

// ── Step 7 — Requirements ─────────────────────────────────────────────────
function Step7({ form, set }: { form: OppFormState; set: (f: Partial<OppFormState>) => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6"><h2 className="text-xl font-black text-gray-900">Who are you looking for?</h2></div>
      <SectionCard title="Experience Level" icon={<Users className="w-4 h-4" />}>
        <RadioCards columns={2} value={form.experienceLevel} onChange={v => set({ experienceLevel: v })} options={[
          { value: 'any', label: 'Any level' }, { value: 'beginner', label: 'Beginner' },
          { value: 'intermediate', label: 'Intermediate' }, { value: 'experienced', label: 'Experienced' },
          { value: 'professional', label: 'Professional' },
        ]} />
      </SectionCard>
      <SectionCard title="Skills" icon={<Info className="w-4 h-4" />}>
        <ChipInput items={form.skills} onChange={skills => set({ skills })} suggestions={SKILL_SUGGESTIONS} placeholder="Add a skill" />
      </SectionCard>
      <SectionCard title="Equipment" icon={<Camera className="w-4 h-4" />}>
        <RadioCards value={form.equipmentRequirement} onChange={v => set({ equipmentRequirement: v })} options={[
          { value: 'provided', label: 'Equipment provided' }, { value: 'own', label: 'Applicant should have their own equipment' }, { value: 'either', label: 'Either' },
        ]} />
        {form.equipmentRequirement === 'own' && <Field><Label>What equipment should they have?</Label><Textarea rows={2} value={form.equipmentDetails} onChange={e => set({ equipmentDetails: e.target.value })} /></Field>}
      </SectionCard>
      <SectionCard title="Optional" icon={<Info className="w-4 h-4" />}>
        <Field><Label>Languages</Label><Input value={form.languages} onChange={e => set({ languages: e.target.value })} placeholder="English, French" /></Field>
        <Field><Label>Certifications</Label><Input value={form.certifications} onChange={e => set({ certifications: e.target.value })} /></Field>
        <Toggle checked={form.driversLicence} onChange={v => set({ driversLicence: v })} label="Driver's licence required" />
        <Toggle checked={form.portfolioRequired} onChange={v => set({ portfolioRequired: v })} label="Portfolio required" />
      </SectionCard>
    </div>
  );
}

// ── Step 8 — Application ──────────────────────────────────────────────────
function Step8({ form, set }: { form: OppFormState; set: (f: Partial<OppFormState>) => void }) {
  const addQuestion = () => { if (form.customQuestions.length < 3) set({ customQuestions: [...form.customQuestions, ''] }); };
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-gray-900">How should people apply?</h2>
        <p className="text-sm text-gray-500 mt-1">Apply through Filmons</p>
      </div>
      <SectionCard title="What should applicants submit?" icon={<Briefcase className="w-4 h-4" />}>
        <Toggle checked={form.requireProfile} onChange={v => set({ requireProfile: v })} label="Filmons Profile" />
        <Toggle checked={form.requirePortfolio} onChange={v => set({ requirePortfolio: v })} label="Portfolio" />
        <Toggle checked={form.requireMessage} onChange={v => set({ requireMessage: v })} label="Short Message" />
        <div className="border-t border-gray-100 my-2" />
        <Toggle checked={form.requireResume} onChange={v => set({ requireResume: v })} label="Resume (link)" />
        <Toggle checked={form.requireDemoReel} onChange={v => set({ requireDemoReel: v })} label="Demo Reel / Work Sample (link)" />
        <Toggle checked={form.requireAvailability} onChange={v => set({ requireAvailability: v })} label="Availability" />
        <Toggle checked={form.requireExpectedRate} onChange={v => set({ requireExpectedRate: v })} label="Expected Rate" />
      </SectionCard>
      <SectionCard title="Custom screening questions" icon={<Info className="w-4 h-4" />}>
        {form.customQuestions.map((q, i) => (
          <div key={i} className="flex gap-2">
            <Input value={q} onChange={e => set({ customQuestions: form.customQuestions.map((x, j) => j === i ? e.target.value : x) })} placeholder="Tell us about your experience shooting live events." />
            <button type="button" onClick={() => set({ customQuestions: form.customQuestions.filter((_, j) => j !== i) })} className="px-3 rounded-xl bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
          </div>
        ))}
        {form.customQuestions.length < 3 && <button type="button" onClick={addQuestion} className="text-xs font-bold text-indigo-600">+ Add question</button>}
      </SectionCard>
    </div>
  );
}

// ── Step 9 — Communication ────────────────────────────────────────────────
function Step9() {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6"><h2 className="text-xl font-black text-gray-900">Communication</h2></div>
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-2.5">
        <MessageCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-indigo-900">Messages through Filmons ✓</p>
          <p className="text-xs text-indigo-700 mt-1">Applicants and you communicate through the Filmons Inbox. Your account email and phone stay private.</p>
        </div>
      </div>
    </div>
  );
}

// ── Step 10 — Review ──────────────────────────────────────────────────────
function Step10({ form, previewListing, onPublish, isSubmitting, onEditStep, limitReached, onUpgrade, onDismissLimit, onManageOpportunities }: {
  form: OppFormState; previewListing: Listing; onPublish: () => void; isSubmitting: boolean; onEditStep: (s: number) => void;
  limitReached: LimitReachedInfo | null; onUpgrade: (plan: 'professional' | 'business') => void;
  onDismissLimit: () => void; onManageOpportunities: () => void;
}) {
  const navigate = useNavigate();
  const sections: { label: string; step: number }[] = [
    { label: 'Opportunity Type', step: 1 }, { label: 'Details', step: 2 }, { label: 'Media', step: 3 },
    { label: 'Location', step: 4 }, { label: 'Dates', step: 5 }, { label: 'Compensation', step: 6 },
    { label: 'Requirements', step: 7 }, { label: 'Application', step: 8 },
  ];

  if (limitReached) {
    // Draft/wizard state is completely untouched — this replaces only what
    // renders, so dismissing returns straight back to this same review step.
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <OpportunityLimitUpgrade kind="posts" plan={limitReached.plan} limit={limitReached.limit}
            onUpgrade={onUpgrade} onUpgradeToCreatorPlus={() => navigate('/verification')} onMaybeLater={onDismissLimit} />
        </div>
        <button onClick={onManageOpportunities} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">Manage Opportunities</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-6"><h2 className="text-xl font-black text-gray-900">Review your Opportunity</h2></div>
      <div className="max-w-xs mx-auto pointer-events-none"><ListingCard listing={previewListing} /></div>
      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50">
        {sections.map(s => (
          <button key={s.step} type="button" onClick={() => onEditStep(s.step)} className="w-full flex items-center justify-between px-5 py-3.5 text-left">
            <span className="text-sm font-semibold text-gray-800">{s.label}</span>
            <span className="text-xs font-bold text-indigo-600">Edit</span>
          </button>
        ))}
      </div>
      <button onClick={onPublish} disabled={isSubmitting}
        className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
        {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</> : 'Publish Opportunity'}
      </button>
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────────
function SuccessScreen({ listingId, navigate }: { listingId: string; navigate: (p: string) => void }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center gap-4">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"><Check className="w-8 h-8 text-green-600" /></div>
      <div>
        <h2 className="text-xl font-black text-gray-900">Opportunity published ✓</h2>
        <p className="text-sm text-gray-500 mt-1">Your opportunity is now live on Filmons.</p>
      </div>
      <div className="w-full max-w-xs flex flex-col gap-2 mt-2">
        <button onClick={() => navigate(`/listing/${listingId}`)} className="w-full py-3.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm">View Opportunity</button>
        <button onClick={() => navigate('/profile')} className="w-full py-3 text-sm font-semibold text-gray-400">Done</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export function CreateOpportunity() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');

  const [step, setStep] = useState(1);
  const [form, setFormRaw] = useState<OppFormState>(defaultForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState<LimitReachedInfo | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback((updates: Partial<OppFormState>) => setFormRaw(prev => ({ ...prev, ...updates })), []);

  // Unlike gear/studio rental listings (which do require Creator+
  // verification), posting an Opportunity only requires being signed in —
  // every account tier has an Opportunity posting entitlement, weekly for
  // Creator/Professional and monthly for Creator+/Business (see
  // src/app/lib/entitlements.ts; plain Creator and Creator+ both get 2 for
  // free, Creator+ verification doesn't raise the limit).
  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
  }, [isAuthenticated]);

  // Edit mode — prefill from the existing listing
  useEffect(() => {
    if (!editId) return;
    listingsApi.getOne(editId).then(l => {
      const o = l.opportunity;
      if (!o) return;
      set({
        opportunityType: o.opportunityType, title: l.title, categoryIndustry: o.categoryIndustry || '', roleNeeded: o.roleNeeded || '',
        description: l.description, numPeopleNeeded: o.numPeopleNeeded ? String(o.numPeopleNeeded) : '',
        existingImages: l.images || [], existingVideos: l.videos || [],
        workArrangement: o.workArrangement,
        addressInput: [l.streetAddress, l.city, l.province, l.postalCode].filter(Boolean).join(', '),
        streetAddress: l.streetAddress || '', city: l.city || '', province: l.province || '',
        postalCode: l.postalCode || '', remoteEligibility: o.remoteEligibility || 'CA',
        timingType: o.timingType, startDate: o.startDate || '', endDate: o.endDate || '', startTime: o.startTime || '', endTime: o.endTime || '',
        applicationDeadline: o.applicationDeadline || '', noDeadline: !!o.noDeadline, estimatedWorkDays: o.estimatedWorkDays ? String(o.estimatedWorkDays) : '',
        paid: o.paid, compensationType: o.compensationType || 'daily', compensationAmount: o.compensationAmount ? String(o.compensationAmount) : '',
        compensationMin: o.compensationMin ? String(o.compensationMin) : '', compensationMax: o.compensationMax ? String(o.compensationMax) : '',
        currency: o.currency || 'CAD', paymentDetails: o.paymentDetails || '',
        experienceLevel: o.experienceLevel || 'any', skills: o.skills || [], equipmentRequirement: o.equipmentRequirement || 'either', equipmentDetails: o.equipmentDetails || '',
        languages: o.languages || '', certifications: o.certifications || '', driversLicence: !!o.driversLicence, portfolioRequired: !!o.portfolioRequired,
        requireProfile: o.applicationConfig?.requireProfile ?? true, requirePortfolio: o.applicationConfig?.requirePortfolio ?? true,
        requireMessage: o.applicationConfig?.requireMessage ?? true, requireResume: o.applicationConfig?.requireResume ?? false,
        requireDemoReel: o.applicationConfig?.requireDemoReel ?? false, requireAvailability: o.applicationConfig?.requireAvailability ?? false,
        requireExpectedRate: o.applicationConfig?.requireExpectedRate ?? false, customQuestions: o.applicationConfig?.customQuestions || [],
      });
    }).catch(() => toast.error('Could not load this opportunity'));
  }, [editId]);

  // Draft recovery (silent restore, one-time toast — same pattern as CreateListing.tsx)
  useEffect(() => {
    if (editId) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!isMeaningfulDraft(parsed)) { localStorage.removeItem(DRAFT_KEY); return; }
      const { imageFiles, videoFiles, imagePreviews, videoPreviews, ...rest } = parsed;
      void imageFiles; void videoFiles; void imagePreviews; void videoPreviews;
      setFormRaw(prev => ({ ...prev, ...rest, imageFiles: [], videoFiles: [], imagePreviews: [], videoPreviews: [] }));
      if (parsed.step) setStep(parsed.step);
      if (!sessionStorage.getItem(DRAFT_RECOVERED_SHOWN_KEY)) {
        sessionStorage.setItem(DRAFT_RECOVERED_SHOWN_KEY, '1');
        toast('Draft recovered', { icon: '📋', duration: 3000, description: 'Your unfinished opportunity has been restored.' });
      }
    } catch {}
  }, []);

  // Returning from an in-flow Professional/Business upgrade checkout —
  // confirm the subscription actually activated (never assume from the
  // redirect alone), clear the now-stale limitReached state, and drop the
  // query params so a refresh doesn't re-trigger this. The draft itself
  // (including which step we were on) is already restored by the draft-
  // recovery effect above since it reads from localStorage, not the URL.
  useEffect(() => {
    const sessionId = params.get('session_id');
    if (!params.get('sub_success') || !sessionId) return;
    (async () => {
      try {
        const { activated } = await entitlementsApi.verifySubscription(sessionId);
        if (activated) {
          toast.success('Upgrade complete — you can publish now.');
          setLimitReached(null);
        } else {
          toast.error('We could not confirm your upgrade yet. Please try publishing again in a moment.');
        }
      } catch {
        toast.error('We could not confirm your upgrade yet. Please try publishing again in a moment.');
      } finally {
        navigate(editId ? `/create-opportunity?edit=${editId}` : '/create-opportunity', { replace: true });
      }
    })();
  }, []); // eslint-disable-line

  // Auto-save (silent, 300ms debounce)
  useEffect(() => {
    if (editId) return;
    if (!isMeaningfulDraft(form) && step <= 1) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      try { const { imageFiles, videoFiles, ...serializable } = form; void imageFiles; void videoFiles; localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...serializable, step })); } catch {}
    }, 300);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [form, step, editId]);

  const progress = Math.round((step / TOTAL_STEPS) * 100);
  const canAdvance = (): boolean => {
    if (step === 1) return !!form.opportunityType;
    if (step === 2) return !!form.title.trim() && !!form.categoryIndustry && !!form.roleNeeded.trim() && !!form.description.trim();
    if (step === 4) return form.workArrangement === 'remote' || !!form.city.trim();
    return true;
  };
  const goNext = () => { if (step < TOTAL_STEPS && canAdvance()) setStep(s => s + 1); else if (!canAdvance()) toast.error('Please complete required fields'); };
  const goPrev = () => { if (step > 1) setStep(s => s - 1); };

  const buildOpportunity = (): OpportunityDetails => ({
    opportunityType: form.opportunityType || 'other',
    categoryIndustry: form.categoryIndustry || undefined,
    roleNeeded: form.roleNeeded || undefined,
    numPeopleNeeded: form.numPeopleNeeded ? parseInt(form.numPeopleNeeded, 10) : undefined,
    workArrangement: form.workArrangement,
    remoteEligibility: form.workArrangement !== 'onsite' ? form.remoteEligibility : undefined,
    timingType: form.timingType,
    startDate: form.startDate || undefined, endDate: form.endDate || undefined,
    startTime: form.startTime || undefined, endTime: form.endTime || undefined,
    applicationDeadline: form.noDeadline ? undefined : (form.applicationDeadline || undefined),
    noDeadline: form.noDeadline,
    estimatedWorkDays: form.estimatedWorkDays ? parseInt(form.estimatedWorkDays, 10) : undefined,
    paid: form.paid,
    compensationType: form.paid ? form.compensationType : undefined,
    compensationAmount: form.paid && form.compensationAmount ? parseFloat(form.compensationAmount) : undefined,
    compensationMin: form.paid && form.compensationMin ? parseFloat(form.compensationMin) : undefined,
    compensationMax: form.paid && form.compensationMax ? parseFloat(form.compensationMax) : undefined,
    currency: form.paid ? form.currency : undefined,
    paymentDetails: form.paid ? (form.paymentDetails || undefined) : undefined,
    experienceLevel: form.experienceLevel,
    skills: form.skills.length ? form.skills : undefined,
    equipmentRequirement: form.equipmentRequirement,
    equipmentDetails: form.equipmentRequirement === 'own' ? (form.equipmentDetails || undefined) : undefined,
    languages: form.languages || undefined,
    certifications: form.certifications || undefined,
    driversLicence: form.driversLicence,
    portfolioRequired: form.portfolioRequired,
    applicationConfig: {
      requireProfile: form.requireProfile, requirePortfolio: form.requirePortfolio, requireMessage: form.requireMessage,
      requireResume: form.requireResume, requireDemoReel: form.requireDemoReel,
      requireAvailability: form.requireAvailability, requireExpectedRate: form.requireExpectedRate,
      customQuestions: form.customQuestions.filter(q => q.trim()),
    },
  });

  const previewListing: Listing = {
    id: editId || 'preview', userId: user?.id || '', title: form.title || 'Untitled Opportunity', description: form.description,
    tags: form.skills, price: form.paid ? (parseFloat(form.compensationAmount || form.compensationMin || '0') || 0) : 0,
    city: form.city, province: form.province, streetAddress: form.streetAddress, postalCode: form.postalCode,
    image: form.imagePreviews[0] || form.existingImages[0], images: [...form.existingImages, ...form.imagePreviews],
    videos: [...form.existingVideos, ...form.videoPreviews],
    createdAt: new Date().toISOString(), listingType: 'opportunity', listingMode: undefined, listingKind: 'talent',
    opportunity: buildOpportunity(),
  } as Listing;

  const handlePublish = async () => {
    if (!user) return;
    if (!form.title.trim() || (form.workArrangement !== 'remote' && !form.city.trim())) { toast.error('Title and location are required'); return; }
    setIsSubmitting(true);
    try {
      let imageUrls = [...form.existingImages];
      if (form.imageFiles.length) { const results = await Promise.all(form.imageFiles.map(f => listingsApi.uploadImage(f))); imageUrls = [...imageUrls, ...results.map((r: any) => r.imageUrl)]; }
      let videoUrls = [...form.existingVideos];
      if (form.videoFiles.length) { const results = await Promise.all(form.videoFiles.map(f => listingsApi.uploadVideo(f))); videoUrls = [...videoUrls, ...results.map((r: any) => r.videoUrl)]; }

      const opportunity = buildOpportunity();
      const payload = {
        title: form.title.trim(), description: form.description.trim(), tags: form.skills,
        price: opportunity.compensationAmount ?? opportunity.compensationMin ?? 0,
        city: form.city.trim(), street_address: form.streetAddress.trim() || null, province: form.province || null,
        postal_code: form.postalCode || null, country: form.country || 'Canada',
        images: imageUrls, videos: videoUrls,
        listing_type: 'opportunity', listing_mode: null, service_category: (form.categoryIndustry || 'other').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        metadata: { listingKind: 'talent', opportunity },
        boosted: false, // listings.boosted is NOT NULL — see 20240308000000_fix_publish_opportunity_boosted.sql
        updated_at: new Date().toISOString(),
      };

      if (editId) {
        const { error } = await supabase.from('listings').update(payload).eq('id', editId);
        if (error) throw new Error(error.message);
        localStorage.removeItem(DRAFT_KEY);
        invalidateListingsCache();
        toast.success('Opportunity updated!');
        navigate(`/listing/${editId}`);
        return;
      }

      // listings.id has no database-side default — every other listing
      // creation path in this app (listingsApi.create()'s fallback) already
      // generates it client-side; the direct insert here needs the same.
      const newId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // Server-verified — enforces the posting entitlement (weekly for
      // Creator/Professional, monthly for Creator+) atomically
      // (fn_publish_opportunity), never a client-side pre-check followed by
      // a direct insert.
      const result = await entitlementsApi.publishOpportunity(user.id, {
        ...payload, id: newId, user_id: user.id, created_at: new Date().toISOString(), is_active: true,
      });
      if ('limitReached' in result) { setLimitReached(result.limitReached); return; }
      localStorage.removeItem(DRAFT_KEY);
      invalidateListingsCache();
      setPublishedId(newId);
      fetch(`https://${projectId}.supabase.co/functions/v1/notify-event`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ type: 'followed_creator_posted', creatorId: user.id, creatorName: user.name, listingId: newId, listingTitle: payload.title }),
      }).catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to publish. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpgrade = async (plan: 'professional' | 'business') => {
    if (!user) return;
    try {
      const origin = window.location.origin;
      const { url } = await entitlementsApi.startSubscriptionCheckout(
        user.id, plan, `${origin}/create-opportunity?sub_success=1&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`, `${origin}/create-opportunity`,
      );
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message || 'Could not start checkout');
    }
  };

  if (!isAuthenticated || !user) return null;
  if (publishedId) return <SuccessScreen listingId={publishedId} navigate={navigate} />;

  const renderStep = () => {
    switch (step) {
      case 1: return <Step1 form={form} set={set} onNext={goNext} />;
      case 2: return <Step2 form={form} set={set} />;
      case 3: return <Step3 form={form} set={set} />;
      case 4: return <Step4 form={form} set={set} />;
      case 5: return <Step5 form={form} set={set} />;
      case 6: return <Step6 form={form} set={set} />;
      case 7: return <Step7 form={form} set={set} />;
      case 8: return <Step8 form={form} set={set} />;
      case 9: return <Step9 />;
      case 10: return <Step10 form={form} previewListing={previewListing} onPublish={handlePublish} isSubmitting={isSubmitting} onEditStep={setStep}
        limitReached={limitReached} onUpgrade={handleUpgrade} onDismissLimit={() => setLimitReached(null)}
        onManageOpportunities={() => navigate('/dashboard?tab=opportunities')} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => step > 1 ? goPrev() : navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <h1 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5 text-indigo-600" /> {editId ? 'Edit Opportunity' : 'Post an Opportunity'}</h1>
              <span className="text-[10px] font-bold text-gray-400">{STEP_LABELS[step - 1]}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} /></div>
              <span className="text-[10px] font-bold text-gray-500 shrink-0">Step {step}/{TOTAL_STEPS}</span>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 pt-6 pb-32">{renderStep()}</main>

      {step < 10 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 px-4 py-3">
          <div className="max-w-2xl mx-auto flex gap-3">
            <button type="button" onClick={goPrev} disabled={step === 1}
              className="flex items-center gap-1.5 px-5 py-3 rounded-2xl border-2 border-gray-200 text-gray-700 font-semibold text-sm disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button type="button" onClick={goNext}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm active:scale-95">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
