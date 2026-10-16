import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Lock, ShieldCheck, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { uploadRentalDoc } from '../../lib/upload';
import { withTimeout } from '../lib/withTimeout';
import { generateServiceAgreement } from '../lib/generateServiceAgreement';
import type { HireRequestRow, HireTransactionRow } from '../lib/hireApi';
import { BottomSheet } from './BottomSheet';
import { SignatureCanvas } from './RentalAgreementModal';

type Step = 'info' | 'review' | 'sign';
const STEPS: Step[] = ['info', 'review', 'sign'];
const STEP_LABEL: Record<Step, string> = { info: 'Your information', review: 'Review agreement', sign: 'Sign' };

interface Props {
  hire: HireRequestRow;
  txn: HireTransactionRow | null;
  userId: string;
  role: 'client' | 'provider';
  onSigned: () => void;
  onClose: () => void;
}

/** Signing flow for the Service Agreement: information → review → sign.
 *  Verified accounts get legal name / birth date / contact details filled
 *  from identity verification and locked; others enter them by hand. */
export function ServiceAgreementModal({ hire, txn, userId, role, onSigned, onClose }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [dob, setDob] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const [opening, setOpening] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  const [sigMode, setSigMode] = useState<'drawn' | 'typed'>('drawn');
  const [typedSig, setTypedSig] = useState('');
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const [confirmAccurate, setConfirmAccurate] = useState(false);
  const [confirmAgree, setConfirmAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true); setLoadFailed(false);
    Promise.all([
      withTimeout(Promise.resolve(supabase.from('profiles').select('name, email, phone').eq('id', userId).maybeSingle()).then(r => r.data).catch(() => null), 3500, null),
      withTimeout(Promise.resolve(supabase.from('identity_verifications')
        .select('id, status, legal_first_name, legal_last_name, date_of_birth, address_line1, address_line2, city, province_state, postal_code')
        .eq('user_id', userId).order('submitted_at', { ascending: false }).limit(1).maybeSingle()).then(r => r.data).catch(() => undefined), 3500, undefined),
    ]).then(([profile, v]) => {
      if (v === undefined && profile === null) { setLoadFailed(true); setLoading(false); return; }
      setEmail(profile?.email || ''); setPhone(profile?.phone || '');
      if (v && v.status === 'approved') {
        setVerified(true); setVerificationId(v.id);
        setFirst(v.legal_first_name || ''); setLast(v.legal_last_name || ''); setDob(v.date_of_birth || '');
        setAddress([[v.address_line1, v.address_line2].filter(Boolean).join(', '), v.city, v.province_state, v.postal_code].filter(Boolean).join(', '));
      } else {
        setFirst(profile?.name?.split(' ')[0] || ''); setLast(profile?.name?.split(' ').slice(1).join(' ') || '');
      }
      setLoading(false);
    });
  };
  useEffect(load, []); // eslint-disable-line

  const canContinue = useMemo(() => {
    if (step === 'info') return !!first.trim() && !!last.trim() && !!dob && !!email;
    if (step === 'review') return reviewed;
    return !!sigDataUrl && confirmAccurate && confirmAgree;
  }, [step, first, last, dob, email, reviewed, sigDataUrl, confirmAccurate, confirmAgree]);

  const openAgreement = async () => {
    setOpening(true);
    const win = window.open('', '_blank');
    try {
      const html = await generateServiceAgreement(hire, txn);
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html; charset=utf-8' }));
      if (win) win.location.href = url; else window.location.href = url;
      setReviewed(true);
    } catch { win?.close(); toast.error('Could not open the agreement. Please try again.'); }
    setOpening(false);
  };

  const submit = async () => {
    if (!sigDataUrl || submitting) return;
    setSubmitting(true);
    try {
      const blob = await (await fetch(sigDataUrl)).blob();
      const path = await uploadRentalDoc(blob, `service/${hire.id}/${userId}-signature.png`, 'image/png');
      if (!path || path.startsWith('data:')) throw new Error('Signature upload failed — please try again.');
      const { error } = await supabase.from('service_agreement_signatures').insert({
        hire_request_id: hire.id, user_id: userId, role,
        legal_first_name: first.trim(), legal_last_name: last.trim(), date_of_birth: dob || null,
        email, phone, verification_id: verificationId,
        signature_type: sigMode, signature_path: path,
      });
      if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
      toast.success('Service Agreement signed');
      onSigned();
    } catch (e: any) {
      toast.error(e?.message || 'Could not sign the agreement.');
      setSubmitting(false);
    }
  };

  const lockedCls = 'w-full border border-gray-200 bg-gray-50 text-gray-700 rounded-xl px-3 py-2.5 text-base cursor-not-allowed';
  const openCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-400';
  const fieldCls = verified ? lockedCls : openCls;
  const lockRow = (label: string, value: string) => (
    <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      <div className="flex items-center gap-2 border border-gray-200 bg-gray-50 rounded-xl px-3 py-2.5">
        <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="text-sm text-gray-700 flex-1 truncate">{value || '—'}</span>
      </div></div>
  );

  const footer = loading || loadFailed ? null : (
    <div className="flex gap-3 w-full">
      {stepIdx > 0 && <button onClick={() => setStepIdx(i => i - 1)} disabled={submitting} className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-700 font-bold text-sm">Back</button>}
      {step !== 'sign' ? (
        <button onClick={() => setStepIdx(i => i + 1)} disabled={!canContinue} className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">Continue</button>
      ) : (
        <button onClick={submit} disabled={!canContinue || submitting} className="flex-1 py-3 rounded-2xl bg-green-600 text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Sign Agreement
        </button>
      )}
    </div>
  );

  return (
    <BottomSheet title={`Service Agreement · ${stepIdx + 1}/${STEPS.length}`} onClose={onClose} footer={footer} zIndex={90}>
      <div className="px-5 py-4 space-y-4">
        <h2 className="text-lg font-black text-gray-900">{STEP_LABEL[step]}</h2>

        {loading ? (
          <div className="space-y-3 animate-pulse">{[0, 1, 2, 3].map(i => <div key={i} className="h-11 rounded-xl bg-gray-100" />)}</div>
        ) : loadFailed ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-gray-600">This is taking longer than expected.</p>
            <button onClick={load} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">Retry</button>
          </div>
        ) : step === 'info' ? (
          <>
            {verified && (
              <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5 flex items-start gap-1.5">
                <ShieldCheck className="w-4 h-4 shrink-0" /> Your legal name, date of birth, email, phone, address and ID were already verified during your Filmons identity verification, so they're filled in and locked here.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Legal first name *</label>
                <input value={first} onChange={e => setFirst(e.target.value)} readOnly={verified} className={fieldCls} /></div>
              <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Legal last name *</label>
                <input value={last} onChange={e => setLast(e.target.value)} readOnly={verified} className={fieldCls} /></div>
            </div>
            <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Date of birth *</label>
              <input type="date" value={dob} onChange={e => setDob(e.target.value)} readOnly={verified}
                max={new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().split('T')[0]} className={fieldCls} /></div>
            {lockRow('Email', email)}
            {lockRow('Phone', phone)}
            {verified && lockRow('Verified address', address)}
          </>
        ) : step === 'review' ? (
          <>
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Project</p><p className="font-semibold text-gray-900">{hire.project_title}</p></div>
              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Service</p><p className="text-gray-700">{hire.service_label}</p></div>
              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Agreed amount</p>
                <p className="text-gray-900 font-bold">{hire.budget_amount != null ? `$${Number(hire.budget_amount).toFixed(2)} ${hire.currency}` : '—'}</p></div>
            </div>
            <p className="text-xs text-gray-500">Open and read the full Service Agreement before signing. It opens in a new tab.</p>
            <button onClick={openAgreement} disabled={opening} className="w-full py-3 rounded-2xl border-2 border-indigo-200 text-indigo-700 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {opening && <Loader2 className="w-4 h-4 animate-spin" />} {reviewed ? 'Open again' : 'Open full agreement'}
            </button>
            {reviewed && <p className="text-xs text-green-600 font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Agreement opened</p>}
          </>
        ) : (
          <>
            <div><p className="text-xs font-semibold text-gray-700 mb-1">Signing as ({role === 'client' ? 'Client' : 'Service Provider'})</p>
              <p className="text-sm text-gray-900 font-bold">{first} {last}</p></div>
            <div className="flex gap-2">
              {(['drawn', 'typed'] as const).map(m => (
                <button key={m} type="button" onClick={() => { setSigMode(m); setSigDataUrl(null); setTypedSig(''); }}
                  className={`flex-1 py-2 rounded-xl border-2 text-xs font-bold transition-all ${sigMode === m ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500'}`}>
                  {m === 'drawn' ? 'Draw signature' : 'Type signature'}
                </button>
              ))}
            </div>
            {sigMode === 'drawn' ? <SignatureCanvas onChange={setSigDataUrl} /> : (
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
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-lg italic focus:outline-none focus:ring-2 focus:ring-indigo-400" style={{ fontFamily: 'cursive' }} />
            )}
            <p className="text-xs text-gray-400">Date signed: {new Date().toLocaleDateString('en-CA')}</p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={confirmAccurate} onChange={e => setConfirmAccurate(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600" />
              <span className="text-sm text-gray-700">I confirm the information above is accurate.</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={confirmAgree} onChange={e => setConfirmAgree(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600" />
              <span className="text-sm text-gray-700">I have read and agree to the Service Agreement.</span>
            </label>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
