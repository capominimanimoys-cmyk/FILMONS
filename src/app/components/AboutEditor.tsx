import { useState, useRef, useEffect } from 'react';
import { Search, X, Check, Plus, Loader2, MapPin, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { ProfessionPicker } from './ProfessionPicker';

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────

const ALL_SKILLS = [
  'Cinematic Filming','Storytelling','Video Editing','Color Grading','Drone Filming',
  'Documentary','Music Video','Lighting','Sound Recording','Directing','Screenwriting',
  'Storyboarding','Short-form Content','Livestream','Vlogging',
  'Portrait Photography','Street Photography','Fashion Photography','Product Photography',
  'Real Estate Photography','Travel Photography','Photo Retouching','Studio Lighting',
  'Drone Photography','Nature Photography','Event Coverage',
  'Graphic Design','Branding','Typography','Illustration','Poster Design',
  'UI Design','UX Design','Motion Graphics','Digital Painting','Character Design',
  '3D Art','Concept Art','AI Art Generation',
  'Beatmaking','Music Production','Songwriting','Mixing','Mastering','DJing',
  'Sound Design','Podcast Editing','Audio Engineering','Voice Acting','Soundtrack Creation',
  'Creative Writing','Poetry','Blogging','Journalism','Copywriting',
  'Worldbuilding','Lyric Writing','Spoken Word',
  'TikTok Editing','YouTube Content','Streaming','Personal Branding',
  'Thumbnail Design','Social Media Strategy','Podcast Hosting',
  'Gaming','Esports','Game Modding','VR Gaming','Level Design','Fan Art','Cosplay',
  'Acting','Dancing','Choreography','Public Speaking','Comedy','Improvisation',
  'AI Prompt Engineering','AI Video Generation','Virtual Production',
  'AR Filter Creation','XR Design','Digital Fashion','Generative Art',
];

const CA_CITIES = [
  'Toronto, ON','Mississauga, ON','Brampton, ON','Hamilton, ON','Ottawa, ON',
  'London, ON','Markham, ON','Vaughan, ON','Kitchener, ON','Windsor, ON',
  'Richmond Hill, ON','Oakville, ON','Burlington, ON','Oshawa, ON','Barrie, ON',
  'Guelph, ON','Kingston, ON','Sudbury, ON','Thunder Bay, ON','Brantford, ON',
  'Montreal, QC','Quebec City, QC','Laval, QC','Longueuil, QC','Gatineau, QC',
  'Sherbrooke, QC','Saguenay, QC','Trois-Rivières, QC',
  'Vancouver, BC','Surrey, BC','Burnaby, BC','Richmond, BC','Kelowna, BC',
  'Abbotsford, BC','Coquitlam, BC','Nanaimo, BC','Kamloops, BC','Victoria, BC',
  'Calgary, AB','Edmonton, AB','Red Deer, AB','Lethbridge, AB','Airdrie, AB',
  'Winnipeg, MB','Brandon, MB','Saskatoon, SK','Regina, SK',
  'Halifax, NS','Moncton, NB','Saint John, NB','Fredericton, NB',
  "St. John's, NL",'Charlottetown, PE',
  'Yellowknife, NT','Whitehorse, YT','Iqaluit, NU',
];

// ── Education ────────────────────────────────────────────────────────────────
interface EduEntry {
  id: string;
  school: string;
  schoolCity?: string;
  schoolProvince?: string;
  degree: string;
  field: string;
  startYear: string;
  endYear: string;
  current: boolean;
  description: string;
  showOnProfile: boolean;
}
interface EduState { entries: EduEntry[]; training: string[]; }

interface CanadianSchool {
  name: string;
  city: string;
  province: string;
  category: string;
}

const CA_SCHOOLS: CanadianSchool[] = [
  // ── Film & Media ──────────────────────────────────────────────────────────
  { name:'Vancouver Film School',            city:'Vancouver',      province:'BC', category:'Film School' },
  { name:'Toronto Film School',              city:'Toronto',        province:'ON', category:'Film School' },
  { name:'Canadian Film Centre',             city:'Toronto',        province:'ON', category:'Film School' },
  { name:'Ryerson University – Film',        city:'Toronto',        province:'ON', category:'Film School' },
  { name:'York University – Film',           city:'Toronto',        province:'ON', category:'Film School' },
  { name:'Concordia University – Cinema',    city:'Montreal',       province:'QC', category:'Film School' },
  { name:'Capilano University – Film',       city:'North Vancouver',province:'BC', category:'Film School' },
  { name:'Humber College – Film & Media',   city:'Toronto',        province:'ON', category:'Film School' },
  { name:'Sheridan College – Animation',     city:'Oakville',       province:'ON', category:'Film School' },
  { name:'Trebas Institute',                 city:'Toronto',        province:'ON', category:'Film School' },
  { name:'Centre for Arts and Technology',   city:'Kelowna',        province:'BC', category:'Film School' },
  // ── Art & Design ─────────────────────────────────────────────────────────
  { name:'OCAD University',                  city:'Toronto',        province:'ON', category:'Art School' },
  { name:'Emily Carr University of Art + Design', city:'Vancouver', province:'BC', category:'Art School' },
  { name:'NSCAD University',                 city:'Halifax',        province:'NS', category:'Art School' },
  { name:'Alberta University of the Arts',   city:'Calgary',        province:'AB', category:'Art School' },
  { name:'Concordia University – Fine Arts', city:'Montreal',       province:'QC', category:'Art School' },
  { name:'Université du Québec – Design',    city:'Montreal',       province:'QC', category:'Art School' },
  { name:'George Brown College – Design',    city:'Toronto',        province:'ON', category:'Design School' },
  { name:'Seneca College – Graphic Design',  city:'Toronto',        province:'ON', category:'Design School' },
  { name:'Algonquin College – Graphic Design',city:'Ottawa',        province:'ON', category:'Design School' },
  { name:'BCIT – Digital Design',            city:'Burnaby',        province:'BC', category:'Design School' },
  { name:'Red River College – Creative Communications',city:'Winnipeg',province:'MB',category:'Design School'},
  // ── Music ────────────────────────────────────────────────────────────────
  { name:'Royal Conservatory of Music',      city:'Toronto',        province:'ON', category:'Music School' },
  { name:'Schulich School of Music – McGill',city:'Montreal',       province:'QC', category:'Music School' },
  { name:'Humber College – Music',           city:'Toronto',        province:'ON', category:'Music School' },
  { name:'Berklee Online (Canada)',           city:'Online',         province:'CA', category:'Music School' },
  { name:'MacEwan University – Music',       city:'Edmonton',       province:'AB', category:'Music School' },
  { name:'Wilfrid Laurier – Music',          city:'Waterloo',       province:'ON', category:'Music School' },
  { name:'Grant MacEwan – Music',            city:'Edmonton',       province:'AB', category:'Music School' },
  // ── Acting & Theatre ─────────────────────────────────────────────────────
  { name:'National Theatre School of Canada',city:'Montreal',       province:'QC', category:'Acting School' },
  { name:'Studio 58 – Langara College',      city:'Vancouver',      province:'BC', category:'Acting School' },
  { name:'George Brown College – Acting',    city:'Toronto',        province:'ON', category:'Acting School' },
  { name:'Ryerson University – Acting',      city:'Toronto',        province:'ON', category:'Acting School' },
  { name:'York University – Theatre',        city:'Toronto',        province:'ON', category:'Acting School' },
  { name:'Soulpepper Academy',               city:'Toronto',        province:'ON', category:'Acting School' },
  { name:'Vancouver Film School – Acting',   city:'Vancouver',      province:'BC', category:'Acting School' },
  // ── Universities ─────────────────────────────────────────────────────────
  { name:'University of Toronto',            city:'Toronto',        province:'ON', category:'University' },
  { name:'University of British Columbia',   city:'Vancouver',      province:'BC', category:'University' },
  { name:'McGill University',                city:'Montreal',       province:'QC', category:'University' },
  { name:'University of Alberta',            city:'Edmonton',       province:'AB', category:'University' },
  { name:'University of Waterloo',           city:'Waterloo',       province:'ON', category:'University' },
  { name:'Western University',               city:'London',         province:'ON', category:'University' },
  { name:'Queen\'s University',              city:'Kingston',       province:'ON', category:'University' },
  { name:'University of Ottawa',             city:'Ottawa',         province:'ON', category:'University' },
  { name:'University of Calgary',            city:'Calgary',        province:'AB', category:'University' },
  { name:'Simon Fraser University',          city:'Burnaby',        province:'BC', category:'University' },
  { name:'McMaster University',              city:'Hamilton',       province:'ON', category:'University' },
  { name:'University of Victoria',           city:'Victoria',       province:'BC', category:'University' },
  { name:'Carleton University',              city:'Ottawa',         province:'ON', category:'University' },
  { name:'York University',                  city:'Toronto',        province:'ON', category:'University' },
  { name:'Concordia University',             city:'Montreal',       province:'QC', category:'University' },
  { name:'Toronto Metropolitan University',  city:'Toronto',        province:'ON', category:'University' },
  { name:'University of Guelph',             city:'Guelph',         province:'ON', category:'University' },
  { name:'University of Manitoba',           city:'Winnipeg',       province:'MB', category:'University' },
  { name:'University of Saskatchewan',       city:'Saskatoon',      province:'SK', category:'University' },
  { name:'Dalhousie University',             city:'Halifax',        province:'NS', category:'University' },
  { name:'Memorial University',              city:"St. John's",     province:'NL', category:'University' },
  { name:'Brock University',                 city:'St. Catharines', province:'ON', category:'University' },
  { name:'Wilfrid Laurier University',       city:'Waterloo',       province:'ON', category:'University' },
  { name:'University of Windsor',            city:'Windsor',        province:'ON', category:'University' },
  { name:'Athabasca University',             city:'Athabasca',      province:'AB', category:'University (Online)' },
  { name:'Royal Roads University',           city:'Victoria',       province:'BC', category:'University (Online)' },
  { name:'Thompson Rivers University',       city:'Kamloops',       province:'BC', category:'University (Online)' },
  { name:'Université de Montréal',           city:'Montreal',       province:'QC', category:'University' },
  { name:'Université Laval',                 city:'Quebec City',    province:'QC', category:'University' },
  { name:'Université du Québec à Montréal',  city:'Montreal',       province:'QC', category:'University' },
  // ── Colleges ─────────────────────────────────────────────────────────────
  { name:'Humber College',                   city:'Toronto',        province:'ON', category:'College' },
  { name:'Seneca College',                   city:'Toronto',        province:'ON', category:'College' },
  { name:'George Brown College',             city:'Toronto',        province:'ON', category:'College' },
  { name:'Centennial College',               city:'Toronto',        province:'ON', category:'College' },
  { name:'Sheridan College',                 city:'Oakville',       province:'ON', category:'College' },
  { name:'Algonquin College',                city:'Ottawa',         province:'ON', category:'College' },
  { name:'Fanshawe College',                 city:'London',         province:'ON', category:'College' },
  { name:'Mohawk College',                   city:'Hamilton',       province:'ON', category:'College' },
  { name:'Durham College',                   city:'Oshawa',         province:'ON', category:'College' },
  { name:'Niagara College',                  city:'Niagara-on-the-Lake',province:'ON',category:'College'},
  { name:'Georgian College',                 city:'Barrie',         province:'ON', category:'College' },
  { name:'Fleming College',                  city:'Peterborough',   province:'ON', category:'College' },
  { name:'St. Lawrence College',             city:'Kingston',       province:'ON', category:'College' },
  { name:'St. Clair College',                city:'Windsor',        province:'ON', category:'College' },
  { name:'Cambrian College',                 city:'Sudbury',        province:'ON', category:'College' },
  { name:'Confederation College',            city:'Thunder Bay',    province:'ON', category:'College' },
  { name:'Loyalist College',                 city:'Belleville',     province:'ON', category:'College' },
  { name:'BCIT',                             city:'Burnaby',        province:'BC', category:'College' },
  { name:'Douglas College',                  city:'New Westminster', province:'BC', category:'College' },
  { name:'Langara College',                  city:'Vancouver',      province:'BC', category:'College' },
  { name:'Kwantlen Polytechnic University',  city:'Surrey',         province:'BC', category:'College' },
  { name:'Capilano University',              city:'North Vancouver', province:'BC', category:'College' },
  { name:'Vancouver Community College',      city:'Vancouver',      province:'BC', category:'College' },
  { name:'Camosun College',                  city:'Victoria',       province:'BC', category:'College' },
  { name:'NAIT',                             city:'Edmonton',       province:'AB', category:'College' },
  { name:'SAIT',                             city:'Calgary',        province:'AB', category:'College' },
  { name:'Bow Valley College',               city:'Calgary',        province:'AB', category:'College' },
  { name:'Lethbridge College',               city:'Lethbridge',     province:'AB', category:'College' },
  { name:'Red River College Polytechnic',    city:'Winnipeg',       province:'MB', category:'College' },
  { name:'Assiniboine Community College',    city:'Brandon',        province:'MB', category:'College' },
  { name:'Saskatchewan Polytechnic',         city:'Saskatoon',      province:'SK', category:'College' },
  { name:'NSCC',                             city:'Halifax',        province:'NS', category:'College' },
  { name:'New Brunswick Community College',  city:'Fredericton',    province:'NB', category:'College' },
  { name:'Holland College',                  city:'Charlottetown',  province:'PE', category:'College' },
  { name:'College of the North Atlantic',    city:"St. John's",     province:'NL', category:'College' },
  { name:'Collège Boréal',                   city:'Sudbury',        province:'ON', category:'College' },
  { name:'La Cité collégiale',               city:'Ottawa',         province:'ON', category:'College' },
  { name:'Vanier College',                   city:'Montreal',       province:'QC', category:'College' },
  { name:'John Abbott College',              city:'Montreal',       province:'QC', category:'College' },
  // ── Trade & Vocational ────────────────────────────────────────────────────
  { name:'CDI College',                      city:'Various',        province:'CA', category:'Trade School' },
  { name:'Willis College',                   city:'Ottawa',         province:'ON', category:'Trade School' },
  { name:'Canadian Business College',        city:'Toronto',        province:'ON', category:'Trade School' },
];

const TRAINING_SUGGESTIONS = [
  'Adobe Certified Professional','Unreal Engine Certification','DaVinci Resolve Certification',
  'Google Analytics Certification','Meta Blueprint Certification',
  'Film Workshop','Cinematography Bootcamp','Music Production Masterclass',
  'Photography Bootcamp','Color Grading Masterclass','VFX Online Course',
  'Sound Design Workshop','Screenwriting Masterclass','Motion Graphics Course',
  'Online Course','Mentorship Program','Industry Internship','Film Festival Program',
];

const DEGREE_OPTIONS = [
  'Bachelor\'s Degree','Master\'s Degree','Diploma','Certificate',
  'Associate Degree','Honours Degree','Doctorate / PhD','Professional Certification',
  'Vocational Training','High School Diploma','Self-taught',
];

const CATEGORY_EMOJI: Record<string, string> = {
  'Film School':'🎬', 'Art School':'🎨', 'Design School':'✏️', 'Music School':'🎵',
  'Acting School':'🎭', 'University':'🎓', 'University (Online)':'💻', 'College':'🏫',
  'Trade School':'🔧',
};

function blankEntry(): EduEntry {
  return {
    id: Math.random().toString(36).slice(2),
    school:'', schoolCity:'', schoolProvince:'',
    degree:'', field:'', startYear:'', endYear:'',
    current:false, description:'', showOnProfile: true,
  };
}

// ── School Finder ────────────────────────────────────────────────────────────
function SchoolFinder({ value, onChange }: {
  value: string;
  onChange: (name: string, city: string, province: string) => void;
}) {
  const [q, setQ]           = useState(value);
  const [results, setResults] = useState<CanadianSchool[]>([]);
  const [manual, setManual] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQ(value); }, [value]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setResults([]);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const onInput = (v: string) => {
    setQ(v);
    setManual(false);
    if (v.length < 2) { setResults([]); return; }
    const q2 = v.toLowerCase();
    setResults(
      CA_SCHOOLS.filter(s =>
        s.name.toLowerCase().includes(q2) ||
        s.city.toLowerCase().includes(q2) ||
        s.province.toLowerCase().includes(q2) ||
        s.category.toLowerCase().includes(q2)
      ).slice(0, 8)
    );
  };

  const pick = (s: CanadianSchool) => {
    setQ(s.name); setResults([]);
    onChange(s.name, s.city, s.province);
  };

  const confirmManual = () => {
    if (q.trim()) { onChange(q.trim(), '', ''); setResults([]); setManual(false); }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-white
                      focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
        <Search className="w-4 h-4 text-gray-400 shrink-0"/>
        <input value={q} onChange={e => onInput(e.target.value)}
          placeholder="Search school in Canada…"
          className="flex-1 bg-transparent text-sm outline-none text-gray-800 placeholder:text-gray-400 min-w-0"/>
        {q && (
          <button type="button" onClick={() => { setQ(''); onChange('','',''); setResults([]); }}>
            <X className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500"/>
          </button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {results.map((s, i) => (
            <button key={i} type="button" onMouseDown={() => pick(s)}
              className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center gap-3
                         border-b border-gray-50 last:border-0 transition-colors">
              <span className="text-base shrink-0">{CATEGORY_EMOJI[s.category] || '🏫'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                <p className="text-[11px] text-gray-400">{s.city}, {s.province} · {s.category}</p>
              </div>
            </button>
          ))}
          {/* Not found option */}
          <button type="button" onMouseDown={() => { setResults([]); setManual(true); }}
            className="w-full text-left px-4 py-2.5 flex items-center gap-2 bg-gray-50
                       text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
            <Plus className="w-3.5 h-3.5"/> School not listed? Add manually
          </button>
        </div>
      )}

      {/* Manual entry confirm */}
      {manual && (
        <div className="mt-2 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="text-xs text-amber-700 flex-1">Adding "<strong>{q}</strong>" manually</span>
          <button type="button" onClick={confirmManual}
            className="text-xs font-bold text-white bg-blue-600 px-3 py-1.5 rounded-lg">Confirm</button>
          <button type="button" onClick={() => setManual(false)}>
            <X className="w-3.5 h-3.5 text-gray-400"/>
          </button>
        </div>
      )}
    </div>
  );
}

const COLLAB_OPTIONS = [
  'Open to collabs','Commercial only','Indie friendly','Open to passion projects',
  'Looking for crew','Looking for clients','Remote work','In-person only',
  'Travel available','Mentorship',
];

// ─────────────────────────────────────────────────────────────────────────────
// SMALL UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function TagPicker({ all, selected, onToggle, single, placeholder }: {
  all: string[]; selected: string[]; onToggle: (v: string) => void;
  single?: boolean; placeholder?: string;
}) {
  const [q, setQ]   = useState('');
  const [custom, setCustom] = useState('');
  const visible = q ? all.filter(t => t.toLowerCase().includes(q.toLowerCase())) : all;
  const addCustom = () => {
    const t = custom.trim();
    if (t && !selected.includes(t)) { onToggle(t); setCustom(''); }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-blue-400">
        <Search className="w-3.5 h-3.5 text-gray-400 shrink-0"/>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder || 'Search…'}
          className="flex-1 bg-transparent text-sm outline-none text-gray-800 placeholder:text-gray-400"/>
        {q && <button onClick={() => setQ('')}><X className="w-3 h-3 text-gray-400"/></button>}
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
        {visible.slice(0, 60).map(tag => {
          const on = selected.includes(tag);
          return (
            <button key={tag} type="button"
              onClick={() => { if (single && !on && selected.length > 0) return; onToggle(tag); }}
              className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-all flex items-center gap-1 ${
                on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}>
              {on && <Check className="w-2.5 h-2.5"/>}{tag}
            </button>
          );
        })}
        {q && visible.length === 0 && <p className="text-xs text-gray-400 py-1">No matches — add below</p>}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100">
          {selected.map(t => (
            <span key={t} className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
              {t}<button onClick={() => onToggle(t)}><X className="w-2.5 h-2.5 hover:text-red-500"/></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={custom} onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); }}}
          placeholder="Add your own…"
          className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400 text-gray-800 placeholder:text-gray-400"/>
        <button type="button" onClick={addCustom}
          className="text-xs bg-blue-600 text-white font-bold px-3 py-2 rounded-xl flex items-center gap-1">
          <Plus className="w-3 h-3"/>Add
        </button>
      </div>
    </div>
  );
}

