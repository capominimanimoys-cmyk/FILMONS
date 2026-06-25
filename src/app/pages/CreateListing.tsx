import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { listingsApi } from '../lib/api';
import {
  ArrowLeft, ChevronRight, ChevronLeft, Upload, Trash2, Plus, X,
  Check, DollarSign, MapPin, Clock, Image as ImageIcon, Video,
  CheckCircle, Camera, Briefcase, Building2, Users, Tag,
  Star, Shield, CreditCard, Calendar, Info, Eye, Globe,
  Loader2, Zap, AlertCircle, Film,
} from 'lucide-react';
import { toast } from 'sonner';
import { SmartAddressInput, AddressComponents } from '../components/SmartAddressInput';
import { supabase } from '../../lib/supabase';

// ── Types ───────────────────────────────────────────────────────────────────
type ListingKind =
  | 'equipment-rental'
  | 'equipment-sale'
  | 'creative-service'
  | 'studio'
  | 'talent'
  | 'job';

interface PricingPkg {
  name: string;
  price: string;
  description: string;
}

interface FormState {
  // Step 1
  kind: ListingKind | null;
  // Step 2
  title: string;
  category: string;
  subcategory: string;
  brand: string;
  model: string;
  description: string;
  tags: string[];
  tagInput: string;
  // Step 3
  existingImages: string[];
  imagePreviews: string[];
  imageFiles: File[];
  existingVideos: string[];
  videoPreviews: string[];
  videoFiles: File[];
  // Step 4 Pricing
  dailyRate: string;
  weeklyRate: string;
  monthlyRate: string;
  salePrice: string;
  acceptOffers: boolean;
  negotiable: boolean;
  startingPrice: string;
  hourlyRate: string;
  securityDeposit: string;
  lateFee: string;
  minDuration: string;
  cleaningFee: string;
  pricingPackages: PricingPkg[];
  // Step 5 Requirements
  depositRequired: boolean;
  insuranceRequired: boolean;
  govIdRequired: boolean;
  ageRequirement: string;
  agreementRequired: boolean;
  usageRules: string;
  customRequirements: string;
  // Step 6 Payment
  acceptedPayments: string[];
  paymentTiming: string;
  cancellationPolicy: string;
  refundPolicy: string;
  // Step 7 Availability
  blockedDates: string[];
  availableDays: string[];
  startTime: string;
  endTime: string;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  remoteAvailable: boolean;
  travelAvailable: boolean;
  instantBooking: boolean;
  // Step 8 Location
  addressInput: string;
  streetAddress: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  showExactLocation: boolean;
  serviceRadius: string;
  // Step 9 Details
  accessories: string;
  specifications: string;
  batteryInfo: string;
  insuranceNotes: string;
  pickupInstructions: string;
  languages: string[];
  experience: string;
  turnaroundTime: string;
  deliverables: string;
  clientRequirements: string;
  capacity: string;
  squareFootage: string;
  parking: boolean;
  lightingIncluded: boolean;
  powerAccess: boolean;
  amenities: string;
  houseRules: string;
  height: string;
  skills: string[];
  projectType: string;
  roleNeeded: string;
  shootDates: string;
  experienceRequired: string;
  applicationProcess: string;
}

// ── Constants ───────────────────────────────────────────────────────────────
const LISTING_KINDS: { kind: ListingKind; icon: React.ReactNode; label: string; sub: string }[] = [
  { kind: 'equipment-rental', icon: <Camera className="w-7 h-7" />, label: 'Equipment Rental', sub: 'Rent out your gear' },
  { kind: 'equipment-sale',   icon: <Tag className="w-7 h-7" />,    label: 'Equipment for Sale', sub: 'Sell your equipment' },
  { kind: 'creative-service', icon: <Film className="w-7 h-7" />,   label: 'Creative Service', sub: 'Offer your skills' },
  { kind: 'studio',           icon: <Building2 className="w-7 h-7" />, label: 'Studio / Location', sub: 'Rent your space' },
  { kind: 'talent',           icon: <Users className="w-7 h-7" />,  label: 'Talent / Creator', sub: 'Showcase yourself' },
  { kind: 'job',              icon: <Briefcase className="w-7 h-7" />, label: 'Job / Gig', sub: 'Post an opportunity' },
];

const CATEGORIES: Record<ListingKind, string[]> = {
  'equipment-rental': ['Camera', 'Lens', 'Lighting', 'Audio', 'Grip & Rigging', 'Drone', 'Monitor', 'Storage & Media', 'Stabilizer', 'Power', 'Accessories', 'Other'],
  'equipment-sale':   ['Camera', 'Lens', 'Lighting', 'Audio', 'Grip & Rigging', 'Drone', 'Monitor', 'Storage & Media', 'Stabilizer', 'Power', 'Accessories', 'Other'],
  'creative-service': ['Photography', 'Videography', 'Video Editing', 'Color Grading', 'Sound Design', 'Motion Graphics', 'Drone Piloting', 'Gaffing', 'Production Assistant', 'Directing', 'Scriptwriting', 'Other'],
  'studio':           ['Sound Stage', 'Photo Studio', 'Film Location', 'Office / Conference', 'Event Space', 'Outdoor Location', 'Unique Venue', 'Other'],
  'talent':           ['Actor', 'Model', 'Voice Actor', 'Musician', 'Dancer', 'Host / MC', 'Influencer', 'Other'],
  'job':              ['Full-time', 'Part-time', 'Freelance', 'Contract', 'Internship', 'Volunteer', 'Other'],
};

const PROVINCES = ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'];

const PAYMENT_OPTIONS = [
  'Credit Card', 'Debit Card', 'Apple Pay', 'Google Pay',
  'PayPal', 'Stripe', 'E-Transfer', 'Cash', 'Bank Transfer',
];

const PAYMENT_TIMING = ['Full Payment Upfront', 'Deposit + Balance', 'On Pickup / Delivery', 'Custom'];
const CANCELLATION_POLICIES = ['Flexible (Full refund 24h before)', 'Moderate (Full refund 7 days before)', 'Strict (50% refund only)', 'Custom'];
const REFUND_POLICIES = ['Full Refund', 'Partial Refund', 'No Refund'];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STEP_LABELS = [
  'Type', 'Info', 'Media', 'Pricing', 'Requirements',
  'Payments', 'Availability', 'Location', 'Details', 'Publish',
];

const DRAFT_KEY = 'filmons_create_listing_draft';

// ── Default state ────────────────────────────────────────────────────────────
function defaultForm(): FormState {
  return {
    kind: null, title: '', category: '', subcategory: '', brand: '', model: '',
    description: '', tags: [], tagInput: '',
    existingImages: [], imagePreviews: [], imageFiles: [],
    existingVideos: [], videoPreviews: [], videoFiles: [],
    dailyRate: '', weeklyRate: '', monthlyRate: '', salePrice: '',
    acceptOffers: false, negotiable: false, startingPrice: '', hourlyRate: '',
    securityDeposit: '', lateFee: '', minDuration: '', cleaningFee: '',
    pricingPackages: [],
    depositRequired: false, insuranceRequired: false, govIdRequired: false,
    ageRequirement: '', agreementRequired: false, usageRules: '', customRequirements: '',
    acceptedPayments: ['Credit Card', 'Debit Card', 'E-Transfer'],
    paymentTiming: 'Full Payment Upfront',
    cancellationPolicy: 'Moderate (Full refund 7 days before)',
    refundPolicy: 'Full Refund',
    blockedDates: [], availableDays: ['Mon','Tue','Wed','Thu','Fri'],
    startTime: '09:00', endTime: '18:00',
    deliveryAvailable: false, pickupAvailable: true, remoteAvailable: false,
    travelAvailable: false, instantBooking: false,
    addressInput: '', streetAddress: '', city: '', province: '', country: 'Canada',
    postalCode: '', latitude: null, longitude: null,
    showExactLocation: false, serviceRadius: '',
    accessories: '', specifications: '', batteryInfo: '', insuranceNotes: '',
    pickupInstructions: '', languages: [], experience: '', turnaroundTime: '',
    deliverables: '', clientRequirements: '', capacity: '', squareFootage: '',
    parking: false, lightingIncluded: false, powerAccess: false,
    amenities: '', houseRules: '', height: '', skills: [],
    projectType: '', roleNeeded: '', shootDates: '', experienceRequired: '',
    applicationProcess: '',
  };
}

