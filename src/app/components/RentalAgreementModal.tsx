import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { uploadRentalDoc, signRentalDoc } from '../../lib/upload';
import { SmartAddressInput, type AddressComponents } from './SmartAddressInput';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import {
  ArrowLeft, X, Check, Upload, Loader2, Lock,
  FileText, ShieldCheck, PenLine, MapPin, Camera,
} from 'lucide-react';

interface RentalAgreementProps {
  pay: any; user: any; hostUser: any | null;
  convId: string; msgId: string;
  totalAmount: number; selectedMethod: string;
  onAccepted: (data: SignedAgreementData) => void;
  onClose: () => void;
}

export interface SignedAgreementData {
  agreementId: string;
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

const SIGN_EDGE = `https://${projectId}.supabase.co/functions/v1/rental-agreement-sign`;
const QUOTE_EDGE = `https://${projectId}.supabase.co/functions/v1/checkout-quote`;

// Preview-only breakdown shown in Step 6 before signing — the actual signed
// snapshot is computed independently, server-side, by rental-agreement-sign
// at signing time (see supabase/functions/_shared/pricing.ts). This is just
// so the renter isn't surprised by the fee at the payment step. No tax is
// calculated here — Stripe handles applicable tax on its own, separately.
interface PriceQuote {
  subtotal: number; buyerFeeRate: number; buyerFeeAmount: number; total: number;
}

const ID_TYPES: Record<string, string[]> = {
  CA: ["Driver's Licence", 'Canadian Passport', 'Provincial/Territorial Photo ID'],
  US: ["Driver's License", 'U.S. Passport', 'State-issued Photo ID'],
  OTHER: ['Passport — Recommended', 'National Identity Card', "Driver's Licence — where supported"],
};

const PROOF_TYPES = ['Utility bill', 'Bank statement', 'Credit-card statement', 'Government correspondence', 'Lease/rental agreement'];

const STEP_LABELS = ['Personal', 'Address', 'Verification', 'Rental Rules', 'Signature', 'Review'];
type StepKey = 'personal' | 'address' | 'verify' | 'rules' | 'signature' | 'review';
const STEPS: StepKey[] = ['personal', 'address', 'verify', 'rules', 'signature', 'review'];

function mkAgreementNumber() {
  return `FLM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

// ── Signature canvas (draw) ─────────────────────────────────────────
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
    const down = (e: MouseEvent | TouchEvent) => { e.preventDefault(); drawing.current = true; const { x, y } = getXY(e, cv); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (e: MouseEvent | TouchEvent) => { if (!drawing.current) return; e.preventDefault(); hasStroke.current = true; const { x, y } = getXY(e, cv); ctx.lineTo(x, y); ctx.stroke(); };
    const up = () => { drawing.current = false; if (hasStroke.current) onChange(cv.toDataURL()); };
    cv.addEventListener('mousedown', down); cv.addEventListener('mousemove', move); cv.addEventListener('mouseup', up);
    cv.addEventListener('touchstart', down, { passive: false }); cv.addEventListener('touchmove', move, { passive: false }); cv.addEventListener('touchend', up);
    return () => { cv.removeEventListener('mousedown', down); cv.removeEventListener('mousemove', move); cv.removeEventListener('mouseup', up); cv.removeEventListener('touchstart', down); cv.removeEventListener('touchmove', move); cv.removeEventListener('touchend', up); };
  }, [onChange]);
  const clear = () => { const cv = cvRef.current; if (!cv) return; cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height); hasStroke.current = false; onChange(null); };
  return (
    <div className="border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-gray-50 relative">
      <canvas ref={cvRef} width={540} height={110} className="w-full touch-none cursor-crosshair" style={{ height: '110px' }} />
      <div className="absolute bottom-2 right-2 flex items-center gap-2">
        <span className="text-[10px] text-gray-400">Draw signature above</span>
        <button type="button" onClick={clear} className="text-[10px] text-red-500 bg-white border border-red-200 rounded-lg px-2 py-0.5 font-semibold">Clear</button>
      </div>
      <div className="absolute left-4 right-4 pointer-events-none bg-gray-300 h-px" style={{ bottom: '28px' }} />
    </div>
  );
}

// ── Country -> ID type picker (CA / US / Other with searchable country) ─────
function IssuingCountryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [showOther, setShowOther] = useState(value !== '' && value !== 'Canada' && value !== 'United States');
  const [q, setQ] = useState('');
  const OTHER_COUNTRIES = ['United Kingdom', 'France', 'Germany', 'Australia', 'Mexico', 'Brazil', 'India', 'Japan', 'Other'];
  const filtered = useMemo(() => OTHER_COUNTRIES.filter(c => c.toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {[{ id: 'Canada', label: '🇨🇦 Canada' }, { id: 'United States', label: '🇺🇸 United States' }, { id: '__other', label: '🌍 Other' }].map(o => (
          <button key={o.id} type="button"
            onClick={() => { if (o.id === '__other') { setShowOther(true); onChange(''); } else { setShowOther(false); onChange(o.id); } }}
            className={`py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${(o.id === '__other' ? showOther : value === o.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            {o.label}
          </button>
        ))}
      </div>
      {showOther && (
        <div className="relative">
          <input value={value || q} onChange={e => { setQ(e.target.value); onChange(''); }} placeholder="Search issuing country…"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          {q && !value && (
            <div className="absolute z-40 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden max-h-40 overflow-y-auto">
              {filtered.map(c => (
                <button key={c} type="button" onClick={() => { onChange(c); setQ(''); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 text-gray-700">{c}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Private-storage upload card ─────────────────────────────────────
function UploadCard({ label, sub, filePreview, onPick, uploading }: {
  label: string; sub?: string; filePreview: string | null; onPick: (f: File) => void; uploading: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
      {filePreview ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          <img src={filePreview} alt={label} className="w-full h-32 object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
            <button type="button" onClick={() => ref.current?.click()} className="bg-white text-gray-800 text-xs font-bold px-3 py-1.5 rounded-lg">Replace</button>
          </div>
          <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center"><Check className="w-3.5 h-3.5 text-white" /></div>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
          className="w-full flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 transition-all disabled:opacity-50">
          {uploading ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin" /> : <Upload className="w-5 h-5 text-gray-400" />}
          <span className="text-xs font-bold text-gray-700">{label}</span>
          {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
        </button>
      )}
    </div>
  );
}

// ── Progress stepper ─────────────────────────────────────────────────
function Stepper({ stepIdx }: { stepIdx: number }) {
  return (
    <div className="flex items-center px-5 pt-3 pb-1">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-300 ${
              i < stepIdx ? 'bg-green-500 text-white' : i === stepIdx ? 'bg-blue-600 text-white scale-110' : 'bg-gray-100 text-gray-400'
            }`}>
              {i < stepIdx ? <Check className="w-3 h-3" /> : i + 1}
            </div>
            <span className={`text-[9px] font-bold whitespace-nowrap ${i === stepIdx ? 'text-blue-700' : i < stepIdx ? 'text-green-600' : 'text-gray-300'}`}>{label}</span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className="flex-1 h-0.5 mx-1 mb-3.5 rounded-full overflow-hidden bg-gray-100">
              <div className={`h-full bg-green-500 transition-all duration-500 ${i < stepIdx ? 'w-full' : 'w-0'}`} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────
export function RentalAgreementModal({ pay, user, hostUser, convId, msgId, totalAmount, selectedMethod, onAccepted, onClose }: RentalAgreementProps) {
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [overview, setOverview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const step = STEPS[stepIdx];

  const agreementId = useRef<string>(crypto.randomUUID()).current;
  const agreementNumber = useRef(mkAgreementNumber()).current;
  const draftCreated = useRef(false);

  // Verified contact — fetched fresh from `profiles`, never trusted from the
  // client-side `user` object (AuthContext doesn't populate emailVerified/
  // phoneVerified on it; this is also the actual source of truth the Edge
  // Function re-checks server-side at signing time).
  //
  // email_verified/phone_verified come from a separate, rarely-used OTP-style
  // flow — Creator+ approval (verification-decision Edge Function) never
  // touches them, even though Creator+ KYC (government ID + proof of
  // address) is a strictly stronger identity check. Treating a Creator+
  // approved account as having unverified contact info was a real bug, not
  // intended behaviour — so an approved account also satisfies this gate.
  const [profile, setProfile] = useState<{ email: string; phone: string; email_verified: boolean; phone_verified: boolean; is_verified: boolean } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const isCreatorPlusApproved = !!profile?.is_verified;
  const emailVerified = !!profile?.email_verified || isCreatorPlusApproved;
  const phoneVerified = !!profile?.phone_verified || isCreatorPlusApproved;

  // Step 1 — Personal
  const [legalFirst, setLegalFirst] = useState(user?.name?.split(' ')[0] || '');
  const [legalLast, setLegalLast] = useState(user?.name?.split(' ').slice(1).join(' ') || '');
  const [dob, setDob] = useState('');

  // Step 2 — Address
  const [addrCountryCode, setAddrCountryCode] = useState<'CA' | 'US'>('CA');
  const [addressText, setAddressText] = useState('');
  const [addrParts, setAddrParts] = useState<AddressComponents | null>(null);
  const [unit, setUnit] = useState('');

  // Step 3 — Verification
  const [idCountry, setIdCountry] = useState('Canada');
  const [idType, setIdType] = useState('');
  const [idFrontPath, setIdFrontPath] = useState<string | null>(null);
  const [idFrontPreview, setIdFrontPreview] = useState<string | null>(null);
  const [idBackPath, setIdBackPath] = useState<string | null>(null);
  const [idBackPreview, setIdBackPreview] = useState<string | null>(null);
  const [proofType, setProofType] = useState('');
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);

  // Step 4 — Rules
  const [listing, setListing] = useState<any>(null);
  const [rulesAgreed, setRulesAgreed] = useState(false);

  // Step 6 — Review (preview pricing only; the sign call recomputes this
  // server-side and freezes the real snapshot)
  const [quote, setQuote] = useState<PriceQuote | null>(null);

  // Step 5 — Signature
  const [sigMode, setSigMode] = useState<'drawn' | 'typed'>('drawn');
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const [typedSig, setTypedSig] = useState('');
  const [confirmAccurate, setConfirmAccurate] = useState(false);
  const [confirmAgree, setConfirmAgree] = useState(false);

  const idTypes = idCountry === 'Canada' ? ID_TYPES.CA : idCountry === 'United States' ? ID_TYPES.US : ID_TYPES.OTHER;
  const requiresIdBack = idType.toLowerCase().includes('licence') || idType.toLowerCase().includes('license') || idType.toLowerCase().includes('id');

  // Create the draft row, fetch the renter's verified-contact profile, and
  // the listing's rental rules — once, on open.
  useEffect(() => {
    if (draftCreated.current) return;
    draftCreated.current = true;
    supabase.from('rental_agreements').insert({
      id: agreementId, agreement_number: agreementNumber, status: 'draft',
      order_id: null, listing_id: pay?.listingId || null,
      conversation_id: convId, message_id: msgId,
      renter_id: user?.id, host_id: hostUser?.id || null,
    }).then(({ error }) => { if (error) console.warn('[rental-agreement] draft create failed:', error.message); });

    if (user?.id) {
      supabase.from('profiles').select('email, phone, email_verified, phone_verified, is_verified').eq('id', user.id).maybeSingle()
        .then(({ data, error }) => {
          if (error) console.warn('[rental-agreement] profile fetch failed:', error.message);
          setProfile(data as any);
          setProfileLoading(false);
        })
        .catch(e => { console.warn('[rental-agreement] profile fetch failed:', e); setProfileLoading(false); });
    } else {
      setProfileLoading(false);
    }

    if (pay?.listingId) {
      supabase.from('listings').select('requirements, cancellation').eq('id', pay.listingId).maybeSingle()
        .then(({ data }) => setListing(data));
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!profile || !pay?.amount) return;
    fetch(QUOTE_EDGE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
      body: JSON.stringify({ subtotal: Number(pay.amount) || 0 }),
    }).then(r => r.json()).then(data => { if (!data.error) setQuote(data); }).catch(() => {});
  }, [profile, pay?.amount]);

  const goNext = () => { setDir(1); setStepIdx(i => Math.min(STEPS.length - 1, i + 1)); };
  const goBack = () => { setDir(-1); setStepIdx(i => Math.max(0, i - 1)); };

  const canContinuePersonal = emailVerified && phoneVerified && legalFirst.trim() && legalLast.trim() && dob;
  const canContinueAddress  = !!addrParts?.city && !!addrParts?.postalCode && !!addressText.trim();
  const canContinueVerify   = !!idType && !!idFrontPath && (!requiresIdBack || !!idBackPath) && !!proofType && !!proofPath;
  const canContinueRules    = rulesAgreed;
  const canContinueSign     = !!sigDataUrl && confirmAccurate && confirmAgree;

  const handleUpload = async (kind: 'idFront' | 'idBack' | 'proof', file: File) => {
    setUploadingKind(kind);
    const localPreview = URL.createObjectURL(file);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${agreementId}/${kind === 'idFront' ? 'id-front' : kind === 'idBack' ? 'id-back' : 'proof-address'}.${ext}`;
    const uploaded = await uploadRentalDoc(file, path, file.type);
    setUploadingKind(null);
    if (!uploaded || uploaded.startsWith('data:') || uploaded.startsWith('blob:')) {
      toast.error('Upload failed — please try again.');
      return;
    }
    if (kind === 'idFront') { setIdFrontPath(uploaded); setIdFrontPreview(localPreview); }
    else if (kind === 'idBack') { setIdBackPath(uploaded); setIdBackPreview(localPreview); }
    else { setProofPath(uploaded); setProofPreview(localPreview); }
  };

  const handleSubmit = async () => {
    if (!canContinueSign || submitting) return;
    setSubmitting(true);
    try {
      // Upload the signature image
      const sigBlob = await (await fetch(sigDataUrl!)).blob();
      const sigPath = await uploadRentalDoc(sigBlob, `${agreementId}/signature.png`, 'image/png');

      // Save the draft's full field set, then finalize server-side.
      const { error: updErr } = await supabase.from('rental_agreements').update({
        legal_first_name: legalFirst.trim(), legal_last_name: legalLast.trim(), date_of_birth: dob,
        address_country: addrCountryCode, address_line1: addressText.trim(), address_line2: unit.trim() || null,
        city: addrParts?.city || '', province_state: addrParts?.province || '', postal_code: addrParts?.postalCode || '',
        id_issuing_country: idCountry, id_type: idType, id_front_path: idFrontPath, id_back_path: idBackPath,
        proof_of_address_type: proofType, proof_of_address_path: proofPath,
        signature_type: sigMode, signature_path: sigPath,
        status: 'ready_to_sign',
      }).eq('id', agreementId);
      if (updErr) throw new Error(updErr.message);

      const res = await fetch(SIGN_EDGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ agreementId, renterId: user?.id, messageId: msgId, listingId: pay?.listingId }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Could not finalize agreement');

      const signedAt = new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' }) + ' EST';
      // Short-lived signed URLs for the immediate post-sign email only — the
      // DB never stores these; Dashboard → Orders mints fresh ones on demand.
      const idUrl = (await signRentalDoc(idFrontPath, 24 * 3600)) || '';
      const proofUrl = (await signRentalDoc(proofPath, 24 * 3600)) || '';

      onAccepted({
        agreementId, refNo: agreementNumber, receiptNo: `RCP-${agreementNumber.split('-')[1]}`,
        renterName: `${legalFirst} ${legalLast}`, renterEmail: profile?.email || user?.email || '', renterPhone: profile?.phone || user?.phone || '',
        agreementUrl: '', hostAgreementUrl: '', receiptUrl: '', idUrl, proofUrl, signedAt,
      });
    } catch (e: any) {
      toast.error(e?.message || 'Could not sign the agreement. Please try again.');
      setSubmitting(false);
    }
  };

  const overviewField = (label: string, value: string | null | undefined) => (
    <div className="mb-2.5">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
      <p className={`text-sm ${value ? 'text-gray-900 font-semibold' : 'text-gray-300 italic'}`}>{value || 'Not completed'}</p>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes ramSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes ramFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .ram-step-enter { animation: ramStepIn 0.22s ease both; }
        @keyframes ramStepIn { from { opacity: 0; transform: translateX(var(--ram-dir, 24px)); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
      <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center" style={{ animation: 'ramFadeIn 0.2s ease' }} onClick={onClose}>
        <div
          className="bg-white w-full md:max-w-2xl rounded-t-3xl md:rounded-[22px] max-h-[94vh] md:max-h-[88vh] flex flex-col shadow-2xl"
          style={{ animation: 'ramSlideUp 0.32s cubic-bezier(0.32,0.72,0,1)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Sticky header */}
          <div className="shrink-0 border-b border-gray-100">
            <div className="flex items-center gap-3 px-5 pt-4">
              {stepIdx > 0 && !overview && (
                <button onClick={goBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0">
                  <ArrowLeft className="w-4 h-4 text-gray-600" />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">FILMONS · Rental Agreement</p>
                <p className="text-sm font-bold text-gray-900">{overview ? 'Document Overview' : `Step ${stepIdx + 1} of 6`}</p>
              </div>
              <button onClick={() => setOverview(v => !v)}
                className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-colors shrink-0">
                <FileText className="w-3.5 h-3.5" /> {overview ? 'Back to Form' : 'Document Overview'}
              </button>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0">
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            {!overview && <Stepper stepIdx={stepIdx} />}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {overview ? (
              <div className="px-5 py-5">
                <div className="bg-gray-50 rounded-2xl p-4 space-y-1 border border-gray-100">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Renter</p>
                  {overviewField('Legal name', (legalFirst || legalLast) ? `${legalFirst} ${legalLast}`.trim() : null)}
                  {overviewField('Address', addrParts?.city ? `${addressText}, ${addrParts.city}` : null)}
                  {overviewField('Verified contact', emailVerified && phoneVerified ? `${profile?.email}\n${profile?.phone}` : null)}
                  {overviewField('Listing', pay?.listingTitle)}
                  {overviewField('Rental rules', rulesAgreed ? 'Agreed' : null)}
                  {overviewField('Signature', sigDataUrl ? `Signed by ${legalFirst} ${legalLast}` : null)}
                </div>
              </div>
            ) : (
              <div key={step} className="ram-step-enter" style={{ ['--ram-dir' as any]: dir === 1 ? '24px' : '-24px' }}>

                {/* ── Step 1: Personal ── */}
                {step === 'personal' && (
                  <div className="px-5 py-5 space-y-4">
                    <h2 className="text-lg font-black text-gray-900">Your information</h2>

                    {profileLoading ? (
                      <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>
                    ) : !(emailVerified && phoneVerified) ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center space-y-3">
                        <ShieldCheck className="w-8 h-8 text-amber-500 mx-auto" />
                        <p className="font-black text-gray-900">Contact verification required</p>
                        <p className="text-xs text-gray-500">Your rental agreement must use the verified contact information connected to your Filmons account.</p>
                        <button onClick={() => navigate('/verification')} className="w-full py-3 bg-blue-600 text-white font-bold rounded-2xl text-sm">
                          Verify contact information
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Legal first name *</label>
                            <input value={legalFirst} onChange={e => setLegalFirst(e.target.value)} placeholder="John"
                              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-400" /></div>
                          <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Legal last name *</label>
                            <input value={legalLast} onChange={e => setLegalLast(e.target.value)} placeholder="Doe"
                              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-400" /></div>
                        </div>
                        <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Date of birth *</label>
                          <input type="date" value={dob} onChange={e => setDob(e.target.value)}
                            max={new Date(Date.now() - 16 * 365.25 * 86400000).toISOString().split('T')[0]}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-400" /></div>
                        <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Email</label>
                          <div className="flex items-center gap-2 border border-gray-200 bg-gray-50 rounded-xl px-3 py-2.5">
                            <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="text-sm text-gray-700 flex-1 truncate">{profile?.email}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">🔒 Verified account email</p>
                        </div>
                        <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Phone</label>
                          <div className="flex items-center gap-2 border border-gray-200 bg-gray-50 rounded-xl px-3 py-2.5">
                            <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="text-sm text-gray-700 flex-1 truncate">{profile?.phone}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">🔒 Verified account phone</p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ── Step 2: Address ── */}
                {step === 'address' && (
                  <div className="px-5 py-5 space-y-4">
                    <h2 className="text-lg font-black text-gray-900">Where do you live?</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {[{ id: 'CA', label: '🇨🇦 Canada' }, { id: 'US', label: '🇺🇸 United States' }].map(c => (
                        <button key={c.id} type="button" onClick={() => setAddrCountryCode(c.id as 'CA' | 'US')}
                          className={`py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${addrCountryCode === c.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                    <SmartAddressInput
                      value={addressText}
                      onInputChange={setAddressText}
                      onAddressSelect={(_, parts) => setAddrParts(parts)}
                      mode="full"
                      countryCode={addrCountryCode}
                      showGPS
                      label="Street address"
                    />
                    <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Apartment / Unit (optional)</label>
                      <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="Unit 4B"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-400" /></div>
                    <p className="text-[11px] text-gray-400 bg-gray-50 rounded-xl px-3 py-2.5 flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Your residential address is private and is used only for rental verification and agreement purposes.
                    </p>
                  </div>
                )}

                {/* ── Step 3: Verification ── */}
                {step === 'verify' && (
                  <div className="px-5 py-5 space-y-5">
                    <h2 className="text-lg font-black text-gray-900">Verify your information</h2>

                    <div className="border border-gray-200 rounded-2xl p-4 space-y-3">
                      <p className="text-sm font-bold text-gray-900">Government ID</p>
                      <p className="text-xs text-gray-500">Country that issued your ID</p>
                      <IssuingCountryPicker value={idCountry} onChange={v => { setIdCountry(v); setIdType(''); }} />
                      {idCountry && (
                        <select value={idType} onChange={e => setIdType(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                          <option value="">Select ID type…</option>
                          {idTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      )}
                      {idType && (
                        <div className="grid grid-cols-2 gap-2">
                          <UploadCard label="Upload front" filePreview={idFrontPreview} uploading={uploadingKind === 'idFront'} onPick={f => handleUpload('idFront', f)} />
                          {requiresIdBack && (
                            <UploadCard label="Upload back" filePreview={idBackPreview} uploading={uploadingKind === 'idBack'} onPick={f => handleUpload('idBack', f)} />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="border border-gray-200 rounded-2xl p-4 space-y-3">
                      <p className="text-sm font-bold text-gray-900">Proof of Address</p>
                      <select value={proofType} onChange={e => setProofType(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="">Select document type…</option>
                        {PROOF_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {proofType && (
                        <UploadCard label="Upload document" sub="Shows name, address, issuer, and a recent date" filePreview={proofPreview} uploading={uploadingKind === 'proof'} onPick={f => handleUpload('proof', f)} />
                      )}
                    </div>

                    <p className="text-[11px] text-gray-400 bg-gray-50 rounded-xl px-3 py-2.5 flex items-start gap-1.5">
                      <Camera className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Your verification documents are private and are never displayed publicly. The listing owner never sees these files — only a verification status.
                    </p>
                  </div>
                )}

                {/* ── Step 4: Rental Rules ── */}
                {step === 'rules' && (
                  <div className="px-5 py-5 space-y-4">
                    <h2 className="text-lg font-black text-gray-900">Rental Rules</h2>
                    <p className="text-xs text-gray-500">{pay?.listingTitle} Rental Rules</p>
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {listing?.requirements || listing?.cancellation
                        ? [listing?.requirements, listing?.cancellation].filter(Boolean).join('\n\n')
                        : 'The owner has not listed specific rental rules for this item. Standard Filmons rental terms apply.'}
                    </div>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={rulesAgreed} onChange={e => setRulesAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-blue-600" />
                      <span className="text-sm text-gray-700">I have read and agree to the rental rules set by the owner.</span>
                    </label>
                  </div>
                )}

                {/* ── Step 5: Signature ── */}
                {step === 'signature' && (
                  <div className="px-5 py-5 space-y-4">
                    <h2 className="text-lg font-black text-gray-900">Sign your Rental Agreement</h2>
                    <div><p className="text-xs font-semibold text-gray-700 mb-1">Legal name</p>
                      <p className="text-sm text-gray-900 font-bold">{legalFirst} {legalLast}</p></div>

                    <div className="flex gap-2">
                      {(['drawn', 'typed'] as const).map(m => (
                        <button key={m} type="button" onClick={() => { setSigMode(m); setSigDataUrl(null); }}
                          className={`flex-1 py-2 rounded-xl border-2 text-xs font-bold transition-all ${sigMode === m ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
                          {m === 'drawn' ? 'Draw signature' : 'Type signature'}
                        </button>
                      ))}
                    </div>

                    {sigMode === 'drawn' ? (
                      <SignatureCanvas onChange={setSigDataUrl} />
                    ) : (
                      <div>
                        <input value={typedSig} onChange={e => {
                          setTypedSig(e.target.value);
                          if (!e.target.value.trim()) { setSigDataUrl(null); return; }
                          const c = document.createElement('canvas'); c.width = 540; c.height = 110;
                          const ctx = c.getContext('2d')!;
                          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
                          ctx.fillStyle = '#1e3a5f'; ctx.font = 'italic 40px "Brush Script MT", cursive';
                          ctx.fillText(e.target.value, 20, 65);
                          setSigDataUrl(c.toDataURL());
                        }} placeholder="Type your full legal name"
                          className="w-full border border-gray-200 rounded-xl px-3 py-3 text-lg italic focus:outline-none focus:ring-2 focus:ring-blue-400" style={{ fontFamily: 'cursive' }} />
                      </div>
                    )}

                    <p className="text-xs text-gray-400">Date signed: {new Date().toLocaleDateString('en-CA')}</p>

                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={confirmAccurate} onChange={e => setConfirmAccurate(e.target.checked)} className="mt-0.5 w-4 h-4 accent-blue-600" />
                      <span className="text-sm text-gray-700">I confirm that the information I provided is accurate.</span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={confirmAgree} onChange={e => setConfirmAgree(e.target.checked)} className="mt-0.5 w-4 h-4 accent-blue-600" />
                      <span className="text-sm text-gray-700">I have read and agree to the Rental Agreement and listing rental rules.</span>
                    </label>
                  </div>
                )}

                {/* ── Step 6: Review ── */}
                {step === 'review' && (
                  <div className="px-5 py-5 space-y-4">
                    <h2 className="text-lg font-black text-gray-900">Review your Rental Agreement</h2>

                    <div className="bg-gray-50 rounded-2xl p-4 space-y-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Renter</p>
                      {overviewField('Legal name', `${legalFirst} ${legalLast}`)}
                      {overviewField('Residential address', `${addressText}, ${addrParts?.city}, ${addrParts?.province} ${addrParts?.postalCode}`)}
                      {overviewField('Verified email', profile?.email)}
                      {overviewField('Verified phone', profile?.phone)}
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4 space-y-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Verification</p>
                      <div className="flex justify-between text-sm py-1"><span className="text-gray-500">Government ID</span><span className="font-bold text-green-600">Provided ✓</span></div>
                      <div className="flex justify-between text-sm py-1"><span className="text-gray-500">Proof of Address</span><span className="font-bold text-green-600">Provided ✓</span></div>
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4 space-y-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Rental</p>
                      {overviewField('Listing', pay?.listingTitle)}
                      {overviewField('Owner', hostUser?.name)}
                      {overviewField('Rental dates', pay?.startDate ? `${pay.startDate} · ${pay.duration || 1} ${pay.durationType || 'day(s)'}` : null)}
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4 space-y-1.5">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Price</p>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Rental</span><span className="text-gray-800">${(quote?.subtotal ?? (Number(pay?.amount) || 0)).toFixed(2)} CAD</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Filmons Fee{quote ? ` (${(quote.buyerFeeRate * 100).toFixed(0)}%)` : ''}</span><span className="text-gray-800">${(quote?.buyerFeeAmount ?? 0).toFixed(2)} CAD</span></div>
                      <div className="flex justify-between text-sm font-bold border-t border-gray-200 pt-1.5 mt-0.5"><span className="text-gray-900">Total</span><span className="text-gray-900">${(quote?.total ?? totalAmount).toFixed(2)} CAD</span></div>
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Signature</p>
                      <p className="text-sm text-gray-900 font-semibold mb-2">Signed by: {legalFirst} {legalLast}</p>
                      {sigDataUrl && <img src={sigDataUrl} alt="signature" className="h-12 object-contain" />}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sticky footer actions */}
          {!overview && (
            <div className="shrink-0 border-t border-gray-100 px-5 py-3.5 flex gap-3">
              {stepIdx > 0 && (
                <button onClick={goBack} className="flex-1 py-3.5 rounded-2xl border border-gray-200 text-gray-700 font-bold text-sm">Back</button>
              )}
              {step !== 'review' ? (
                <button
                  onClick={goNext}
                  disabled={
                    (step === 'personal' && !canContinuePersonal) ||
                    (step === 'address' && !canContinueAddress) ||
                    (step === 'verify' && !canContinueVerify) ||
                    (step === 'rules' && !canContinueRules) ||
                    (step === 'signature' && !canContinueSign)
                  }
                  className="flex-[2] py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-sm disabled:opacity-40 transition-all active:scale-[0.98]">
                  {step === 'rules' ? 'Agree & Continue' : step === 'signature' ? 'Sign & Continue' : 'Continue'}
                </button>
              ) : (
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-[2] py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-sm disabled:opacity-60 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing…</> : <><PenLine className="w-4 h-4" /> Confirm &amp; Sign Agreement</>}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