interface NominatimResult {
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
  };
}

const PROV_MAP: Record<string, string> = {
  'Ontario':'ON','British Columbia':'BC','Quebec':'QC','Alberta':'AB',
  'Manitoba':'MB','Saskatchewan':'SK','Nova Scotia':'NS','New Brunswick':'NB',
  'Newfoundland and Labrador':'NL','Prince Edward Island':'PE',
  'Northwest Territories':'NT','Nunavut':'NU','Yukon':'YT',
};

function formatNominatim(r: NominatimResult): string {
  const a = r.address;
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  const city   = a.city || a.town || a.village || '';
  const prov   = PROV_MAP[a.state || ''] || a.state || '';
  const postal = a.postcode || '';
  return [street, city, prov, postal].filter(Boolean).join(', ');
}

function LocationSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ]           = useState(value);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const debounce  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { setQ(value); }, [value]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setResults([]);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const search = (v: string) => {
    clearTimeout(debounce.current);
    if (v.length < 2) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        // Try Nominatim API for real Canadian addresses
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(v)}&countrycodes=ca&format=json&addressdetails=1&limit=6`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'FilmonsApp/1.0' } }
        );
        const data: NominatimResult[] = await res.json();
        if (data.length > 0) {
          setResults(data);
        } else {
          // Fallback: filter static city list
          setResults(
            CA_CITIES.filter(c => c.toLowerCase().includes(v.toLowerCase())).slice(0, 6).map(c => ({
              display_name: c, address: {},
            })) as any
          );
        }
      } catch {
        // Offline fallback: static list
        setResults(
          CA_CITIES.filter(c => c.toLowerCase().includes(v.toLowerCase())).slice(0, 6).map(c => ({
            display_name: c, address: {},
          })) as any
        );
      }
      setLoading(false);
    }, 380);
  };

  const onInput = (v: string) => { setQ(v); search(v); };

  const pick = (r: NominatimResult) => {
    const label = r.address?.city || r.address?.town
      ? formatNominatim(r)
      : r.display_name.split(',').slice(0, 3).join(',').trim();
    setQ(label); onChange(label); setResults([]);
  };

  const detect = () => {
    if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&countrycodes=ca`,
          { headers: { 'User-Agent': 'FilmonsApp/1.0' } }
        );
        const d: NominatimResult = await res.json();
        const city = d.address?.city || d.address?.town || d.address?.village || '';
        const prov = PROV_MAP[d.address?.state || ''] || d.address?.state || '';
        const loc  = [city, prov].filter(Boolean).join(', ');
        setQ(loc); onChange(loc); setResults([]);
      } catch { toast.error('Could not detect location'); }
      setDetecting(false);
    }, () => { toast.error('Location access denied'); setDetecting(false); }, { timeout: 8000 });
  };

  return (
    <div ref={wrapRef} className="relative space-y-1.5">
      {/* Input row */}
      <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-white
                      focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
        {loading
          ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
          : <MapPin  className="w-4 h-4 text-gray-400 shrink-0" />
        }
        <input
          value={q}
          onChange={e => onInput(e.target.value)}
          onBlur={() => { setTimeout(() => setResults([]), 200); onChange(q); }}
          placeholder="Street, city, province or postal code…"
          className="flex-1 bg-transparent text-sm outline-none text-gray-800 placeholder:text-gray-400 min-w-0"
        />
        {q && (
          <button type="button" onClick={() => { setQ(''); onChange(''); setResults([]); }}
            className="shrink-0 text-gray-300 hover:text-gray-500">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <button type="button" onClick={detect} title="Detect my location"
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50
                     text-blue-600 hover:bg-blue-100 border border-blue-100 transition-colors">
          {detecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="text-sm leading-none">📍</span>}
        </button>
      </div>

      {/* Suggestions dropdown */}
      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {results.map((r, i) => {
            const label = r.address?.city || r.address?.town
              ? formatNominatim(r)
              : r.display_name.split(',').slice(0, 3).join(',').trim();
            const sub = r.address?.state
              ? [PROV_MAP[r.address.state] || r.address.state, r.address.postcode].filter(Boolean).join(' · ')
              : '';
            return (
              <button key={i} type="button" onMouseDown={() => pick(r)}
                className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-start gap-2.5
                           border-b border-gray-50 last:border-0 transition-colors">
                <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">{label}</p>
                  {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-400">🇨🇦 Canada only · Street, city, province or postal code · tap 📍 to auto-detect</p>
    </div>
  );
}

function CalendarPicker({ value, onChange, maxDate }: { value: string; onChange: (d: string) => void; maxDate?: string }) {
  const today = new Date();
  const init = value ? new Date(value + 'T12:00:00') : new Date(today.getFullYear() - 25, 0, 1);
  const [viewYear, setViewYear]   = useState(init.getFullYear());
  const [viewMonth, setViewMonth] = useState(init.getMonth());
  const [selected, setSelected]   = useState(value);
  const [showYear, setShowYear]   = useState(false);

  useEffect(() => {
    if (value && value !== selected) {
      setSelected(value);
      const d = new Date(value + 'T12:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]); // eslint-disable-line
  const maxD = maxDate ? new Date(maxDate + 'T12:00:00') : today;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const monthName   = new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long' });
  const years       = Array.from({ length: 100 }, (_, i) => today.getFullYear() - i);
  const toISO = (y: number, m: number, d: number) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const pick = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    if (d > maxD) return;
    const iso = toISO(viewYear, viewMonth, day);
    setSelected(iso); onChange(iso);
  };
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button type="button" onClick={() => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); }}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 font-bold text-lg">‹</button>
        <button type="button" onClick={() => setShowYear(!showYear)}
          className="text-sm font-bold text-gray-900 hover:text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50">
          {monthName} {viewYear}
        </button>
        <button type="button" onClick={() => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); }}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 font-bold text-lg">›</button>
      </div>
      {showYear && (
        <div className="max-h-36 overflow-y-auto grid grid-cols-4 gap-1 p-2 bg-gray-50 border-b border-gray-100">
          {years.map(y => (
            <button key={y} type="button" onClick={() => { setViewYear(y); setShowYear(false); }}
              className={`py-1.5 text-xs font-semibold rounded-lg ${y===viewYear?'bg-blue-600 text-white':'hover:bg-gray-200 text-gray-700'}`}>
              {y}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-7 px-3 pt-3 pb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="text-center text-[10px] font-bold text-gray-400">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 px-3 pb-3 gap-0.5">
        {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
        {Array.from({length:daysInMonth}).map((_,i)=>{
          const day=i+1, iso=toISO(viewYear,viewMonth,day), isSel=iso===selected, isFut=new Date(viewYear,viewMonth,day)>maxD;
          return (
            <button key={day} type="button" disabled={isFut} onClick={()=>pick(day)}
              className={`aspect-square rounded-xl text-xs font-semibold flex items-center justify-center ${isSel?'bg-blue-600 text-white':isFut?'text-gray-200 cursor-not-allowed':'hover:bg-blue-50 text-gray-700'}`}>
              {day}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 text-center">
          <p className="text-xs text-blue-700 font-semibold">
            {new Date(selected+'T12:00:00').toLocaleDateString('en-CA',{month:'long',day:'numeric',year:'numeric'})}
          </p>
        </div>
      )}
    </div>
  );
}

function SField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function SInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white transition-all ${props.className||''}`}/>;
}

// ── Accordion item ──────────────────────────────────────────────────────────
function Accordion({ title, number, children, defaultOpen }: {
  title: string; number: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-gray-200 rounded-2xl bg-white">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-4 text-left transition-colors ${open ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
        <div className="flex items-center gap-3">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${open ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{number}</span>
          <span className={`text-sm font-bold ${open ? 'text-blue-700' : 'text-gray-800'}`}>{title}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}/>
      </button>
      {open && (
        <div className="px-4 pb-5 pt-2 border-t border-gray-100 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABOUT EDITOR MAIN
// ─────────────────────────────────────────────────────────────────────────────
interface Props {
  user: any; updateUser: (u: any) => Promise<any>;
  location: string; setLocation: (v:string)=>void;
  displayName: string; setDisplayName: (v:string)=>void;
  username: string; setUsername: (v:string)=>void;
  bio: string; setBio: (v:string)=>void;
  yearsExp: string; setYearsExp: (v:string)=>void;
  website: string; setWebsite: (v:string)=>void;
  instagram: string; setInstagram: (v:string)=>void;
  youtube: string; setYoutube: (v:string)=>void;
  tiktok: string; setTiktok: (v:string)=>void;
  primaryRole: string; setPrimaryRole: (v:string)=>void;
  secondaryRoles: string[]; setSecondaryRoles: (v:string[])=>void;
  skills: string[]; setSkills: (v:string[])=>void;
  gear: string[]; setGear: (v:string[])=>void;
  collab: string[]; setCollab: (v:string[])=>void;
  newBirthdate: string; setNewBirthdate: (v:string)=>void;
  editEmail: boolean; setEditEmail: (v:boolean)=>void;
  editPhone: boolean; setEditPhone: (v:boolean)=>void;
  newEmail: string; setNewEmail: (v:string)=>void;
  newPhone: string; setNewPhone: (v:string)=>void;
  otpSent: boolean; setOtpSent: (v:boolean)=>void;
  otpCode: string; setOtpCode: (v:string)=>void;
  otpVerifying: boolean; setOtpVerifying: (v:boolean)=>void;
  onSave: ()=>void; saving: boolean;
}

export function AboutEditor(props: Props) {
  const { user, updateUser, onSave, saving } = props;
  const [gearInput, setGearInput] = useState('');
  const toggleSkill = (v: string) => props.setSkills(props.skills.includes(v) ? props.skills.filter(s=>s!==v) : [...props.skills,v]);
  const addGear = () => { const t=gearInput.trim(); if(t&&!props.gear.includes(t)){props.setGear([...props.gear,t]);setGearInput('');} };

  // ── Education local state ──────────────────────────────────────────────────
  const [edu, setEdu] = useState<EduState>(() => {
    const raw = (user as any).education;
    if (raw && typeof raw === 'object' && Array.isArray(raw.entries)) return raw as EduState;
    return { entries: [], training: [] };
  });
  const [addingEdu, setAddingEdu] = useState(false);
  const [newEntry,  setNewEntry]  = useState<EduEntry>(() => blankEntry());
  const [trainingInput, setTrainingInput] = useState('');

  const saveEdu = async (next: EduState) => {
    setEdu(next);
    await updateUser({ education: next } as any).catch(() => {});
  };

  const commitEntry = async () => {
    if (!newEntry.school.trim()) return;
    const next = { ...edu, entries: [...edu.entries, { ...newEntry, id: newEntry.id || blankEntry().id }] };
    await saveEdu(next);
    setNewEntry(blankEntry()); setAddingEdu(false);
  };

  const deleteEntry = async (id: string) => {
    await saveEdu({ ...edu, entries: edu.entries.filter(e => e.id !== id) });
  };

  const toggleTraining = async (tag: string) => {
    const has = edu.training.includes(tag);
    await saveEdu({ ...edu, training: has ? edu.training.filter(t => t !== tag) : [...edu.training, tag] });
  };

  const addCustomTraining = async () => {
    const t = trainingInput.trim();
    if (!t || edu.training.includes(t)) return;
    await saveEdu({ ...edu, training: [...edu.training, t] });
    setTrainingInput('');
  };

  return (
    <div className="space-y-3">

      {/* 1. Personal Details */}
      <Accordion number="1" title="Personal Details" defaultOpen>
        <SField label="Email">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-800 font-semibold truncate flex-1">{user.email||'—'}</p>
            <button onClick={()=>{props.setEditEmail(!props.editEmail);props.setOtpSent(false);props.setOtpCode('');props.setNewEmail(user.email||'');}}
              className="text-xs text-blue-600 font-semibold ml-3 shrink-0 hover:underline">{props.editEmail?'Cancel':'Change'}</button>
          </div>
          {props.editEmail&&(
            <div className="space-y-2 mt-2">
              <SInput type="email" value={props.newEmail} onChange={e=>props.setNewEmail(e.target.value)} placeholder="new@email.com"/>
              {!props.otpSent?(
                <button onClick={async()=>{if(!props.newEmail.includes('@')){toast.error('Enter a valid email');return;}props.setOtpVerifying(true);try{await updateUser({email:props.newEmail}as any);props.setOtpSent(true);toast.success('Verification code sent');}catch{toast.error('Failed');}props.setOtpVerifying(false);}}
                  className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-xl">{props.otpVerifying?'Sending…':'Send verification code'}</button>
              ):(
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Enter code sent to <strong>{user.email}</strong></p>
                  <SInput value={props.otpCode} onChange={e=>props.setOtpCode(e.target.value)} maxLength={6} placeholder="000000" className="text-center text-lg font-bold tracking-widest"/>
                  <button onClick={async()=>{props.setOtpVerifying(true);try{await updateUser({email:props.newEmail}as any);props.setEditEmail(false);props.setOtpSent(false);props.setOtpCode('');toast.success('Email updated!');}catch{toast.error('Failed');}props.setOtpVerifying(false);}}
                    className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-xl">{props.otpVerifying?'Verifying…':'Confirm'}</button>
                </div>
              )}
            </div>
          )}
        </SField>
        <SField label="Phone">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-800 font-semibold flex-1">{(user as any).phone||'Not set'}</p>
            <button onClick={()=>{props.setEditPhone(!props.editPhone);props.setOtpSent(false);props.setOtpCode('');props.setNewPhone((user as any).phone||'');}}
              className="text-xs text-blue-600 font-semibold ml-3 shrink-0 hover:underline">{props.editPhone?'Cancel':'Change'}</button>
          </div>
          {props.editPhone&&(
            <div className="space-y-2 mt-2">
              <SInput type="tel" value={props.newPhone} onChange={e=>props.setNewPhone(e.target.value)} placeholder="+1 514 000-0000"/>
              {!props.otpSent?(
                <button onClick={async()=>{props.setOtpVerifying(true);try{const d=((user as any).phone||props.newPhone).replace(/\D/g,'');const r=await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/send-phone-otp`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${publicAnonKey}`},body:JSON.stringify({phone:'+'+d})});if(r.ok){props.setOtpSent(true);toast.success('Code sent');}else toast.error('Failed');}catch{toast.error('Failed');}props.setOtpVerifying(false);}}
                  className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-xl">{props.otpVerifying?'Sending…':'Send verification code'}</button>
              ):(
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Enter the code sent to your number</p>
                  <SInput value={props.otpCode} onChange={e=>props.setOtpCode(e.target.value)} maxLength={6} placeholder="000000" className="text-center text-lg font-bold tracking-widest"/>
                  <button onClick={async()=>{props.setOtpVerifying(true);try{await updateUser({phone:props.newPhone}as any);props.setEditPhone(false);props.setOtpSent(false);props.setOtpCode('');toast.success('Phone updated!');}catch{toast.error('Failed');}props.setOtpVerifying(false);}}
                    className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-xl">{props.otpVerifying?'Verifying…':'Confirm'}</button>
                </div>
              )}
            </div>
          )}
        </SField>
        <SField label="Birthday">
          <CalendarPicker value={props.newBirthdate||(user as any).birthdate?.slice(0,10)||''}
            onChange={async d=>{props.setNewBirthdate(d);await updateUser({birthdate:d}as any);toast.success('Birthday saved!');}}
            maxDate={new Date().toISOString().slice(0,10)}/>
        </SField>
      </Accordion>

      {/* 2. Overview */}
      <Accordion number="2" title="Overview">
        <SField label="Display name"><SInput value={props.displayName} onChange={e=>props.setDisplayName(e.target.value)} placeholder="Your full name"/></SField>
        <SField label="Username">
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus-within:border-blue-400">
            <span className="text-gray-400 text-sm">@</span>
            <input value={props.username} onChange={e=>props.setUsername(e.target.value.toLowerCase().replace(/\s/g,''))}
              placeholder="username" className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder:text-gray-400"/>
          </div>
        </SField>
        <SField label="Bio / Creator summary">
          <textarea value={props.bio} onChange={e=>props.setBio(e.target.value)} rows={4} maxLength={300}
            placeholder="Cinematographer specializing in music videos and commercial lighting."
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-400 resize-none bg-white"/>
          <p className="text-xs text-gray-400 text-right">{props.bio.length}/300</p>
        </SField>
        <SField label="Years of experience">
          <SInput type="number" min={0} max={50} value={props.yearsExp} onChange={e=>props.setYearsExp(e.target.value)} placeholder="e.g. 5"/>
        </SField>
      </Accordion>

      {/* 3. Professional Identity */}
      <Accordion number="3" title="Professional Identity">
        <ProfessionPicker
          primaryRole={props.primaryRole}
          onPrimaryChange={props.setPrimaryRole}
          secondaryRoles={props.secondaryRoles}
          onSecondaryChange={props.setSecondaryRoles}
          variant="light"
        />
      </Accordion>

      {/* 4. Skills & Specialties */}
      <Accordion number="4" title="Skills & Specialties">
        <p className="text-xs text-gray-400">Select all that apply to your creative work</p>
        <TagPicker all={ALL_SKILLS} selected={props.skills} onToggle={toggleSkill} placeholder="Search skills…"/>
      </Accordion>

      {/* 5. Gear & Tools */}
      <Accordion number="5" title="Gear & Tools">
        <p className="text-xs text-gray-400">Cameras, software, audio equipment you own or use</p>
        <div className="flex gap-2">
          <SInput value={gearInput} onChange={e=>setGearInput(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addGear();}}}
            placeholder="e.g. Sony FX3, DaVinci Resolve…"/>
          <button type="button" onClick={addGear}
            className="bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-xl shrink-0 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5"/>Add
          </button>
        </div>
        {props.gear.length>0&&(
          <div className="flex flex-wrap gap-1.5">
            {props.gear.map(g=>(
              <span key={g} className="flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-full">
                {g}<button onClick={()=>props.setGear(props.gear.filter(x=>x!==g))}><X className="w-3 h-3 hover:text-red-500"/></button>
              </span>
            ))}
          </div>
        )}
      </Accordion>

      {/* 6. Location */}
      <Accordion number="6" title="Location">
        <p className="text-xs text-gray-400 mb-1">Where you're based in Canada</p>
        <LocationSearch value={props.location} onChange={props.setLocation}/>
      </Accordion>

      {/* 7. Social & Links */}
      <Accordion number="7" title="Social & External Links">
        <SField label="Website">
          <SInput value={props.website} onChange={e=>props.setWebsite(e.target.value)} placeholder="https://yoursite.com"/>
          {props.website && <a href={props.website} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:underline truncate">🌐 {props.website}</a>}
        </SField>
        <SField label="Instagram">
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus-within:border-pink-400 focus-within:ring-2 focus-within:ring-pink-100 transition-all">
            {/* Real Instagram gradient icon */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
              <defs>
                <radialGradient id="ig1" cx="30%" cy="107%" r="150%">
                  <stop offset="0%" stopColor="#fdf497"/>
                  <stop offset="5%" stopColor="#fdf497"/>
                  <stop offset="45%" stopColor="#fd5949"/>
                  <stop offset="60%" stopColor="#d6249f"/>
                  <stop offset="90%" stopColor="#285AEB"/>
                </radialGradient>
              </defs>
              <rect width="24" height="24" rx="6" fill="url(#ig1)"/>
              <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" fill="none"/>
              <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
            </svg>
            <input value={props.instagram} onChange={e=>props.setInstagram(e.target.value)} placeholder="handle (without @)"
              className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder:text-gray-400"/>
          </div>
          {props.instagram && (
            <a href={`https://instagram.com/${props.instagram.replace('@','')}`} target="_blank" rel="noreferrer"
              className="mt-1 flex items-center gap-1 text-xs text-pink-600 hover:underline">
              instagram.com/{props.instagram.replace('@','')} ↗
            </a>
          )}
        </SField>
        <SField label="YouTube">
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100 transition-all">
            {/* Real YouTube icon */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <rect width="24" height="24" rx="5" fill="#FF0000"/>
              <polygon points="10,8 16,12 10,16" fill="white"/>
            </svg>
            <input value={props.youtube} onChange={e=>props.setYoutube(e.target.value)} placeholder="channel URL or @handle"
              className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder:text-gray-400"/>
          </div>
          {props.youtube && (
            <a href={props.youtube.startsWith('http') ? props.youtube : `https://youtube.com/${props.youtube}`}
              target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-red-600 hover:underline">
              {props.youtube.startsWith('http') ? props.youtube : `youtube.com/${props.youtube}`} ↗
            </a>
          )}
        </SField>
        <SField label="TikTok">
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus-within:border-gray-400 focus-within:ring-2 focus-within:ring-gray-100 transition-all">
            {/* Real TikTok icon */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <rect width="24" height="24" rx="5" fill="#000000"/>
              <path d="M16 7.5c1 .5 2 .5 2.5.5v2c-.5 0-1.5-.1-2.5-.6v4.8c0 2.2-1.8 4-4 4s-4-1.8-4-4 1.8-4 4-4c.2 0 .4 0 .6.1V12c-.2-.1-.4-.1-.6-.1-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2V4h2v3.5z" fill="white"/>
            </svg>
            <input value={props.tiktok} onChange={e=>props.setTiktok(e.target.value)} placeholder="@handle"
              className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder:text-gray-400"/>
          </div>
          {props.tiktok && (
            <a href={`https://tiktok.com/${props.tiktok.startsWith('@') ? props.tiktok : '@'+props.tiktok}`}
              target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-gray-700 hover:underline">
              tiktok.com/{props.tiktok.startsWith('@') ? props.tiktok : '@'+props.tiktok} ↗
            </a>
          )}
        </SField>
        <SField label="Vimeo">
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <rect width="24" height="24" rx="5" fill="#1AB7EA"/>
              <path d="M19.5 8.5c-.1 2.1-1.5 5-4.4 8.6C12.2 20.9 9.8 22 7.8 22c-1.1 0-2.1-.9-2.8-2.8L4 14.4C3.4 12.5 2.8 11.5 2 11.5l-1.5 1.1-.9-1.2C.8 10.4 2 9.2 3.3 8c1.5-1.4 2.8-2.1 3.8-2.2 2-.2 3.2 1.2 3.6 4.1.5 3.1.8 5 1 5.7.6 2.6 1.2 3.9 1.8 3.9.5 0 1.3-.8 2.3-2.5 1-1.6 1.5-2.9 1.6-3.8.1-1.4-.4-2.1-1.5-2.1-.5 0-1.1.1-1.7.4.1-3.1 2.4-4.7 4.3-4.5l.9-.5z" fill="white"/>
            </svg>
            <input value={(props as any).vimeo || ''} onChange={e=>(props as any).setVimeo?.(e.target.value)} placeholder="vimeo.com/username"
              className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder:text-gray-400"/>
          </div>
        </SField>
      </Accordion>

      {/* 8. Education & Training */}
      <Accordion number="8" title="Education & Training">
        <p className="text-xs text-gray-400">Optional — educational background and professional development</p>

        {/* Saved education entries */}
        <div className="space-y-2">
          {edu.entries.map(e => (
            <div key={e.id} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-gray-900">{e.school}</p>
                    {(e.schoolCity || e.schoolProvince) && (
                      <span className="text-[11px] text-gray-400">{[e.schoolCity, e.schoolProvince].filter(Boolean).join(', ')}</span>
                    )}
                    {!e.showOnProfile && (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Private</span>
                    )}
                  </div>
                  {(e.degree || e.field) && (
                    <p className="text-xs text-blue-600 font-medium mt-0.5">{[e.degree, e.field].filter(Boolean).join(' · ')}</p>
                  )}
                  {(e.startYear || e.endYear || e.current) && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {e.startYear}{e.startYear && (e.endYear || e.current) ? ' – ' : ''}{e.current ? 'Present' : e.endYear}
                    </p>
                  )}
                  {e.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{e.description}</p>
                  )}
                </div>
                <button type="button" onClick={() => deleteEntry(e.id)}
                  className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors mt-0.5">
                  <X className="w-3.5 h-3.5"/>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add entry form */}
        {addingEdu ? (
          <div className="border border-blue-200 rounded-xl bg-blue-50/30 p-4 space-y-4">
            <p className="text-xs font-black text-blue-700 uppercase tracking-widest">New Education Entry</p>

            <SField label="School / Institution">
              <SchoolFinder
                value={newEntry.school}
                onChange={(name, city, province) =>
                  setNewEntry(p => ({ ...p, school: name, schoolCity: city, schoolProvince: province }))
                }
              />
              {newEntry.schoolCity && (
                <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3"/> {newEntry.schoolCity}, {newEntry.schoolProvince}
                </p>
              )}
            </SField>

            <div className="grid grid-cols-2 gap-3">
              <SField label="Degree / Diploma">
                <select value={newEntry.degree} onChange={e => setNewEntry(p => ({...p, degree: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400 bg-white">
                  <option value="">Select…</option>
                  {DEGREE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </SField>
              <SField label="Field of Study">
                <SInput value={newEntry.field} onChange={e => setNewEntry(p => ({...p, field: e.target.value}))}
                  placeholder="e.g. Film Production"/>
              </SField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SField label="Start Year">
                <SInput type="number" min={1950} max={new Date().getFullYear()} value={newEntry.startYear}
                  onChange={e => setNewEntry(p => ({...p, startYear: e.target.value}))} placeholder="2018"/>
              </SField>
              <SField label="End Year">
                <SInput type="number" min={1950} max={new Date().getFullYear() + 6} value={newEntry.endYear}
                  onChange={e => setNewEntry(p => ({...p, endYear: e.target.value}))}
                  placeholder="2022" disabled={newEntry.current}/>
              </SField>
            </div>

            {/* Currently studying toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div onClick={() => setNewEntry(p => ({...p, current: !p.current, endYear: !p.current ? '' : p.endYear}))}
                className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${newEntry.current ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${newEntry.current ? 'translate-x-4' : ''}`}/>
              </div>
              <span className="text-xs text-gray-700 font-medium">Currently studying here</span>
            </label>

            <SField label="Description (optional)">
              <textarea value={newEntry.description}
                onChange={e => setNewEntry(p => ({...p, description: e.target.value}))}
                rows={3} maxLength={300}
                placeholder="e.g. Specialized in cinematography and lighting for narrative film."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900
                           placeholder:text-gray-400 outline-none focus:border-blue-400 resize-none bg-white"/>
              <p className="text-[11px] text-gray-400 text-right">{newEntry.description.length}/300</p>
            </SField>

            {/* Show on profile toggle */}
            <label className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer select-none">
              <div>
                <p className="text-xs font-semibold text-gray-700">Show on profile</p>
                <p className="text-[11px] text-gray-400">Visible to other users on your profile</p>
              </div>
              <div onClick={() => setNewEntry(p => ({...p, showOnProfile: !p.showOnProfile}))}
                className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${newEntry.showOnProfile ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${newEntry.showOnProfile ? 'translate-x-4' : ''}`}/>
              </div>
            </label>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={commitEntry} disabled={!newEntry.school.trim()}
                className="flex-1 py-2.5 bg-blue-600 disabled:opacity-40 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors">
                Save Entry
              </button>
              <button type="button" onClick={() => { setAddingEdu(false); setNewEntry(blankEntry()); }}
                className="px-4 py-2.5 bg-white border border-gray-200 text-xs font-bold text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAddingEdu(true)}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-xs font-bold text-gray-400
                       hover:border-blue-300 hover:text-blue-500 transition-colors flex items-center justify-center gap-2">
            <Plus className="w-3.5 h-3.5"/> Add Education
          </button>
        )}

        {/* Additional Training */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-bold text-gray-700 mb-1">Additional Training</p>
          <p className="text-[11px] text-gray-400 mb-3">Workshops, bootcamps, masterclasses, certifications, online courses</p>

          {/* Preset suggestions */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {TRAINING_SUGGESTIONS.map(tag => {
              const on = edu.training.includes(tag);
              return (
                <button key={tag} type="button" onClick={() => toggleTraining(tag)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-all flex items-center gap-1 ${
                    on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}>
                  {on && <Check className="w-2.5 h-2.5"/>}{tag}
                </button>
              );
            })}
          </div>

          {/* Custom training input */}
          <div className="flex gap-2">
            <SInput value={trainingInput} onChange={e => setTrainingInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTraining(); }}}
              placeholder="Add custom certification or training…"/>
            <button type="button" onClick={addCustomTraining}
              className="bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-xl shrink-0 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5"/>Add
            </button>
          </div>

          {/* Custom training tags */}
          {edu.training.filter(t => !TRAINING_SUGGESTIONS.includes(t)).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {edu.training.filter(t => !TRAINING_SUGGESTIONS.includes(t)).map(t => (
                <span key={t} className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full">
                  {t}
                  <button type="button" onClick={() => toggleTraining(t)}><X className="w-2.5 h-2.5 hover:text-red-500"/></button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Accordion>

      {/* 9. Collaboration */}
      <Accordion number="9" title="Collaboration Preferences">
        <p className="text-xs text-gray-400">Let others know what kind of work you're open to</p>
        <div className="flex flex-wrap gap-2">
          {COLLAB_OPTIONS.map(opt=>{
            const on=props.collab.includes(opt);
            return (
              <button key={opt} type="button"
                onClick={()=>props.setCollab(on?props.collab.filter(x=>x!==opt):[...props.collab,opt])}
                className={`text-sm px-3.5 py-2 rounded-full font-medium border-2 transition-all flex items-center gap-1.5 ${on?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                {on&&<Check className="w-3.5 h-3.5"/>}{opt}
              </button>
            );
          })}
        </div>
      </Accordion>

      {/* Save button */}
      <button onClick={onSave} disabled={saving}
        className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-colors text-sm">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin"/>Saving…</> : '💾 Save all changes'}
      </button>
    </div>
  );
}