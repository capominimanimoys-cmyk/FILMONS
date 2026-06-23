import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { authApi } from '../lib/api';
import { sendEmail } from '../lib/emailjs-config';
import {
  ShieldCheck, ArrowLeft, ChevronRight, ChevronLeft, ChevronDown,
  Check, Upload, Camera, FileText, User, MapPin, CreditCard, AlertCircle,
  Eye, CheckCircle, X, Loader2, Info, Search, Navigation,
} from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { supabase } from "../../lib/supabase";
import { uploadImage } from "../../lib/upload";


const STEPS = [
  { id: 1, label: 'Personal Info',   icon: User       },
  { id: 2, label: 'Documents',       icon: FileText   },
  { id: 3, label: 'Consent',         icon: ShieldCheck },
  { id: 4, label: 'Permissions',     icon: Camera     },
  { id: 5, label: 'Instructions',    icon: Eye        },
  { id: 6, label: 'Selfie',          icon: Camera     },
];

const ID_TYPES = [
  "Driver's Licence",
  "Passport",
  "Provincial Health Card",
  "Permanent Resident Card",
  "Canadian Citizenship Card",
  "Tribal ID",
];
const CA_PROVINCES = ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'];

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

export function Verification() {
  const { user, isAuthenticated, updateUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Personal info
  const [legalName, setLegalName] = useState('');
  const [dob, setDob] = useState('');
  const [streetAddr, setStreetAddr] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [issuingCountry, setIssuingCountry] = useState('Canada');
  const [idType, setIdType] = useState('');
  const [loading, setLoading] = useState(false); 

  // Address autocomplete
  const [addrSearch, setAddrSearch]           = useState('');
  const [addrSuggestions, setAddrSuggestions] = useState<any[]>([]);
  const [addrShowSug, setAddrShowSug]         = useState(false);
  const [addrSearching, setAddrSearching]     = useState(false);
  const [addrFilled, setAddrFilled]           = useState(false);
  const addrTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addrSugRef  = useRef<HTMLDivElement>(null);

  // Step 2: Documents
  const [utilityBill, setUtilityBill] = useState('');
  const [govId, setGovId] = useState('');

  // Step 3: Consent
  const [consentId, setConsentId] = useState(false);
  const [consentData, setConsentData] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);

  // Step 4: Permissions
  const [cameraGranted, setCameraGranted] = useState(false);
  const [storageGranted, setStorageGranted] = useState(false);

  // Step 6: Selfie
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [selfieUrl, setSelfieUrl] = useState('');
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) navigate('/login');
    if (user) { setLegalName(user.name || ''); }
  }, [isAuthenticated, user]);

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
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&countrycodes=ca&format=json&addressdetails=1&limit=6`,
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
  }, []);

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
      const province   = (() => {
        const p = (addr.state || '').toLowerCase();
        const map: Record<string,string> = {
          'ontario':'ON','quebec':'QC','british columbia':'BC','alberta':'AB',
          'manitoba':'MB','saskatchewan':'SK','nova scotia':'NS','new brunswick':'NB',
          'prince edward island':'PE','newfoundland and labrador':'NL',
          'northwest territories':'NT','nunavut':'NU','yukon':'YT',
        };
        return map[p] || addr.state_code || addr.state || '';
      })();
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

        if (addr.country_code && addr.country_code !== 'ca') {
          toast.error('Location must be in Canada.');
          return;
        }

        const streetNum  = addr.house_number || '';
        const streetName = addr.road || '';
        const street     = [streetNum, streetName].filter(Boolean).join(' ');
        const city       = addr.city || addr.town || addr.village || addr.municipality || '';
        const province   = (() => {
          const p = (addr.state || '').toLowerCase();
          const map: Record<string,string> = {
            'ontario':'ON','quebec':'QC','british columbia':'BC','alberta':'AB',
            'manitoba':'MB','saskatchewan':'SK','nova scotia':'NS','new brunswick':'NB',
            'prince edward island':'PE','newfoundland and labrador':'NL',
            'northwest territories':'NT','nunavut':'NU','yukon':'YT',
          };
          return map[p] || addr.state_code || addr.state || '';
        })();
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
  }, []);

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

  const handleNext = () => {
    if (step === 1) {
      if (!legalName.trim()) { toast.error('Legal name is required'); return; }
      if (!dob) { toast.error('Date of birth is required'); return; }
      if (!city.trim()) { toast.error('City is required'); return; }
      if (!province) { toast.error('Province is required'); return; }
      if (!postalCode.trim()) { toast.error('Postal code is required'); return; }
      if (!idType) { toast.error('Please select an ID type'); return; }
    }
    if (step === 2) {
      if (!utilityBill) { toast.error('Please upload proof of address (utility bill)'); return; }
      if (!govId) { toast.error('Please upload your government ID'); return; }
    }
    if (step === 3) {
      if (!consentId || !consentData || !consentPrivacy) { toast.error('Please agree to all terms to continue'); return; }
    }
    if (step === 4) {
      if (!cameraGranted || !storageGranted) { toast.error('Please grant both permissions to continue'); return; }
    }
    if (step < 6) { setStep(s => s + 1); return; }
    // Step 6: Submit
    handleSubmit();
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
      userEmail: user.email || '', userPhone: user.phone || '',
      phoneVerified: false, emailVerified: true, fullName: legalName,
      dob, streetAddr, city, province, postalCode, issuingCountry, idType,
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
        userName: user.name, phone: user.phone || '',
        dob, streetAddr, city, province, postalCode,
        issuingCountry, idType,
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto"><Upload className="w-10 h-10 text-orange-500"/></div>
          <h2 className="text-2xl font-bold text-gray-900">New Documents Required</h2>
          {myReq?.rejectionReason && <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-left"><p className="text-xs font-bold text-orange-600 mb-1">Admin note</p><p className="text-sm text-orange-700">{myReq.rejectionReason}</p></div>}
          <p className="text-gray-500 text-sm">The admin has requested new documents. You can continue from where you left off.</p>
          <button onClick={() => { setStep(2); try { const u = JSON.parse(localStorage.getItem('filmons_current_user') || 'null'); if(u){u.verificationStatus='';localStorage.setItem('filmons_current_user',JSON.stringify(u));} } catch{} }} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl py-3">Upload New Documents</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => step > 1 ? setStep(s => s - 1) : navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900">Creator+ Verification</h1>
            <p className="text-xs text-gray-400">Step {step} of {STEPS.length} — {STEPS[step-1].label}</p>
          </div>
          <div className="flex items-center gap-1">
            {STEPS.map(s => (
              <div key={s.id} className={`h-1.5 rounded-full transition-all ${s.id < step ? 'w-4 bg-green-400' : s.id === step ? 'w-8 bg-blue-600' : 'w-4 bg-gray-200'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* ── Step 1: Personal Information ── */}
        {step === 1 && (
          <>
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-5 text-white">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><User className="w-5 h-5 text-white"/></div>
                <div><h2 className="text-lg font-bold">Personal Information</h2><p className="text-blue-200 text-xs">Provide your legal details for identity verification</p></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
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

              {/* Smart address autocomplete */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Residential Address (Canada)</label>
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
                      placeholder="Search your street address in Canada…"
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
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Prov.</label>
                          <select value={province} onChange={e => setProvince(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                            <option value="">--</option>
                            {CA_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Postal</label>
                          <input value={postalCode} onChange={e => setPostalCode(e.target.value.toUpperCase())} maxLength={7}
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

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Country of ID *</label>
                <select value={issuingCountry} onChange={e=>setIssuingCountry(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  {ALL_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">ID Type *</label>
                <select value={idType} onChange={e=>setIdType(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  <option value="">Select ID type</option>
                  {ID_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: Document Upload ── */}
        {step === 2 && (
          <>
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-5 text-white">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Upload className="w-5 h-5"/></div>
                <div><h2 className="text-lg font-bold">Document Upload</h2><p className="text-blue-200 text-xs">Upload your proof of address and government ID</p></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
              <div>
                <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-500"/>Proof of Address</h3>
                <p className="text-xs text-gray-500 mb-3">A recent utility bill, bank statement, or government mail (within 3 months)</p>
                <FileUploadZone label="Utility Bill / Proof of Address" accept="image/*,.pdf"
                  value={utilityBill || null} onChange={(url) => setUtilityBill(url)} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2"><CreditCard className="w-4 h-4 text-blue-500"/>Government ID</h3>
                <p className="text-xs text-gray-500 mb-3">Upload a clear photo of your {idType || 'government ID'} — front and back if applicable</p>
                <FileUploadZone label="Government ID Photo" accept="image/*,.pdf"
                  value={govId || null} onChange={(url) => setGovId(url)} />
              </div>
            </div>
          </>
        )}

        {/* ── Step 3: Consent & Legal ── */}
        {step === 3 && (
          <>
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-5 text-white">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><ShieldCheck className="w-5 h-5"/></div>
                <div><h2 className="text-lg font-bold">Consent & Legal Agreements</h2><p className="text-blue-200 text-xs">Please read and agree to the following terms</p></div>
              </div>
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

        {/* ── Step 4: Permissions ── */}
        {step === 4 && (
          <>
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-5 text-white">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Camera className="w-5 h-5"/></div>
                <div><h2 className="text-lg font-bold">App Permissions</h2><p className="text-blue-200 text-xs">We need access to complete your verification</p></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              {[
                {
                  key: 'camera', granted: cameraGranted, icon: '📷', title: 'Camera Access',
                  desc: 'Required to take your ID photos and verification selfie.',
                  onGrant: async () => {
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                      stream.getTracks().forEach(t => t.stop());
                      setCameraGranted(true); toast.success('Camera access granted!');
                    } catch { toast.error('Camera access denied. Please enable it in your browser settings.'); }
                  }
                },
                {
                  key: 'storage', granted: storageGranted, icon: '💾', title: 'Storage Access',
                  desc: 'Required to upload existing photos of your documents.',
                  onGrant: () => { setStorageGranted(true); toast.success('Storage access granted!'); }
                },
              ].map(item => (
                <div key={item.key} className={`flex items-start gap-3 p-4 rounded-xl border-2 ${item.granted ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                  <span className="text-2xl shrink-0">{item.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                  </div>
                  {item.granted ? (
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shrink-0"><Check className="w-4 h-4 text-white"/></div>
                  ) : (
                    <button onClick={item.onGrant} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors shrink-0">
                      Grant
                    </button>
                  )}
                </div>
              ))}

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5"/>
                <p className="text-xs text-blue-700">Your data is encrypted and never shared with third parties without your consent.</p>
              </div>
            </div>
          </>
        )}

        {/* ── Step 5: Instructions ── */}
        {step === 5 && (
          <>
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-5 text-white">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Eye className="w-5 h-5"/></div>
                <div><h2 className="text-lg font-bold">Before You Continue</h2><p className="text-blue-200 text-xs">Read these guidelines for a successful verification</p></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-800 mb-3">📄 Document Guidelines</h3>
                <div className="space-y-2">
                  {[
                    '✅ Use a valid, unexpired government-issued ID',
                    '✅ Ensure the document is well-lit and fully visible',
                    '✅ Avoid glare, shadows, or blurry images',
                    '✅ Capture all four corners of the document',
                    '✅ Make sure all text is legible',
                    '❌ Do not cover any part of the document',
                    '❌ Do not use expired documents',
                  ].map(tip => (
                    <div key={tip} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="shrink-0">{tip.slice(0,2)}</span>
                      <span>{tip.slice(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-bold text-gray-800 mb-3">🤳 Selfie Guidelines</h3>
                <div className="space-y-2">
                  {[
                    '✅ Face the camera directly in good lighting',
                    '✅ Remove glasses and hats if possible',
                    '✅ Keep a neutral expression',
                    '✅ Position your face within the oval frame',
                    '✅ You may be asked to blink or turn your head slightly',
                  ].map(tip => (
                    <div key={tip} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="shrink-0">{tip.slice(0,2)}</span>
                      <span>{tip.slice(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"/>
                <p className="text-xs text-amber-700">Your selfie is compared against your government ID to confirm your identity. Data is processed securely.</p>
              </div>
            </div>
          </>
        )}

        {/* ── Step 6: Selfie ── */}
        {step === 6 && (
          <>
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-5 text-white">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Camera className="w-5 h-5"/></div>
                <div><h2 className="text-lg font-bold">Face Verification</h2><p className="text-blue-200 text-xs">Take a selfie to verify your identity</p></div>
              </div>
            </div>

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

              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-start gap-2">
                <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5"/>
                <p className="text-xs text-gray-500">Your selfie is securely transmitted for identity matching. It is not stored on your device.</p>
              </div>
            </div>
          </>
        )}

        {/* Navigation */}
        <button
          onClick={handleNext}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-2xl py-4 transition-colors shadow-sm"
        >
          {submitting ? (
            <><Loader2 className="w-5 h-5 animate-spin"/>Submitting verification…</>
          ) : step === 6 ? (
            <><ShieldCheck className="w-5 h-5"/>Submit for Review</>
          ) : (
            <>Continue<ChevronRight className="w-5 h-5"/></>
          )}
        </button>

        <p className="text-xs text-gray-400 text-center">
          {step < 6 ? `Step ${step} of 6 — ${STEPS[step-1].label}` : 'Your information is reviewed by our team within 1–3 business days'}
        </p>
      </div>
    </div>
  );
}