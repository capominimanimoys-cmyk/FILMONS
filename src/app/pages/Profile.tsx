import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useT } from '../lib/i18n';
import { useAuth } from '../context/AuthContext';
import { SoundEditSheet } from '../components/SoundEditSheet';
import { MusicBrowser } from '../components/MusicBrowser';
import { SoundTrimSheet } from '../components/SoundTrimSheet';
import { supabase } from '../../lib/supabase';
import { usePostStore } from '../context/PostContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { useNavigate, Link, useSearchParams } from 'react-router';
import {
  Star, StarOff, MapPin, ShieldCheck, Loader2, Camera,
  Globe, Link as LinkIcon, X, Settings, Bookmark,
  FileText, ThumbsUp, Package, Info, Grid3X3,
  Plus, Trash2, ChevronDown, ChevronUp, Check,
  Instagram, Youtube, Edit3, Share2, QrCode, Repeat2,
  Film, Music2, User, ExternalLink, MoreVertical,
} from 'lucide-react';
import { reviewsApi, listingsApi, postsApi, savedPostsApi } from '../lib/api';
import { authApi } from '../lib/api';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { Review, Listing, Post } from '../types';
import { toast } from 'sonner';
import { UserAvatar, AccountTypeBadge } from '../components/AccountTypeBadge';
import { PostCard } from '../components/PostCard';
import { ReliabilityCard, ReliabilityBadge } from '../components/ReliabilityScore';
import { reliabilityApi, ReputationScore, isCreatorPlus } from '../lib/reliabilityApi';
import { AvatarActionSheet, AvatarFullScreen } from '../components/AvatarActionSheet';
import { ProfileQRCode } from '../components/ProfileQRCode';
import { PostComposer } from '../components/PostComposer';
import { ListingCard } from '../components/ListingCard';
import { FollowersModal } from '../components/FollowersModal';
import { AboutEditor } from '../components/AboutEditor';
import { AddPortfolioItemSheet } from '../components/AddPortfolioItemSheet';
import { getPortfolioItems, deletePortfolioItem, toggleFeatured, type PortfolioItem } from '../lib/portfolioApi';

// ── Data ────────────────────────────────────────────────────────────────────
// V1: marketplace-focused tabs only. Feed/social tabs are planned for V2.
type Tab = 'portfolio' | 'listings' | 'reviews' | 'about' | 'liked';

const TAB_IDS: Tab[] = ['portfolio', 'listings', 'reviews', 'about', 'liked'];

const ROLE_CATEGORIES = [
  { label: 'Film & Video', roles: ['Director','Cinematographer','Camera Operator','Gaffer','Grip','Producer','Video Editor','Colorist','VFX Artist','Sound Designer'] },
  { label: 'Photography',  roles: ['Photographer','Fashion Photographer','Retoucher','Studio Manager','Drone Photographer'] },
  { label: 'Music & Audio',roles: ['Music Producer','Beatmaker','Mixing Engineer','DJ','Composer'] },
  { label: 'Social Media', roles: ['Content Creator','UGC Creator','YouTuber','Streamer','Podcast Producer'] },
  { label: 'Design',       roles: ['Graphic Designer','UI Designer','Motion Designer','Creative Director'] },
  { label: 'Animation/3D', roles: ['3D Animator','Unreal Engine Artist','Blender Artist','Technical Artist'] },
  { label: 'Writing',      roles: ['Screenwriter','Copywriter','Story Editor','Narrative Designer'] },
  { label: 'Fashion',      roles: ['Fashion Designer','Makeup Artist','Stylist','Hair Stylist'] },
  { label: 'Marketing',    roles: ['Brand Strategist','Campaign Manager','Media Buyer','PR Specialist'] },
  { label: 'Game Dev',     roles: ['Game Designer','Character Artist','Level Designer'] },
  { label: 'Performing',   roles: ['Actor','Voice Actor','Dancer','Choreographer'] },
  { label: 'Architecture', roles: ['Architect','Interior Designer','Exhibition Designer'] },
  { label: 'Emerging',     roles: ['AI Artist','Prompt Engineer','XR Designer','Virtual Production Artist'] },
];

const SKILL_CATEGORIES = [
  { label:'Video & Film', skills:['Cinematic Filming','Storytelling','Video Editing','Color Grading','Drone Filming','Documentary Shooting','Music Video Creation','Lighting Techniques','Sound Recording','Directing','Screenwriting','Storyboarding','Short-form Content','Livestream Production'] },
  { label:'Photography',  skills:['Portrait Photography','Street Photography','Fashion Photography','Product Photography','Real Estate Photography','Travel Photography','Photo Retouching','Studio Lighting','Drone Photography','Nature Photography','Event Coverage'] },
  { label:'Design',       skills:['Graphic Design','Branding','Typography','Illustration','Poster Design','UI Design','UX Design','Motion Graphics','Digital Painting','Character Design','3D Art','Concept Art','AI Art Generation'] },
  { label:'Music & Audio',skills:['Beatmaking','Music Production','Songwriting','Mixing','Mastering','DJing','Sound Design','Podcast Editing','Audio Engineering','Voice Acting','Soundtrack Creation'] },
  { label:'Writing',      skills:['Creative Writing','Screenwriting','Poetry','Blogging','Journalism','Copywriting','Worldbuilding','Lyric Writing','Comic Writing','Spoken Word'] },
  { label:'Social Media', skills:['Content Creation','UGC Creation','TikTok Editing','YouTube Content','Streaming','Personal Branding','Thumbnail Design','Social Media Strategy','Podcast Hosting'] },
  { label:'Gaming',       skills:['Gaming','Esports','Game Modding','VR Gaming','Level Design','Fan Art Creation','Cosplay','Game Photography'] },
  { label:'Performance',  skills:['Acting','Dancing','Choreography','Public Speaking','Comedy','Improvisation','Hosting','Live Performance'] },
  { label:'Emerging',     skills:['AI Prompt Engineering','AI Video Generation','Virtual Production','AR Filter Creation','XR Design','Digital Fashion','Generative Art','Immersive Storytelling'] },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function resizeImage(file: File, maxW = 800): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = url;
  });
}


