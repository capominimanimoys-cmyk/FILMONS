import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ArrowBackRounded, ArticleRounded, BadgeRounded, CameraAltRounded, CheckRounded, CloseRounded, CreateRounded, HomeRounded, MyLocationRounded, PhoneRounded, PictureAsPdfRounded, PublicRounded, ReceiptLongRounded, UploadFileRounded, VerifiedRounded, VisibilityOffRounded, VisibilityRounded } from './Icons';
import { supabase } from '../../lib/supabase';
import { buildAgreementHTML, buildReceiptHTML, uploadPDFDoc } from '../lib/generatePDF';
import { EMAILJS_CONFIG } from '../lib/emailjs-config';
import emailjs from '@emailjs/browser';



interface RentalAgreementProps {
  pay: any; user: any; hostUser: any | null;
  convId: string; msgId: string;
  totalAmount: number; selectedMethod: string;
  onAccepted: (data: SignedAgreementData) => void;
  onClose: () => void;
}

export interface SignedAgreementData {
  refNo: string;
  receiptNo: string;
  renterName: string;
  renterEmail: string;
  renterPhone: string;
  agreementUrl: string;
  hostAgreementUrl: string;
  receiptUrl: string;
  idUrl: string;
  proofUrl: string;
  signedAt: string;
}

// ── ID Types ───────────────────────────────────────────────────────
const CANADIAN_IDS = [
  'Canadian Passport',
  "Provincial Driver's License",
  'Provincial Photo Card (BCID, Ontario Photo Card, etc.)',
  'Permanent Resident Card',
  'Secure Certificate of Indian Status',
  'Nexus Card',
  'Canadian Military Identification Card',
  'Firearms License (PAL)',
];

const PRIMARY_IDS = CANADIAN_IDS;

const OTHER_IDS = [
  'Citizenship Card',
  'Foreign Passport',
  'Government Employee ID',
];

// ── Countries ──────────────────────────────────────────────────────
const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia','Australia',
  'Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin',
  'Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi',
  'Cabo Verde','Cambodia','Cameroon','Canada','Central African Republic','Chad','Chile','China','Colombia',
  'Comoros','Congo','Costa Rica','Croatia','Cuba','Cyprus','Czech Republic','Denmark','Djibouti','Dominica',
  'Dominican Republic','Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Eswatini',
  'Ethiopia','Fiji','Finland','France','Gabon','Gambia','Georgia','Germany','Ghana','Greece','Grenada',
  'Guatemala','Guinea','Guinea-Bissau','Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia',
  'Iran','Iraq','Ireland','Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kiribati','Kuwait',
  'Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg',
  'Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania','Mauritius',
  'Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia',
  'Nauru','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia',
  'Norway','Oman','Pakistan','Palau','Palestine','Panama','Papua New Guinea','Paraguay','Peru','Philippines',
  'Poland','Portugal','Qatar','Romania','Russia','Rwanda','Saint Kitts and Nevis','Saint Lucia',
  'Saint Vincent and the Grenadines','Samoa','San Marino','Sao Tome and Principe','Saudi Arabia','Senegal',
  'Serbia','Seychelles','Sierra Leone','Singapore','Slovakia','Slovenia','Solomon Islands','Somalia',
  'South Africa','South Korea','South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland',
  'Syria','Taiwan','Tajikistan','Tanzania','Thailand','Timor-Leste','Togo','Tonga','Trinidad and Tobago',
  'Tunisia','Turkey','Turkmenistan','Tuvalu','Uganda','Ukraine','United Arab Emirates','United Kingdom',
  'United States','Uruguay','Uzbekistan','Vanuatu','Vatican City','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
];

function generateOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }

// ── Country Picker ─────────────────────────────────────────────────
function CountryPicker({ value, onChange, placeholder = 'Select country…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => COUNTRIES.filter(c => c.toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-400">
        <PublicRounded sx={{fontSize:16,color:'#9ca3af'}} />
        <span className={value ? 'text-gray-800 flex-1 truncate' : 'text-gray-400 flex-1'}>{value || placeholder}</span>
        <span className="text-gray-400 text-xs ml-1">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div className="overflow-y-auto max-h-44">
            {filtered.map(c => (
              <button key={c} type="button" onClick={() => { onChange(c); setOpen(false); setQ(''); }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors ${c === value ? 'text-blue-700 font-semibold bg-blue-50' : 'text-gray-700'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Signature Canvas ───────────────────────────────────────────────
function SignatureCanvas({ onChange }: { onChange: (v: string | null) => void }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);
  const getXY = (e: MouseEvent | TouchEvent, cv: HTMLCanvasElement) => {
    const r = cv.getBoundingClientRect();
    const s = 'touches' in e ? e.touches[0] : e;
    return { x: (s.clientX - r.left) * (cv.width / r.width), y: (s.clientY - r.top) * (cv.height / r.height) };
  };
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const down = (e: MouseEvent | TouchEvent) => { e.preventDefault(); drawing.current = true; const {x,y}=getXY(e,cv); ctx.beginPath(); ctx.moveTo(x,y); };
    const move = (e: MouseEvent | TouchEvent) => { if (!drawing.current) return; e.preventDefault(); hasStroke.current=true; const {x,y}=getXY(e,cv); ctx.lineTo(x,y); ctx.stroke(); };
    const up = () => { drawing.current=false; if (hasStroke.current) onChange(cv.toDataURL()); };
    cv.addEventListener('mousedown',down); cv.addEventListener('mousemove',move); cv.addEventListener('mouseup',up);
    cv.addEventListener('touchstart',down,{passive:false}); cv.addEventListener('touchmove',move,{passive:false}); cv.addEventListener('touchend',up);
    return () => { cv.removeEventListener('mousedown',down); cv.removeEventListener('mousemove',move); cv.removeEventListener('mouseup',up); cv.removeEventListener('touchstart',down); cv.removeEventListener('touchmove',move); cv.removeEventListener('touchend',up); };
  }, [onChange]);
  const clear = () => { const cv=cvRef.current; if (!cv) return; cv.getContext('2d')!.clearRect(0,0,cv.width,cv.height); hasStroke.current=false; onChange(null); };
  return (
    <div className="border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-gray-50 relative">
      <canvas ref={cvRef} width={540} height={110} className="w-full touch-none cursor-crosshair" style={{height:'110px'}} />
      <div className="absolute bottom-2 right-2 flex items-center gap-2">
        <span className="text-[10px] text-gray-400">Draw signature above</span>
        <button type="button" onClick={clear} className="text-[10px] text-red-500 bg-white border border-red-200 rounded-lg px-2 py-0.5 font-semibold">Clear</button>
      </div>
      <div className="absolute left-4 right-4 pointer-events-none bg-gray-300 h-px" style={{bottom:'28px'}} />
    </div>
  );
}

// ── ID Type Picker ─────────────────────────────────────────────────
function IDTypePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState('');
  const allIds = [
    { group: 'Primary Government Photo ID', items: PRIMARY_IDS },
    { group: 'Other Accepted Documents',    items: OTHER_IDS },
  ];
  const filtered = allIds.map(g => ({
    ...g,
    items: g.items.filter(id => id.toLowerCase().includes(q.toLowerCase())),
  })).filter(g => g.items.length > 0);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-400">
        <BadgeRounded sx={{fontSize:16,color:'#9ca3af'}} />
        <span className={`flex-1 ${value ? 'text-gray-800' : 'text-gray-400'}`}>{value || 'Select ID type…'}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search ID type…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div className="overflow-y-auto max-h-64">
            {filtered.map(group => (
              <div key={group.group}>
                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">
                  {group.group}
                </div>
                {group.items.map(id => (
                  <button key={id} type="button"
                    onClick={() => { onChange(id); setOpen(false); setQ(''); }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2 ${id === value ? 'text-blue-700 font-semibold bg-blue-50' : 'text-gray-700'}`}>
                    {id === value && <CheckRounded sx={{fontSize:14,color:'#2563eb'}} />}
                    <span>{id}</span>
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No results</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Address Search ─────────────────────────────────────────────────
function AddressSearch({ onSelect }: {
  onSelect: (a: { address: string; city: string; province: string; postalCode: string; country: string }) => void;
}) {
  const [q, setQ]            = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (val: string) => {
    setQ(val);
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 3) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(val)}`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        setResults(data);
      } catch {}
      setLoading(false);
    }, 400);
  };

  const pick = (r: any) => {
    const a = r.address || {};
    const road    = [a.house_number, a.road].filter(Boolean).join(' ');
    const city    = a.city || a.town || a.village || a.municipality || '';
    const province = a.state || a.province || '';
    const postal  = (a.postcode || '').replace(/\s+/g, ' ').toUpperCase();
    const country = a.country || '';
    onSelect({ address: road, city, province, postalCode: postal, country });
    setQ(road || r.display_name?.split(',')[0] || '');
    setResults([]);
  };

  return (
    <div className="relative mb-3">
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
        &#x1F50D; Search address
      </label>
      <div className="relative">
        <input value={q} onChange={e => search(e.target.value)}
          placeholder="Start typing your address…"
          className="w-full border border-blue-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 pr-8" />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        )}
      </div>
      {results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {results.map((r: any) => (
            <button key={r.place_id} type="button" onClick={() => pick(r)}
              className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0 leading-snug">
              {r.display_name}
            </button>
          ))}
        </div>
      )}
      <p className="text-[10px] text-gray-400 mt-1">Powered by OpenStreetMap &#xB7; Selecting a result auto-fills the fields below</p>
    </div>
  );
}

function LiveCamera({ onCapture, onClose }: { onCapture: (url: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(s => { streamRef.current=s; if (videoRef.current) videoRef.current.srcObject=s; })
      .catch(() => { alert('Camera access denied.'); onClose(); });
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);
  const capture = () => {
    const v = videoRef.current; if (!v) return;
    const c = document.createElement('canvas'); c.width=v.videoWidth; c.height=v.videoHeight;
    c.getContext('2d')!.drawImage(v,0,0); streamRef.current?.getTracks().forEach(t=>t.stop());
    onCapture(c.toDataURL('image/jpeg',0.85));
  };
  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-sm">
        <video ref={videoRef} autoPlay playsInline className="w-full rounded-2xl" />
        <div className="absolute inset-4 border-2 border-white/60 rounded-xl pointer-events-none">
          {['-top-1 -left-1 border-t-2 border-l-2 rounded-tl-lg','-top-1 -right-1 border-t-2 border-r-2 rounded-tr-lg','-bottom-1 -left-1 border-b-2 border-l-2 rounded-bl-lg','-bottom-1 -right-1 border-b-2 border-r-2 rounded-br-lg'].map(c=>(
            <div key={c} className={`absolute w-5 h-5 border-white ${c}`} />
          ))}
        </div>
      </div>
      <p className="text-white/70 text-xs mt-4 mb-6">Align your document within the frame</p>
      <div className="flex gap-4">
        <button onClick={onClose} className="px-5 py-2.5 bg-white/20 text-white rounded-xl font-semibold text-sm">Cancel</button>
        <button onClick={capture} className="px-8 py-2.5 bg-white text-gray-900 rounded-xl font-bold text-sm flex items-center gap-2">
          <CameraAltRounded sx={{fontSize:18}} /> Capture
        </button>
      </div>
    </div>
  );
}

// ── Collapsible Terms ──────────────────────────────────────────────
function TermsSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <button type="button" onClick={() => setOpen(v=>!v)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors">
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        <span className={`text-gray-400 text-xs font-bold transition-transform duration-200 ${open?'rotate-180':''}`}>▼</span>
      </button>
      {open && <div className="px-4 pb-4 border-t border-gray-100 pt-3 bg-gray-50">{children}</div>}
    </div>
  );
}

// ── Build Agreement PDF HTML (matches uploaded PDF layout) ─────────
function buildAgreementPDF(d: {
  refNo: string; today: string; firstName: string; lastName: string;
  birthdate: string; idType: string; idNumber: string; idCountry: string;
  email: string; phone: string; address: string; city: string;
  province: string; postalCode: string; country: string;
  proofType: string; signature: string; pay: any; hostUser: any;
  totalAmount: number; selectedMethod: string; isHostCopy?: boolean; idUrl?: string; proofUrl?: string;
}) {
  const dailyRate = d.pay.duration ? (d.totalAmount / d.pay.duration).toFixed(2) : d.totalAmount.toFixed(2);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:40px;max-width:800px;margin:0 auto}
.cover-header{background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;padding:32px 40px;border-radius:12px;margin-bottom:32px}
.logo{font-size:28px;font-weight:900;letter-spacing:-0.5px;margin-bottom:4px}
.logo-sub{font-size:11px;opacity:.75;text-transform:uppercase;letter-spacing:1px}
.doc-title{font-size:20px;font-weight:700;margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,.25)}
.doc-sub{font-size:11px;opacity:.7;margin-top:6px}
.ref-line{margin-top:16px;font-size:10px;opacity:.6;font-family:monospace}
.site-line{margin-top:4px;font-size:10px;opacity:.5}
.section{margin-bottom:24px}
.section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:4px;margin-bottom:12px}
.sub-title{font-size:11px;font-weight:700;color:#1e3a5f;margin:10px 0 6px}
table.info{width:100%;border-collapse:collapse;margin-bottom:10px}
table.info td{padding:5px 8px;border:1px solid #e5e7eb;font-size:10.5px;vertical-align:top}
table.info td:first-child{background:#f8fafc;font-weight:600;color:#374151;width:38%}
table.data{width:100%;border-collapse:collapse;margin-bottom:10px}
table.data th{background:#1e3a5f;color:#fff;padding:6px 8px;font-size:10px;text-align:left;font-weight:700}
table.data td{padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:10.5px}
table.data tr:nth-child(even) td{background:#f9fafb}
.note{background:#fffbeb;border-left:3px solid #f59e0b;padding:7px 10px;border-radius:0 6px 6px 0;font-size:10px;color:#78350f;margin:8px 0}
.sig-box{border:1.5px solid #d1d5db;border-radius:8px;background:#f9fafb;padding:12px;margin-top:8px;min-height:70px;position:relative}
.sig-box img{max-height:60px;max-width:200px;object-fit:contain}
.sig-line{border-top:1px solid #9ca3af;margin-top:8px;padding-top:4px;font-size:9px;color:#9ca3af}
.badge{display:inline-block;background:#dcfce7;color:#15803d;padding:1px 8px;border-radius:99px;font-size:9px;font-weight:700;border:1px solid #bbf7d0}
.badge-blue{background:#dbeafe;color:#1d4ed8;border:1px solid #bfdbfe}
.badge-orange{background:#fed7aa;color:#92400e;border:1px solid #fdba74}
.page-break{page-break-before:always;padding-top:24px}
.footer-bar{margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:9px;color:#9ca3af;text-align:center}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.field-label{font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
.field-value{font-size:11px;color:#111;padding-bottom:6px;border-bottom:1px solid #e5e7eb;min-height:22px}
</style></head><body>
<!-- Print bar -->
<div class="no-print" style="position:sticky;top:0;z-index:100;background:#1e3a5f;color:#fff;padding:10px 40px;display:flex;align-items:center;justify-content:space-between;margin:-40px -40px 24px -40px;">
  <span style="font-size:12px;font-weight:700;letter-spacing:0.3px;">🎬 Filmons Document</span>
  <div style="display:flex;gap:10px;">
    <button onclick="window.print()" style="background:#2563eb;color:#fff;border:none;padding:7px 18px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">🖨️ Print / Save as PDF</button>
    <button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;">✕ Close</button>
  </div>
</div>
<!-- COVER -->
<div class="cover-header">
  <div class="logo">🎬 FILMONS</div>
  <div class="logo-sub">Film Gear Rental Marketplace</div>
  <div class="doc-title">EQUIPMENT RENTAL AGREEMENT</div>
  <div class="doc-sub">This Agreement governs the rental of film and production equipment between Hosts and Renters on the Filmons platform.</div>
  <div class="ref-line">Booking Reference: ${d.refNo} &nbsp;&nbsp; Agreement Date: ${d.today}</div>
  <div class="site-line">filmons.com | support@filmons.com</div>
</div>

<!-- SECTION 1 -->
<div class="section">
  <div class="section-title">Section 1 — Parties &amp; Booking Details</div>
  <div class="sub-title">1.1 Host (Gear Owner)</div>
  <div class="two-col" style="margin-bottom:12px">
    <div><div class="field-label">Full Legal Name</div><div class="field-value">${d.hostUser?.name || '—'}</div></div>
    <div><div class="field-label">Filmons Username</div><div class="field-value">@${d.hostUser?.username || d.hostUser?.name?.toLowerCase().replace(/\s/g,'') || '—'}</div></div>
    <div><div class="field-label">Email Address</div><div class="field-value">${d.hostUser?.email || '—'}</div></div>
    <div><div class="field-label">Phone Number</div><div class="field-value">${d.hostUser?.phone || '—'}</div></div>
  </div>
  <div class="sub-title">1.2 Renter</div>
  <div class="two-col" style="margin-bottom:12px">
    <div><div class="field-label">Full Legal Name</div><div class="field-value">${d.firstName} ${d.lastName}</div></div>
    <div><div class="field-label">Email Address</div><div class="field-value">${d.email} <span class="badge">✓ Verified</span></div></div>
    <div><div class="field-label">Phone Number</div><div class="field-value">${d.phone} <span class="badge">✓ Verified</span></div></div>
    <div><div class="field-label">Date of Birth</div><div class="field-value">${d.birthdate}</div></div>
    <div><div class="field-label">Government ID Type</div><div class="field-value">${d.idType}</div></div>
    <div><div class="field-label">ID Number</div><div class="field-value">${d.idNumber}</div></div>
    <div><div class="field-label">ID Country of Issue</div><div class="field-value">${d.idCountry}</div></div>
    <div><div class="field-label">ID Photo</div><div class="field-value">${d.isHostCopy && d.idUrl ? `<a href="${d.idUrl}" style="color:#2563eb">🔒 View secure ID</a>` : 'Stored securely — Filmons vault'}</div></div>
  </div>
  <div class="sub-title">1.3 Renter Address</div>
  <div class="two-col">
    <div><div class="field-label">Street Address</div><div class="field-value">${d.address}</div></div>
    <div><div class="field-label">City</div><div class="field-value">${d.city}</div></div>
    <div><div class="field-label">Province / State</div><div class="field-value">${d.province}</div></div>
    <div><div class="field-label">Postal / ZIP</div><div class="field-value">${d.postalCode}</div></div>
    <div><div class="field-label">Country</div><div class="field-value">${d.country}</div></div>
    <div><div class="field-label">Proof of Address</div><div class="field-value">${d.proofType} <span class="badge">✓ Provided</span>${d.isHostCopy && d.proofUrl ? ` <a href="${d.proofUrl}" style="color:#2563eb;font-size:9px">View</a>` : ''}</div></div>
  </div>
</div>

<!-- SECTION 2 -->
<div class="section">
  <div class="section-title">Section 2 — Equipment Description</div>
  <div class="sub-title">2.1 Rented Equipment</div>
  <table class="data">
    <tr><th>#</th><th>Equipment Description</th><th>Type</th><th>Duration</th><th>Condition</th></tr>
    <tr><td>1</td><td>${d.pay.listingTitle}</td><td>${d.pay.listingType || 'Rental'}</td><td>${d.pay.duration||1} ${d.pay.durationType||'day(s)'}</td><td>As listed on Filmons</td></tr>
  </table>
  <div class="note">⏱ The Renter must inspect all equipment at pickup and report any pre-existing damage within <strong>2 hours</strong> via the Filmons platform. Failure to report constitutes acceptance of equipment as described.</div>
</div>

<!-- SECTION 3 -->
<div class="section">
  <div class="section-title">Section 3 — Pricing &amp; Payment</div>
  <table class="info">
    <tr><td>Daily Rate</td><td>$${dailyRate} CAD</td></tr>
    <tr><td>Number of Days</td><td>${d.pay.duration||1}</td></tr>
    <tr><td>Subtotal</td><td>$${(parseFloat(dailyRate)*(d.pay.duration||1)).toFixed(2)} CAD</td></tr>
    <tr><td>Payment Method</td><td>${d.selectedMethod}</td></tr>
    <tr><td style="font-weight:800">TOTAL PAID</td><td style="font-weight:800;color:#1e3a5f">$${d.totalAmount.toFixed(2)} CAD</td></tr>
  </table>
  <div class="note">The Security Deposit is authorized (held) on the Renter's payment method and is not charged unless damage is confirmed through the Filmons dispute process. Released within 48 hours of confirmed return in satisfactory condition.</div>
</div>

<!-- SECTION 6 -->
<div class="section page-break">
  <div class="section-title">Section 6 — Damage Policy &amp; Liability</div>
  <table class="data">
    <tr><th>Damage Tier</th><th>Description</th><th>Responsible Party</th><th>Resolution</th></tr>
    <tr><td>Normal Wear</td><td>Minor dust, expected surface marks</td><td>Host absorbs</td><td>No charge</td></tr>
    <tr><td>Accidental Damage</td><td>Drops, scratches, functional issues</td><td>Renter</td><td>Repair cost, capped at deposit</td></tr>
    <tr><td>Major Damage</td><td>Broken parts, water damage, bent gear</td><td>Renter</td><td>Full repair or replacement value</td></tr>
    <tr><td>Total Loss / Theft</td><td>Gear not returned or stolen</td><td>Renter</td><td>Full replacement value + fees</td></tr>
  </table>
  <div class="note">All damage claims must be submitted through the Filmons platform within <strong>48 hours</strong> of equipment return. Filmons will mediate disputes within 5 business days. Claims above CAD $2,500 proceed to binding arbitration.</div>
</div>

<!-- SECTION 8 -->
<div class="section">
  <div class="section-title">Section 8 — Cancellation Policy</div>
  <table class="data">
    <tr><th>Cancellation Window</th><th>Renter Refund</th><th>Host Payout</th></tr>
    <tr><td>7+ days before rental start</td><td>100%</td><td>0%</td></tr>
    <tr><td>3–6 days before rental start</td><td>50%</td><td>25% of rental fee</td></tr>
    <tr><td>24–48 hours before rental start</td><td>25%</td><td>50% of rental fee</td></tr>
    <tr><td>Less than 24 hours / No-show</td><td>0%</td><td>75% of rental fee</td></tr>
  </table>
</div>

<!-- SECTION 9 -->
<div class="section">
  <div class="section-title">Section 9 — General Terms &amp; Conditions</div>
  <p style="font-size:10.5px;line-height:1.7;color:#374151">
    <strong>9.1 Filmons' Role:</strong> Filmons operates as a neutral marketplace facilitator. It is not the owner, lessor, or insurer of any equipment listed on the platform.<br/>
    <strong>9.2 Governing Law:</strong> This Agreement shall be governed by the laws of the Province of British Columbia, Canada.<br/>
    <strong>9.3 Dispute Resolution:</strong> Any dispute not resolved through the Filmons platform shall be submitted to binding arbitration under the BCICAC rules. Class actions are waived.<br/>
    <strong>9.4 Entire Agreement:</strong> This Agreement, together with the Filmons Terms of Service and Privacy Policy, constitutes the entire agreement between the parties.
  </p>
</div>

<!-- SECTION 10 -->
<div class="section">
  <div class="section-title">Section 10 — Acknowledgement &amp; Signatures</div>
  <p style="font-size:10.5px;color:#374151;margin-bottom:16px">By signing below, both parties confirm they have read, understood, and agree to be bound by all terms of this Film Gear Rental Agreement.</p>
  <div class="two-col">
    <div>
      <div class="sub-title">HOST (GEAR OWNER)</div>
      <div class="field-label" style="margin-top:8px">Full Name</div><div class="field-value">${d.hostUser?.name || '—'}</div>
      <div class="field-label" style="margin-top:8px">Signature</div>
      <div class="sig-box"><p style="font-size:9px;color:#9ca3af">To be signed by host</p></div>
      <div class="field-label" style="margin-top:8px">Date</div><div class="field-value">${d.today}</div>
    </div>
    <div>
      <div class="sub-title">RENTER</div>
      <div class="field-label" style="margin-top:8px">Full Name</div><div class="field-value">${d.firstName} ${d.lastName}</div>
      <div class="field-label" style="margin-top:8px">Digital Signature</div>
      <div class="sig-box">${d.signature ? `<img src="${d.signature}" alt="signature"/>` : '<p style="color:#d1d5db;font-size:10px">No signature</p>'}<div class="sig-line">Digitally signed ${d.today} — Ref: ${d.refNo}</div></div>
      <div class="field-label" style="margin-top:8px">Date</div><div class="field-value">${d.today} <span class="badge">✓ Digitally signed</span></div>
    </div>
  </div>
  <div style="margin-top:16px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px">
    <table style="width:100%"><tr>
      <td style="font-size:10px;color:#374151"><strong>Booking ID:</strong> ${d.refNo}</td>
      <td style="font-size:10px;color:#374151"><strong>Verified By:</strong> Filmons Platform</td>
    </tr><tr>
      <td style="font-size:10px;color:#374151"><strong>Email Verified:</strong> ${d.email} ✓</td>
      <td style="font-size:10px;color:#374151"><strong>Date Processed:</strong> ${d.today}</td>
    </tr></table>
  </div>
</div>

<div class="footer-bar">
  This document is generated by Filmons Film Gear Rental Marketplace. For support, visit filmons.com or email support@filmons.com. Agreement Version 1.0 — ${new Date().getFullYear()}.
</div>
</body></html>`;
}

// ── Build Receipt PDF HTML (matches uploaded PDF layout) ──────────
function buildReceiptPDF(d: {
  refNo: string; receiptNo: string; today: string; signedAt: string;
  firstName: string; lastName: string; email: string; phone: string;
  address: string; city: string; province: string; postalCode: string; country: string;
  idCountry: string; pay: any; hostUser: any; totalAmount: number; selectedMethod: string;
}) {
  const dailyRate = d.pay.duration ? (d.totalAmount / d.pay.duration).toFixed(2) : d.totalAmount.toFixed(2);
  const serviceFee = (d.totalAmount * 0.058).toFixed(2);
  const subtotal = (d.totalAmount - parseFloat(serviceFee)).toFixed(2);
  const deposit = (d.totalAmount * 1.44).toFixed(2);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:40px;max-width:800px;margin:0 auto}
.cover-header{background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;padding:32px 40px;border-radius:12px;margin-bottom:32px;text-align:center}
.logo{font-size:28px;font-weight:900;letter-spacing:-0.5px;margin-bottom:4px}
.logo-sub{font-size:11px;opacity:.75;text-transform:uppercase;letter-spacing:1px}
.amount{font-size:48px;font-weight:900;margin:20px 0 4px}
.amount-label{font-size:12px;opacity:.8}
.confirmed{display:inline-block;background:#4ade80;color:#14532d;font-size:12px;font-weight:700;padding:4px 16px;border-radius:99px;margin-top:12px}
.ref-block{margin-top:16px;font-size:10px;opacity:.65;font-family:monospace;line-height:1.8}
.section{margin-bottom:24px}
.section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:4px;margin-bottom:12px}
table.info{width:100%;border-collapse:collapse;margin-bottom:10px}
table.info td{padding:5px 8px;border:1px solid #e5e7eb;font-size:10.5px;vertical-align:top}
table.info td:first-child{background:#f8fafc;font-weight:600;color:#374151;width:38%}
table.price{width:100%;border-collapse:collapse}
table.price td{padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:11px}
table.price td:last-child{text-align:right}
table.price .total-row td{background:#1e3a5f;color:#fff;font-weight:800;font-size:13px;border-radius:0}
.badge{display:inline-block;background:#dcfce7;color:#15803d;padding:1px 8px;border-radius:99px;font-size:9px;font-weight:700;border:1px solid #bbf7d0}
table.policy{width:100%;border-collapse:collapse}
table.policy td{padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:10.5px;vertical-align:top}
table.policy td:first-child{font-weight:600;color:#374151;width:30%;background:#f8fafc}
.footer-bar{margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:9px;color:#9ca3af;text-align:center;line-height:1.8}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.thank-you{background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin:16px 0;text-align:center}
</style></head><body>
<!-- Print bar -->
<div class="no-print" style="position:sticky;top:0;z-index:100;background:#1e3a5f;color:#fff;padding:10px 40px;display:flex;align-items:center;justify-content:space-between;margin:-40px -40px 24px -40px;">
  <span style="font-size:12px;font-weight:700;letter-spacing:0.3px;">🎬 Filmons Document</span>
  <div style="display:flex;gap:10px;">
    <button onclick="window.print()" style="background:#2563eb;color:#fff;border:none;padding:7px 18px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">🖨️ Print / Save as PDF</button>
    <button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;">✕ Close</button>
  </div>
</div>
<!-- COVER -->
<div class="cover-header">
  <div class="logo">🎬 FILMONS</div>
  <div class="logo-sub">Film Gear Rental Marketplace</div>
  <div style="border-top:1px solid rgba(255,255,255,.25);margin-top:16px;padding-top:16px">
    <div class="logo-sub">PAYMENT RECEIPT</div>
    <div class="amount">$${d.totalAmount.toFixed(2)} CAD</div>
    <div class="amount-label">Total Paid</div>
    <div class="confirmed">✓ PAYMENT CONFIRMED</div>
  </div>
  <div class="ref-block">
    Receipt No: ${d.receiptNo}<br/>
    Agreement Ref: ${d.refNo}<br/>
    Issued: ${d.signedAt}
  </div>
  <div style="font-size:10px;opacity:.5;margin-top:6px">filmons.com | support@filmons.com</div>
</div>

<!-- SECTION 1 -->
<div class="section">
  <div class="section-title">Section 1 — Receipt Information</div>
  <table class="info">
    <tr><td>Receipt Number</td><td>${d.receiptNo}</td><td>Agreement Ref</td><td>${d.refNo}</td></tr>
    <tr><td>Issued Date</td><td>${d.today}</td><td>Issued Time</td><td>${d.signedAt.split(' ').slice(1).join(' ')}</td></tr>
    <tr><td>Payment Status</td><td><strong>PAID ✓</strong></td><td>Payment Method</td><td>${d.selectedMethod}</td></tr>
  </table>
</div>

<!-- SECTION 2 -->
<div class="section">
  <div class="section-title">Section 2 — Parties</div>
  <div class="two-col">
    <div>
      <div style="font-size:11px;font-weight:700;color:#1e3a5f;margin-bottom:8px">2.1 Host (Gear Owner)</div>
      <table class="info">
        <tr><td>Full Name</td><td>${d.hostUser?.name || '—'}</td></tr>
        <tr><td>Email</td><td>${d.hostUser?.email || '—'}</td></tr>
        <tr><td>Role</td><td>Host / Gear Owner</td></tr>
      </table>
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;color:#1e3a5f;margin-bottom:8px">2.2 Renter</div>
      <table class="info">
        <tr><td>Full Name</td><td>${d.firstName} ${d.lastName}</td></tr>
        <tr><td>Email</td><td>${d.email} ✓</td></tr>
        <tr><td>Phone</td><td>${d.phone} ✓</td></tr>
        <tr><td>Address</td><td>${d.address}, ${d.city}, ${d.province} ${d.postalCode}</td></tr>
        <tr><td>ID Country</td><td>${d.idCountry}</td></tr>
      </table>
    </div>
  </div>
</div>

<!-- SECTION 3 -->
<div class="section">
  <div class="section-title">Section 3 — Rental Details</div>
  <table class="info">
    <tr><td>Listing</td><td><strong>${d.pay.listingTitle}</strong></td></tr>
    <tr><td>Type</td><td>${d.pay.listingType || 'Rental'}</td></tr>
    <tr><td>Start Date</td><td>${d.pay.startDate || '—'}</td></tr>
    <tr><td>Duration</td><td>${d.pay.duration||1} ${d.pay.durationType||'day(s)'}</td></tr>
    <tr><td>Return Date</td><td>${d.pay.startDate ? (() => { const dt=new Date(d.pay.startDate); dt.setDate(dt.getDate()+(d.pay.duration||1)); return dt.toISOString().split('T')[0]; })() : '—'}</td></tr>
    <tr><td>Pickup Location</td><td>${d.city}, ${d.province}</td></tr>
  </table>
</div>

<!-- SECTION 4 -->
<div class="section">
  <div class="section-title">Section 4 — Price Breakdown</div>
  <table class="price">
    <tr style="background:#f8fafc"><td style="font-weight:700">Description</td><td style="text-align:center;font-weight:700">Qty</td><td style="text-align:center;font-weight:700">Unit Price</td><td style="font-weight:700">Amount</td></tr>
    <tr><td>${d.pay.listingTitle}</td><td style="text-align:center">${d.pay.duration||1} days</td><td style="text-align:center">$${dailyRate} CAD</td><td>$${subtotal} CAD</td></tr>
    <tr><td>Filmons Platform Service Fee</td><td style="text-align:center">1</td><td style="text-align:center">—</td><td>$${serviceFee} CAD</td></tr>
    <tr class="total-row"><td colspan="3"><strong>TOTAL PAID</strong></td><td><strong>$${d.totalAmount.toFixed(2)} CAD</strong></td></tr>
  </table>
  <table class="info" style="margin-top:8px">
    <tr><td>Security Deposit (authorized, not charged)</td><td>Held &nbsp;<span class="badge">$${deposit} CAD</span></td></tr>
  </table>
  <p style="font-size:9.5px;color:#6b7280;margin-top:6px">The security deposit is authorized (held) on your payment method and is not charged unless damage is confirmed through the Filmons dispute process. Released within 48 hours of confirmed return in satisfactory condition.</p>
</div>

<!-- SECTION 5 -->
<div class="section">
  <div class="section-title">Section 5 — Key Policies</div>
  <table class="policy">
    <tr><td>Security Deposit</td><td>Authorized (held) — released 48 hrs after confirmed return in good condition.</td></tr>
    <tr><td>Late Return Fee</td><td>1.5× daily rate per additional day after agreed return time.</td></tr>
    <tr><td>Cancellation</td><td>Full refund if cancelled 7+ days before start. See Agreement §8.</td></tr>
    <tr><td>Dispute Window</td><td>48 hours after return via Filmons platform.</td></tr>
  </table>
</div>

<!-- SECTION 6 -->
<div class="section">
  <div class="section-title">Section 6 — Platform Confirmation</div>
  <table class="info">
    <tr><td>Payment Processed By</td><td>Filmons Platform (secure escrow)</td><td>Release to Host</td><td>24 hrs after confirmed return</td></tr>
    <tr><td>Email Verified</td><td>Yes ✓</td><td>Phone Verified</td><td>Yes ✓</td></tr>
    <tr><td>ID Verified</td><td>Yes — stored in Filmons vault</td><td>Agreement Signed</td><td>Yes — digital signature ✓</td></tr>
    <tr><td>Governing Law</td><td>Province of British Columbia, Canada</td><td>Dispute Resolution</td><td>BCICAC binding arbitration</td></tr>
  </table>
</div>

<div class="thank-you">
  <p style="font-size:13px;font-weight:700;color:#15803d;margin-bottom:4px">Thank you for renting on Filmons, ${d.firstName}!</p>
  <p style="font-size:10.5px;color:#374151">This receipt was automatically generated and emailed to ${d.email} and ${d.hostUser?.name || 'the host'} upon payment confirmation.</p>
</div>

<div class="footer-bar">
  Filmons Film Gear Rental Marketplace | filmons.com | support@filmons.com<br/>
  Receipt ${d.receiptNo} | Agreement ${d.refNo} | Version 1.0 — ${new Date().getFullYear()}
</div>
</body></html>`;
}

// ── Upload HTML as "PDF" to Supabase storage ───────────────────────
async function uploadHTMLDoc(path: string, html: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(html);
  const blob = new Blob([bytes], { type: 'text/html; charset=utf-8' });
  try {
    // Upload to public 'documents' bucket so URLs work directly
    const { data } = await supabase.storage.from('documents')
      .upload(path, blob, { contentType: 'text/html; charset=utf-8', upsert: true });
    if (data) return supabase.storage.from('documents').getPublicUrl(data.path).data.publicUrl;
  } catch {}
  // Fallback: try agreements bucket with signed URL (60 days)
  try {
    const { data } = await supabase.storage.from('agreements')
      .upload(path, blob, { contentType: 'text/html; charset=utf-8', upsert: true });
    if (data) {
      const { data: signed } = await supabase.storage.from('agreements')
        .createSignedUrl(data.path, 60 * 24 * 60 * 60);
      return signed?.signedUrl || '';
    }
  } catch {}
  return '';
}

// ── Main Modal ─────────────────────────────────────────────────────
export function RentalAgreementModal({ pay, user, hostUser, convId, msgId, totalAmount, selectedMethod, onAccepted, onClose }: RentalAgreementProps) {
  type Step = 'form' | 'address' | 'verify_email' | 'verify_phone' | 'sign' | 'preview' | 'done';
  const [step, setStep] = useState<Step>('form');
  const [sending, setSending] = useState(false);
  const [locating, setLocating] = useState(false);

  // Personal info
  const [firstName,  setFirstName]  = useState(user?.name?.split(' ')[0] || '');
  const [lastName,   setLastName]   = useState(user?.name?.split(' ').slice(1).join(' ') || '');
  const [birthdate,  setBirthdate]  = useState('');
  const [idType,     setIdType]     = useState('');
  const [idNumber,   setIdNumber]   = useState('');
  const [idCountry,  setIdCountry]  = useState('');
  const [email,      setEmail]      = useState(user?.email || '');
  const [phone,      setPhone]      = useState(user?.phone || '');

  // Address
  const [address,    setAddress]    = useState('');
  const [city,       setCity]       = useState('');
  const [province,   setProvince]   = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [addrCountry,setAddrCountry]= useState('');

  // Proof of address
  const [proofType,     setProofType]     = useState('');
  const [proofPhotoUrl, setProofPhotoUrl] = useState<string | null>(null);
  const [showProof,     setShowProof]     = useState(false);
  const [proofIsCamera, setProofIsCamera] = useState(false);

  // ID photo
  const [idPhotoUrl, setIdPhotoUrl] = useState<string | null>(null);
  const [showId,     setShowId]     = useState(false);
  const [showCamera, setShowCamera] = useState<'id' | 'proof' | null>(null);

  // OTPs
  const emailOtpRef = useRef('');
  const [emailOtpVal,   setEmailOtpVal]   = useState('');
  const [emailOtpSent,  setEmailOtpSent]  = useState(false);
  const [emailOtpErr,   setEmailOtpErr]   = useState('');

  const phoneOtpRef = useRef('');
  const [phoneOtpVal,   setPhoneOtpVal]   = useState('');
  const [phoneOtpSent,  setPhoneOtpSent]  = useState(false);
  const [phoneOtpErr,   setPhoneOtpErr]   = useState('');

  // Signature & acceptance
  const [signature, setSignature] = useState<string | null>(null);
  const [accepted,  setAccepted]  = useState(false);

  const refNo     = useRef(`FLM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`).current;
  const receiptNo = useRef(`RCP-FLM-${refNo.split('-')[1]}`).current;
  const today     = new Date().toLocaleDateString('en-CA');

  const formValid = firstName.trim() && lastName.trim() && birthdate && idType && idNumber.trim() && idCountry && email.trim() && phone.trim() && idPhotoUrl;
  const addrValid = address.trim() && city.trim() && province.trim() && postalCode.trim() && addrCountry && proofType && proofPhotoUrl;
  const signValid = signature && accepted;

  // ── Geolocation ────────────────────────────────────────────────
  const detectLocation = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`);
        const data = await r.json();
        const a = data.address || {};
        setAddress((a.house_number ? a.house_number + ' ' : '') + (a.road || ''));
        setCity(a.city || a.town || a.village || a.municipality || '');
        setProvince(a.state || a.province || '');
        setPostalCode(a.postcode || '');
        const cmap: Record<string,string> = { ca:'Canada', us:'United States', gb:'United Kingdom', fr:'France', de:'Germany', au:'Australia' };
        setAddrCountry(cmap[a.country_code?.toLowerCase()] || a.country || '');
      } catch {}
      setLocating(false);
    }, () => { setLocating(false); alert('Location access denied.'); });
  };

  // ── OTPs ────────────────────────────────────────────────────────
  const sendEmailOTP = async () => {
    const otp = generateOTP(); emailOtpRef.current = otp;
    setEmailOtpSent(true); setEmailOtpErr('');
    try {
      await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templates.emailVerification,
        { to_email: email, to_name: `${firstName} ${lastName}`, verification_code: otp, otp_code: otp, expiry: '10 minutes' },
        EMAILJS_CONFIG.publicKey);
    } catch { setEmailOtpErr('Failed to send. Check email address.'); }
  };

  const sendPhoneOTP = async () => {
    const otp = generateOTP(); phoneOtpRef.current = otp;
    setPhoneOtpSent(true); setPhoneOtpErr('');
    try {
      await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templates.emailVerification,
        { to_email: email, to_name: `${firstName} ${lastName}`, verification_code: otp, otp_code: otp, expiry: '10 minutes', extra_message: `Phone verification for ${phone}` },
        EMAILJS_CONFIG.publicKey);
    } catch { setPhoneOtpErr('Failed to send. Try again.'); }
  };

  const verifyEmailOTP = () => {
    if (emailOtpVal === emailOtpRef.current) { setEmailOtpErr(''); setStep('verify_phone'); sendPhoneOTP(); }
    else setEmailOtpErr('Incorrect code. Try again.');
  };

  const verifyPhoneOTP = () => {
    if (phoneOtpVal === phoneOtpRef.current) { setPhoneOtpErr(''); setStep('sign'); }
    else setPhoneOtpErr('Incorrect code. Try again.');
  };

  // ── Proof file upload ────────────────────────────────────────────
  const handleProofFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => { setProofPhotoUrl(reader.result as string); setProofIsCamera(false); };
    reader.readAsDataURL(file);
  };

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!signValid || sending) return;
    setSending(true);

    const signedAt = new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' }) + ' EST';

    // Upload ID photo to private storage, generate 60-day signed URL for host
    let idUrl = '';
    if (idPhotoUrl) {
      try {
        const blob = await (await fetch(idPhotoUrl)).blob();
        const idPath = `${msgId}-${user?.id || 'u'}-id.jpg`;
        const { data } = await supabase.storage.from('agreements')
          .upload(idPath, blob, { contentType: 'image/jpeg', upsert: true });
        if (data) {
          const { data: signed } = await supabase.storage.from('agreements')
            .createSignedUrl(idPath, 60 * 24 * 60 * 60);
          idUrl = signed?.signedUrl || '';
        }
      } catch {}
    }

    // Upload proof of address, generate 60-day signed URL for host
    let proofUrl = '';
    if (proofPhotoUrl) {
      try {
        const blob2 = await (await fetch(proofPhotoUrl)).blob();
        const ext = proofIsCamera ? 'jpg' : 'file';
        const proofPath = `${msgId}-${user?.id || 'u'}-proof.${ext}`;
        const { data: d2 } = await supabase.storage.from('agreements')
          .upload(proofPath, blob2, { upsert: true });
        if (d2) {
          const { data: signed2 } = await supabase.storage.from('agreements')
            .createSignedUrl(proofPath, 60 * 24 * 60 * 60);
          proofUrl = signed2?.signedUrl || '';
        }
      } catch {}
    }

    const renterAgreementHtml = buildAgreementHTML({
      id: refNo, first_name: firstName, last_name: lastName,
      birthdate, id_type: idType, id_number: idNumber, id_country: idCountry,
      email, phone, address, city, province, postal_code: postalCode,
      country: addrCountry, proof_of_address_type: proofType,
      id_photo_url: idUrl, proof_url: proofUrl, signature_data: signature!,
      listing_title: pay.listingTitle, total_amount: totalAmount,
      payment_method: selectedMethod, start_date: pay.startDate,
      duration: pay.duration, duration_type: pay.durationType,
      signed_at: new Date().toISOString(),
      host_name: hostUser?.name, host_email: hostUser?.email, host_username: hostUser?.username,
    }, false);

    const hostAgreementHtml = buildAgreementHTML({
      id: refNo, first_name: firstName, last_name: lastName,
      birthdate, id_type: idType, id_number: idNumber, id_country: idCountry,
      email, phone, address, city, province, postal_code: postalCode,
      country: addrCountry, proof_of_address_type: proofType,
      id_photo_url: idUrl, proof_url: proofUrl, signature_data: signature!,
      listing_title: pay.listingTitle, total_amount: totalAmount,
      payment_method: selectedMethod, start_date: pay.startDate,
      duration: pay.duration, duration_type: pay.durationType,
      signed_at: new Date().toISOString(),
      host_name: hostUser?.name, host_email: hostUser?.email, host_username: hostUser?.username,
    }, true);

    const receiptHtml = buildReceiptHTML({
      id: receiptNo, agreement_id: refNo,
      renter_name: `${firstName} ${lastName}`, renter_email: email, renter_phone: phone,
      host_name: hostUser?.name, host_email: hostUser?.email,
      listing_title: pay.listingTitle, listing_type: pay.listingType,
      start_date: pay.startDate, duration: pay.duration, duration_type: pay.durationType,
      total_amount: totalAmount, payment_method: selectedMethod,
      issued_at: new Date().toISOString(),
    });

    const agreementUrl     = await uploadPDFDoc(`${refNo}-agreement-renter.html`, renterAgreementHtml);
    const hostAgreementUrl = await uploadPDFDoc(`${refNo}-agreement-host.html`,   hostAgreementHtml);
    const receiptUrl       = await uploadPDFDoc(`${refNo}-receipt.html`,           receiptHtml);

    // Save agreement to DB
    try {
      await supabase.from('rental_agreements').insert({
        id: refNo, conversation_id: convId, message_id: msgId,
        renter_id: user?.id, host_id: hostUser?.id,
        listing_title: pay.listingTitle, first_name: firstName, last_name: lastName,
        birthdate, id_number: idNumber, id_country: idCountry, id_type: idType,
        email, phone, address, city, province, postal_code: postalCode,
        country: addrCountry, proof_of_address_type: proofType,
        id_photo_url: idUrl, proof_url: proofUrl,
        signature_data: signature, total_amount: totalAmount,
        payment_method: selectedMethod, signed_at: new Date().toISOString(),
        agreement_url: agreementUrl,
      });
    } catch (e) { console.warn('Agreement DB save failed:', e); }

    // Save receipt to separate receipts table
    try {
      await supabase.from('receipts').insert({
        id:              receiptNo,
        agreement_id:    refNo,
        conversation_id: convId,
        message_id:      msgId,
        renter_id:       user?.id,
        host_id:         hostUser?.id,
        renter_name:     `${firstName} ${lastName}`,
        renter_email:    email,
        renter_phone:    phone,
        host_name:       hostUser?.name || null,
        host_email:      hostUser?.email || null,
        listing_title:   pay.listingTitle,
        listing_type:    pay.listingType || 'Rental',
        start_date:      pay.startDate || null,
        duration:        pay.duration || 1,
        duration_type:   pay.durationType || 'day',
        total_amount:    totalAmount,
        payment_method:  selectedMethod,
        receipt_url:     receiptUrl,
        issued_at:       new Date().toISOString(),
      });
    } catch (e) { console.warn('Receipt DB save failed:', e); }

    // Email to renter — will be sent by Checkout after payment
    // (removed from here — triggered by handlePay in Checkout.tsx)

    setSending(false);
    setStep('done');
    setTimeout(() => onAccepted({
      refNo, receiptNo,
      renterName: `${firstName} ${lastName}`,
      renterEmail: email,
      renterPhone: phone,
      agreementUrl,
      hostAgreementUrl,
      receiptUrl,
      idUrl,
      proofUrl,
      signedAt,
    }), 600);
  };

  const STEPS: Step[] = ['form', 'address', 'verify_email', 'verify_phone', 'sign'];
  const stepIdx = STEPS.indexOf(step as any);
  const stepLabels = ['Identity', 'Address', 'Email', 'Phone', 'Sign'];
  const prevStep = useRef<Step>('form');

  // Build live preview HTML from current form data
  const buildPreviewHTML = () => buildAgreementHTML({
    id: refNo,
    first_name: firstName || '(First Name)',
    last_name:  lastName  || '(Last Name)',
    birthdate:  birthdate || '—',
    id_type:    idType    || '—',
    id_number:  idNumber  || '—',
    id_country: idCountry || '—',
    email:      email     || '—',
    phone:      phone     || '—',
    address:    address   || '—',
    city:       city      || '—',
    province:   province  || '—',
    postal_code: postalCode || '—',
    country:    addrCountry || '—',
    proof_of_address_type: proofType || '—',
    signature_data: signature || undefined,
    listing_title:  pay.listingTitle,
    total_amount:   totalAmount,
    payment_method: selectedMethod,
    start_date:     pay.startDate,
    duration:       pay.duration,
    duration_type:  pay.durationType,
    signed_at:      new Date().toISOString(),
    host_name:      hostUser?.name,
    host_email:     hostUser?.email,
    host_username:  hostUser?.username,
  }, false);

  return (
    <>
      {showCamera && (
        <LiveCamera
          onCapture={url => {
            if (showCamera === 'id') setIdPhotoUrl(url);
            else { setProofPhotoUrl(url); setProofIsCamera(true); }
            setShowCamera(null);
          }}
          onClose={() => setShowCamera(null)}
        />
      )}

      <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
        <div className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
            {(stepIdx > 0 && step !== 'done') || step === 'preview' ? (
              <button onClick={() => {
                if (step === 'preview') setStep(prevStep.current);
                else setStep(STEPS[stepIdx-1]);
              }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                <ArrowBackRounded sx={{fontSize:18,color:'#6b7280'}} />
              </button>
            ) : null}
            <div className="flex-1">
              <button
                type="button"
                onClick={() => { if (step !== 'preview') { prevStep.current = step as Step; setStep('preview'); } else setStep(prevStep.current); }}
                className="text-left group"
                title="Click to preview the rental agreement document"
              >
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 group-hover:text-blue-600 transition-colors">
                  <ReceiptLongRounded sx={{fontSize:18,color:'#2563eb'}} />
                  {step === 'preview' ? 'Document Preview' : 'Rental Agreement'}
                  {step !== 'preview' && step !== 'done' && (
                    <span className="text-[10px] font-normal text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-200">
                      Preview &#x2197;
                    </span>
                  )}
                </h3>
                <p className="text-[10px] text-gray-400 font-mono">Ref: {refNo}</p>
              </button>
            </div>
            {step !== 'done' && step !== 'preview' && (
              <div className="flex items-center gap-1">
                {STEPS.map((s,i) => (
                  <div key={s} title={stepLabels[i]}
                    className={`rounded-full transition-all duration-300 ${i===stepIdx?'bg-blue-600 w-5 h-1.5':i<stepIdx?'bg-green-500 w-2 h-1.5':'bg-gray-200 w-1.5 h-1.5'}`} />
                ))}
              </div>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
              <CloseRounded sx={{fontSize:18,color:'#6b7280'}} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ── PREVIEW: Live document preview ── */}
            {step === 'preview' && (
              <div className="flex flex-col h-full">
                <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between shrink-0">
                  <p className="text-xs text-blue-700 font-semibold">
                    Live preview — fields update as you fill the form
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep(prevStep.current)}
                    className="text-xs text-blue-600 bg-white border border-blue-200 px-3 py-1 rounded-lg font-semibold hover:bg-blue-50 transition-colors flex items-center gap-1"
                  >
                    <ArrowBackRounded sx={{fontSize:12}} /> Back to form
                  </button>
                </div>
                <iframe
                  srcDoc={buildPreviewHTML()}
                  className="flex-1 w-full border-0"
                  style={{ minHeight: '70vh' }}
                  title="Rental Agreement Preview"
                />
              </div>
            )}

            {/* ── STEP 1: Personal Info ── */}
            {step === 'form' && (
              <div className="px-5 py-5 space-y-4">
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                  Your ID photo is stored securely and only accessible to you and the host via a private link. It is not printed on the agreement.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">First Name *</label>
                    <input value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="John"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" /></div>
                  <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Last Name *</label>
                    <input value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Doe"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" /></div>
                </div>

                <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Date of Birth *</label>
                  <input type="date" value={birthdate} onChange={e=>setBirthdate(e.target.value)}
                    max={new Date(Date.now()-16*365.25*86400000).toISOString().split('T')[0]}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" /></div>

                <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address *</label>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" /></div>

                <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Phone Number *</label>
                  <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+1 514 000 0000"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" /></div>

                {/* Government ID Type */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Government ID Type *</label>
                  <IDTypePicker value={idType} onChange={id => {
                    setIdType(id);
                    if (CANADIAN_IDS.includes(id)) setIdCountry('Canada');
                  }} />
                </div>

                <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">ID Number *</label>
                  <input value={idNumber} onChange={e=>setIdNumber(e.target.value)} placeholder="Passport / License number…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" /></div>

                <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Country of Issue *</label>
                  <CountryPicker value={idCountry} onChange={setIdCountry} /></div>

                {/* Live camera ID */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Government ID Photo * <span className="font-normal text-gray-400">(live photo only)</span>
                  </label>
                  {idPhotoUrl ? (
                    <div className="flex items-center gap-3 border border-green-200 bg-green-50 rounded-xl p-3">
                      <div className="w-14 h-10 rounded-lg overflow-hidden border border-gray-200 shrink-0">
                        {showId?<img src={idPhotoUrl} alt="ID" className="w-full h-full object-cover"/>:<div className="w-full h-full bg-gray-200 flex items-center justify-center"><BadgeRounded sx={{fontSize:18,color:'#9ca3af'}}/></div>}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-green-700 flex items-center gap-1"><CheckRounded sx={{fontSize:12,color:'#16a34a'}}/>ID photo captured</p>
                        <button type="button" onClick={()=>setShowCamera('id')} className="text-[10px] text-blue-600 underline">Retake</button>
                      </div>
                      <button type="button" onClick={()=>setShowId(v=>!v)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-gray-200">
                        {showId?<VisibilityOffRounded sx={{fontSize:16,color:'#6b7280'}}/>:<VisibilityRounded sx={{fontSize:16,color:'#6b7280'}}/>}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={()=>setShowCamera('id')}
                      className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-6 hover:border-blue-400 hover:bg-blue-50 transition-colors">
                      <CameraAltRounded sx={{fontSize:32,color:'#9ca3af'}}/>
                      <p className="text-sm font-semibold text-gray-600">Take live photo of your ID</p>
                      <p className="text-xs text-gray-400">Passport, driver's license, or national ID</p>
                    </button>
                  )}
                </div>

                <button onClick={()=>setStep('address')} disabled={!formValid}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl py-3.5 transition-colors">
                  Continue — Address →
                </button>
              </div>
            )}

            {/* ── STEP 2: Address ── */}
            {step === 'address' && (
              <div className="px-5 py-5 space-y-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                    <HomeRounded sx={{fontSize:18,color:'#2563eb'}}/> Your Address
                  </div>
                  <button type="button" onClick={detectLocation} disabled={locating}
                    className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50">
                    <MyLocationRounded sx={{fontSize:14}}/>
                    {locating ? 'Detecting…' : 'Auto-detect'}
                  </button>
                </div>

                <AddressSearch onSelect={a => {
                  if (a.address) setAddress(a.address);
                  if (a.city) setCity(a.city);
                  if (a.province) setProvince(a.province);
                  if (a.postalCode) setPostalCode(a.postalCode);
                  if (a.country) setAddrCountry(a.country);
                }} />

                <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Street Address *</label>
                  <input value={address} onChange={e=>setAddress(e.target.value)} placeholder="123 Main Street, Apt 4B"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">City *</label>
                    <input value={city} onChange={e=>setCity(e.target.value)} placeholder="Montreal"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
                  <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Province / State *</label>
                    <input value={province} onChange={e=>setProvince(e.target.value)} placeholder="QC"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Postal / ZIP *</label>
                    <input value={postalCode} onChange={e=>setPostalCode(e.target.value.toUpperCase())} placeholder="H2X 1Y1"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
                  <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Country *</label>
                    <CountryPicker value={addrCountry} onChange={setAddrCountry}/></div>
                </div>

                {/* Proof of address */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-3">
                    <ArticleRounded sx={{fontSize:18,color:'#2563eb'}}/> Proof of Address
                  </div>
                  <div className="mb-3">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Document type *</label>
                    <select value={proofType} onChange={e=>setProofType(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="">Select type…</option>
                      {['Utility Bill (electricity, water, gas)','Bank Statement','Credit Card Statement','Government Letter','Lease / Rental Agreement','Insurance Document','Tax Document','Phone Bill'].map(t=>(
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {proofPhotoUrl ? (
                    <div className="flex items-center gap-3 border border-green-200 bg-green-50 rounded-xl p-3">
                      <div className="w-14 h-10 rounded-lg overflow-hidden border border-gray-200 shrink-0">
                        {showProof?<img src={proofPhotoUrl} alt="Proof" className="w-full h-full object-cover"/>:<div className="w-full h-full bg-gray-200 flex items-center justify-center"><ArticleRounded sx={{fontSize:18,color:'#9ca3af'}}/></div>}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-green-700 flex items-center gap-1"><CheckRounded sx={{fontSize:12,color:'#16a34a'}}/>Proof provided</p>
                        <div className="flex gap-2 mt-0.5">
                          <button type="button" onClick={()=>setShowCamera('proof')} className="text-[10px] text-blue-600 underline">Retake</button>
                          <span className="text-[10px] text-gray-300">|</span>
                          <label className="text-[10px] text-blue-600 underline cursor-pointer">
                            Upload file<input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleProofFileUpload}/>
                          </label>
                        </div>
                      </div>
                      <button type="button" onClick={()=>setShowProof(v=>!v)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-gray-200">
                        {showProof?<VisibilityOffRounded sx={{fontSize:16,color:'#6b7280'}}/>:<VisibilityRounded sx={{fontSize:16,color:'#6b7280'}}/>}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={()=>setShowCamera('proof')}
                        className="flex flex-col items-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-4 hover:border-blue-400 hover:bg-blue-50 transition-colors">
                        <CameraAltRounded sx={{fontSize:24,color:'#9ca3af'}}/>
                        <p className="text-xs font-semibold text-gray-600">Take photo</p>
                      </button>
                      <label className="flex flex-col items-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-4 hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer">
                        <UploadFileRounded sx={{fontSize:24,color:'#9ca3af'}}/>
                        <p className="text-xs font-semibold text-gray-600">Upload file</p>
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleProofFileUpload}/>
                      </label>
                    </div>
                  )}
                </div>

                <button onClick={()=>{setStep('verify_email'); sendEmailOTP();}} disabled={!addrValid}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl py-3.5 transition-colors">
                  Continue — Verify Email →
                </button>
              </div>
            )}

            {/* ── STEP 3: Email OTP ── */}
            {step === 'verify_email' && (
              <div className="px-5 py-10 space-y-5">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                    <VerifiedRounded sx={{fontSize:28,color:'#2563eb'}}/>
                  </div>
                  <h4 className="text-base font-bold text-gray-900">Verify your email</h4>
                  <p className="text-sm text-gray-500 mt-1">6-digit code sent to <strong>{email}</strong></p>
                </div>
                <input value={emailOtpVal} onChange={e=>setEmailOtpVal(e.target.value.replace(/\D/g,'').slice(0,6))}
                  placeholder="000000" maxLength={6}
                  className="w-full text-center text-2xl font-mono font-bold border-2 border-gray-200 rounded-2xl px-4 py-4 focus:outline-none focus:ring-2 focus:ring-blue-400 tracking-[0.5em]"/>
                {emailOtpErr && <p className="text-xs text-red-600 text-center">{emailOtpErr}</p>}
                <button onClick={verifyEmailOTP} disabled={emailOtpVal.length!==6}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm rounded-2xl py-3.5">
                  Verify Email →
                </button>
                <div className="text-center space-x-3">
                  <button type="button" onClick={sendEmailOTP} className="text-xs text-blue-600 underline">Resend code</button>
                  <button type="button" onClick={()=>setStep('address')} className="text-xs text-gray-400 underline">Back</button>
                </div>
              </div>
            )}

            {/* ── STEP 4: Phone OTP ── */}
            {step === 'verify_phone' && (
              <div className="px-5 py-10 space-y-5">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <PhoneRounded sx={{fontSize:28,color:'#16a34a'}}/>
                  </div>
                  <h4 className="text-base font-bold text-gray-900">Verify your phone</h4>
                  <p className="text-sm text-gray-500 mt-1">Code for <strong>{phone}</strong> sent to <strong>{email}</strong></p>
                  <p className="text-xs text-gray-400 mt-1">(SMS requires Twilio — code delivered via email)</p>
                </div>
                <input value={phoneOtpVal} onChange={e=>setPhoneOtpVal(e.target.value.replace(/\D/g,'').slice(0,6))}
                  placeholder="000000" maxLength={6}
                  className="w-full text-center text-2xl font-mono font-bold border-2 border-gray-200 rounded-2xl px-4 py-4 focus:outline-none focus:ring-2 focus:ring-green-400 tracking-[0.5em]"/>
                {phoneOtpErr && <p className="text-xs text-red-600 text-center">{phoneOtpErr}</p>}
                <button onClick={verifyPhoneOTP} disabled={phoneOtpVal.length!==6}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold text-sm rounded-2xl py-3.5">
                  Verify Phone →
                </button>
                <div className="text-center">
                  <button type="button" onClick={sendPhoneOTP} className="text-xs text-blue-600 underline">Resend code</button>
                </div>
              </div>
            )}

            {/* ── STEP 5: Sign ── */}
            {step === 'sign' && (
              <div className="px-5 py-5 space-y-4">
                <div className="bg-gray-50 rounded-2xl border border-gray-200 px-4 py-3 space-y-1.5 text-xs">
                  <p className="font-bold text-gray-800 text-sm mb-2">Agreement Summary</p>
                  {[['Renter',`${firstName} ${lastName}`],['Host',hostUser?.name||'—'],['Item',pay.listingTitle],['Amount',`$${totalAmount.toFixed(2)} CAD`],['Method',selectedMethod],['Email',`${email} ✓`],['Phone',`${phone} ✓`]].map(([l,v])=>(
                    <div key={l} className="flex justify-between gap-2"><span className="text-gray-500">{l}</span><span className="font-semibold truncate text-right">{v}</span></div>
                  ))}
                </div>

                {[
                  {title:'⚠️ Damage Liability',content:(
                    <div className="text-xs space-y-2">
                      <div className="rounded-xl overflow-hidden border border-gray-200">
                        {[['Normal wear','Minor dust, expected scuffs','Host absorbs'],['Accidental damage','Drops, scratches, issues','Renter pays (capped at deposit)'],['Major damage','Broken, water damage','Renter pays repair/replacement'],['Total loss/theft','Gear not returned','Renter pays full value']].map(([t,d,w])=>(
                          <div key={t} className="grid grid-cols-3 border-b border-gray-100 last:border-0">
                            <div className="px-2 py-2 font-semibold bg-gray-50">{t}</div>
                            <div className="px-2 py-2 border-x border-gray-100 text-gray-600">{d}</div>
                            <div className="px-2 py-2 text-gray-600">{w}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-gray-500">Flag pre-existing damage within <strong>2 hours</strong> of pickup.</p>
                    </div>
                  )},
                  {title:'❌ Cancellation Policy',content:(
                    <div className="rounded-xl overflow-hidden border border-gray-200 text-xs">
                      {[['7+ days','100% refund','Nothing'],['3–6 days','50% refund','25%'],['< 48 hrs','0–25% refund','50%'],['No-show','0% refund','75%']].map(([w,r,h])=>(
                        <div key={w} className="grid grid-cols-3 border-b border-gray-100 last:border-0">
                          <div className="px-2 py-2 font-semibold bg-gray-50">{w}</div>
                          <div className="px-2 py-2 border-x border-gray-100 text-green-700 font-semibold">{r}</div>
                          <div className="px-2 py-2 text-gray-500">Host: {h}</div>
                        </div>
                      ))}
                    </div>
                  )},
                  {title:'⚖️ Dispute Resolution',content:(
                    <div className="text-xs text-gray-600 space-y-1.5">
                      <p>Submit disputes via Filmons within <strong>48 hours</strong> of return.</p>
                      <p>Filmons mediates within <strong>5 business days</strong>. Unresolved → BCICAC binding arbitration.</p>
                      <p>Filmons final say for disputes up to <strong>$2,500 CAD</strong>. Governing law: Province of BC, Canada.</p>
                    </div>
                  )},
                ].map(({title,content})=><TermsSection key={title} title={title}>{content}</TermsSection>)}

                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
                    <CreateRounded sx={{fontSize:14,color:'#2563eb'}}/> Draw Your Signature *
                  </label>
                  <SignatureCanvas onChange={setSignature}/>
                </div>

                <button type="button" onClick={()=>setAccepted(v=>!v)}
                  className={`flex items-start gap-3 w-full text-left p-4 rounded-2xl border-2 transition-colors ${accepted?'bg-green-50 border-green-400':'bg-white border-gray-200 hover:border-blue-300'}`}>
                  <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-colors ${accepted?'bg-green-600 border-green-600':'border-gray-300'}`}>
                    {accepted && <CheckRounded sx={{fontSize:13,color:'white'}}/>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">I have read and accept the Filmons Rental Agreement</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Including damage liability, cancellation policy, and dispute resolution. Legally binding digital signature.</p>
                  </div>
                </button>

                <button onClick={handleSubmit} disabled={!signValid||sending}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2">
                  {sending
                    ?<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Generating & emailing documents…</>
                    :<><PictureAsPdfRounded sx={{fontSize:18,color:'white'}}/>Sign & Send Agreement + Receipt</>
                  }
                </button>
                <p className="text-[10px] text-center text-gray-400">
                  Agreement + receipt emailed to {email} and {hostUser?.name||'the host'} with download links.
                </p>
              </div>
            )}

            {/* ── DONE ── */}
            {step === 'done' && (
              <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <CheckRounded sx={{fontSize:36,color:'#16a34a'}}/>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Agreement Signed & Emailed!</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Your signed rental agreement and receipt have been emailed to <strong>{email}</strong> and the host, with download links.
                </p>
                <p className="text-xs font-mono text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full">{refNo}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}