// ── Shared UI helpers ────────────────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function Field({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className || ''}`}>{children}</div>;
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all ${className || ''}`}
    />
  );
}

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none ${className || ''}`}
    />
  );
}

function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all appearance-none cursor-pointer ${className || ''}`}
    />
  );
}

function Toggle({ checked, onChange, label, sub }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full py-3"
    >
      <div className="text-left">
        <p className={`text-sm font-semibold ${checked ? 'text-gray-900' : 'text-gray-700'}`}>{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-4 ${checked ? 'bg-blue-500' : 'bg-gray-200'}`}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2.5">
        <span className="text-blue-500">{icon}</span>
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

// ── Availability Calendar ─────────────────────────────────────────────────────
function AvailabilityCalendar({ blockedDates, onChange }: { blockedDates: string[]; onChange: (d: string[]) => void }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [vy, setVy] = useState(today.getFullYear());
  const [vm, setVm] = useState(today.getMonth());
  const iso = (y: number, m: number, d: number) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const toggle = (s: string) => onChange(blockedDates.includes(s) ? blockedDates.filter(x=>x!==s) : [...blockedDates,s]);
  const dim = new Date(vy, vm+1, 0).getDate(), fd = new Date(vy,vm,1).getDay();
  const mn = new Date(vy,vm).toLocaleString('default',{month:'long',year:'numeric'});
  const prev = () => vm===0?(setVm(11),setVy(y=>y-1)):setVm(m=>m-1);
  const next = () => vm===11?(setVm(0),setVy(y=>y+1)):setVm(m=>m+1);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button type="button" onClick={prev} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">‹</button>
        <span className="text-sm font-bold text-gray-800">{mn}</span>
        <button type="button" onClick={next} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">›</button>
      </div>
      <div className="grid grid-cols-7 px-3 mb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=><div key={d} className="text-center text-[10px] font-bold text-gray-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 px-3 pb-3 gap-1">
        {Array.from({length:fd}).map((_,i)=><div key={`e${i}`}/>)}
        {Array.from({length:dim}).map((_,i)=>{
          const d=i+1, s=iso(vy,vm,d), dt=new Date(vy,vm,d);
          const past=dt<today, blocked=blockedDates.includes(s);
          return <button key={d} type="button" disabled={past} onClick={()=>toggle(s)}
            className={`aspect-square rounded-xl text-xs font-semibold transition-all flex items-center justify-center ${past?'text-gray-200 cursor-not-allowed':blocked?'bg-red-500 text-white':'hover:bg-gray-100 text-gray-700'}`}>{d}</button>;
        })}
      </div>
      {blockedDates.length>0&&<div className="px-4 py-2 bg-red-50 border-t border-red-100 flex items-center justify-between">
        <p className="text-xs text-red-600 font-semibold">{blockedDates.length} date{blockedDates.length!==1?'s':''} blocked</p>
        <button type="button" onClick={()=>onChange([])} className="text-xs text-red-400 hover:text-red-600 font-medium">Clear all</button>
      </div>}
    </div>
  );
}