// ── Cover action sheet ───────────────────────────────────────────────────────
function CoverActionSheet({ coverImg, onChangePhoto, onRemove, onClose }: {
  coverImg?: string;
  onChangePhoto: (f: File) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [showPicker, setShowPicker] = useState(false);

  const SPRING = { type: 'spring' as const, damping: 32, stiffness: 340, mass: 0.9 };

  if (showPicker) return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPicker(false)} />
        <motion.div
          className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom)+8px)' }}
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={SPRING}
        >
          <div className="w-9 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1"/>
          <p className="text-center text-sm font-black text-gray-900 mt-2 mb-3">Choose method</p>
          <div className="px-4 pb-2 space-y-2">
            <button onClick={()=>cameraRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl text-sm font-semibold text-gray-800 hover:bg-gray-50">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><Camera className="w-5 h-5 text-blue-600"/></div>Take a photo
            </button>
            <button onClick={()=>uploadRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl text-sm font-semibold text-gray-800 hover:bg-gray-50">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center"><Globe className="w-5 h-5 text-purple-600"/></div>Upload from library
            </button>
          </div>
          <button onClick={()=>setShowPicker(false)} className="mx-4 mt-2 mb-1 w-[calc(100%-32px)] py-3.5 rounded-2xl bg-gray-100 text-gray-700 text-sm font-bold">Cancel</button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f){onChangePhoto(f);onClose();}}}/>
          <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f){onChangePhoto(f);onClose();}}}/>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
        <motion.div
          className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom)+8px)' }}
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={SPRING}
        >
          <div className="w-9 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1"/>
          <div className="px-4 pt-2 pb-2 space-y-1">
            <button onClick={()=>setShowPicker(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-2xl hover:bg-gray-50 text-left">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><Camera className="w-5 h-5 text-blue-600"/></div>
              <div><p className="text-sm font-semibold text-gray-900">{coverImg ? 'Change cover picture' : 'Add cover picture'}</p><p className="text-[11px] text-gray-400">Take or upload a photo</p></div>
            </button>
            {coverImg && (
              <button onClick={onRemove} className="w-full flex items-center gap-3 px-2 py-3 rounded-2xl hover:bg-gray-50 text-left">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center"><Trash2 className="w-5 h-5 text-red-500"/></div>
                <div><p className="text-sm font-semibold text-red-500">Remove cover picture</p><p className="text-[11px] text-gray-400">Revert to default gradient</p></div>
              </button>
            )}
          </div>
          <button onClick={onClose} className="mx-4 mt-2 mb-1 w-[calc(100%-32px)] py-3.5 rounded-2xl bg-gray-100 text-gray-700 text-sm font-bold">Cancel</button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Canadian location search ─────────────────────────────────────────────────
const CA_CITIES = [
  'Toronto, ON','Montreal, QC','Vancouver, BC','Calgary, AB','Edmonton, AB',
  'Ottawa, ON','Winnipeg, MB','Quebec City, QC','Hamilton, ON','Kitchener, ON',
  'London, ON','Victoria, BC','Halifax, NS','Oshawa, ON','Windsor, ON',
  'Saskatoon, SK','Regina, SK','Sherbrooke, QC','St. Catharines, ON',
  'Kelowna, BC','Barrie, ON','Abbotsford, BC','Sudbury, ON','Kingston, ON',
  'Saguenay, QC','Trois-Rivières, QC','Guelph, ON','Moncton, NB','Brantford, ON',
  'Saint John, NB','Thunder Bay, ON','Fredericton, NB','Red Deer, AB','Lethbridge, AB',
  'Kamloops, BC','Nanaimo, BC','Burnaby, BC','Surrey, BC','Mississauga, ON',
  'Brampton, ON','Markham, ON','Richmond Hill, ON','Vaughan, ON','Oakville, ON',
  'Burlington, ON','Richmond, BC','Laval, QC','Longueuil, QC','Gatineau, QC',
];

function CanadianLocationField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => { setQuery(value); }, [value]);

  const handleInput = (v: string) => {
    setQuery(v);
    if (v.length > 1) {
      setSuggestions(CA_CITIES.filter(c => c.toLowerCase().includes(v.toLowerCase())).slice(0, 6));
    } else {
      setSuggestions([]);
    }
  };

  const detect = () => {
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&countrycodes=ca`);
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village || '';
          const province = data.address?.state || '';
          const short = province.replace('Ontario','ON').replace('British Columbia','BC').replace('Quebec','QC').replace('Alberta','AB').replace('Manitoba','MB').replace('Saskatchewan','SK').replace('Nova Scotia','NS').replace('New Brunswick','NB').replace('Newfoundland and Labrador','NL').replace('Prince Edward Island','PE').replace('Northwest Territories','NT').replace('Nunavut','NU').replace('Yukon','YT');
          const loc = city ? `${city}, ${short}` : '';
          setQuery(loc); onChange(loc);
        } catch { toast.error('Could not determine location'); }
        setDetecting(false);
      },
      () => { toast.error('Location access denied'); setDetecting(false); },
      { timeout: 8000 }
    );
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input value={query} onChange={e => handleInput(e.target.value)}
          onBlur={() => { onChange(query); setSuggestions([]); }}
          placeholder="e.g. Montreal, QC"
          className="input-field flex-1"
        />
        <button type="button" onClick={detect}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors shrink-0 border border-blue-200"
          title="Detect my location">
          {detecting ? <Loader2 className="w-4 h-4 animate-spin"/> : <MapPin className="w-4 h-4"/>}
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
          {suggestions.map(s => (
            <button key={s} type="button"
              onMouseDown={() => { setQuery(s); onChange(s); setSuggestions([]); }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-center gap-2">
              <MapPin className="w-3 h-3 text-gray-400 shrink-0"/> {s}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-0.5 flex-wrap">Canada only · Start typing or tap <MapPin className="inline w-3 h-3"/> to detect</p>
    </div>
  );
}

// ── Calendar date picker ─────────────────────────────────────────────────────
function CalendarPicker({ value, onChange, maxDate }: { value: string; onChange: (d: string) => void; maxDate?: string }) {
  const today   = new Date();
  const initYear  = value ? parseInt(value.slice(0,4)) : today.getFullYear() - 25;
  const initMonth = value ? parseInt(value.slice(5,7)) - 1 : today.getMonth();
  const [viewYear,  setViewYear]  = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);
  const [selected, setSelected]   = useState(value);
  const [showYear,  setShowYear]  = useState(false);

  const daysInMonth   = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay      = new Date(viewYear, viewMonth, 1).getDay();
  const monthName     = new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long' });
  const maxD          = maxDate ? new Date(maxDate) : today;
  const years         = Array.from({ length: 100 }, (_, i) => today.getFullYear() - i);

  const toISO = (y: number, m: number, d: number) =>
    `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  const handleSelect = (day: number) => {
    const iso = toISO(viewYear, viewMonth, day);
    const d   = new Date(viewYear, viewMonth, day);
    if (d > maxD) return;
    setSelected(iso);
    onChange(iso);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden">
      {/* Month/Year nav */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
        <button type="button" onClick={() => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); }}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 font-bold text-lg">‹</button>
        <button type="button" onClick={() => setShowYear(!showYear)}
          className="text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors">
          {monthName} {viewYear}
        </button>
        <button type="button" onClick={() => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); }}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 font-bold text-lg">›</button>
      </div>

      {/* Year picker */}
      {showYear && (
        <div className="max-h-40 overflow-y-auto grid grid-cols-4 gap-1 p-3 bg-white border-b border-gray-100">
          {years.map(y => (
            <button key={y} type="button"
              onClick={() => { setViewYear(y); setShowYear(false); }}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-colors ${y===viewYear?'bg-blue-600 text-white':'hover:bg-gray-100 text-gray-700'}`}>
              {y}
            </button>
          ))}
        </div>
      )}

      {/* Day headers */}
      <div className="grid grid-cols-7 px-3 pt-3 pb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-gray-400">{d}</div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 px-3 pb-3 gap-0.5">
        {Array.from({length: firstDay}).map((_,i) => <div key={`e${i}`}/>)}
        {Array.from({length: daysInMonth}).map((_,i) => {
          const day = i+1;
          const iso = toISO(viewYear, viewMonth, day);
          const d   = new Date(viewYear, viewMonth, day);
          const future = d > maxD;
          const isSel  = iso === selected;
          return (
            <button key={day} type="button" disabled={future}
              onClick={() => handleSelect(day)}
              className={`aspect-square rounded-xl text-xs font-semibold transition-all flex items-center justify-center ${
                isSel ? 'bg-blue-600 text-white shadow-sm' :
                future ? 'text-gray-200 cursor-not-allowed' :
                'hover:bg-blue-50 hover:text-blue-700 text-gray-700'
              }`}>
              {day}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100">
          <p className="text-xs text-blue-700 font-semibold text-center">
            Selected: {new Date(selected+'T12:00:00').toLocaleDateString('en-CA',{month:'long',day:'numeric',year:'numeric'})}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Small sub-components ────────────────────────────────────────────────────
function ExpandableCategory({ label, items, selected, onToggle }: {
  label: string; items: string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasSelected = items.some(i => selected.includes(i));
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-left transition-colors ${hasSelected ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
        <span>{label} {hasSelected && <span className="text-xs font-bold text-blue-500">({items.filter(i=>selected.includes(i)).length})</span>}</span>
        {open ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
      </button>
      {open && (
        <div className="px-3 py-2 bg-gray-50 flex flex-wrap gap-1.5 border-t border-gray-100">
          {items.map(item => {
            const on = selected.includes(item);
            return (
              <button key={item} type="button" onClick={() => onToggle(item)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${on ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                {on && <Check className="w-2.5 h-2.5 inline mr-1" />}{item}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Portfolio card ───────────────────────────────────────────────────────────
function PortfolioCard({ item, userId, onTap, onToggleFeatured, onDelete }: {
  item: PortfolioItem;
  userId: string;
  onTap: () => void;
  onToggleFeatured: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwn = item.user_id === userId;

  const thumb = item.thumbnail_url || item.media_url;
  const isVideo = item.media_type === 'video';
  const isAudio = item.media_type === 'audio';
  const isLink  = item.media_type === 'link';

  return (
    <div className="relative rounded-2xl overflow-hidden bg-gray-100 cursor-pointer aspect-square group"
      onClick={onTap}>
      {/* Thumbnail */}
      {thumb && !isAudio && !isLink ? (
        <img src={thumb} alt={item.title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center"
          style={{ background: isAudio ? 'linear-gradient(135deg,#1e1040,#312e81)' : 'linear-gradient(135deg,#f0f4ff,#e0e7ff)' }}>
          {isAudio ? <Music2 className="w-10 h-10 text-purple-300"/> : isLink ? <LinkIcon className="w-10 h-10 text-indigo-400"/> : <FileText className="w-10 h-10 text-indigo-300"/>}
        </div>
      )}

      {/* Video badge */}
      {isVideo && (
        <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
      )}

      {/* Featured badge */}
      {item.is_featured && (
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center">
          <Star className="w-3 h-3 fill-white text-white"/>
        </div>
      )}

      {/* Bottom overlay */}
      <div className="absolute inset-x-0 bottom-0 p-2"
        style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 100%)' }}>
        <p className="text-white text-[11px] font-black truncate">{item.title}</p>
        {item.category && <p className="text-white/60 text-[9px] truncate">{item.category}</p>}
      </div>

      {/* Owner menu */}
      {isOwn && (
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 hidden group-hover:flex items-center justify-center"
        >
          <MoreVertical className="w-4 h-4 text-white" />
        </button>
      )}

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setMenuOpen(false); }} />
          <div className="absolute top-10 right-2 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-w-[140px]"
            onClick={e => e.stopPropagation()}>
            <button onClick={() => { setMenuOpen(false); onToggleFeatured(); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-800 hover:bg-gray-50">
              {item.is_featured
                ? <StarOff className="w-3.5 h-3.5 text-gray-400"/>
                : <Star className="w-3.5 h-3.5 text-amber-500"/>}
              {item.is_featured ? 'Unfeature' : 'Feature'}
            </button>
            <button onClick={() => { setMenuOpen(false); if (window.confirm('Delete this portfolio item?')) onDelete(); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-500 hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Portfolio detail sheet ────────────────────────────────────────────────────
function PortfolioDetailSheet({ item, onClose }: { item: PortfolioItem; onClose: () => void }) {
  const isVideo = item.media_type === 'video';
  const isAudio = item.media_type === 'audio';
  const isLink  = item.media_type === 'link';

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/70" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[61] bg-white rounded-t-3xl overflow-hidden"
        style={{ maxHeight: '92vh', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Media */}
        {isVideo && item.media_url && (
          <video src={item.media_url} controls playsInline className="w-full max-h-64 bg-black object-contain" />
        )}
        {!isVideo && !isAudio && !isLink && (item.thumbnail_url || item.media_url) && (
          <img src={item.thumbnail_url || item.media_url} alt={item.title} className="w-full max-h-72 object-cover" />
        )}
        {isAudio && item.media_url && (
          <div className="px-4 py-6 flex flex-col items-center gap-3"
            style={{ background: 'linear-gradient(135deg,#1e1040,#312e81)' }}>
            <Music2 className="w-12 h-12 text-purple-300"/>
            <audio controls src={item.media_url} className="w-full" />
          </div>
        )}

        {/* Info */}
        <div className="px-4 pt-4 pb-6 space-y-3">
          {item.is_featured && <span className="flex items-center gap-1 text-xs font-black text-amber-500"><Star className="w-3 h-3 fill-amber-400 text-amber-400"/> Featured Work</span>}
          <h2 className="text-xl font-black text-gray-900">{item.title}</h2>
          {item.description && <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>}

          <div className="flex flex-wrap gap-2">
            {item.category && <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-medium">{item.category}</span>}
            {item.role    && <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{item.role}</span>}
            {item.year    && <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{item.year}</span>}
          </div>

          {isLink && item.external_link && (
            <a href={item.external_link} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 px-4 py-3 rounded-2xl">
              <ExternalLink className="w-4 h-4"/> Open Link
            </a>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Profile ─────────────────────────────────────────────────────────────
export function Profile() {
  const { user, isAuthenticated, updateUser } = useAuth();
  const T = useT();
  const TABS: { id: Tab; label: string }[] = [
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'listings',  label: T('profile.listings_tab') || 'Listings' },
    { id: 'reviews',   label: T('profile.reviews')      || 'Reviews'  },
    { id: 'about',     label: T('profile.about')        || 'About'    },
    { id: 'liked',     label: 'Liked' },
  ];
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getAllPosts, mergePosts, updatePost } = usePostStore();

  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab') as Tab;
    return TABS.find(x => x.id === t) ? t : 'portfolio';
  });

  // Content state
  const [posts,         setPosts]         = useState<Post[]>([]);
  const [taggedPosts,   setTaggedPosts]   = useState<Post[]>([]);
  const [repostedPosts, setRepostedPosts] = useState<Post[]>([]);
  const [repostersMap,  setRepostersMap]  = useState<Record<string, any[]>>({});
  const [sheetReposters, setSheetReposters] = useState<any[] | null>(null);
  const [loadingTagged, setLoadingTagged] = useState(false);
  const [loadingReposts,setLoadingReposts]= useState(false);
  const [listings,      setListings]      = useState<Listing[]>([]);
  const [likedPosts,    setLikedPosts]    = useState<Post[]>([]);
  const [savedPosts,    setSavedPosts]    = useState<Post[]>([]);
  const [userSounds,    setUserSounds]    = useState<any[]>([]);
  const [favSounds,     setFavSounds]     = useState<any[]>([]);
  const [loadingSnds,   setLoadingSnds]   = useState(false);
  const [editingSound,  setEditingSound]  = useState<any|null>(null);
  const [trimmingSound,    setTrimmingSound]    = useState<any|null>(null);
  const [showMusicUploader, setShowMusicUploader] = useState(false);
  const [savedListings,   setSavedListings]   = useState<any[]>([]);
  const [likedCreators,   setLikedCreators]   = useState<any[]>([]);
  const [reviews,       setReviews]       = useState<Review[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showCompose,      setShowCompose]      = useState(false);
  const [showAvatarSheet,  setShowAvatarSheet]  = useState(false);
  const [rep,              setRep]              = useState<ReputationScore | null>(null);
  const [showRentalBadge,  setShowRentalBadge]  = useState<boolean>(() => {
    try { const p = JSON.parse(localStorage.getItem('fm_badge_prefs') || '{}'); return p.show_rental_badge ?? true; }
    catch { return true; }
  });
  const [showCreatorBadge, setShowCreatorBadge] = useState<boolean>(() => {
    try { const p = JSON.parse(localStorage.getItem('fm_badge_prefs') || '{}'); return p.show_identity_badge ?? true; }
    catch { return true; }
  });
  const [showCoverSheet,   setShowCoverSheet]   = useState(false);
  const [showAvatarFull,   setShowAvatarFull]   = useState(false);
  const [showQR,           setShowQR]           = useState(false);
  const [showFollowers,    setShowFollowers]    = useState<'followers'|'following'|null>(null);
  const [followerUsers,    setFollowerUsers]    = useState<any[]>([]);
  const [followingUsers,   setFollowingUsers]   = useState<any[]>([]);

  // Media upload
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef  = useRef<HTMLInputElement>(null);
  const [coverImg,       setCoverImg]       = useState<string>('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover,  setUploadingCover]  = useState(false);

  // About form state
  const [aboutSaving,    setAboutSaving]    = useState(false);
  const [editEmail,      setEditEmail]      = useState(false);
  const [editPhone,      setEditPhone]      = useState(false);
  const [newEmail,       setNewEmail]       = useState('');
  const [newPhone,       setNewPhone]       = useState('');
  const [otpCode,        setOtpCode]        = useState('');
  const [otpSent,        setOtpSent]        = useState(false);
  const [otpVerifying,   setOtpVerifying]   = useState(false);
  const [otpField,       setOtpField]       = useState<'email'|'phone'|null>(null);
  const [newBirthdate,   setNewBirthdate]   = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username,    setUsername]    = useState('');
  const [bio,         setBio]         = useState('');
  const [location,    setLocation]    = useState(''); // full location string e.g. 'Montréal, QC'
  const [website,     setWebsite]     = useState('');
  const [instagram,   setInstagram]   = useState('');
  const [youtube,     setYoutube]     = useState('');
  const [tiktok,      setTiktok]      = useState('');
  const [primaryRole, setPrimaryRole] = useState('');
  const [secondaryRoles, setSecondaryRoles] = useState<string[]>([]);
  const [skills,      setSkills]      = useState<string[]>([]);
  const [gear,        setGear]        = useState<string[]>([]);
  const [gearInput,   setGearInput]   = useState('');
  const [yearsExp,    setYearsExp]    = useState('');
  const [collab,      setCollab]      = useState<string[]>([]);

  // Auth guard
  // Sync badge prefs from settings page (localStorage bridge)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'fm_badge_prefs' && e.newValue) {
        try {
          const p = JSON.parse(e.newValue);
          setShowRentalBadge(p.show_rental_badge ?? true);
          setShowCreatorBadge(p.show_identity_badge ?? true);
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!isAuthenticated && !user) {
      const t = setTimeout(() => { if (!isAuthenticated) navigate('/login'); }, 600);
      return () => clearTimeout(t);
    }
    if (user) {
      load(); initAboutForm();
      reliabilityApi.getScore(user.id).then(setRep).catch(()=>{});
      // Load badge visibility prefs
      import('../lib/settingsApi').then(({ reputationSettingsApi }) => {
        reputationSettingsApi.load(user.id).then((s: any) => {
          setShowRentalBadge(s.show_rental_badge ?? true);
          setShowCreatorBadge(s.show_identity_badge ?? true);
          localStorage.setItem('fm_badge_prefs', JSON.stringify({
            show_rental_badge: s.show_rental_badge ?? true,
            show_identity_badge: s.show_identity_badge ?? true,
          }));
        }).catch(() => {});
      });
    }
  }, [isAuthenticated, user?.id]);

  // Sync tab from URL
  useEffect(() => {
    const t = searchParams.get('tab') as Tab;
    if (t && TABS.find(x => x.id === t)) setTab(t);
  }, [searchParams.get('tab')]);

  function initAboutForm() {
    if (!user) return;
    setDisplayName(user.name || '');
    setUsername(user.username || '');
    setBio(user.bio || '');
    setLocation(user.city ? (user.province ? `${user.city}, ${user.province}` : user.city) : (user as any).location || '');
    setWebsite((user as any).website || '');
    setCoverImg((user as any).coverPhoto || '');
    const meta = (user as any).profileMeta || {};
    setInstagram((user as any).instagram || meta.instagram || '');
    setYoutube((user as any).youtube    || meta.youtube    || '');
    setTiktok((user as any).tiktok      || meta.tiktok     || '');
    setLocation((user as any).location  || user.city ? `${user.city}${user.province ? ', ' + user.province : ''}` : '');
    setPrimaryRole((user as any).primaryRole    || meta.primaryRole    || '');
    setSecondaryRoles((user as any).secondaryRoles || meta.secondaryRoles || []);
    setSkills((user as any).skills     || meta.skills     || []);
    setGear((user as any).gear         || meta.gear       || []);
    setYearsExp(String((user as any).years_exp || meta.yearsExp || ''));
    setCollab((user as any).collabPrefs || meta.collab    || []);
  }

  const [portfolioItems,   setPortfolioItems]   = useState<PortfolioItem[]>([]);
  const [showAddPortfolio, setShowAddPortfolio] = useState(false);
  const [portfolioDetail,  setPortfolioDetail]  = useState<PortfolioItem | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const [myPosts, myListings, myReviews, myPortfolio] = await Promise.all([
        postsApi.getUserPosts(user.id).catch(() => []),
        listingsApi.getUserListings(user.id).catch(() => []),
        reviewsApi.getUserReviews(user.id).catch(() => []),
        getPortfolioItems(user.id).catch(() => []),
      ]);
      setPosts(myPosts);
      setListings(myListings);
      setReviews(myReviews);
      setPortfolioItems(myPortfolio);
      mergePosts(myPosts);
    } finally { setLoading(false); }
  }

  async function loadLiked() {
    const all = getAllPosts();
    setLikedPosts(all.filter(p => p?.userName && p.likes?.includes(user!.id)));
  }

  async function loadSaved() {
    if (!user) return;
    const sp = await savedPostsApi.getSaved(user.id).catch(() => []);
    setSavedPosts(sp.filter((p: any) => p?.id && p?.userName));
    const [listingFavs, creatorFavs] = await Promise.all([
      supabase.from('favorites').select('*')
        .eq('user_id', user.id).eq('item_type', 'listing').order('created_at', { ascending: false })
        .then(r => r.data || [], () => []),
      supabase.from('favorites').select('*')
        .eq('user_id', user.id).eq('item_type', 'creator').order('created_at', { ascending: false })
        .then(r => r.data || [], () => []),
    ]);
    setSavedListings(listingFavs);
    setLikedCreators(creatorFavs);
  }

  const SOUNDS_CACHE_KEY = user?.id ? `filmons_sounds_${user.id}` : null;

  const loadSounds = async () => {
    if (!user?.id) return;

    // 1. Show cache instantly
    try {
      const raw = localStorage.getItem(`filmons_sounds_${user.id}`);
      if (raw) {
        const cached = JSON.parse(raw);
        setUserSounds(cached.pub ?? []);
        setFavSounds(cached.fav ?? []);
      }
    } catch {}

    // 2. Refresh from Supabase in background
    setLoadingSnds(true);
    const [{ data: pub }, { data: fav }] = await Promise.all([
      supabase
        .from('user_sounds')
        .select('id, title, description, category, file_url, artwork_url, duration_sec, use_count, fp_earned, copyright_status, visibility, is_original, snippet_start, snippet_end')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('saved_user_sounds')
        .select('user_sounds(id, title, category, file_url, artwork_url, duration_sec, use_count)')
        .eq('user_id', user.id),
    ]);
    const freshPub = pub ?? [];
    const freshFav = (fav ?? []).map((r: any) => r.user_sounds).filter(Boolean);
    setUserSounds(freshPub);
    setFavSounds(freshFav);
    setLoadingSnds(false);
    // Update cache
    try {
      localStorage.setItem(`filmons_sounds_${user.id}`, JSON.stringify({ pub: freshPub, fav: freshFav }));
    } catch {}
  };

  // V2: loadLiked / loadSaved / loadSounds / loadTagged / loadReposts remain available
  // but are not triggered by any V1 tab.
  useEffect(() => { /* V2 social tabs hooked here */ }, [tab]); // eslint-disable-line

  const loadTagged = async () => {
    if (!user?.id) return;
    setLoadingTagged(true);
    // Posts where user is tagged via post_user_tags
    const { data: tagRows } = await supabase
      .from('post_user_tags')
      .select('post_id')
      .eq('user_id', user.id);
    const postIds = (tagRows ?? []).map((r: any) => r.post_id).filter(Boolean);
    if (postIds.length) {
      const { data } = await supabase
        .from('posts')
        .select('*, profiles!author_id(id,name,username,avatar_url,account_type)')
        .in('id', postIds)
        .order('created_at', { ascending: false });
      setTaggedPosts((data ?? []).map((row: any) => ({
        ...row, userId: row.author_id,
        userName: row.profiles?.name || row.profiles?.username || '',
        userAvatar: row.profiles?.avatar_url,
        images: Array.isArray(row.media_urls) ? row.media_urls : [],
      })));
    } else {
      setTaggedPosts([]);
    }
    setLoadingTagged(false);
  };

  const loadReposts = async () => {
    if (!user?.id) return;
    setLoadingReposts(true);
    try {
      // Step 1: get reposted post IDs in order
      const { data: repostRows } = await supabase
        .from('reposts')
        .select('post_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (!repostRows?.length) { setRepostedPosts([]); return; }
      const postIds = repostRows.map((r: any) => r.post_id);

      // Step 2: fetch the original posts
      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .in('id', postIds);
      if (!postsData?.length) { setRepostedPosts([]); return; }

      // Step 3: batch-fetch author profiles
      const authorIds = [...new Set(postsData.map((p: any) => p.author_id).filter(Boolean))];
      const profileMap: Record<string, any> = {};
      if (authorIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, username, avatar_url, account_type')
          .in('id', authorIds);
        (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });
      }

      // Step 4: normalize to Post shape (same as feed)
      const normalized: Post[] = postsData.map((p: any) => {
        const prof = profileMap[p.author_id] || {};
        const meta = (typeof p.metadata === 'string'
          ? (() => { try { return JSON.parse(p.metadata); } catch { return {}; } })()
          : p.metadata) ?? {};
        const images = Array.isArray(p.images) ? p.images
          : Array.isArray(p.media_urls) ? p.media_urls : [];
        return {
          id:                 p.id,
          userId:             p.author_id,
          userName:           prof.name || prof.username || '',
          userAvatar:         prof.avatar_url || undefined,
          userAccountType:    prof.account_type || undefined,
          content:            p.content || '',
          images,
          videos:             Array.isArray(p.videos) ? p.videos : [],
          likes:              Array.isArray(p.likes)  ? p.likes  : [],
          likesCount:         p.likes_count ?? 0,
          commentCount:       p.comments_count ?? 0,
          totalCommentsCount: p.total_comments_count ?? p.comments_count ?? 0,
          repostCount:        p.reposts_count ?? 0,
          allowComments:      meta.allowComments !== false,
          allowDownload:      meta.allowDownload !== false,
          createdAt:          p.created_at || new Date().toISOString(),
        } as Post;
      });

      // Preserve repost order (by repost created_at)
      const ordered = postIds
        .map((id: string) => normalized.find(p => p.id === id))
        .filter(Boolean) as Post[];

      setRepostedPosts(mergePosts(ordered));

      // Fetch all reposters for each post (for the "Reposted by" banner)
      const { data: allRepostRows } = await supabase
        .from('reposts')
        .select('post_id, user_id')
        .in('post_id', postIds);

      if (allRepostRows?.length) {
        const reposterIds = [...new Set(allRepostRows.map((r: any) => r.user_id))];
        const { data: reposterProfiles } = await supabase
          .from('profiles')
          .select('id, name, username, avatar_url')
          .in('id', reposterIds);
        const profMap: Record<string, any> = {};
        (reposterProfiles ?? []).forEach((p: any) => { profMap[p.id] = p; });

        const byPost: Record<string, any[]> = {};
        allRepostRows.forEach((r: any) => {
          if (!byPost[r.post_id]) byPost[r.post_id] = [];
          if (profMap[r.user_id]) byPost[r.post_id].push(profMap[r.user_id]);
        });
        // Put current user first in each list
        Object.keys(byPost).forEach(pid => {
          byPost[pid].sort((a: any, b: any) =>
            a.id === user?.id ? -1 : b.id === user?.id ? 1 : 0
          );
        });
        setRepostersMap(byPost);
      }
    } catch (e) {
      console.error('[Profile] loadReposts error:', e);
    } finally {
      setLoadingReposts(false);
    }
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setSearchParams({ tab: t });
  };

  // ── Avatar upload ────────────────────────────────────────────────────────
  const handleAvatarFile = async (file: File) => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      const dataUrl = await resizeImage(file, 400);
      const url = await authApi.uploadPhoto(user.id, 'avatar', dataUrl);
      await updateUser({ avatar: url });
      toast.success('Profile picture updated!');
    } catch {
      // fallback: store locally
      const dataUrl = await resizeImage(file, 400);
      await updateUser({ avatar: dataUrl });
      toast.info('Profile picture saved locally');
    }
    setUploadingAvatar(false);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleAvatarFile(file);
  };

  const handleDeleteAvatar = async () => {
    if (!user) return;
    await updateUser({ avatar: '' });
    toast.success('Profile picture removed');
  };

  // ── Cover upload ─────────────────────────────────────────────────────────
  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingCover(true);
    try {
      const dataUrl = await resizeImage(file, 1200);
      const url = await authApi.uploadPhoto(user.id, 'cover', dataUrl);
      setCoverImg(url);
      await updateUser({ coverPhoto: url } as any);
      toast.success('Cover updated!');
    } catch {
      // Fallback: store data URL locally
      const dataUrl = await resizeImage(file, 1200);
      setCoverImg(dataUrl);
      toast.info('Cover saved locally');
    }
    setUploadingCover(false);
  };

  // ── Save About form ──────────────────────────────────────────────────────
  const saveAbout = async () => {
    if (!user) return;
    setAboutSaving(true);
    try {
      await updateUser({
        name:        displayName.trim() || user.name,
        username:    username.trim()    || undefined,
        bio:         bio.trim()         || undefined,
        location:    location.trim() || undefined,
        city:        location.includes(',') ? location.split(',')[0].trim() : location.trim() || undefined,
        province:    location.includes(',') ? location.split(',')[1]?.trim() || undefined : undefined,
        website:        website.trim()        || undefined,
        youtube:        youtube.trim()        || undefined,
        tiktok:         tiktok.trim()         || undefined,
        instagram:      instagram.trim()      || undefined,
        yearsExp:       yearsExp              || undefined,
        primaryRole:    primaryRole           || undefined,
        secondaryRoles: secondaryRoles,
        skills:         skills,
        gear:           gear,
        collabPrefs:    collab,
        // Keep profileMeta for backward compat
        profileMeta: { instagram, youtube, tiktok, primaryRole, secondaryRoles, skills, gear, yearsExp, collab },
      } as any);
      toast.success('Profile saved!');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save profile');
    }
    setAboutSaving(false);
  };

  const handleLikeToggled = (p: Post) => updatePost(p.id, p);

  // Load follower/following user objects from DB when requested
  const loadFollowUsers = async () => {
    if (!user) return;
    const followerIds  = user.followers || [];
    const followingIds = user.following || [];
    const ids = [...new Set([...followerIds, ...followingIds])];
    if (!ids.length) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, name, username, avatar_url, account_type, is_verified, bio')
      .in('id', ids);
    if (data) {
      const map = Object.fromEntries(data.map((r: any) => [r.id, {
        id: r.id, name: r.name, username: r.username,
        avatar: r.avatar_url, accountType: r.account_type,
        isVerified: r.is_verified, bio: r.bio,
      }]));
      setFollowerUsers(followerIds.map((id: string) => map[id]).filter(Boolean));
      setFollowingUsers(followingIds.map((id: string) => map[id]).filter(Boolean));
    }
  };

  useEffect(() => {
    if (showFollowers) loadFollowUsers();
  }, [showFollowers]);

  if (!user) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  );

  const isCreatorPlus = user.accountType === 'business';
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ── Cover ── */}
      <div className="relative h-48 md:h-64 overflow-hidden group cursor-pointer"
        onClick={() => setShowCoverSheet(true)}>
        {coverImg
          ? <img src={coverImg} alt="Cover" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700" />
        }
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 bg-white/90 text-gray-800 text-sm font-semibold px-4 py-2 rounded-xl shadow">
            {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {uploadingCover ? 'Uploading…' : 'Change cover photo'}
          </div>
        </div>
        <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
      </div>

      <div className="max-w-4xl mx-auto px-4">

        {/* ── Profile identity card ── */}
        <div className="relative bg-white rounded-b-2xl shadow-sm pb-4 mb-3 border border-gray-100">
          {/* Avatar — z-20 so it's always above buttons row */}
          <div className="absolute -top-12 left-4 cursor-pointer group z-20"
            onClick={() => setShowAvatarSheet(true)}
            onContextMenu={e => { e.preventDefault(); if (user?.avatar) setShowAvatarFull(true); }}
            onTouchStart={e => {
              const t = setTimeout(() => setShowAvatarFull(true), 600);
              const el = e.currentTarget;
              const clear = () => { clearTimeout(t); el.removeEventListener('touchend', clear); };
              el.addEventListener('touchend', clear, { once: true });
            }}>
            <div className="relative w-24 h-24">
              <div data-animate-id="profile-avatar" className="w-24 h-24 rounded-full border-4 border-white overflow-hidden bg-gray-200 shadow-lg">
                {user.avatar
                  ? <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-2xl font-black text-gray-400">
                      {user.name?.[0]?.toUpperCase() || '?'}
                    </div>
                }
              </div>
              <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                {uploadingAvatar
                  ? <Loader2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 animate-spin" />
                  : <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                }
              </div>
              {isCreatorPlus && (
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center border-2 border-white">
                  <span className="text-[8px] text-white font-black">C+</span>
                </div>
              )}
            </div>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          {/* Buttons — right-aligned, pl-28 clears the 96px avatar + 8px gap on 375px screens */}
          <div className="flex justify-end items-center gap-1.5 pt-3 pr-3 pl-28">
            {/* Settings — icon only */}
            <button onClick={() => { captureSnapshot(); navigate('/settings'); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors shrink-0"
              title="Settings">
              <Settings className="w-3.5 h-3.5" />
            </button>
            {/* Share profile */}
            <button onClick={async () => {
              const url = `${window.location.origin}/host/${user.id}`;
              if (navigator.share) { try { await navigator.share({ title: user.name, url }); } catch {} }
              else { await navigator.clipboard.writeText(url); toast.success('Link copied!'); }
            }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors shrink-0"
              title="Share">
              <Share2 className="w-3.5 h-3.5" />
            </button>
            {/* QR Code */}
            <button onClick={() => setShowQR(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors shrink-0"
              title="QR Code">
              <QrCode className="w-3.5 h-3.5" />
            </button>
            {/* Edit profile */}
            <button onClick={() => switchTab('about')}
              className="flex items-center gap-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1.5 rounded-lg transition-colors shrink-0">
              <Edit3 className="w-3 h-3" />Edit profile
            </button>
          </div>

          {/* Name & info */}
          <div className="mt-12 px-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 data-animate-id="profile-name" className="text-xl font-black text-gray-900">{user.name}</h1>
              {isCreatorPlus && <AccountTypeBadge type="business" size="sm" />}
              {user.isVerified && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              )}
            </div>
            {user.username && <p className="text-sm text-gray-400">@{user.username}</p>}
            <div className="mt-1">
              {rep && showRentalBadge && <ReliabilityBadge score={rep.reliability_score} level={rep.reliability_level} accountType={user.accountType} size="sm"/>}
            </div>
            {user.bio && <p className="text-sm text-gray-600 mt-1 max-w-lg leading-relaxed">{user.bio}</p>}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
              {user.city && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{user.city}</span>}
              {reviews.length > 0 && <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />{avgRating.toFixed(1)} ({reviews.length})</span>}
              <button onClick={() => switchTab('listings')}
                className="font-semibold text-gray-700 hover:text-blue-600 transition-colors">
                {listings.length} <span className="font-normal text-gray-500">listings</span>
              </button>
              <button onClick={() => setShowFollowers('followers')}
                className="font-semibold text-gray-700 hover:text-blue-600 transition-colors">
                {followerUsers.length || (user.followers||[]).length} <span className="font-normal text-gray-500">{T('profile.followers')}</span>
              </button>
              <button onClick={() => setShowFollowers('following')}
                className="font-semibold text-gray-700 hover:text-blue-600 transition-colors">
                {followingUsers.length || (user.following||[]).length} <span className="font-normal text-gray-500">{T('profile.following')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
          <div className="flex overflow-x-auto no-scrollbar">
            {TABS.map(({ id, label }) => (
              <button key={id} onClick={() => switchTab(id)}
                className={`px-4 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${
                  tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="pb-24 space-y-4">

          {/* PORTFOLIO — creator showcase */}
          {tab === 'portfolio' && (
            <div>
              {/* About summary */}
              {(user.bio || (user as any).birthdate || user.location || user.city) && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 mb-4 space-y-2">
                  {user.bio && (
                    <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">{user.bio}</p>
                  )}
                  {((user as any).birthdate) && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>🎂</span>
                      <span>
                        {new Date((user as any).birthdate + 'T12:00:00').toLocaleDateString('en-CA', {
                          month: 'long', day: 'numeric', year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                  {(user.location || user.city) && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span>{user.location || [user.city, user.province].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  <button
                    onClick={() => switchTab('about')}
                    className="text-xs text-blue-600 font-semibold hover:underline"
                  >
                    View full profile →
                  </button>
                </div>
              )}

              {/* Portfolio header row */}
              <div className="flex items-center justify-between mb-4">
                <p className="font-black text-gray-900">
                  Portfolio
                  {portfolioItems.length > 0 && <span className="text-gray-400 font-normal ml-1.5">({portfolioItems.length})</span>}
                </p>
                <button
                  onClick={() => setShowAddPortfolio(true)}
                  className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-black px-3 py-2 rounded-xl transition-all active:scale-95"
                >
                  + Add Work
                </button>
              </div>

              {/* Empty state */}
              {portfolioItems.length === 0 && (
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm text-center py-14 px-6">
                  <Film className="w-12 h-12 text-gray-300 mx-auto mb-4"/>
                  <p className="font-black text-gray-900 mb-1">Showcase your work</p>
                  <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">Upload photos, videos, audio samples, or link to your best projects.</p>
                  <button
                    onClick={() => setShowAddPortfolio(true)}
                    className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-black px-5 py-3 rounded-2xl transition-all active:scale-95"
                    style={{ boxShadow: '0 6px 20px rgba(59,130,246,0.3)' }}
                  >
                    + Add First Work
                  </button>
                </div>
              )}

              {/* Featured items */}
              {portfolioItems.filter(i => i.is_featured).length > 0 && (
                <div className="mb-5">
                  <p className="flex items-center gap-1 text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400"/> Featured Work</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {portfolioItems.filter(i => i.is_featured).map(item => (
                      <PortfolioCard key={item.id} item={item} userId={user.id}
                        onTap={() => setPortfolioDetail(item)}
                        onToggleFeatured={async () => {
                          await toggleFeatured(item.id, item.is_featured);
                          setPortfolioItems(prev => prev.map(p => p.id === item.id ? { ...p, is_featured: !p.is_featured } : p));
                        }}
                        onDelete={async () => {
                          await deletePortfolioItem(item.id);
                          setPortfolioItems(prev => prev.filter(p => p.id !== item.id));
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* All items */}
              {portfolioItems.filter(i => !i.is_featured).length > 0 && (
                <div>
                  {portfolioItems.filter(i => i.is_featured).length > 0 && (
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5">All Work</p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {portfolioItems.filter(i => !i.is_featured).map(item => (
                      <PortfolioCard key={item.id} item={item} userId={user.id}
                        onTap={() => setPortfolioDetail(item)}
                        onToggleFeatured={async () => {
                          await toggleFeatured(item.id, item.is_featured);
                          setPortfolioItems(prev => prev.map(p => p.id === item.id ? { ...p, is_featured: !p.is_featured } : p));
                        }}
                        onDelete={async () => {
                          await deletePortfolioItem(item.id);
                          setPortfolioItems(prev => prev.filter(p => p.id !== item.id));
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Detail lightbox */}
              {portfolioDetail && (
                <PortfolioDetailSheet item={portfolioDetail} onClose={() => setPortfolioDetail(null)} />
              )}

              {/* Add sheet */}
              {showAddPortfolio && (
                <AddPortfolioItemSheet
                  onClose={() => setShowAddPortfolio(false)}
                  onAdded={item => setPortfolioItems(prev => [item, ...prev])}
                />
              )}
            </div>
          )}

          {/* ABOUT PREVIEW — kept for the sidebar inside the old grid, now unused; real about is the About tab */}
          {(false as boolean) && tab === ('_about_preview' as Tab) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-4">
                <ReliabilityCard userId={user.id} accountType={user.accountType} />
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-gray-900">About</h3>
                    <button onClick={() => switchTab('about')} className="text-xs text-blue-600 font-semibold hover:underline">Edit →</button>
                  </div>

                  {/* Bio */}
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {user.bio || <span className="italic text-gray-400">No bio yet.</span>}
                  </p>

                  {/* Primary role */}
                  {((user as any).primaryRole || (user as any).profileMeta?.primaryRole) && (
                    <p className="text-xs font-semibold text-blue-600 mt-2">
                      {(user as any).primaryRole || (user as any).profileMeta?.primaryRole}
                    </p>
                  )}

                  {/* Location + years exp */}
                  <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
                    {((user as any).location || user.city) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-gray-400"/>
                        {(user as any).location || [user.city, user.province].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {((user as any).years_exp || (user as any).profileMeta?.yearsExp) && (
                      <span>
                        {(user as any).years_exp || (user as any).profileMeta?.yearsExp} yrs experience
                      </span>
                    )}
                  </div>

                  {/* Secondary roles */}
                  {(((user as any).secondaryRoles || (user as any).profileMeta?.secondaryRoles) || []).length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Also does</p>
                      <div className="flex flex-wrap gap-1">
                        {((user as any).secondaryRoles || (user as any).profileMeta?.secondaryRoles || []).slice(0, 5).map((r: string) => (
                          <span key={r} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {(((user as any).skills || (user as any).profileMeta?.skills) || []).length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Skills</p>
                      <div className="flex flex-wrap gap-1">
                        {((user as any).skills || (user as any).profileMeta?.skills || []).slice(0, 6).map((s: string) => (
                          <span key={s} className="text-[11px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full font-medium">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Gear */}
                  {(((user as any).gear || (user as any).profileMeta?.gear) || []).length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Gear</p>
                      <div className="flex flex-wrap gap-1">
                        {((user as any).gear || (user as any).profileMeta?.gear || []).slice(0, 4).map((g: string) => (
                          <span key={g} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{g}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Social links — all clickable */}
                  {(() => {
                    const ig  = (user as any).instagram  || (user as any).profileMeta?.instagram;
                    const yt  = (user as any).youtube    || (user as any).profileMeta?.youtube;
                    const tt  = (user as any).tiktok     || (user as any).profileMeta?.tiktok;
                    const vm  = (user as any).vimeo      || (user as any).profileMeta?.vimeo;
                    const web = (user as any).website;
                    if (!ig && !yt && !tt && !vm && !web) return null;
                    return (
                      <div className="mt-3 pt-3 border-t border-gray-50">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Links</p>
                        <div className="flex flex-wrap gap-2">
                          {web && (
                            <a href={web.startsWith('http') ? web : `https://${web}`} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full font-medium hover:bg-blue-100 transition-colors">
                              🌐 {web.replace(/https?:\/\//,'').split('/')[0]}
                            </a>
                          )}
                          {ig && (
                            <a href={`https://instagram.com/${ig.replace('@','')}`} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 text-xs text-white rounded-full px-2.5 py-1 font-medium hover:opacity-90 transition-opacity"
                              style={{background:'radial-gradient(circle at 30% 107%, #fdf497 0%, #fd5949 45%, #d6249f 60%, #285AEB 90%)'}}>
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="white"/><rect x="2" y="2" width="20" height="20" rx="6" stroke="white" strokeWidth="2" fill="none"/></svg>
                              @{ig.replace('@','')}
                            </a>
                          )}
                          {yt && (
                            <a href={yt.startsWith('http') ? yt : `https://youtube.com/${yt}`} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 text-xs text-white bg-red-600 hover:bg-red-700 px-2.5 py-1 rounded-full font-medium transition-colors">
                              <svg className="w-3 h-3" viewBox="0 0 24 24"><polygon points="9,7 17,12 9,17" fill="white"/></svg>
                              YouTube
                            </a>
                          )}
                          {tt && (
                            <a href={`https://tiktok.com/${tt.startsWith('@') ? tt : '@'+tt}`} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 text-xs text-white bg-black hover:bg-gray-900 px-2.5 py-1 rounded-full font-medium transition-colors">
                              <span className="text-[10px] font-black">TT</span>
                              {tt}
                            </a>
                          )}
                          {vm && (
                            <a href={`https://vimeo.com/${vm.replace(/https?:\/\/vimeo\.com\//,'')}`} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 text-xs text-white bg-[#1AB7EA] hover:opacity-90 px-2.5 py-1 rounded-full font-medium transition-opacity">
                              <svg className="w-3 h-3" viewBox="0 0 24 24"><path d="M19.5 8.5c-.1 2.1-1.5 5-4.4 8.6C12.2 20.9 9.8 22 7.8 22c-1.1 0-2.1-.9-2.8-2.8L4 14.4C3.4 12.5 2.8 11.5 2 11.5l-1.5 1.1-.9-1.2C.8 10.4 2 9.2 3.3 8c1.5-1.4 2.8-2.1 3.8-2.2 2-.2 3.2 1.2 3.6 4.1.5 3.1.8 5 1 5.7.6 2.6 1.2 3.9 1.8 3.9.5 0 1.3-.8 2.3-2.5 1-1.6 1.5-2.9 1.6-3.8.1-1.4-.4-2.1-1.5-2.1-.5 0-1.1.1-1.7.4.1-3.1 2.4-4.7 4.3-4.5l.9-.5z" fill="white"/></svg>
                              Vimeo
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Collab prefs */}
                  {(((user as any).collabPrefs || (user as any).profileMeta?.collab) || []).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-50">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Open to</p>
                      <div className="flex flex-wrap gap-1">
                        {((user as any).collabPrefs || (user as any).profileMeta?.collab || []).slice(0, 3).map((c: string) => (
                          <span key={c} className="text-[11px] bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>
              <div className="md:col-span-2 space-y-4">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <button onClick={() => setShowCompose(true)}
                    className="w-full text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-left hover:bg-gray-100 transition-colors">
                    What's on your mind?
                  </button>
                </div>
                {/* Listings highlight grid */}
                {listings.length > 0 ? (
                  <>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Listings</p>
                    <div className="grid grid-cols-2 gap-2">
                      {listings.slice(0, 4).map(l => <ListingCard key={l.id} listing={l} />)}
                    </div>
                    {listings.length > 4 && (
                      <button onClick={() => switchTab('listings')} className="w-full mt-2 bg-white border border-gray-200 rounded-2xl py-3 text-sm font-semibold text-blue-600 hover:bg-gray-50">
                        See all {listings.length} listings →
                      </button>
                    )}
                  </>
                ) : (
                  <div className="text-center py-6">
                    <Package className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <Link to="/create-listing" className="text-sm text-blue-600 font-semibold">Create your first listing →</Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* POSTS — V2 */}
          {(false as boolean) && tab === ('posts' as Tab) && (
            <>
              <div id="posts-section" />
              <div className="max-w-2xl mx-auto space-y-4">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <button onClick={() => setShowCompose(true)} className="w-full text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-left hover:bg-gray-100">What's on your mind?</button>
              </div>
              {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
                : posts.length === 0
                  ? <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100"><FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" /><p className="text-gray-500">No posts yet</p></div>
                  : posts.map(p => <PostCard key={p.id} post={p} onDeleted={(id)=>{ 
                    setPosts(prev=>prev.filter(x=>x.id!==id));
                    try { localStorage.removeItem(`filmons_posts_${user?.id}`); } catch {}
                  }} onLikeToggled={handleLikeToggled} />)
              }
            </div>
            </>
          )}

          {/* TAGGED — V2 */}
          {(false as boolean) && tab === ('tagged' as Tab) && (
            <div>
              {loadingTagged ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : taggedPosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <p className="text-sm font-semibold text-gray-400">No tagged posts yet</p>
                  <p className="text-xs text-gray-300">Posts where you're tagged will appear here</p>
                </div>
              ) : taggedPosts.map(post => (
                <div key={post.id} className="relative">
                  <div className="absolute top-14 left-4 z-10 bg-purple-50 border border-purple-100 rounded-full px-2.5 py-0.5">
                    <p className="text-[10px] font-black text-purple-600">🏷 Tagged in this post</p>
                  </div>
                  <PostCard post={post}/>
                </div>
              ))}
            </div>
          )}

          {(false as boolean) && tab === ('reposts' as Tab) && (
            <div>
              {loadingReposts ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : repostedPosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <p className="text-sm font-semibold text-gray-400">No reposts yet</p>
                  <p className="text-xs text-gray-300">Content you've reposted will appear here</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {repostedPosts.map(p => {
                    const reposters = repostersMap[p.id] ?? [];
                    return (
                      <div key={p.id}>
                        {/* "Reposted by" banner */}
                        {reposters.length > 0 && (
                          <button
                            onClick={() => setSheetReposters(reposters)}
                            className="w-full flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100 hover:bg-gray-100 transition-colors text-left"
                          >
                            <Repeat2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            <span className="text-xs text-gray-500 truncate">
                              <span className="font-semibold text-gray-700">Reposted by </span>
                              {reposters.slice(0, 2).map((r: any, i: number) => (
                                <span key={r.id}>
                                  <span className="font-semibold text-gray-800">{r.name || r.username}</span>
                                  {i === 0 && reposters.length > 1 ? ', ' : ''}
                                </span>
                              ))}
                              {reposters.length > 2 && (
                                <span className="text-gray-400"> +{reposters.length - 2} more</span>
                              )}
                            </span>
                          </button>
                        )}
                        <PostCard post={p} onLikeToggled={handleLikeToggled} userRepostPostId={user?.id} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Reposters bottom sheet */}
              {sheetReposters && (
                <div className="fixed inset-0 z-50 flex items-end" onClick={() => setSheetReposters(null)}>
                  <div className="absolute inset-0 bg-black/40" />
                  <div
                    className="relative w-full bg-white rounded-t-2xl max-h-[70vh] flex flex-col"
                    style={{ animation: 'slideUp 0.28s cubic-bezier(0.32,0.72,0,1)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <h3 className="text-sm font-bold text-gray-900">
                        Reposted by {sheetReposters.length} {sheetReposters.length === 1 ? 'person' : 'people'}
                      </h3>
                      <button onClick={() => setSheetReposters(null)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                    <div className="overflow-y-auto overscroll-contain py-2">
                      {sheetReposters.map((r: any) => (
                        <button key={r.id} onClick={() => { setSheetReposters(null); navigate(`/host/${r.id}`); }}
                          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-50 transition-colors text-left">
                          <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                            {r.avatar_url
                              ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                              : <span className="text-sm font-bold text-gray-400">{(r.name || r.username || '?')[0].toUpperCase()}</span>
                            }
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{r.name || r.username}</p>
                            {r.username && <p className="text-xs text-gray-400 truncate">@{r.username}</p>}
                          </div>
                          {r.id === user?.id && (
                            <span className="ml-auto text-[10px] font-bold text-green-500 bg-green-50 px-2 py-0.5 rounded-full shrink-0">You</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'listings' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-gray-900">{listings.length} listing{listings.length!==1?'s':''}</p>
                <Link to="/create-listing" className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl">+ New</Link>
              </div>
              {listings.length === 0
                ? <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100"><Package className="w-10 h-10 text-gray-200 mx-auto mb-3" /><Link to="/create-listing" className="text-sm text-blue-600 font-semibold">Create a listing →</Link></div>
                : <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{listings.map(l=><ListingCard key={l.id} listing={l} />)}</div>
              }
            </div>
          )}

          {/* LIKED — V2 */}
          {(false as boolean) && tab === ('liked' as Tab) && (
            <div className="max-w-2xl mx-auto space-y-4">
              {likedPosts.length===0
                ? <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100"><ThumbsUp className="w-10 h-10 text-gray-200 mx-auto mb-3" /><p className="text-gray-500">Posts you like appear here</p></div>
                : likedPosts.map(p=><PostCard key={p.id} post={p} onLikeToggled={handleLikeToggled} />)
              }
            </div>
          )}

          {/* SAVED — V2 */}
          {(false as boolean) && tab === ('saved' as Tab) && (
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-gray-900 mb-3">Saved Listings</h3>
                {savedListings.length===0
                  ? <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100"><Bookmark className="w-8 h-8 text-gray-200 mx-auto mb-2" /><p className="text-xs text-gray-400">Save listings to see them here</p></div>
                  : <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {savedListings.map((fav:any)=>{
                        const d=fav.item_data||{};
                        return (
                          <Link key={fav.id} to={`/listing/${fav.item_id}`} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                            <div className="aspect-[4/3] bg-gray-100">{d.image&&<img src={d.image} alt="" className="w-full h-full object-cover" loading="lazy"/>}</div>
                            <div className="p-3"><p className="text-sm font-semibold text-gray-900 truncate">{d.title||'Listing'}</p>{d.price&&<p className="text-xs text-gray-400">${d.price} CAD</p>}</div>
                          </Link>
                        );
                      })}
                    </div>
                }
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-3">Saved Posts</h3>
                <div className="max-w-2xl space-y-4">
                  {savedPosts.length===0
                    ? <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100"><Bookmark className="w-8 h-8 text-gray-200 mx-auto mb-2" /><p className="text-xs text-gray-400">Posts you bookmark appear here</p></div>
                    : savedPosts.map(p=><PostCard key={p.id} post={p} onLikeToggled={handleLikeToggled}/>)
                  }
                </div>
              </div>
            </div>
          )}


          {/* SOUNDS — V2 feature, not shown in V1 */}
          {(false as boolean) && tab === ('sounds' as Tab) && (
            <div className="space-y-8">
              {/* User's public sounds */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-900">
                    {'My Sounds'}
                  </h3>
                  {true && (
                    <button onClick={()=>setShowMusicUploader(true)}
                      className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
                      + Upload Sound
                    </button>
                  )}
                </div>
                {loadingSnds && userSounds.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
                  </div>
                ) : userSounds.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
                    <Music2 className="w-8 h-8 mx-auto mb-2 text-gray-400"/>
                    <p className="text-sm font-semibold text-gray-500">No public sounds yet</p>
                    <p className="text-xs text-gray-400 mt-1">Upload original audio to earn FP when others use your sounds</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userSounds.map((track: any) => (
                      <div key={track.id}
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
                        {track.artwork_url
                          ? <img src={track.artwork_url} className="w-12 h-12 rounded-xl object-cover shrink-0"/>
                          : <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                              <Music2 className="w-5 h-5 text-gray-400"/>
                            </div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{track.title}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {(track.category ?? 'original_audio').replace(/_/g,' ')}
                            {track.use_count > 0 && <span className="ml-1.5 text-blue-500">· {track.use_count.toLocaleString()} uses</span>}
                            {track.fp_earned > 0 && <span className="ml-1.5 text-yellow-500">· {track.fp_earned} FP</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Status badge */}
                          {track.visibility === 'private' && (
                            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Private</span>
                          )}
                          {track.copyright_status === 'pending' && (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Review</span>
                          )}
                          {track.copyright_status === 'blocked' && (
                            <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Blocked</span>
                          )}
                          {/* Scissors — trim segment */}
                          <button
                            onClick={e=>{e.stopPropagation();setTrimmingSound(track);}}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100 active:bg-gray-200"
                            title="Trim segment">
                            <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
                              <line x1="20" y1="4" x2="8.12" y2="15.88"/>
                              <line x1="14.47" y1="14.48" x2="20" y2="20"/>
                              <line x1="8.12" y1="8.12" x2="12" y2="12"/>
                            </svg>
                          </button>
                          {/* Edit — pencil */}
                          <button
                            onClick={e=>{e.stopPropagation();setEditingSound(track);}}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100 active:bg-gray-200"
                            title="Edit sound">
                            <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Favorite sounds (only own profile or public) */}
              {true && (
                <div>
                  <h3 className="font-bold text-gray-900 mb-3">
                    {'Saved Sounds'}
                  </h3>
                  {loadingSnds ? null : favSounds.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
                      <span className="text-3xl block mb-2">🔖</span>
                      <p className="text-sm font-semibold text-gray-500">No saved sounds</p>
                      <p className="text-xs text-gray-400 mt-1">Bookmark sounds from the music browser to find them here</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {favSounds.map((track: any) => (
                        <div key={track.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
                          {track.artwork_url
                            ? <img src={track.artwork_url} className="w-12 h-12 rounded-xl object-cover shrink-0"/>
                            : <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                                <Music2 className="w-5 h-5 text-gray-400"/>
                              </div>}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{track.title}</p>
                            {track.use_count > 0 && (
                              <p className="text-xs text-blue-500">{track.use_count.toLocaleString()} uses</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sound trim sheet */}
          {trimmingSound && (
            <SoundTrimSheet
              sound={trimmingSound}
              onClose={()=>setTrimmingSound(null)}
              onSaved={(snippetStart, snippetEnd)=>{
                setUserSounds(prev => prev.map(s =>
                  s.id === trimmingSound.id ? {...s, snippet_start: snippetStart, snippet_end: snippetEnd} : s
                ));
                setTrimmingSound(null);
              }}
            />
          )}

          {/* Music Browser for uploading sounds from profile */}
          {showMusicUploader && (
            <MusicBrowser
              initialTab="mysounds"
              onSelect={() => { setShowMusicUploader(false); loadSounds(); }}
              onClose={() => { setShowMusicUploader(false); loadSounds(); }}
            />
          )}

          {/* Sound edit sheet */}
          {editingSound && (
            <SoundEditSheet
              sound={editingSound}
              onClose={()=>setEditingSound(null)}
              onSaved={(updated)=>{
                setUserSounds(prev => {
                  const next = prev.map(s => s.id === updated.id ? updated : s);
                  try { localStorage.setItem(`filmons_sounds_${user?.id}`, JSON.stringify({pub:next,fav:favSounds})); } catch {}
                  return next;
                });
                setEditingSound(null);
              }}
              onDelete={(id)=>{
                setUserSounds(prev => {
                  const next = prev.filter(s => s.id !== id);
                  try { localStorage.setItem(`filmons_sounds_${user?.id}`, JSON.stringify({pub:next,fav:favSounds})); } catch {}
                  return next;
                });
                setEditingSound(null);
              }}
            />
          )}

          {/* REVIEWS */}
          {tab === 'reviews' && (
            <div className="max-w-2xl mx-auto space-y-4">
              {reviews.length===0
                ? <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100"><Star className="w-10 h-10 text-gray-200 mx-auto mb-3"/><p className="text-gray-500">No reviews yet</p></div>
                : reviews.map(r=>(
                    <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-sm text-gray-900">{r.userName||'Anonymous'}</p>
                        <div className="flex gap-0.5">{[...Array(5)].map((_,i)=><Star key={i} className={`w-3.5 h-3.5 ${i<r.rating?'text-yellow-400 fill-yellow-400':'text-gray-200'}`}/>)}</div>
                      </div>
                      <p className="text-sm text-gray-600">{r.comment}</p>
                      <p className="text-[11px] text-gray-400 mt-2">{new Date(r.createdAt).toLocaleDateString('en-CA',{month:'short',year:'numeric',day:'numeric'})}</p>
                    </div>
                  ))
              }
            </div>
          )}

          {/* LIKED — saved listings + liked creators */}
          {tab === 'liked' && (
            <div className="space-y-4">
              {/* Liked Listings */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                  <p className="font-bold text-sm text-gray-900 flex items-center gap-1.5"><Package className="w-4 h-4"/> Liked Listings</p>
                  <span className="text-xs text-gray-400">{savedListings.length}</span>
                </div>
                {savedListings.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-gray-300"/>
                    Swipe right on listings to save them here.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {savedListings.map((fav: any) => {
                      const item = fav.item_data || {};
                      const price = item.price ? `$${Number(item.price).toLocaleString()}` : '';
                      const suffix = item.listingMode === 'rent' ? '/day' : item.listingType === 'service' ? '/hr' : '';
                      return (
                        <button
                          key={fav.item_id || fav.id}
                          onClick={() => navigate(`/listing/${fav.item_id || item.id}`)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                        >
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                            {item.images?.[0]
                              ? <img src={item.images[0]} className="w-full h-full object-cover" alt=""/>
                              : <div className="w-full h-full flex items-center justify-center"><Film className="w-6 h-6 text-gray-300"/></div>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{item.title || 'Listing'}</p>
                            {item.city && <p className="text-xs text-gray-400 truncate flex items-center gap-0.5"><MapPin className="w-3 h-3 shrink-0"/> {item.city}</p>}
                          </div>
                          {price && <p className="text-sm font-black text-blue-600 shrink-0">{price}{suffix}</p>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Liked Creators */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                  <p className="font-bold text-sm text-gray-900 flex items-center gap-1.5"><User className="w-4 h-4"/> Liked Creators</p>
                  <span className="text-xs text-gray-400">{likedCreators.length}</span>
                </div>
                {likedCreators.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    <User className="w-8 h-8 mx-auto mb-2 text-gray-300"/>
                    Swipe right on creators to like them here.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {likedCreators.map((fav: any) => {
                      const c = fav.item_data || {};
                      return (
                        <button
                          key={fav.item_id || fav.id}
                          onClick={() => navigate(`/host/${fav.item_id || c.id}`)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                        >
                          <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
                            {c.avatar_url
                              ? <img src={c.avatar_url} className="w-full h-full object-cover" alt=""/>
                              : <div className="w-full h-full flex items-center justify-center text-gray-400 font-black text-sm">
                                  {c.name?.[0]?.toUpperCase() ?? '?'}
                                </div>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{c.name || 'Creator'}</p>
                            {c.primary_role && <p className="text-xs text-blue-600 truncate">{c.primary_role}</p>}
                            {c.city && <p className="text-xs text-gray-400 flex items-center gap-0.5"><MapPin className="w-3 h-3 shrink-0"/> {c.city}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ABOUT — tab layout */}
          {tab === 'about' && (
            <div className="max-w-4xl mx-auto">
              <AboutEditor
                user={user}
                updateUser={updateUser}
                location={location}
                setLocation={setLocation}
                displayName={displayName} setDisplayName={setDisplayName}
                username={username} setUsername={setUsername}
                bio={bio} setBio={setBio}
                yearsExp={yearsExp} setYearsExp={setYearsExp}
                website={website} setWebsite={setWebsite}
                instagram={instagram} setInstagram={setInstagram}
                youtube={youtube} setYoutube={setYoutube}
                tiktok={tiktok} setTiktok={setTiktok}
                primaryRole={primaryRole} setPrimaryRole={setPrimaryRole}
                secondaryRoles={secondaryRoles} setSecondaryRoles={setSecondaryRoles}
                skills={skills} setSkills={setSkills}
                gear={gear} setGear={setGear}
                collab={collab} setCollab={setCollab}
                newBirthdate={newBirthdate} setNewBirthdate={setNewBirthdate}
                editEmail={editEmail} setEditEmail={setEditEmail}
                editPhone={editPhone} setEditPhone={setEditPhone}
                newEmail={newEmail} setNewEmail={setNewEmail}
                newPhone={newPhone} setNewPhone={setNewPhone}
                otpSent={otpSent} setOtpSent={setOtpSent}
                otpCode={otpCode} setOtpCode={setOtpCode}
                otpVerifying={otpVerifying} setOtpVerifying={setOtpVerifying}
                onSave={saveAbout}
                saving={aboutSaving}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Followers / Following modal ── */}
      {showFollowers && (
        <FollowersModal
          tab={showFollowers}
          followers={followerUsers}
          following={followingUsers}
          onClose={() => setShowFollowers(null)}
          onTabChange={t => setShowFollowers(t)}
          currentUserId={user.id}
        />
      )}

      {/* ── Cover photo action sheet ── */}
      {showCoverSheet && (
        <CoverActionSheet
          coverImg={coverImg}
          onChangePhoto={async (file) => { setShowCoverSheet(false); await handleCoverChange({ target: { files: [file] } } as any); }}
          onRemove={() => { setShowCoverSheet(false); setCoverImg(''); updateUser({ coverPhoto: '' } as any); }}
          onClose={() => setShowCoverSheet(false)}
        />
      )}

      {/* ── Avatar action sheet ── */}
      {showAvatarSheet && (
        <AvatarActionSheet
          avatar={user.avatar}
          onChangePhoto={handleAvatarFile}
          onDeletePhoto={handleDeleteAvatar}
          onViewPhoto={() => { setShowAvatarSheet(false); setShowAvatarFull(true); }}
          onClose={() => setShowAvatarSheet(false)}
        />
      )}

      {/* ── Avatar full screen ── */}
      {showAvatarFull && user.avatar && (
        <AvatarFullScreen
          avatar={user.avatar}
          onClose={() => setShowAvatarFull(false)}
          onChangePhoto={f => { handleAvatarFile(f); setShowAvatarFull(false); }}
          onDelete={() => { handleDeleteAvatar(); setShowAvatarFull(false); }}
        />
      )}

      {/* ── QR Code modal ── */}
      {showQR && (
        <ProfileQRCode
          userId={user.id}
          name={user.name}
          avatar={user.avatar}
          onClose={() => setShowQR(false)}
        />
      )}

      {/* Compose modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-bold text-gray-900">Create post</p>
              <button onClick={()=>setShowCompose(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-4">
              <PostComposer onPost={post=>{setPosts(prev=>[post,...prev]);mergePosts([post]);setShowCompose(false);}} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── UI helpers ───────────────────────────────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <p className="font-bold text-sm text-gray-900">{title}</p>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}