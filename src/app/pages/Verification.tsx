import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { authApi } from '../lib/api';
import { sendEmail } from '../lib/emailjs-config';
import {
  ShieldCheck, ArrowLeft, ChevronRight, ChevronLeft, ChevronDown,
  Check, Upload, Camera, FileText, User, MapPin, CreditCard, AlertCircle,
  CheckCircle, X, Loader2, Info, Search, Navigation, XCircle,
  Phone, Home, Briefcase,
} from 'lucide-react';
import { supabase } from "../../lib/supabase";
import { uploadImage } from "../../lib/upload";

const STEPS = [
  { id: 1, label: 'Personal Information', icon: User       },
  { id: 2, label: 'Contact',              icon: Phone      },
  { id: 3, label: 'Location',             icon: MapPin     },
  { id: 4, label: 'Proof of Address',     icon: Home       },
  { id: 5, label: 'Identity',             icon: CreditCard },
  { id: 6, label: 'Face Verification',    icon: Camera     },
  { id: 7, label: 'Professional',         icon: Briefcase  },
  { id: 8, label: 'Review',               icon: CheckCircle},
];

const ROLE_CATEGORIES = [
  { label: 'Film & Video',  roles: ['Director','Cinematographer','Camera Operator','Gaffer','Grip','Producer','Video Editor','Colorist','VFX Artist','Sound Designer'] },
  { label: 'Photography',   roles: ['Photographer','Fashion Photographer','Retoucher','Studio Manager','Drone Photographer'] },
  { label: 'Music & Audio', roles: ['Music Producer','Beatmaker','Mixing Engineer','DJ','Composer'] },
  { label: 'Social Media',  roles: ['Content Creator','UGC Creator','YouTuber','Streamer','Podcast Producer'] },
  { label: 'Design',        roles: ['Graphic Designer','UI Designer','Motion Designer','Creative Director'] },
  { label: 'Animation/3D',  roles: ['3D Animator','Unreal Engine Artist','Blender Artist','Technical Artist'] },
  { label: 'Writing',       roles: ['Screenwriter','Copywriter','Story Editor','Narrative Designer'] },
  { label: 'Performing',    roles: ['Actor','Voice Actor','Dancer','Choreographer'] },
];

// ── ID type options — depend on where the ID was actually issued, not where
//    the creator lives. Canada/US get their normal government-issued photo
//    ID set; anything else gets the narrower set we can realistically
//    verify (passport, or a national ID card where the country's format is
//    known) — we deliberately don't accept foreign driver's licences, or
//    ask for health/SIN/citizenship cards for a routine Creator+ check.
function idTypeOptions(idCountry: string): { value: string; icon: string; recommended?: boolean }[] {
  if (idCountry === 'Canada') return [
    { value: "Driver's Licence", icon: '🪪', recommended: true },
    { value: 'Canadian Passport', icon: '🛂' },
    { value: 'Provincial/Territorial Photo ID', icon: '🪪' },
  ];
  if (idCountry === 'United States') return [
    { value: "Driver's License", icon: '🪪', recommended: true },
    { value: 'U.S. Passport', icon: '🛂' },
    { value: 'State-Issued Photo ID', icon: '🪪' },
  ];
  return [
    { value: 'Passport', icon: '🛂', recommended: true },
    { value: 'National Identity Card', icon: '🪪' },
  ];
}
const CA_PROVINCES = ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'];
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];
// Nominatim returns the full province/state name regardless of country —
// one combined lookup covers both without needing to branch on country.
const REGION_NAME_TO_ABBR: Record<string,string> = {
  'ontario':'ON','quebec':'QC','british columbia':'BC','alberta':'AB',
  'manitoba':'MB','saskatchewan':'SK','nova scotia':'NS','new brunswick':'NB',
  'prince edward island':'PE','newfoundland and labrador':'NL',
  'northwest territories':'NT','nunavut':'NU','yukon':'YT',
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
  'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
  'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
  'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
  'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
  'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
  'district of columbia':'DC',
};
function regionAbbrev(addr: any): string {
  const name = (addr.state || '').toLowerCase();
  return REGION_NAME_TO_ABBR[name] || addr.state_code || addr.state || '';
}

const ALL_COUNTRIES = [
  'Canada', 'United States',
  'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina',
  'Armenia','Australia','Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados',
  'Belarus','Belgium','Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina',
  'Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cabo Verde',
  'Cambodia','Cameroon','Central African Republic','Chad','Chile','China','Colombia',
  'Comoros','Congo (DRC)','Congo (Republic)','Costa Rica','Croatia','Cuba','Cyprus',
  'Czech Republic','Denmark','Djibouti','Dominica','Dominican Republic','Ecuador',
  'Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia',
  'Fiji','Finland','France','Gabon','Gambia','Georgia','Germany','Ghana','Greece',
  'Grenada','Guatemala','Guinea','Guinea-Bissau','Guyana','Haiti','Honduras','Hungary',
  'Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Jamaica',
  'Japan','Jordan','Kazakhstan','Kenya','Kiribati','Kuwait','Kyrgyzstan','Laos',
  'Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg',
  'Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands',
  'Mauritania','Mauritius','Mexico','Micronesia','Moldova','Monaco','Mongolia',
  'Montenegro','Morocco','Mozambique','Myanmar','Namibia','Nauru','Nepal','Netherlands',
  'New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia','Norway',
  'Oman','Pakistan','Palau','Palestine','Panama','Papua New Guinea','Paraguay','Peru',
  'Philippines','Poland','Portugal','Qatar','Romania','Russia','Rwanda',
  'Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Samoa',
  'San Marino','Sao Tome and Principe','Saudi Arabia','Senegal','Serbia','Seychelles',
  'Sierra Leone','Singapore','Slovakia','Slovenia','Solomon Islands','Somalia',
  'South Africa','South Korea','South Sudan','Spain','Sri Lanka','Sudan','Suriname',
  'Sweden','Switzerland','Syria','Taiwan','Tajikistan','Tanzania','Thailand',
  'Timor-Leste','Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan',
  'Tuvalu','Uganda','Ukraine','United Arab Emirates','United Kingdom','Uruguay',
  'Uzbekistan','Vanuatu','Vatican City','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
];