// ── Step 1 — Listing Type ─────────────────────────────────────────────────────
function Step1({ form, set, onNext }: { form: FormState; set: (f: Partial<FormState>) => void; onNext: () => void }) {
  const select = (kind: ListingKind) => { set({ kind }); setTimeout(onNext, 120); };
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-gray-900">What are you offering?</h2>
        <p className="text-sm text-gray-500 mt-1">Choose a listing type to get started</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {LISTING_KINDS.map(({ kind, icon, label, sub }) => (
          <button
            key={kind}
            type="button"
            onClick={() => select(kind)}
            className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all text-center active:scale-95 ${
              form.kind === kind
                ? 'border-blue-500 bg-blue-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/30'
            }`}
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${form.kind===kind?'bg-blue-100 text-blue-600':'bg-gray-50 text-gray-500'}`}>
              {icon}
            </div>
            <div>
              <p className={`text-sm font-bold leading-tight ${form.kind===kind?'text-blue-700':'text-gray-800'}`}>{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
            </div>
            {form.kind === kind && <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center"><Check className="w-3 h-3 text-white"/></div>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2 — Basic Info ───────────────────────────────────────────────────────
function Step2({ form, set }: { form: FormState; set: (f: Partial<FormState>) => void }) {
  const cats = form.kind ? CATEGORIES[form.kind] : [];
  const kindLabel = LISTING_KINDS.find(k=>k.kind===form.kind)?.label || '';

  const addTag = () => {
    const t = form.tagInput.trim().toLowerCase().replace(/\s+/g,' ');
    if (t && !form.tags.includes(t) && form.tags.length < 15) {
      set({ tags: [...form.tags, t], tagInput: '' });
    } else { set({ tagInput: '' }); }
  };

  const suggestTags = () => {
    const suggestions: string[] = [];
    if (form.title) suggestions.push(...form.title.toLowerCase().split(' ').filter(w=>w.length>2));
    if (form.brand) suggestions.push(form.brand.toLowerCase());
    if (form.model) suggestions.push(form.model.toLowerCase());
    if (form.category) suggestions.push(form.category.toLowerCase());
    return [...new Set(suggestions)].filter(s=>!form.tags.includes(s)).slice(0,6);
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-gray-900">Tell people what you're offering</h2>
        <p className="text-sm text-gray-500 mt-1">{kindLabel} — Basic details</p>
      </div>

      <SectionCard title="Listing Details" icon={<Info className="w-4 h-4"/>}>
        <Field>
          <Label required>Listing Title</Label>
          <Input
            value={form.title}
            onChange={e=>set({title:e.target.value})}
            placeholder={form.kind==='equipment-rental'?'Sony FX3 Cinema Camera Rental':form.kind==='equipment-sale'?'Selling: Canon 5D Mark IV':form.kind==='creative-service'?'Professional Videography Service':'Your listing title'}
            maxLength={80}
          />
          <p className="text-[11px] text-gray-400 text-right">{form.title.length}/80</p>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label required>Category</Label>
            <Select value={form.category} onChange={e=>set({category:e.target.value,subcategory:''})}>
              <option value="">Select…</option>
              {cats.map(c=><option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field>
            <Label>Subcategory</Label>
            <Input value={form.subcategory} onChange={e=>set({subcategory:e.target.value})} placeholder="e.g. DSLR"/>
          </Field>
        </div>

        {(form.kind==='equipment-rental'||form.kind==='equipment-sale') && (
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Brand</Label>
              <Input value={form.brand} onChange={e=>set({brand:e.target.value})} placeholder="e.g. Sony"/>
            </Field>
            <Field>
              <Label>Model</Label>
              <Input value={form.model} onChange={e=>set({model:e.target.value})} placeholder="e.g. FX3"/>
            </Field>
          </div>
        )}

        <Field>
          <Label required>Description</Label>
          <Textarea
            rows={4}
            value={form.description}
            onChange={e=>set({description:e.target.value})}
            placeholder="Describe your listing in detail. Include condition, what's included, any special features…"
            maxLength={2000}
          />
          <p className="text-[11px] text-gray-400 text-right">{form.description.length}/2000</p>
        </Field>
      </SectionCard>

      <SectionCard title="Tags" icon={<Tag className="w-4 h-4"/>}>
        <div className="flex gap-2">
          <Input
            value={form.tagInput}
            onChange={e=>set({tagInput:e.target.value})}
            onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTag();}}}
            placeholder="Type a tag and press Enter"
          />
          <button type="button" onClick={addTag} className="px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shrink-0">
            Add
          </button>
        </div>
        {form.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {form.tags.map(tag=>(
              <span key={tag} className="flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full">
                #{tag}
                <button type="button" onClick={()=>set({tags:form.tags.filter(t=>t!==tag)})} className="text-blue-400 hover:text-red-500 transition-colors"><X className="w-3 h-3"/></button>
              </span>
            ))}
          </div>
        )}
        {suggestTags().length > 0 && (
          <div>
            <p className="text-[11px] text-gray-400 mb-2 font-semibold uppercase tracking-wide">Suggestions</p>
            <div className="flex flex-wrap gap-2">
              {suggestTags().map(s=>(
                <button key={s} type="button" onClick={()=>set({tags:[...form.tags,s]})}
                  className="text-xs text-gray-500 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 px-3 py-1 rounded-full transition-colors font-medium">
                  + {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Step 3 — Media ─────────────────────────────────────────────────────────────
function Step3({ form, set }: { form: FormState; set: (f: Partial<FormState>) => void }) {
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);

  const handleImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const total = form.existingImages.length + form.imageFiles.length + files.length;
    if (total > 10) { toast.error('Maximum 10 images'); return; }
    const valid = files.filter(f=>f.size<=5*1024*1024&&['image/jpeg','image/png','image/webp'].includes(f.type));
    if (valid.length < files.length) toast.error('Some files skipped — max 5MB, JPEG/PNG/WebP only');
    const newPreviews: string[] = [];
    valid.forEach(f=>{
      const r=new FileReader();
      r.onload=ev=>{
        newPreviews.push(ev.target!.result as string);
        if (newPreviews.length===valid.length) set({imageFiles:[...form.imageFiles,...valid],imagePreviews:[...form.imagePreviews,...newPreviews]});
      };
      r.readAsDataURL(f);
    });
    e.target.value='';
  };

  const handleVideos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const total = form.existingVideos.length + form.videoFiles.length + files.length;
    if (total > 5) { toast.error('Maximum 5 videos'); return; }
    const valid = files.filter(f=>f.size<=100*1024*1024);
    if (valid.length < files.length) toast.error('Some files skipped — max 100MB per video');
    const newPreviews: string[] = [];
    valid.forEach(f=>{
      const r=new FileReader();
      r.onload=ev=>{
        newPreviews.push(ev.target!.result as string);
        if (newPreviews.length===valid.length) set({videoFiles:[...form.videoFiles,...valid],videoPreviews:[...form.videoPreviews,...newPreviews]});
      };
      r.readAsDataURL(f);
    });
    e.target.value='';
  };

  const removeImage = (i: number) => {
    const allPreviews=[...form.existingImages,...form.imagePreviews];
    if (i<form.existingImages.length) {
      set({existingImages:form.existingImages.filter((_,j)=>j!==i),imagePreviews:form.imagePreviews});
    } else {
      const ni=i-form.existingImages.length;
      set({imageFiles:form.imageFiles.filter((_,j)=>j!==ni),imagePreviews:form.imagePreviews.filter((_,j)=>j!==ni)});
    }
    void allPreviews;
  };

  const removeVideo = (i: number) => {
    if (i<form.existingVideos.length) {
      set({existingVideos:form.existingVideos.filter((_,j)=>j!==i)});
    } else {
      const ni=i-form.existingVideos.length;
      set({videoFiles:form.videoFiles.filter((_,j)=>j!==ni),videoPreviews:form.videoPreviews.filter((_,j)=>j!==ni)});
    }
  };

  const allImages=[...form.existingImages,...form.imagePreviews];
  const allVideos=[...form.existingVideos,...form.videoPreviews];

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-gray-900">Show your listing</h2>
        <p className="text-sm text-gray-500 mt-1">Great photos get more bookings</p>
      </div>

      <SectionCard title="Photos" icon={<ImageIcon className="w-4 h-4"/>}>
        <input ref={imgInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleImages}/>
        <div className="grid grid-cols-3 gap-2.5">
          {allImages.map((src,i)=>(
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
              <img src={src} alt="" className="w-full h-full object-cover"/>
              {i===0&&<div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">Cover</div>}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button type="button" onClick={()=>removeImage(i)} className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600">
                  <Trash2 className="w-3.5 h-3.5 text-white"/>
                </button>
              </div>
            </div>
          ))}
          {allImages.length<10&&(
            <button type="button" onClick={()=>imgInput.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer">
              <Upload className="w-5 h-5 text-gray-400"/>
              <span className="text-[11px] text-gray-400 font-medium">{allImages.length}/10</span>
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-400">First image = cover photo. Max 10 photos · 5MB each · JPEG/PNG/WebP</p>
      </SectionCard>

      <SectionCard title="Videos" icon={<Video className="w-4 h-4"/>}>
        <input ref={vidInput} type="file" accept="video/mp4,video/quicktime,video/x-msvideo" multiple className="hidden" onChange={handleVideos}/>
        <div className="grid grid-cols-3 gap-2.5">
          {allVideos.map((src,i)=>(
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
              <video src={src} className="w-full h-full object-cover"/>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button type="button" onClick={()=>removeVideo(i)} className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600">
                  <Trash2 className="w-3.5 h-3.5 text-white"/>
                </button>
              </div>
            </div>
          ))}
          {allVideos.length<5&&(
            <button type="button" onClick={()=>vidInput.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer">
              <Video className="w-5 h-5 text-gray-400"/>
              <span className="text-[11px] text-gray-400 font-medium">{allVideos.length}/5</span>
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-400">Max 5 videos · 100MB each · MP4/MOV</p>
      </SectionCard>
    </div>
  );
}

// ── Step 4 — Pricing ───────────────────────────────────────────────────────────
function Step4({ form, set }: { form: FormState; set: (f: Partial<FormState>) => void }) {
  const PriceField = ({ label, value, onChange, placeholder, unit }: { label: string; value: string; onChange: (v:string)=>void; placeholder?: string; unit?: string }) => (
    <Field>
      <Label>{label}</Label>
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
        <DollarSign className="w-4 h-4 text-gray-400 shrink-0"/>
        <input type="number" min="0" step="0.01" value={value} onChange={e=>onChange(e.target.value)}
          placeholder={placeholder||'0.00'}
          className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-300 outline-none font-semibold"/>
        {unit&&<span className="text-xs text-gray-400 shrink-0 font-semibold">{unit}</span>}
      </div>
    </Field>
  );

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-gray-900">Set your pricing</h2>
        <p className="text-sm text-gray-500 mt-1">Competitive pricing gets more bookings</p>
      </div>

      {(form.kind==='equipment-rental') && (
        <SectionCard title="Rental Rates" icon={<DollarSign className="w-4 h-4"/>}>
          <PriceField label="Daily Rate *" value={form.dailyRate} onChange={v=>set({dailyRate:v})} unit="CAD/day"/>
          <PriceField label="Weekly Rate" value={form.weeklyRate} onChange={v=>set({weeklyRate:v})} unit="CAD/week"/>
          <PriceField label="Monthly Rate" value={form.monthlyRate} onChange={v=>set({monthlyRate:v})} unit="CAD/month"/>
          <div className="grid grid-cols-2 gap-3">
            <PriceField label="Security Deposit" value={form.securityDeposit} onChange={v=>set({securityDeposit:v})} unit="CAD"/>
            <PriceField label="Late Fee / day" value={form.lateFee} onChange={v=>set({lateFee:v})} unit="CAD"/>
          </div>
          <Field>
            <Label>Minimum Rental Duration</Label>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 focus-within:border-blue-400 transition-all">
              <Clock className="w-4 h-4 text-gray-400 shrink-0"/>
              <input type="text" value={form.minDuration} onChange={e=>set({minDuration:e.target.value})}
                placeholder="e.g. 1 day, 2 days"
                className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-300 outline-none"/>
            </div>
          </Field>
        </SectionCard>
      )}

      {form.kind==='equipment-sale' && (
        <SectionCard title="Sale Price" icon={<DollarSign className="w-4 h-4"/>}>
          <PriceField label="Asking Price *" value={form.salePrice} onChange={v=>set({salePrice:v})} unit="CAD"/>
          <div className="divide-y divide-gray-100">
            <Toggle checked={form.acceptOffers} onChange={v=>set({acceptOffers:v})} label="Accept Offers" sub="Buyers can submit offers below your asking price"/>
            <Toggle checked={form.negotiable} onChange={v=>set({negotiable:v})} label="Price is Negotiable"/>
          </div>
        </SectionCard>
      )}

      {form.kind==='creative-service' && (
        <>
          <SectionCard title="Base Pricing" icon={<DollarSign className="w-4 h-4"/>}>
            <PriceField label="Starting Price *" value={form.startingPrice} onChange={v=>set({startingPrice:v})} unit="CAD"/>
            <PriceField label="Hourly Rate" value={form.hourlyRate} onChange={v=>set({hourlyRate:v})} unit="CAD/hr"/>
          </SectionCard>
          <SectionCard title="Pricing Packages" icon={<Star className="w-4 h-4"/>}>
            <p className="text-xs text-gray-400">Create custom tiers — Half Day, Full Day, Weekend, etc.</p>
            {form.pricingPackages.map((pkg,i)=>(
              <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Package {i+1}</span>
                  <button type="button" onClick={()=>set({pricingPackages:form.pricingPackages.filter((_,j)=>j!==i)})}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5"/>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Name</Label>
                    <Input value={pkg.name} onChange={e=>{const p=[...form.pricingPackages];p[i]={...p[i],name:e.target.value};set({pricingPackages:p});}} placeholder="e.g. Half Day"/>
                  </div>
                  <div>
                    <Label>Price (CAD)</Label>
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-400 transition-all">
                      <DollarSign className="w-3.5 h-3.5 text-gray-400 shrink-0"/>
                      <input type="number" min="0" value={pkg.price} onChange={e=>{const p=[...form.pricingPackages];p[i]={...p[i],price:e.target.value};set({pricingPackages:p});}}
                        className="flex-1 bg-transparent text-sm outline-none font-semibold" placeholder="0"/>
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={pkg.description} onChange={e=>{const p=[...form.pricingPackages];p[i]={...p[i],description:e.target.value};set({pricingPackages:p});}} placeholder="What's included…"/>
                </div>
              </div>
            ))}
            <button type="button" onClick={()=>set({pricingPackages:[...form.pricingPackages,{name:'',price:'',description:''}]})}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-xl py-3 text-sm font-semibold transition-all">
              <Plus className="w-4 h-4"/> Add Package
            </button>
          </SectionCard>
        </>
      )}

      {form.kind==='studio' && (
        <SectionCard title="Studio Rates" icon={<DollarSign className="w-4 h-4"/>}>
          <PriceField label="Hourly Rate *" value={form.hourlyRate} onChange={v=>set({hourlyRate:v})} unit="CAD/hr"/>
          <PriceField label="Day Rate" value={form.dailyRate} onChange={v=>set({dailyRate:v})} unit="CAD/day"/>
          <PriceField label="Security Deposit" value={form.securityDeposit} onChange={v=>set({securityDeposit:v})} unit="CAD"/>
          <PriceField label="Cleaning Fee" value={form.cleaningFee} onChange={v=>set({cleaningFee:v})} unit="CAD"/>
        </SectionCard>
      )}

      {(form.kind==='talent'||form.kind==='job') && (
        <SectionCard title="Compensation" icon={<DollarSign className="w-4 h-4"/>}>
          <PriceField label={form.kind==='job'?'Budget / Rate *':'Hourly Rate *'} value={form.hourlyRate} onChange={v=>set({hourlyRate:v})} unit="CAD/hr"/>
          <PriceField label="Day Rate" value={form.dailyRate} onChange={v=>set({dailyRate:v})} unit="CAD/day"/>
          <Toggle checked={form.negotiable} onChange={v=>set({negotiable:v})} label="Negotiable" sub="Open to discuss compensation"/>
        </SectionCard>
      )}
    </div>
  );
}

// ── Step 5 — Requirements ─────────────────────────────────────────────────────
function Step5({ form, set }: { form: FormState; set: (f: Partial<FormState>) => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-gray-900">Requirements & Protection</h2>
        <p className="text-sm text-gray-500 mt-1">Protect your gear, space, and services</p>
      </div>

      <SectionCard title="Protection" icon={<Shield className="w-4 h-4"/>}>
        <div className="divide-y divide-gray-100">
          <Toggle checked={form.depositRequired} onChange={v=>set({depositRequired:v})} label="Deposit Required" sub="Collect a security deposit before the booking"/>
          <Toggle checked={form.insuranceRequired} onChange={v=>set({insuranceRequired:v})} label="Insurance Required" sub="Renter must provide proof of insurance"/>
          <Toggle checked={form.govIdRequired} onChange={v=>set({govIdRequired:v})} label="Government ID Required" sub="Verify renter identity before handoff"/>
          <Toggle checked={form.agreementRequired} onChange={v=>set({agreementRequired:v})} label="Signed Agreement Required" sub="Renter must sign a rental agreement"/>
        </div>
        <Field>
          <Label>Age Requirement</Label>
          <Input value={form.ageRequirement} onChange={e=>set({ageRequirement:e.target.value})} placeholder="e.g. Must be 21+" />
        </Field>
      </SectionCard>

      <SectionCard title="Usage Rules" icon={<AlertCircle className="w-4 h-4"/>}>
        <Field>
          <Label>Usage Rules</Label>
          <Textarea rows={3} value={form.usageRules} onChange={e=>set({usageRules:e.target.value})}
            placeholder="e.g. No international travel&#10;No sub-rentals&#10;Return in original condition&#10;Insurance required"/>
        </Field>
        <Field>
          <Label>Custom Requirements</Label>
          <Textarea rows={3} value={form.customRequirements} onChange={e=>set({customRequirements:e.target.value})}
            placeholder="Any other requirements for renters or clients…"/>
        </Field>
      </SectionCard>
    </div>
  );
}

// ── Step 6 — Payment Methods ───────────────────────────────────────────────────
function Step6({ form, set }: { form: FormState; set: (f: Partial<FormState>) => void }) {
  const toggle = (method: string) => {
    set({ acceptedPayments: form.acceptedPayments.includes(method)
      ? form.acceptedPayments.filter(m=>m!==method)
      : [...form.acceptedPayments, method]
    });
  };
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-gray-900">Payment Methods</h2>
        <p className="text-sm text-gray-500 mt-1">How can people pay you?</p>
      </div>

      <SectionCard title="Accepted Payments" icon={<CreditCard className="w-4 h-4"/>}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PAYMENT_OPTIONS.map(opt=>{
            const selected=form.acceptedPayments.includes(opt);
            return (
              <button key={opt} type="button" onClick={()=>toggle(opt)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${selected?'border-blue-500 bg-blue-50 text-blue-700':'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                {selected?<CheckCircle className="w-4 h-4 text-blue-500 shrink-0"/>:<div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0"/>}
                <span className="text-xs font-medium">{opt}</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Payment Timing" icon={<Clock className="w-4 h-4"/>}>
        <div className="space-y-2">
          {PAYMENT_TIMING.map(pt=>(
            <button key={pt} type="button" onClick={()=>set({paymentTiming:pt})}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${form.paymentTiming===pt?'border-blue-500 bg-blue-50':'border-gray-200 bg-white hover:border-gray-300'}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${form.paymentTiming===pt?'border-blue-500 bg-blue-500':'border-gray-300'}`}>
                {form.paymentTiming===pt&&<div className="w-2 h-2 rounded-full bg-white"/>}
              </div>
              <span className={`text-sm font-medium ${form.paymentTiming===pt?'text-blue-700':'text-gray-700'}`}>{pt}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Cancellation Policy" icon={<AlertCircle className="w-4 h-4"/>}>
        <div className="space-y-2">
          {CANCELLATION_POLICIES.map(p=>(
            <button key={p} type="button" onClick={()=>set({cancellationPolicy:p})}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${form.cancellationPolicy===p?'border-blue-500 bg-blue-50':'border-gray-200 bg-white hover:border-gray-300'}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${form.cancellationPolicy===p?'border-blue-500 bg-blue-500':'border-gray-300'}`}>
                {form.cancellationPolicy===p&&<div className="w-2 h-2 rounded-full bg-white"/>}
              </div>
              <span className={`text-sm font-medium ${form.cancellationPolicy===p?'text-blue-700':'text-gray-700'}`}>{p}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Refund Policy" icon={<Shield className="w-4 h-4"/>}>
        <div className="flex gap-2">
          {REFUND_POLICIES.map(p=>(
            <button key={p} type="button" onClick={()=>set({refundPolicy:p})}
              className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${form.refundPolicy===p?'border-blue-500 bg-blue-500 text-white':'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {p}
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Step 7 — Availability ──────────────────────────────────────────────────────
function Step7({ form, set }: { form: FormState; set: (f: Partial<FormState>) => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-gray-900">Availability</h2>
        <p className="text-sm text-gray-500 mt-1">When are you available?</p>
      </div>

      {form.kind !== 'equipment-sale' && form.kind !== 'job' && (
        <SectionCard title="Available Days" icon={<Calendar className="w-4 h-4"/>}>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(day=>{
              const sel=form.availableDays.includes(day);
              return (
                <button key={day} type="button"
                  onClick={()=>set({availableDays:sel?form.availableDays.filter(d=>d!==day):[...form.availableDays,day]})}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${sel?'bg-blue-600 border-blue-600 text-white':'bg-white border-gray-200 text-gray-500 hover:border-blue-300'}`}>
                  {day}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>From</Label>
              <input type="time" value={form.startTime} onChange={e=>set({startTime:e.target.value})}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors"/>
            </Field>
            <Field>
              <Label>To</Label>
              <input type="time" value={form.endTime} onChange={e=>set({endTime:e.target.value})}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors"/>
            </Field>
          </div>
        </SectionCard>
      )}

      {(form.kind==='equipment-rental'||form.kind==='studio') && (
        <SectionCard title="Blocked Dates" icon={<Calendar className="w-4 h-4"/>}>
          <p className="text-xs text-gray-400 mb-3">Tap dates when your listing is <span className="text-red-500 font-semibold">not available</span></p>
          <AvailabilityCalendar blockedDates={form.blockedDates} onChange={dates=>set({blockedDates:dates})}/>
        </SectionCard>
      )}

      <SectionCard title="Fulfilment Options" icon={<Globe className="w-4 h-4"/>}>
        <div className="divide-y divide-gray-100">
          <Toggle checked={form.pickupAvailable} onChange={v=>set({pickupAvailable:v})} label="Pickup Available" sub="Client picks up in person"/>
          <Toggle checked={form.deliveryAvailable} onChange={v=>set({deliveryAvailable:v})} label="Delivery Available" sub="You deliver to client"/>
          <Toggle checked={form.remoteAvailable} onChange={v=>set({remoteAvailable:v})} label="Remote / Online Available" sub="Can work remotely"/>
          {(form.kind==='creative-service'||form.kind==='talent') && (
            <Toggle checked={form.travelAvailable} onChange={v=>set({travelAvailable:v})} label="Travel Available" sub="Willing to travel to client"/>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Booking" icon={<Zap className="w-4 h-4"/>}>
        <Toggle
          checked={form.instantBooking}
          onChange={v=>set({instantBooking:v})}
          label="Instant Booking"
          sub="Clients can book without approval. Turn off to require your approval first."
        />
      </SectionCard>
    </div>
  );
}

// ── Step 8 — Location ─────────────────────────────────────────────────────────
function Step8({ form, set }: { form: FormState; set: (f: Partial<FormState>) => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-gray-900">Location</h2>
        <p className="text-sm text-gray-500 mt-1">Where is this available?</p>
      </div>

      <SectionCard title="Address" icon={<MapPin className="w-4 h-4"/>}>
        <SmartAddressInput
          value={form.addressInput}
          onInputChange={v=>set({addressInput:v})}
          onAddressSelect={(_display, parts: AddressComponents) => {
            set({
              streetAddress: parts.streetAddress,
              city: parts.city,
              province: parts.province,
              postalCode: parts.postalCode,
            });
          }}
          mode="full"
          placeholder="Start typing a Canadian address…"
          showGPS
          canadaOnly
        />

        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 h-px bg-gray-100"/>
          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wide">or fill manually</span>
          <div className="flex-1 h-px bg-gray-100"/>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <MapPin className="w-4 h-4 text-gray-400 shrink-0"/>
            <input type="text" value={form.streetAddress} onChange={e=>set({streetAddress:e.target.value})}
              placeholder="Street address"
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-300 outline-none"/>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <input type="text" value={form.city} onChange={e=>set({city:e.target.value})} placeholder="City *"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"/>
            <select value={form.province} onChange={e=>set({province:e.target.value})}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 outline-none focus:border-blue-400 transition-all appearance-none cursor-pointer">
              <option value="">Province</option>
              {PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <input type="text" value={form.postalCode} onChange={e=>set({postalCode:e.target.value.toUpperCase()})} maxLength={7}
            placeholder="Postal code (e.g. M5V 2T6)"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 transition-all uppercase tracking-widest"/>
        </div>

        {(form.streetAddress||form.city) && (
          <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-xl mt-2">
            <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0"/>
            <span className="font-medium">{[form.streetAddress,form.city,form.province&&`(${form.province})`,form.postalCode].filter(Boolean).join(' · ')}</span>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Privacy & Reach" icon={<Eye className="w-4 h-4"/>}>
        <Toggle
          checked={form.showExactLocation}
          onChange={v=>set({showExactLocation:v})}
          label="Show Exact Location"
          sub="Show your street address on the listing. Disable to show approximate area only."
        />
        {(form.kind==='creative-service'||form.kind==='talent') && (
          <Field>
            <Label>Service Radius</Label>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 focus-within:border-blue-400 transition-all">
              <Globe className="w-4 h-4 text-gray-400 shrink-0"/>
              <input type="text" value={form.serviceRadius} onChange={e=>set({serviceRadius:e.target.value})}
                placeholder="e.g. 50 km, entire city, anywhere in Canada"
                className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-300 outline-none"/>
            </div>
          </Field>
        )}
      </SectionCard>
    </div>
  );
}

// ── Step 9 — Additional Details ────────────────────────────────────────────────
function Step9({ form, set }: { form: FormState; set: (f: Partial<FormState>) => void }) {
  const k = form.kind;
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-gray-900">Additional Details</h2>
        <p className="text-sm text-gray-500 mt-1">The more info, the better</p>
      </div>

      {(k==='equipment-rental'||k==='equipment-sale') && (
        <SectionCard title="Equipment Details" icon={<Info className="w-4 h-4"/>}>
          <Field>
            <Label>Included Accessories</Label>
            <Textarea rows={3} value={form.accessories} onChange={e=>set({accessories:e.target.value})}
              placeholder="List everything included: batteries, cases, adapters, memory cards…"/>
          </Field>
          <Field>
            <Label>Technical Specifications</Label>
            <Textarea rows={3} value={form.specifications} onChange={e=>set({specifications:e.target.value})}
              placeholder="Resolution, sensor size, mount type, compatible lenses…"/>
          </Field>
          <Field>
            <Label>Battery & Power Info</Label>
            <Input value={form.batteryInfo} onChange={e=>set({batteryInfo:e.target.value})} placeholder="e.g. 2 batteries included, approx 4hr runtime each"/>
          </Field>
          <Field>
            <Label>Pickup Instructions</Label>
            <Textarea rows={2} value={form.pickupInstructions} onChange={e=>set({pickupInstructions:e.target.value})}
              placeholder="How and where to pick up the equipment…"/>
          </Field>
        </SectionCard>
      )}

      {k==='creative-service' && (
        <SectionCard title="Service Details" icon={<Info className="w-4 h-4"/>}>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Years of Experience</Label>
              <Input value={form.experience} onChange={e=>set({experience:e.target.value})} placeholder="e.g. 5 years"/>
            </Field>
            <Field>
              <Label>Turnaround Time</Label>
              <Input value={form.turnaroundTime} onChange={e=>set({turnaroundTime:e.target.value})} placeholder="e.g. 3 business days"/>
            </Field>
          </div>
          <Field>
            <Label>Deliverables</Label>
            <Textarea rows={3} value={form.deliverables} onChange={e=>set({deliverables:e.target.value})}
              placeholder="What exactly do clients receive? Edited files, RAW files, number of final shots…"/>
          </Field>
          <Field>
            <Label>Client Requirements</Label>
            <Textarea rows={2} value={form.clientRequirements} onChange={e=>set({clientRequirements:e.target.value})}
              placeholder="What do you need from the client to get started?"/>
          </Field>
        </SectionCard>
      )}

      {k==='studio' && (
        <SectionCard title="Studio Details" icon={<Info className="w-4 h-4"/>}>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Capacity (people)</Label>
              <Input type="number" value={form.capacity} onChange={e=>set({capacity:e.target.value})} placeholder="e.g. 20"/>
            </Field>
            <Field>
              <Label>Square Footage</Label>
              <Input type="number" value={form.squareFootage} onChange={e=>set({squareFootage:e.target.value})} placeholder="e.g. 2000"/>
            </Field>
          </div>
          <div className="divide-y divide-gray-100">
            <Toggle checked={form.parking} onChange={v=>set({parking:v})} label="Parking Available"/>
            <Toggle checked={form.lightingIncluded} onChange={v=>set({lightingIncluded:v})} label="Lighting Included"/>
            <Toggle checked={form.powerAccess} onChange={v=>set({powerAccess:v})} label="Power Access / Generator"/>
          </div>
          <Field>
            <Label>Amenities</Label>
            <Textarea rows={2} value={form.amenities} onChange={e=>set({amenities:e.target.value})}
              placeholder="Kitchen, bathroom, green room, WiFi, AC…"/>
          </Field>
          <Field>
            <Label>House Rules</Label>
            <Textarea rows={2} value={form.houseRules} onChange={e=>set({houseRules:e.target.value})}
              placeholder="No smoking, quiet hours, cleanup required…"/>
          </Field>
        </SectionCard>
      )}

      {k==='talent' && (
        <SectionCard title="Talent Details" icon={<Info className="w-4 h-4"/>}>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Experience</Label>
              <Input value={form.experience} onChange={e=>set({experience:e.target.value})} placeholder="e.g. 8 years"/>
            </Field>
            <Field>
              <Label>Height (optional)</Label>
              <Input value={form.height} onChange={e=>set({height:e.target.value})} placeholder="e.g. 5'10&quot;"/>
            </Field>
          </div>
          <Field>
            <Label>Skills & Specialties</Label>
            <Textarea rows={3} value={form.skills.join(', ')} onChange={e=>set({skills:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})}
              placeholder="List your skills, separated by commas…"/>
          </Field>
          <Field>
            <Label>Deliverables / What You Offer</Label>
            <Textarea rows={2} value={form.deliverables} onChange={e=>set({deliverables:e.target.value})}
              placeholder="What exactly do clients get when they book you?"/>
          </Field>
        </SectionCard>
      )}

      {k==='job' && (
        <SectionCard title="Job Details" icon={<Info className="w-4 h-4"/>}>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Project Type</Label>
              <Input value={form.projectType} onChange={e=>set({projectType:e.target.value})} placeholder="e.g. Short Film"/>
            </Field>
            <Field>
              <Label>Role Needed</Label>
              <Input value={form.roleNeeded} onChange={e=>set({roleNeeded:e.target.value})} placeholder="e.g. Cinematographer"/>
            </Field>
          </div>
          <Field>
            <Label>Shoot Dates</Label>
            <Input value={form.shootDates} onChange={e=>set({shootDates:e.target.value})} placeholder="e.g. July 15–20, 2025 (flexible)"/>
          </Field>
          <Field>
            <Label>Experience Required</Label>
            <Input value={form.experienceRequired} onChange={e=>set({experienceRequired:e.target.value})} placeholder="e.g. 3+ years, student welcome"/>
          </Field>
          <Field>
            <Label>How to Apply</Label>
            <Textarea rows={3} value={form.applicationProcess} onChange={e=>set({applicationProcess:e.target.value})}
              placeholder="Describe the application process, what to include, deadline…"/>
          </Field>
        </SectionCard>
      )}
    </div>
  );
}

// ── Step 10 — Review & Publish ─────────────────────────────────────────────────
function Step10({ form, onPublish, onSaveDraft, isSubmitting }: {
  form: FormState;
  onPublish: () => void;
  onSaveDraft: () => void;
  isSubmitting: boolean;
}) {
  const allImages=[...form.existingImages,...form.imagePreviews];
  const cover=allImages[0]||null;
  const kindInfo = LISTING_KINDS.find(k=>k.kind===form.kind);

  const score = (() => {
    let pts=0, total=10;
    if(form.kind) pts++;
    if(form.title.trim().length>3) pts++;
    if(form.description.trim().length>20) pts++;
    if(allImages.length>0) pts++;
    if(allImages.length>=3) pts++;
    const hasPrice=form.dailyRate||form.salePrice||form.hourlyRate||form.startingPrice;
    if(hasPrice) pts++;
    if(form.city.trim()) pts++;
    if(form.acceptedPayments.length>0) pts++;
    if(form.tags.length>0) pts++;
    if(form.availableDays.length>0) pts++;
    return Math.round((pts/total)*100);
  })();

  const suggestions: string[] = [];
  const allImages2=[...form.existingImages,...form.imagePreviews];
  if(allImages2.length<3) suggestions.push('Add at least 3 photos for better visibility');
  if(!form.tags.length) suggestions.push('Add tags to help people find your listing');
  if(!form.acceptedPayments.length) suggestions.push('Specify accepted payment methods');
  if(!form.description.trim()) suggestions.push('Write a detailed description');
  if(!form.city.trim()) suggestions.push('Add your location');

  const priceLabel = form.dailyRate ? `$${form.dailyRate}/day`
    : form.salePrice ? `$${form.salePrice}`
    : form.hourlyRate ? `$${form.hourlyRate}/hr`
    : form.startingPrice ? `From $${form.startingPrice}`
    : 'Price TBD';

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black text-gray-900">Review & Publish</h2>
        <p className="text-sm text-gray-500 mt-1">Preview exactly how your listing will appear</p>
      </div>

      {/* Preview card */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
        <div className="relative">
          {cover
            ? <img src={cover} alt="" className="w-full h-48 object-cover"/>
            : <div className="w-full h-48 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center"><ImageIcon className="w-10 h-10 text-gray-300"/></div>
          }
          {kindInfo && (
            <span className="absolute top-3 left-3 bg-black/60 text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
              {kindInfo.label}
            </span>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-bold text-gray-900 text-base line-clamp-2">{form.title||'Untitled Listing'}</h3>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500">
            <span className="font-semibold text-blue-600">{priceLabel}</span>
            {form.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/>{form.city}</span>}
          </div>
          {form.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{form.description}</p>}
          {form.tags.length>0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {form.tags.slice(0,5).map(t=><span key={t} className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">#{t}</span>)}
            </div>
          )}
        </div>
      </div>

      {/* Completion score */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-800">Completion Score</h3>
          <span className={`text-sm font-black ${score>=80?'text-green-600':score>=50?'text-amber-500':'text-red-500'}`}>{score}%</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${score>=80?'bg-green-500':score>=50?'bg-amber-400':'bg-red-400'}`} style={{width:`${score}%`}}/>
        </div>
        {suggestions.length>0 && (
          <div className="mt-4 space-y-2">
            {suggestions.map(s=>(
              <div key={s} className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500"/>
                {s}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3 pb-6">
        <button type="button" onClick={onPublish} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl py-4 transition-colors shadow-lg">
          {isSubmitting
            ? <><Loader2 className="w-4 h-4 animate-spin"/> Publishing…</>
            : <><Zap className="w-4 h-4"/> Publish Listing</>}
        </button>
        <button type="button" onClick={onSaveDraft}
          className="w-full py-3.5 rounded-2xl border-2 border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors">
          Save as Draft
        </button>
      </div>
    </div>
  );
}

// ── Main CreateListing ─────────────────────────────────────────────────────────
export function CreateListing() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setFormRaw] = useState<FormState>(defaultForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  const set = useCallback((updates: Partial<FormState>) => {
    setFormRaw(prev => ({ ...prev, ...updates }));
  }, []);

  // ── Auth guard ──
  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    const type = user?.accountType ?? '';
    if (!['creator_plus', 'professional', 'business'].includes(type)) {
      navigate('/creator-plus-required?type=listings', { replace: true });
    }
  }, [isAuthenticated, user?.accountType]);

  // ── Draft recovery ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only restore non-file fields (Files can't be serialized)
        const { imageFiles, videoFiles, imagePreviews, videoPreviews, ...rest } = parsed;
        void imageFiles; void videoFiles; void imagePreviews; void videoPreviews;
        setFormRaw(prev => ({ ...prev, ...rest, imageFiles: [], videoFiles: [], imagePreviews: [], videoPreviews: [] }));
        if (parsed.step) setStep(parsed.step);
        toast('Draft recovered', { icon: '📋', duration: 3000 });
      }
    } catch {}
  }, []);

  // ── Auto-save (300ms debounce) ──
  useEffect(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      try {
        const { imageFiles, videoFiles, ...serializable } = form;
        void imageFiles; void videoFiles;
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...serializable, step }));
        setLastSaved(new Date());
      } catch {}
    }, 300);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [form, step]);

  const TOTAL_STEPS = 10;
  const progress = Math.round((step / TOTAL_STEPS) * 100);

  const canAdvance = (): boolean => {
    if (step===1) return !!form.kind;
    if (step===2) return !!form.title.trim() && !!form.category && !!form.description.trim();
    if (step===4) {
      const hasPrice=form.dailyRate||form.salePrice||form.hourlyRate||form.startingPrice;
      return !!hasPrice;
    }
    if (step===8) return !!form.city.trim();
    return true;
  };

  const goNext = () => { if (step < TOTAL_STEPS && canAdvance()) setStep(s=>s+1); else if (!canAdvance()) { toast.error('Please complete required fields'); } };
  const goPrev = () => { if (step > 1) setStep(s=>s-1); };

  // ── Build submit payload ──
  const buildPayload = () => {
    const allImages = [...form.existingImages, ...form.imagePreviews];
    const allVideos = [...form.existingVideos, ...form.videoPreviews];

    let listingType: 'gear'|'service' = 'service';
    let listingMode: 'rent'|'sale'|undefined;
    if (form.kind==='equipment-rental') { listingType='gear'; listingMode='rent'; }
    else if (form.kind==='equipment-sale') { listingType='gear'; listingMode='sale'; }

    const price = parseFloat(form.dailyRate||form.salePrice||form.hourlyRate||form.startingPrice||'0')||0;

    const metadata: Record<string,any> = {
      listingKind: form.kind,
      weeklyRate: form.weeklyRate||null,
      monthlyRate: form.monthlyRate||null,
      securityDeposit: form.securityDeposit||null,
      lateFee: form.lateFee||null,
      minDuration: form.minDuration||null,
      cleaningFee: form.cleaningFee||null,
      acceptOffers: form.acceptOffers,
      negotiable: form.negotiable,
      depositRequired: form.depositRequired,
      insuranceRequired: form.insuranceRequired,
      govIdRequired: form.govIdRequired,
      ageRequirement: form.ageRequirement||null,
      agreementRequired: form.agreementRequired,
      usageRules: form.usageRules||null,
      customRequirements: form.customRequirements||null,
      paymentTiming: form.paymentTiming,
      cancellationPolicy: form.cancellationPolicy,
      refundPolicy: form.refundPolicy,
      deliveryAvailable: form.deliveryAvailable,
      pickupAvailable: form.pickupAvailable,
      remoteAvailable: form.remoteAvailable,
      travelAvailable: form.travelAvailable,
      instantBooking: form.instantBooking,
      showExactLocation: form.showExactLocation,
      serviceRadius: form.serviceRadius||null,
      accessories: form.accessories||null,
      specifications: form.specifications||null,
      batteryInfo: form.batteryInfo||null,
      insuranceNotes: form.insuranceNotes||null,
      pickupInstructions: form.pickupInstructions||null,
      turnaroundTime: form.turnaroundTime||null,
      deliverables: form.deliverables||null,
      clientRequirements: form.clientRequirements||null,
      capacity: form.capacity||null,
      squareFootage: form.squareFootage||null,
      parking: form.parking,
      lightingIncluded: form.lightingIncluded,
      powerAccess: form.powerAccess,
      amenities: form.amenities||null,
      houseRules: form.houseRules||null,
      height: form.height||null,
      skills: form.skills.length?form.skills:null,
      projectType: form.projectType||null,
      roleNeeded: form.roleNeeded||null,
      shootDates: form.shootDates||null,
      experienceRequired: form.experienceRequired||null,
      applicationProcess: form.applicationProcess||null,
      pricingPackages: form.pricingPackages.length ? form.pricingPackages : null,
      brand: form.brand||null,
      model: form.model||null,
      subcategory: form.subcategory||null,
    };

    const searchKeywords = [
      form.title, form.category, form.subcategory, form.brand, form.model,
      ...form.tags, form.city, form.province,
    ].filter(Boolean).map(s=>s.toLowerCase()).join(' ');

    return {
      title: form.title.trim(),
      description: form.description.trim(),
      tags: form.tags,
      price,
      city: form.city.trim(),
      street_address: form.streetAddress.trim()||null,
      province: form.province||null,
      postal_code: form.postalCode||null,
      country: form.country||'Canada',
      images: allImages,
      videos: allVideos,
      listing_type: listingType,
      listing_mode: listingMode||null,
      service_category: (form.kind==='creative-service'?form.category?.toLowerCase().replace(/\s+/g,'-'):'other')||'other',
      payment_methods: form.acceptedPayments,
      delivery_options: [
        ...(form.pickupAvailable?['pickup']:[]),
        ...(form.deliveryAvailable?['delivery']:[]),
      ],
      available_days: form.availableDays,
      service_start_time: form.startTime||null,
      service_end_time: form.endTime||null,
      blocked_dates: form.blockedDates.length?form.blockedDates:null,
      requirements: [form.usageRules, form.customRequirements].filter(Boolean).join('\n\n')||null,
      cancellation: form.cancellationPolicy||null,
      working_hours: form.startTime&&form.endTime?`${form.startTime} – ${form.endTime}`:(form.availableDays.join(', ')),
      qualification: form.experience||null,
      metadata,
      search_keywords: searchKeywords,
    };
  };

  const handlePublish = async () => {
    if (!user) return;
    if (!form.title.trim()||!form.city.trim()) { toast.error('Title and city are required'); return; }
    try {
      setIsSubmitting(true);
      const payload = buildPayload();

      // Upload new images
      let imageUrls = [...form.existingImages];
      if (form.imageFiles.length) {
        toast.info('Uploading images…');
        const results = await Promise.all(form.imageFiles.map(f=>listingsApi.uploadImage(f)));
        imageUrls = [...imageUrls, ...results.map((r:any)=>r.imageUrl)];
      }

      // Upload new videos
      let videoUrls = [...form.existingVideos];
      if (form.videoFiles.length) {
        toast.info('Uploading videos…');
        const results = await Promise.all(form.videoFiles.map(f=>listingsApi.uploadVideo(f)));
        videoUrls = [...videoUrls, ...results.map((r:any)=>r.videoUrl)];
      }

      // Direct Supabase insert
      const { data, error } = await supabase.from('listings').insert({
        ...payload,
        images: imageUrls,
        videos: videoUrls,
        user_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
      }).select('id').single();

      if (error) throw new Error(error.message);

      localStorage.removeItem(DRAFT_KEY);
      toast.success('Listing published!', { description: 'Your listing is now live on the marketplace.' });
      navigate(`/listing/${data.id}`);
    } catch (e) {
      // Fallback to edge function
      try {
        const payload = buildPayload();
        const listing = await listingsApi.create({
          title: payload.title, description: payload.description,
          tags: payload.tags, price: payload.price,
          city: payload.city, province: payload.province||undefined,
          postalCode: payload.postal_code||undefined,
          streetAddress: payload.street_address||undefined,
          images: [...form.existingImages,...form.imagePreviews],
          videos: [...form.existingVideos,...form.videoPreviews],
          listingType: payload.listing_type,
          listingMode: payload.listing_mode as any,
          paymentMethods: payload.payment_methods,
          deliveryOptions: payload.delivery_options,
          requirements: payload.requirements||undefined,
          cancellation: payload.cancellation||undefined,
          workingHours: payload.working_hours||undefined,
          qualification: payload.qualification||undefined,
        } as any);
        localStorage.removeItem(DRAFT_KEY);
        toast.success('Listing published!');
        navigate(`/listing/${listing.id}`);
      } catch (fallback) {
        toast.error(fallback instanceof Error ? fallback.message : 'Failed to publish. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = () => {
    try {
      const { imageFiles, videoFiles, ...serializable } = form;
      void imageFiles; void videoFiles;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...serializable, step }));
      setLastSaved(new Date());
      toast.success('Draft saved!');
    } catch { toast.error('Failed to save draft'); }
  };

  if (!isAuthenticated || !user) return null;

  const renderStep = () => {
    switch (step) {
      case 1:  return <Step1 form={form} set={set} onNext={goNext}/>;
      case 2:  return <Step2 form={form} set={set}/>;
      case 3:  return <Step3 form={form} set={set}/>;
      case 4:  return <Step4 form={form} set={set}/>;
      case 5:  return <Step5 form={form} set={set}/>;
      case 6:  return <Step6 form={form} set={set}/>;
      case 7:  return <Step7 form={form} set={set}/>;
      case 8:  return <Step8 form={form} set={set}/>;
      case 9:  return <Step9 form={form} set={set}/>;
      case 10: return <Step10 form={form} onPublish={handlePublish} onSaveDraft={handleSaveDraft} isSubmitting={isSubmitting}/>;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => step>1?goPrev():navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5"/>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <h1 className="text-sm font-bold text-gray-900">Create Listing</h1>
              <div className="flex items-center gap-2">
                {lastSaved && <span className="text-[10px] text-gray-400 hidden sm:block">✓ Saved {lastSaved.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>}
                <button onClick={handleSaveDraft}
                  className="text-[11px] font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors hidden sm:block">
                  Save Draft
                </button>
              </div>
            </div>
            {/* Progress bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{width:`${progress}%`}}/>
              </div>
              <span className="text-[10px] font-bold text-gray-500 shrink-0">Step {step}/{TOTAL_STEPS}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-5xl mx-auto flex">
        {/* Desktop left step nav */}
        <aside className="hidden md:flex w-52 shrink-0 flex-col pt-6 pb-32 sticky top-[73px] h-[calc(100vh-73px)] overflow-y-auto">
          <div className="px-4 space-y-1">
            {STEP_LABELS.map((label, i) => {
              const s = i+1;
              const done = s < step;
              const active = s === step;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => s<=step?setStep(s):undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-all ${
                    active ? 'bg-blue-600 text-white font-bold'
                    : done  ? 'text-gray-600 hover:bg-gray-100 cursor-pointer'
                    :         'text-gray-300 cursor-default'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black ${
                    active?'bg-white text-blue-600':done?'bg-green-500 text-white':'bg-gray-200 text-gray-400'
                  }`}>
                    {done?<Check className="w-3 h-3"/>:s}
                  </div>
                  <span className={active?'font-bold':done?'font-semibold':''}>{label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main form area */}
        <main className="flex-1 px-4 pt-6 pb-32 md:pb-12 min-w-0">
          <div className="max-w-xl mx-auto">
            {renderStep()}
          </div>
        </main>
      </div>

      {/* ── Mobile sticky bottom nav ── */}
      {step < 10 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 px-4 py-3 md:hidden">
          <div className="flex gap-3">
            <button type="button" onClick={goPrev} disabled={step===1}
              className="flex items-center gap-1.5 px-5 py-3 rounded-2xl border-2 border-gray-200 text-gray-700 font-semibold text-sm disabled:opacity-30 transition-all hover:bg-gray-50 active:scale-95">
              <ChevronLeft className="w-4 h-4"/> Back
            </button>
            <button type="button" onClick={goNext}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all active:scale-95 shadow-sm">
              Next <ChevronRight className="w-4 h-4"/>
            </button>
          </div>
        </div>
      )}

      {/* Desktop bottom nav for steps 1-9 */}
      {step < 10 && (
        <div className="hidden md:block fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 px-4 py-3">
          <div className="max-w-5xl mx-auto flex justify-between items-center">
            <button type="button" onClick={goPrev} disabled={step===1}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-sm disabled:opacity-30 transition-all hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4"/> Back
            </button>
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleSaveDraft}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors">
                Save Draft
              </button>
              <button type="button" onClick={goNext}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all shadow-sm">
                Next <ChevronRight className="w-4 h-4"/>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