// ── Custom DOB Calendar ───────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_HEADER = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function DobCalendar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date();
  const maxYear = today.getFullYear() - 18;
  const maxDate = new Date(maxYear, today.getMonth(), today.getDate());

  const parsed = value ? new Date(value + 'T00:00:00') : null;
  const [open, setOpen]           = useState(false);
  const [viewYear, setViewYear]   = useState(parsed?.getFullYear() ?? maxYear);
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth());
  const [pickYear, setPickYear]   = useState(false);
  const calRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const years       = Array.from({ length: maxYear - 1920 + 1 }, (_, i) => maxYear - i);

  const isSelected = (d: number) =>
    !!parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth && parsed.getDate() === d;

  const isDisabled = (d: number) => new Date(viewYear, viewMonth, d) > maxDate;

  const selectDay = (d: number) => {
    if (isDisabled(d)) return;
    const m = String(viewMonth + 1).padStart(2,'0');
    const dd = String(d).padStart(2,'0');
    onChange(`${viewYear}-${m}-${dd}`);
    setOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    const ny = viewMonth === 11 ? viewYear + 1 : viewYear;
    const nm = viewMonth === 11 ? 0 : viewMonth + 1;
    if (new Date(ny, nm, 1) > maxDate) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const displayValue = parsed
    ? parsed.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div ref={calRef} className="relative">
      {/* Trigger field */}
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setPickYear(false); }}
        className="w-full flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors text-left"
      >
        <span className={`flex-1 ${displayValue ? 'text-gray-800' : 'text-gray-400'}`}>
          {displayValue || 'Select your date of birth'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Calendar dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <button
              type="button"
              onClick={() => setPickYear(v => !v)}
              className="flex items-center gap-1.5 text-sm font-bold text-gray-800 hover:text-blue-600 transition-colors"
            >
              {MONTHS[viewMonth]} {viewYear}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${pickYear ? 'rotate-180' : ''}`} />
            </button>
            <button type="button" onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          {pickYear ? (
            /* Year grid */
            <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto pr-1">
              {years.map(y => (
                <button key={y} type="button"
                  onClick={() => { setViewYear(y); setPickYear(false); }}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${y === viewYear ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}
                >
                  {y}
                </button>
              ))}
            </div>
          ) : (
            <>
              {/* Day header */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS_HEADER.map(d => (
                  <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
                ))}
              </div>
              {/* Days */}
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                  const sel = isSelected(d);
                  const dis = isDisabled(d);
                  return (
                    <button key={d} type="button" onClick={() => selectDay(d)} disabled={dis}
                      className={`aspect-square flex items-center justify-center rounded-full text-xs font-medium transition-all ${
                        sel ? 'bg-blue-600 text-white shadow-sm'
                        : dis ? 'text-gray-300 cursor-not-allowed'
                        : 'hover:bg-blue-50 text-gray-700 hover:text-blue-600'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {value && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-600">{displayValue}</span>
              <button type="button" onClick={() => { onChange(''); }} className="text-xs text-red-400 hover:text-red-600 font-medium">Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── File upload helper ────────────────────────────────────────────
function FileUploadZone({ label, accept, value, onChange }: {
  label: string; accept: string; value: string | null; onChange: (url: string, name: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => onChange(reader.result as string, file.name);
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      {value ? (
        <div className="relative rounded-2xl overflow-hidden border-2 border-green-200 bg-green-50">
          {value.startsWith('data:image') ? (
            <img src={value} alt={label} className="w-full h-40 object-cover" />
          ) : (
            <div className="h-24 flex items-center justify-center gap-3">
              <FileText className="w-8 h-8 text-green-500" />
              <div><p className="text-sm font-semibold text-green-700">Document uploaded</p><p className="text-xs text-green-500">Click to replace</p></div>
            </div>
          )}
          <button onClick={() => onChange('', '')} className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full shadow flex items-center justify-center text-gray-500 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-green-600 text-white text-xs font-semibold py-1.5 text-center flex items-center justify-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> {label} uploaded
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          className={`w-full border-2 border-dashed rounded-2xl py-8 flex flex-col items-center gap-2 transition-all ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'}`}
        >
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
            <Upload className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          <p className="text-xs text-gray-400">Drag & drop or tap to upload</p>
          <p className="text-[10px] text-gray-300">JPG, PNG or PDF · Max 10 MB</p>
        </button>
      )}
    </div>
  );
}

// ── Step hero — shared gradient header card for every step ──────────
function StepHero({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-[28px] p-5 text-white shadow-lg shadow-blue-900/10"
      style={{ background: 'linear-gradient(135deg,#2563eb 0%,#4338ca 55%,#3730a3 100%)' }}
    >
      <div className="absolute -top-10 -right-8 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-6 w-32 h-32 bg-indigo-300/20 rounded-full blur-2xl pointer-events-none" />
      <div className="relative flex items-center gap-3.5">
        <div className="w-11 h-11 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center ring-1 ring-white/25 shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          <p className="text-blue-100/90 text-xs mt-0.5">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

// ── Guideline row — icon-badged do/don't line, used in place of emoji bullets ──
function GuidelineRow({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-gray-700">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${ok ? 'bg-green-100' : 'bg-red-100'}`}>
        {ok ? <Check className="w-3 h-3 text-green-600" /> : <XCircle className="w-3 h-3 text-red-500" />}
      </div>
      <span>{children}</span>
    </div>
  );
}

// ── Review row — label/value pair used on the final summary step ──────
function ReviewRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs text-gray-400 shrink-0">{label}</span>
      <span className="text-sm font-semibold text-gray-800 text-right">{value}</span>
    </div>
  );
}

export function Verification() {
  const { user, isAuthenticated, updateUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Personal
  const [legalName, setLegalName] = useState('');
  const [dob, setDob] = useState('');
  // Residence, ID-issuing country, and (implicitly) nationality are kept as
  // separate concepts — an immigrant, international student, or permanent
  // resident can live here without holding a Canadian/US ID, so residence
  // must never be assumed to equal ID country. The ID-country question is
  // fully standalone (Canada / US / Other), not relative to residence.
  const [residenceCountry, setResidenceCountry] = useState<'Canada' | 'United States' | ''>('');

  // Step 2: Contact — email is always verified by the time a user can reach
  // this page (Root.tsx redirects unverified emails to /verify-email before
  // any other route, this one included), so only phone needs an inline flow.
  const [phone, setPhone] = useState(user?.phone || '');
  const [phoneVerified, setPhoneVerified] = useState(!!user?.phoneVerified);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  // Step 3: Location
  const [streetAddr, setStreetAddr] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [addrSearch, setAddrSearch]           = useState('');
  const [addrSuggestions, setAddrSuggestions] = useState<any[]>([]);
  const [addrShowSug, setAddrShowSug]         = useState(false);
  const [addrSearching, setAddrSearching]     = useState(false);
  const [addrFilled, setAddrFilled]           = useState(false);
  const addrTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addrSugRef  = useRef<HTMLDivElement>(null);

  // Step 4: Proof of Address
  const [utilityBill, setUtilityBill] = useState('');

  // Step 5: Identity
  const [idCountryChoice, setIdCountryChoice] = useState<'Canada' | 'United States' | 'Other' | ''>('');
  // The actual issuing country when idCountryChoice is 'Other' — stores the
  // real country name (e.g. "France", "Nigeria"), never the literal "Other".
  const [otherIdCountry, setOtherIdCountry] = useState('');
  const issuingCountry = idCountryChoice === 'Other' ? otherIdCountry : idCountryChoice;
  const [idType, setIdType] = useState('');
  const [govId, setGovId] = useState('');

  // Step 6: Face Verification
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [selfieUrl, setSelfieUrl] = useState('');
  const [cameraError, setCameraError] = useState('');

  // Step 7: Professional (optional)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [skillsText, setSkillsText]       = useState('');
  const [portfolioUrl, setPortfolioUrl]   = useState('');

  // Step 8: Review & consent
  const [consentId, setConsentId] = useState(false);
  const [consentData, setConsentData] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/login');
    if (user) { setLegalName(user.name || ''); }
  }, [isAuthenticated, user]);

  // Available ID types differ per issuing country — drop a selection that
  // no longer applies (e.g. switching from Canada to a different country).
  useEffect(() => {
    if (idType && !idTypeOptions(issuingCountry).some(o => o.value === idType)) setIdType('');
  }, [issuingCountry]); // eslint-disable-line

  useEffect(() => {
    return () => { cameraStream?.getTracks().forEach(t => t.stop()); };
  }, [cameraStream]);

  // Attach stream to <video> after it mounts (cameraStream state → re-render → videoRef available)
  useEffect(() => {
    if (!cameraStream || !videoRef.current) return;
    videoRef.current.srcObject = cameraStream;
    videoRef.current.play().catch(err => {
      console.error('Video play error:', err);
    });
  }, [cameraStream]);

  // Click-outside for address suggestions
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (addrSugRef.current && !addrSugRef.current.contains(e.target as Node)) setAddrShowSug(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Phone OTP ──────────────────────────────────────────────────────
  const sendOtp = async () => {
    if (!phone.trim()) { toast.error('Enter your phone number'); return; }
    setOtpSending(true);
    try {
      await authApi.sendPhoneOTP(phone);
      setOtpSent(true);
      toast.success('Verification code sent!');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send code');
    }
    setOtpSending(false);
  };

  const verifyOtp = async () => {
    if (!otpCode.trim()) { toast.error('Enter the code you received'); return; }
    setOtpVerifying(true);
    try {
      await authApi.verifyPhoneOTP(phone, otpCode);
      setPhoneVerified(true);
      updateUser?.({ phone, phoneVerified: true } as any);
      toast.success('Phone verified!');
    } catch (e: any) {
      toast.error(e?.message || 'Invalid code — please try again');
    }
    setOtpVerifying(false);
  };

  // Address autocomplete handlers
  const handleAddrSearch = useCallback((val: string) => {
    setAddrSearch(val);
    setAddrFilled(false);
    if (addrTimeout.current) clearTimeout(addrTimeout.current);
    if (!val.trim() || val.length < 3) { setAddrSuggestions([]); setAddrShowSug(false); return; }
    addrTimeout.current = setTimeout(async () => {
      setAddrSearching(true);
      try {
        // Use Nominatim for address search (free, no edge function needed)
        const cc = residenceCountry === 'United States' ? 'us' : 'ca';
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&countrycodes=${cc}&format=json&addressdetails=1&limit=6`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'FilmonsApp/1.0' } }
        );
        const results = await res.json();
        // Map Nominatim results to the format used by the address picker
        const predictions = (results || []).map((r: any) => ({
          place_id: r.place_id,
          description: r.display_name,
          structured_formatting: {
            main_text: r.display_name.split(',')[0],
            secondary_text: r.display_name.split(',').slice(1).join(',').trim(),
          },
          _nominatim: r, // raw data for detail lookup
        }));
        setAddrSuggestions(predictions);
        setAddrShowSug(predictions.length > 0);
      } catch { setAddrSuggestions([]); }
      finally { setAddrSearching(false); }
    }, 400);
  }, [residenceCountry]);

  const handleAddrSelect = useCallback(async (s: any) => {
    setAddrSearch(s.structured_formatting?.main_text || s.description);
    setAddrShowSug(false);
    try {
      // Use Nominatim data already in the result
      const r = s._nominatim;
      const addr = r?.address || {};
      const streetNum  = addr.house_number || '';
      const streetName = addr.road || '';
      const street     = [streetNum, streetName].filter(Boolean).join(' ');
      const city       = addr.city || addr.town || addr.village || addr.municipality || '';
      const province   = regionAbbrev(addr);
      const postal = (addr.postcode || '').replace(' ','').toUpperCase();
      setStreetAddr(street || s.structured_formatting?.main_text || '');
      setCity(city);
      setProvince(province);
      setPostalCode(postal);
      setAddrSearch(street || s.structured_formatting?.main_text || '');
      setAddrFilled(true);
      toast.success('Address filled!');
    } catch {
      setStreetAddr(s.structured_formatting?.main_text || s.description);
      setAddrFilled(true);
    }
  }, []);

  const handleAddrGPS = useCallback(() => {
    if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
    toast.info('Detecting location…');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude: lat, longitude: lng } = pos.coords;
        // Use Nominatim (free, no API key needed)
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'FilmonsApp/1.0' } }
        );
        const data = await res.json();
        const addr = data.address || {};

        const expectedCC = residenceCountry === 'United States' ? 'us' : 'ca';
        if (addr.country_code && addr.country_code !== expectedCC) {
          toast.error(`Location must be in ${residenceCountry || 'your country of residence'}.`);
          return;
        }

        const streetNum  = addr.house_number || '';
        const streetName = addr.road || '';
        const street     = [streetNum, streetName].filter(Boolean).join(' ');
        const city       = addr.city || addr.town || addr.village || addr.municipality || '';
        const province   = regionAbbrev(addr);
        const postal     = (addr.postcode || '').replace(' ','').toUpperCase();

        setStreetAddr(street);
        setCity(city);
        setProvince(province);
        setPostalCode(postal);
        setAddrSearch(street || data.display_name?.split(',')[0] || '');
        setAddrFilled(true);
        toast.success('Address detected!');
      } catch (e) {
        console.error('GPS geocode error:', e);
        toast.error('Failed to detect location — please enter manually.');
      }
    }, (err) => {
      if (err.code === 1) toast.error('Location access denied. Please allow location in browser settings.');
      else toast.error('Could not get your location.');
    }, { timeout: 10000, maximumAge: 60000 });
  }, [residenceCountry]);

  const highlightAddr = (text: string) => {
    if (!addrSearch.trim()) return <span>{text}</span>;
    const q = addrSearch.toLowerCase();
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return <span>{text}</span>;
    return <span>{text.slice(0, idx)}<strong className="text-blue-700">{text.slice(idx, idx + q.length)}</strong>{text.slice(idx + q.length)}</span>;
  };

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setCameraStream(stream);
      // ⚠️ Do NOT set srcObject here — videoRef.current is null until React re-renders
      // The useEffect above handles it after the <video> mounts
    } catch (e: any) {
      console.error('Camera error:', e);
      const msg = e?.name === 'NotAllowedError'
        ? 'Camera permission denied. Please click the camera icon in your browser address bar and allow access, then try again.'
        : e?.name === 'NotFoundError'
        ? 'No camera found on this device.'
        : `Camera error: ${e?.message || 'Unknown error'}`;
      setCameraError(msg);
    }
  };

  const takeSelfie = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    setSelfieUrl(canvasRef.current.toDataURL('image/jpeg', 0.8));
    cameraStream?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
  };

  const toggleRole = (role: string) => setSelectedRoles(prev =>
    prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role].slice(0, 3)
  );

  const handleNext = () => {
    if (step === 1) {
      if (!residenceCountry) { toast.error('Please select your country of residence'); return; }
      if (!legalName.trim()) { toast.error('Legal name is required'); return; }
      if (!dob) { toast.error('Date of birth is required'); return; }
    }
    if (step === 2) {
      if (!phoneVerified) { toast.error('Please verify your phone number to continue'); return; }
    }
    if (step === 3) {
      if (!city.trim()) { toast.error('City is required'); return; }
      if (!province) { toast.error(residenceCountry === 'United States' ? 'State is required' : 'Province is required'); return; }
      if (!postalCode.trim()) { toast.error(residenceCountry === 'United States' ? 'ZIP code is required' : 'Postal code is required'); return; }
    }
    if (step === 4) {
      if (!utilityBill) { toast.error('Please upload proof of address'); return; }
    }
    if (step === 5) {
      if (!idCountryChoice) { toast.error('Please select the country that issued your ID'); return; }
      if (idCountryChoice === 'Other' && !otherIdCountry) { toast.error('Please select the issuing country'); return; }
      if (!idType) { toast.error('Please select an ID type'); return; }
      if (!govId) { toast.error('Please upload your government ID'); return; }
    }
    if (step === 6) {
      if (!selfieUrl) { toast.error('Please take a selfie first'); return; }
    }
    // Step 7 (Professional) is optional — no validation.
    if (step === 8) {
      if (!consentId || !consentData || !consentPrivacy) { toast.error('Please agree to all terms to continue'); return; }
      handleSubmit();
      return;
    }
    setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!selfieUrl) { toast.error('Please take a selfie first'); return; }
    setLoading(true);

    const submittedAt = new Date().toISOString();
    const recordId = `ver-${user.id}-${Date.now()}`;

    // 1. Upload documents (await — don't navigate until done)
    let govIdUrl   = govId;
    let utilityUrl = utilityBill;
    let selfieUp   = selfieUrl;
    try {
      const ts = Date.now();
      const [a, b, c] = await Promise.all([
        uploadImage(govId,       `${user.id}/gov-id-${ts}.jpg`),
        uploadImage(utilityBill, `${user.id}/utility-${ts}.jpg`),
        uploadImage(selfieUrl,   `${user.id}/selfie-${ts}.jpg`),
      ]);
      govIdUrl = a; utilityUrl = b; selfieUp = c;
    } catch (uploadErr) {
      console.warn('Storage upload failed — using base64:', uploadErr);
    }

    // 2. Save to localStorage immediately
    const localRecord = {
      id: recordId, userId: user.id, userName: user.name,
      userEmail: user.email || '', userPhone: phone,
      phoneVerified, emailVerified: true, fullName: legalName,
      dob, streetAddr, city, province, postalCode, residenceCountry, issuingCountry, idType,
      roles: selectedRoles, skills: skillsText, portfolioUrl,
      govIdPhoto: govIdUrl, utilityBillPhoto: utilityUrl, selfiePhoto: selfieUp,
      status: 'pending' as const, submittedAt, reviewedAt: null, reviewedBy: null,
    };
    try {
      const existing = JSON.parse(localStorage.getItem('verificationRequests') || '[]');
      localStorage.setItem('verificationRequests', JSON.stringify(
        [localRecord, ...existing.filter((r: any) => r.userId !== user.id)]
      ));
    } catch {}

    // 3. Write directly to Supabase table (bypasses blocked edge function)
    try {
      const metadata = {
        userName: user.name, phone,
        dob, streetAddr, city, province, postalCode,
        residenceCountry, issuingCountry, idType,
        roles: selectedRoles, skills: skillsText, portfolioUrl,
        govIdUrl, utilityBillUrl: utilityUrl, selfieUrl: selfieUp,
      };
      const { error: dbErr } = await supabase
        .from('verification_requests')
        .upsert({
          id:           recordId,
          user_id:      user.id,
          full_name:    legalName,
          email:        user.email || '',
          status:       'pending',
          submitted_at: submittedAt,
          metadata,
        }, { onConflict: 'user_id' });

      if (dbErr) console.warn('Supabase insert error:', dbErr.message);
      else       console.log('✅ Verification saved to verification_requests');
    } catch (dbErr) {
      console.warn('Supabase insert failed — data preserved in localStorage:', dbErr);
    }

    // 4. Update local session
    try {
      const SESSION_KEY = 'filmons_current_user';
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, verificationStatus: 'pending' }));
      const users: any[] = JSON.parse(localStorage.getItem('filmons_users') || '[]');
      localStorage.setItem('filmons_users', JSON.stringify(
        users.map(u => u.id === user.id ? { ...u, verificationStatus: 'pending' } : u)
      ));
    } catch {}

    // 5. Email admin
    sendEmail('template_rd3nhik', {
      to_email: 'filmons481@gmail.com', to_name: 'Admin',
      user_name: legalName || user.name, user_email: user.email || '',
      user_id: user.id, id_type: idType, city, province,
      submitted_at: new Date().toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }),
      admin_url: `${window.location.origin}/admin-verifications`,
    }).catch(e => console.warn('Admin email failed:', e));

    setLoading(false);
    toast.success('Verification submitted! Our team will review within 1–3 business days.');
    setTimeout(() => navigate('/profile'), 1500);
  };
  if (!user) return null;
  if (user.isVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%)' }}>
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto"><ShieldCheck className="w-10 h-10 text-green-600"/></div>
          <h2 className="text-2xl font-bold text-gray-900">Already Verified</h2>
          <p className="text-gray-500 text-sm">Your Creator+ account is active and verified.</p>
          <button onClick={() => navigate('/profile')} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3">Back to Profile</button>
        </div>
      </div>
    );
  }

  if (user.verificationStatus === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%)' }}>
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto"><Loader2 className="w-10 h-10 text-amber-500 animate-spin"/></div>
          <h2 className="text-2xl font-bold text-gray-900">Review in Progress</h2>
          <p className="text-gray-500 text-sm">Your verification is being reviewed by our team. This typically takes 1–3 business days.</p>
          <button onClick={() => navigate('/profile')} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3">Back to Profile</button>
        </div>
      </div>
    );
  }

  if (user.verificationStatus === 'rejected' || user.verificationStatus === 'denied') {
    const localReqs = (() => { try { return JSON.parse(localStorage.getItem('verificationRequests') || '[]'); } catch { return []; } })();
    const myReq = localReqs.find((r: any) => r.userId === user.id);
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%)' }}>
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto"><X className="w-10 h-10 text-red-500"/></div>
          <h2 className="text-2xl font-bold text-gray-900">Verification Denied</h2>
          {myReq?.rejectionReason && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-left"><p className="text-xs font-bold text-red-600 mb-1">Reason</p><p className="text-sm text-red-700">{myReq.rejectionReason}</p></div>}
          <p className="text-gray-500 text-sm">Please review the reason and resubmit with corrected documents.</p>
          <button onClick={() => { try { const u = JSON.parse(localStorage.getItem('filmons_current_user') || 'null'); if(u){u.verificationStatus='';localStorage.setItem('filmons_current_user',JSON.stringify(u));} } catch{} window.location.reload(); }} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3">Resubmit Verification</button>
        </div>
      </div>
    );
  }

  if (user.verificationStatus === 'needs_resubmission') {
    const localReqs = (() => { try { return JSON.parse(localStorage.getItem('verificationRequests') || '[]'); } catch { return []; } })();
    const myReq = localReqs.find((r: any) => r.userId === user.id);
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%)' }}>
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto"><Upload className="w-10 h-10 text-orange-500"/></div>
          <h2 className="text-2xl font-bold text-gray-900">New Documents Required</h2>
          {myReq?.rejectionReason && <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-left"><p className="text-xs font-bold text-orange-600 mb-1">Admin note</p><p className="text-sm text-orange-700">{myReq.rejectionReason}</p></div>}
          <p className="text-gray-500 text-sm">The admin has requested new documents. You can continue from where you left off.</p>
          <button onClick={() => { setStep(4); try { const u = JSON.parse(localStorage.getItem('filmons_current_user') || 'null'); if(u){u.verificationStatus='';localStorage.setItem('filmons_current_user',JSON.stringify(u));} } catch{} }} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl py-3">Upload New Documents</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%)' }}>
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => step > 1 ? setStep(s => s - 1) : navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-gray-900">Creator+ Verification</h1>
              <p className="text-xs text-gray-400 truncate">{STEPS[step-1].label}</p>
            </div>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full shrink-0">{step}/{STEPS.length}</span>
          </div>
          <div className="mt-2.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(step / STEPS.length) * 100}%`, background: 'linear-gradient(90deg,#3b82f6,#4f46e5)' }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* ── Step 1: Personal Information ── */}
        {step === 1 && (
          <>
            <StepHero icon={<User className="w-5 h-5"/>} title="Personal Information" subtitle="Provide your legal details for identity verification" />

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              {/* Country of residence is kept to just the two launch markets
                  rather than a 190-country list — separate question from
                  where the creator's ID is from (asked later, in Identity). */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Country of Residence *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setResidenceCountry('Canada')}
                    className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${residenceCountry === 'Canada' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    🇨🇦 Canada
                  </button>
                  <button type="button" onClick={() => setResidenceCountry('United States')}
                    className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${residenceCountry === 'United States' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    🇺🇸 United States
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Full Legal Name *</label>
                <input value={legalName} onChange={e=>setLegalName(e.target.value)} placeholder="As it appears on your ID"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Date of Birth *</label>
                <DobCalendar value={dob} onChange={setDob} />
                <p className="text-xs text-gray-400">You must be at least 18 years old to use Creator+.</p>
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: Contact ── */}
        {step === 2 && (
          <>
            <StepHero icon={<Phone className="w-5 h-5"/>} title="Contact" subtitle="Confirm your email and verify your phone number" />

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              {/* Email — always verified by the time this page is reachable */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Email</label>
                <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                  <span className="flex-1 text-sm text-gray-700 truncate">{user.email}</span>
                  <span className="flex items-center gap-1 text-xs font-bold text-green-600 shrink-0">
                    <CheckCircle className="w-3.5 h-3.5"/> Verified
                  </span>
                </div>
              </div>

              {/* Phone — verify inline via OTP */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Phone Number *</label>
                {phoneVerified ? (
                  <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                    <span className="flex-1 text-sm font-semibold text-green-800">{phone}</span>
                    <span className="flex items-center gap-1 text-xs font-bold text-green-600 shrink-0">
                      <CheckCircle className="w-3.5 h-3.5"/> Verified
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+1 (555) 123-4567" disabled={otpSent}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"/>
                      {!otpSent && (
                        <button type="button" onClick={sendOtp} disabled={otpSending}
                          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors shrink-0">
                          {otpSending ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Send Code'}
                        </button>
                      )}
                    </div>
                    {otpSent && (
                      <div className="flex gap-2 mt-2">
                        <input value={otpCode} onChange={e=>setOtpCode(e.target.value)} placeholder="Enter 6-digit code" maxLength={6}
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                        <button type="button" onClick={verifyOtp} disabled={otpVerifying}
                          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors shrink-0">
                          {otpVerifying ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Verify'}
                        </button>
                      </div>
                    )}
                    {otpSent && (
                      <button type="button" onClick={sendOtp} disabled={otpSending} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">
                        Resend code
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Step 3: Location ── */}
        {step === 3 && (
          <>
            <StepHero icon={<MapPin className="w-5 h-5"/>} title="Location" subtitle="Where do you currently live?" />

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Residential Address{residenceCountry ? ` (${residenceCountry})` : ''}</label>
              <div ref={addrSugRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  {addrSearching
                    ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 animate-spin" />
                    : addrSearch
                      ? <button type="button" onClick={() => { setAddrSearch(''); setStreetAddr(''); setCity(''); setProvince(''); setPostalCode(''); setAddrFilled(false); setAddrSuggestions([]); setAddrShowSug(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="w-3.5 h-3.5" /></button>
                      : null
                  }
                  <input
                    value={addrSearch}
                    onChange={e => handleAddrSearch(e.target.value)}
                    onFocus={() => addrSuggestions.length > 0 && setAddrShowSug(true)}
                    placeholder={`Search your street address in ${residenceCountry || 'your country'}…`}
                    className="w-full border border-gray-200 rounded-xl pl-9 pr-9 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                </div>
                {addrShowSug && addrSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                    {addrSuggestions.map(s => (
                      <button key={s.place_id} type="button"
                        onMouseDown={e => { e.preventDefault(); handleAddrSelect(s); }}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left group"
                      >
                        <MapPin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5 group-hover:text-blue-600" />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 font-medium truncate">
                            {highlightAddr(s.structured_formatting?.main_text || s.description)}
                          </p>
                          {s.structured_formatting?.secondary_text && (
                            <p className="text-xs text-gray-400 truncate mt-0.5">{s.structured_formatting.secondary_text}</p>
                          )}
                        </div>
                      </button>
                    ))}
                    <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400">Powered by Google Maps</div>
                  </div>
                )}
              </div>

              {/* GPS button */}
              <button type="button" onClick={handleAddrGPS}
                className="flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-xl px-3 py-2 transition-colors"
              >
                <Navigation className="w-3.5 h-3.5" /> Use my current location
              </button>

              {/* Filled address fields */}
              {addrFilled && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-bold text-green-700">Address confirmed</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Street</label>
                      <input value={streetAddr} onChange={e => setStreetAddr(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1 col-span-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">City</label>
                        <input value={city} onChange={e => setCity(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">{residenceCountry === 'United States' ? 'State' : 'Prov.'}</label>
                        <select value={province} onChange={e => setProvince(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                          <option value="">--</option>
                          {(residenceCountry === 'United States' ? US_STATES : CA_PROVINCES).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">{residenceCountry === 'United States' ? 'ZIP' : 'Postal'}</label>
                        <input value={postalCode} onChange={e => setPostalCode(e.target.value.toUpperCase())} maxLength={residenceCountry === 'United States' ? 5 : 7}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Manual fallback toggle */}
              {!addrFilled && (
                <button type="button" onClick={() => setAddrFilled(true)}
                  className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
                >
                  Enter address manually
                </button>
              )}
            </div>
          </>
        )}

        {/* ── Step 4: Proof of Address ── */}
        {step === 4 && (
          <>
            <StepHero icon={<Home className="w-5 h-5"/>} title="Proof of Address" subtitle="Upload a document confirming the address you entered" />

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <p className="text-xs text-gray-500">A recent utility bill, bank statement, or government mail (within 3 months)</p>
              <FileUploadZone label="Utility Bill / Proof of Address" accept="image/*,.pdf"
                value={utilityBill || null} onChange={(url) => setUtilityBill(url)} />
              <div className="space-y-1.5 pt-1">
                <GuidelineRow ok>Ensure the document is well-lit and fully visible</GuidelineRow>
                <GuidelineRow ok>Address on the document must match what you entered</GuidelineRow>
              </div>
            </div>
          </>
        )}

        {/* ── Step 5: Identity ── */}
        {step === 5 && (
          <>
            <StepHero icon={<CreditCard className="w-5 h-5"/>} title="Identity" subtitle="Tell us where your ID is from, then upload it" />

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              {/* Country that issued the ID — standalone question, not
                  relative to residence (immigrants, international students,
                  and permanent residents may hold a foreign ID). When
                  "Other" is picked, otherIdCountry stores the real country
                  name (e.g. "France"), never the literal "Other". */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Country that Issued Your ID *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setIdCountryChoice('Canada')}
                    className={`px-2 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border-2 transition-all ${idCountryChoice === 'Canada' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    🇨🇦 Canada
                  </button>
                  <button type="button" onClick={() => setIdCountryChoice('United States')}
                    className={`px-2 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border-2 transition-all ${idCountryChoice === 'United States' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    🇺🇸 United States
                  </button>
                  <button type="button" onClick={() => setIdCountryChoice('Other')}
                    className={`px-2 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border-2 transition-all ${idCountryChoice === 'Other' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    🌍 Other
                  </button>
                </div>
                {idCountryChoice === 'Other' && (
                  <div className="space-y-1 mt-2">
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Select Issuing Country</label>
                    <select value={otherIdCountry} onChange={e=>setOtherIdCountry(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="">Choose country…</option>
                      {ALL_COUNTRIES.filter(c => c !== 'Canada' && c !== 'United States').map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Choose Your ID Type *</label>
                <select value={idType} onChange={e=>setIdType(e.target.value)} disabled={!issuingCountry}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white disabled:bg-gray-50 disabled:text-gray-400">
                  <option value="">{issuingCountry ? 'Select ID type' : 'Select a country above first'}</option>
                  {idTypeOptions(issuingCountry).map(o=><option key={o.value} value={o.value}>{o.icon} {o.value}{o.recommended ? ' — Recommended' : ''}</option>)}
                </select>
                {issuingCountry && issuingCountry !== 'Canada' && issuingCountry !== 'United States' && (
                  <p className="text-xs text-gray-400">Foreign driver's licences aren't accepted yet — a passport or national ID card is required.</p>
                )}
              </div>

              {idType && (
                <div className="pt-1">
                  <h3 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2"><CreditCard className="w-4 h-4 text-blue-500"/>Upload Your {idType}</h3>
                  <FileUploadZone label="Government ID Photo" accept="image/*,.pdf"
                    value={govId || null} onChange={(url) => setGovId(url)} />
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Step 6: Face Verification ── */}
        {step === 6 && (
          <>
            <StepHero icon={<Camera className="w-5 h-5"/>} title="Face Verification" subtitle="Take a selfie to verify your identity" />

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              {selfieUrl ? (
                <>
                  <div className="relative rounded-2xl overflow-hidden">
                    <img src={selfieUrl} alt="Selfie" className="w-full h-64 object-cover"/>
                    <div className="absolute bottom-0 left-0 right-0 bg-green-600/90 text-white text-xs font-semibold py-2 text-center flex items-center justify-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5"/> Selfie captured
                    </div>
                  </div>
                  <button onClick={() => { setSelfieUrl(''); }} className="w-full border border-gray-200 hover:bg-gray-50 text-gray-600 font-semibold rounded-xl py-2.5 text-sm transition-colors">
                    Retake Selfie
                  </button>
                </>
              ) : cameraStream ? (
                <>
                  <div className="relative rounded-2xl overflow-hidden bg-black">
                    <video ref={videoRef} autoPlay muted playsInline className="w-full h-64 object-cover"/>
                    {/* Oval guide */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-64 border-4 border-white/60 rounded-full"/>
                    </div>
                  </div>
                  <canvas ref={canvasRef} className="hidden"/>
                  <button onClick={takeSelfie} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3 transition-colors flex items-center justify-center gap-2">
                    <Camera className="w-5 h-5"/> Take Selfie
                  </button>
                </>
              ) : (
                <>
                  <div className="h-48 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-3 bg-gray-50">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center"><Camera className="w-8 h-8 text-blue-400"/></div>
                    <p className="text-sm text-gray-500 text-center">Camera preview will appear here</p>
                  </div>
                  {cameraError && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5"/>
                      <p className="text-xs text-red-700">{cameraError}</p>
                    </div>
                  )}
                  <button onClick={startCamera} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3 transition-colors flex items-center justify-center gap-2">
                    <Camera className="w-5 h-5"/> Start Camera
                  </button>
                </>
              )}

              <div className="space-y-1.5">
                <GuidelineRow ok>Face the camera directly in good lighting</GuidelineRow>
                <GuidelineRow ok>Remove glasses and hats if possible</GuidelineRow>
                <GuidelineRow ok>Position your face within the oval frame</GuidelineRow>
              </div>

              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-start gap-2">
                <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5"/>
                <p className="text-xs text-gray-500">Your selfie is compared against your government ID and is not stored on your device.</p>
              </div>
            </div>
          </>
        )}

        {/* ── Step 7: Professional ── */}
        {step === 7 && (
          <>
            <StepHero icon={<Briefcase className="w-5 h-5"/>} title="Professional" subtitle="Optional — helps renters and clients find you" />

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              {selectedRoles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-3 border-b border-gray-50">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest w-full mb-1">Selected ({selectedRoles.length}/3)</p>
                  {selectedRoles.map(r => (
                    <button key={r} type="button" onClick={() => toggleRole(r)}
                      className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2.5 py-1 rounded-full font-semibold">
                      {r} <span className="opacity-70 ml-0.5">×</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-3 max-h-[38vh] overflow-y-auto pr-1">
                {ROLE_CATEGORIES.map(cat => (
                  <div key={cat.label}>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{cat.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.roles.map(role => {
                        const sel = selectedRoles.includes(role);
                        return (
                          <button key={role} type="button" onClick={() => toggleRole(role)}
                            className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${
                              sel ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}>
                            {role}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 pt-3 border-t border-gray-50">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Skills / Services</label>
                <textarea value={skillsText} onChange={e=>setSkillsText(e.target.value)} rows={2}
                  placeholder="e.g. Wedding photography, drone cinematography, color grading…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"/>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Portfolio / Reel URL</label>
                <input value={portfolioUrl} onChange={e=>setPortfolioUrl(e.target.value)}
                  placeholder="filmons.com/@you · vimeo.com/… · behance.net/…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
              </div>
            </div>
          </>
        )}

        {/* ── Step 8: Review & Submit ── */}
        {step === 8 && (
          <>
            <StepHero icon={<CheckCircle className="w-5 h-5"/>} title="Review" subtitle="Confirm your information before submitting" />

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 divide-y divide-gray-50">
              <div className="pb-2">
                <ReviewRow label="Legal Name" value={legalName} />
                <ReviewRow label="Date of Birth" value={dob} />
                <ReviewRow label="Residence" value={residenceCountry} />
              </div>
              <div className="py-2">
                <ReviewRow label="Email" value={user.email || ''} />
                <ReviewRow label="Phone" value={phoneVerified ? `${phone} ✓` : phone} />
              </div>
              <div className="py-2">
                <ReviewRow label="Address" value={[streetAddr, city, province, postalCode].filter(Boolean).join(', ')} />
              </div>
              <div className="py-2">
                <ReviewRow label="ID Country" value={issuingCountry} />
                <ReviewRow label="ID Type" value={idType} />
              </div>
              {selectedRoles.length > 0 && (
                <div className="pt-2">
                  <ReviewRow label="Role" value={selectedRoles.join(', ')} />
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              {[
                {
                  key: 'consentId', checked: consentId, onChange: setConsentId,
                  title: 'Identity Verification Terms',
                  body: 'I agree to provide accurate and truthful identity information. I understand that providing false information is grounds for account termination and may result in legal consequences.'
                },
                {
                  key: 'consentData', checked: consentData, onChange: setConsentData,
                  title: 'Data Processing Consent (KYC/AML)',
                  body: 'I consent to the collection, processing, and storage of my personal data for the purpose of Know Your Customer (KYC) and Anti-Money Laundering (AML) compliance, in accordance with applicable Canadian privacy laws (PIPEDA).'
                },
                {
                  key: 'consentPrivacy', checked: consentPrivacy, onChange: setConsentPrivacy,
                  title: 'Privacy Policy Agreement',
                  body: 'I have read and accept the Filmons Privacy Policy. I understand how my data will be used, retained, and protected, and that I can request deletion at any time.'
                },
              ].map(item => (
                <button key={item.key} type="button" onClick={() => item.onChange(!item.checked)}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${item.checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${item.checked ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                    {item.checked && <Check className="w-3 h-3 text-white"/>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                    <p className="text-xs text-gray-500 leading-relaxed mt-1">{item.body}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Navigation */}
        <button
          onClick={handleNext}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 text-white font-bold rounded-2xl py-4 transition-all shadow-lg shadow-blue-600/25 hover:shadow-blue-600/35 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 disabled:shadow-none"
          style={{ background: 'linear-gradient(135deg,#2563eb,#4338ca)' }}
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin"/>Submitting verification…</>
          ) : step === 8 ? (
            <><ShieldCheck className="w-5 h-5"/>Submit for Review</>
          ) : (
            <>Continue<ChevronRight className="w-5 h-5"/></>
          )}
        </button>

        <p className="text-xs text-gray-400 text-center">
          {step < 8 ? `Step ${step} of 8 — ${STEPS[step-1].label}` : 'Your information is reviewed by our team within 1–3 business days'}
        </p>
      </div>
    </div>
  );
}
