// Wallet -> Payout Settings -> Add/Change Payout Method.
//
// Direct bank deposit only via a Stripe Connect Custom account, collected
// entirely in this page — no Stripe-hosted redirect at any point, so this
// never feels like creating a separate Stripe account. Interac/manual
// bank-transfer are no longer offered here at all (existing legacy manual
// payout_methods rows, if any, keep working via the untouched admin-
// approval pipeline — this page just never produces new ones).
//
// Payouts are only available for Canadian or U.S. bank accounts today.
// Country is asked once, up front, and becomes the connected account's own
// country at Stripe — from then on it's read back from that account
// (defaultMethod.country, sourced from Stripe's own data), never from any
// general Filmons profile field, so it can't be bypassed by changing a
// profile setting elsewhere in the app.
//
// Identity (Individual/Registered Business) is likewise only collected
// once per account — if a Stripe Custom account already exists for this
// host (defaultMethod.provider === 'stripe'), this page skips straight to
// the bank-details step for "Change bank account," per spec: changing the
// bank account re-collects banking information, not identity or country.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Landmark, Loader2, Check, User, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { walletApi, type PayoutMethod, type PayoutPerson } from '../lib/walletApi';
import { VerifyItsYouGate } from '../components/VerifyItsYouGate';

type EntityType = 'individual' | 'company';
type PayoutCountry = 'CA' | 'US';
type Step = 'loading' | 'country' | 'entity' | 'identity' | 'requirement' | 'bank' | 'remove';

const inputCls = 'w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-400';
const labelCls = 'text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 block';

// Only these two are realistically dynamic for a baseline individual
// Custom account — anything else Stripe asks for (e.g. a document upload)
// has no in-app resolution here, so it falls back to a "needs attention"
// message rather than guessing a form for it. Never hard-coded upfront:
// this only ever renders for a field Stripe's own response actually
// listed, and the label/length shown is picked per-country.
const KNOWN_FOLLOWUP_FIELDS: Record<string, { label: string; maxLength?: number }> = {
  'individual.id_number': { label: 'Social Insurance Number (SIN)' },
  'individual.ssn_last_4': { label: 'Last 4 digits of your SSN', maxLength: 4 },
};

export function PayoutMethodSetup() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const removeMode = searchParams.get('action') === 'remove';
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [defaultMethod, setDefaultMethod] = useState<PayoutMethod | null>(null);
  const [removing, setRemoving] = useState(false);

  const [country, setCountry] = useState<PayoutCountry | null>(null);
  const [entityType, setEntityType] = useState<EntityType>('individual');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [addrLine1, setAddrLine1] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrProvince, setAddrProvince] = useState('');
  const [addrPostal, setAddrPostal] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [activeRequirement, setActiveRequirement] = useState<string | null>(null);
  const [tosAccepted, setTosAccepted] = useState(false);

  const [accountHolder, setAccountHolder] = useState('');
  const [institutionNumber, setInstitutionNumber] = useState('');
  const [transitNumber, setTransitNumber] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState<'chequing' | 'savings'>('chequing');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id || !stepUpToken) return;
    walletApi.getDefaultPayoutMethod(user.id).then(m => {
      setDefaultMethod(m);
      setAccountHolder(m?.provider === 'stripe' ? (m.display_name?.split(' ••••')[0] || '') : '');
      // A Stripe Custom account already exists for this host — country and
      // identity are done (country is read from Stripe's own account data,
      // never re-asked), only bank details are re-collected.
      if (m?.provider === 'stripe') {
        setCountry((m.country as PayoutCountry) || 'CA');
        setStep(removeMode ? 'remove' : 'bank');
      } else {
        setStep('country');
      }
    });
  }, [user?.id, stepUpToken]); // eslint-disable-line

  const handleRemove = async () => {
    if (!user?.id || !stepUpToken) return;
    setRemoving(true);
    const res = await walletApi.removePayoutBankAccount(user.id, stepUpToken);
    setRemoving(false);
    if (res.success) { toast.success('Bank account removed'); navigate('/wallet'); }
    else toast.error(res.error || 'Could not remove bank account');
  };

  if (!isAuthenticated || !user) return null;
  if (!stepUpToken) return <VerifyItsYouGate onVerified={setStepUpToken} />;
  if (step === 'loading') {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>;
  }

  const person = (): PayoutPerson => ({
    firstName: firstName.trim(), lastName: lastName.trim(),
    dob: { day: Number(dobDay), month: Number(dobMonth), year: Number(dobYear) },
    address: { line1: addrLine1.trim(), city: addrCity.trim(), province: addrProvince.trim(), postalCode: addrPostal.trim() },
    phone: phone.trim() || undefined,
  });

  const identityValid =
    firstName.trim() && lastName.trim() && dobDay && dobMonth && dobYear &&
    addrLine1.trim() && addrCity.trim() && addrProvince.trim() && addrPostal.trim() && phone.trim() &&
    (entityType === 'individual' || companyName.trim()) && tosAccepted;

  const submitIdentity = async () => {
    if (!identityValid || !country) return;
    setSaving(true);
    const res = await walletApi.setupPayoutAccount(user.id, stepUpToken, {
      country, accountHolderType: entityType,
      individual: entityType === 'individual' ? person() : undefined,
      company: entityType === 'company' ? { name: companyName.trim(), address: person().address, phone: phone.trim(), representative: person() } : undefined,
    });
    setSaving(false);
    if (!res.success) { toast.error(res.error || 'Could not set up payout account'); return; }

    const due = res.requirementsDue || [];
    const knownField = due.find(d => d in KNOWN_FOLLOWUP_FIELDS);
    const hasUnknown = due.some(d => !(d in KNOWN_FOLLOWUP_FIELDS));

    if (knownField) {
      setActiveRequirement(knownField);
      setStep('requirement');
    } else if (hasUnknown) {
      // Nothing this form can resolve (e.g. a document upload) — surface it
      // as "needs attention" rather than guessing a UI for it.
      toast.error('We need a bit more information to verify your account. Our team will follow up, or contact support.');
      navigate('/wallet');
    } else {
      setAccountHolder(entityType === 'individual' ? `${firstName.trim()} ${lastName.trim()}` : companyName.trim());
      setStep('bank');
    }
  };

  const submitRequirement = async () => {
    if (!idNumber.trim() || !country || !activeRequirement) return;
    setSaving(true);
    const extra = activeRequirement === 'individual.ssn_last_4' ? { ssnLast4: idNumber.trim() } : { idNumber: idNumber.trim() };
    const res = await walletApi.setupPayoutAccount(user.id, stepUpToken, {
      country, accountHolderType: entityType,
      individual: entityType === 'individual' ? { ...person(), ...extra } : undefined,
      company: entityType === 'company' ? { name: companyName.trim(), address: person().address, phone: phone.trim(), representative: { ...person(), ...extra } } : undefined,
    });
    setSaving(false);
    if (!res.success) { toast.error(res.error || 'Could not verify your account'); return; }
    const stillDue = res.requirementsDue || [];
    if (stillDue.length > 0) {
      const nextKnown = stillDue.find(d => d in KNOWN_FOLLOWUP_FIELDS);
      if (nextKnown) { setActiveRequirement(nextKnown); setIdNumber(''); return; }
      toast.error('We need a bit more information to verify your account. Our team will follow up, or contact support.');
      navigate('/wallet');
      return;
    }
    setAccountHolder(entityType === 'individual' ? `${firstName.trim()} ${lastName.trim()}` : companyName.trim());
    setStep('bank');
  };

  const isCA = country === 'CA';
  const bankValid = accountHolder.trim() && accountNumber.trim() &&
    (isCA ? institutionNumber.trim() && transitNumber.trim() : routingNumber.trim());

  const submitBank = async () => {
    if (!bankValid || !country) return;
    setSaving(true);
    const res = await walletApi.submitPayoutBankAccount(user.id, stepUpToken, {
      accountHolderName: accountHolder.trim(), accountNumber: accountNumber.trim(), accountType,
      ...(isCA ? { institutionNumber: institutionNumber.trim(), transitNumber: transitNumber.trim() } : { routingNumber: routingNumber.trim() }),
    });
    setSaving(false);
    if (res.success) { toast.success('Payout method saved'); navigate('/wallet'); }
    else toast.error(res.error || 'Could not save payout method');
  };

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 -ml-2 mb-2">
        <ArrowLeft className="w-4 h-4 text-gray-500" />
      </button>
      <h1 className="text-xl font-black text-gray-900">
        {step === 'remove' ? 'Remove bank account' : step === 'bank' && defaultMethod?.provider === 'stripe' ? 'Change bank account' : 'Set up payouts'}
      </h1>
      {step !== 'remove' && (
        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
          Payouts typically arrive within <strong>1–6 business days</strong> after being sent.
        </p>
      )}

      {step === 'remove' && defaultMethod && (
        <div className="mt-6 space-y-4">
          <div className="bg-gray-50 rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><Landmark className="w-4 h-4 text-blue-500" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{defaultMethod.display_name}</p>
              <p className="text-xs text-gray-400">{walletApi.maskDestination(defaultMethod.method, defaultMethod.details, defaultMethod.last4)}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            You'll need to add a new bank account before your next payout can be sent.
          </p>
          <button onClick={handleRemove} disabled={removing}
            className="w-full py-3.5 bg-red-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2">
            {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove Bank Account'}
          </button>
        </div>
      )}

      {step === 'country' && (
        <div className="mt-6">
          <p className="text-xs text-gray-400 leading-relaxed mb-4">
            Payouts are currently available only to Canadian and U.S. bank accounts.
          </p>
          <p className={labelCls}>Where is your bank account located?</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={() => setCountry('CA')}
              className={`py-3.5 rounded-2xl border-2 text-sm font-bold flex items-center justify-center gap-2 ${country === 'CA' ? 'border-blue-500 bg-blue-50 text-gray-900' : 'border-gray-100 text-gray-500'}`}>
              🇨🇦 Canada
            </button>
            <button onClick={() => setCountry('US')}
              className={`py-3.5 rounded-2xl border-2 text-sm font-bold flex items-center justify-center gap-2 ${country === 'US' ? 'border-blue-500 bg-blue-50 text-gray-900' : 'border-gray-100 text-gray-500'}`}>
              🇺🇸 United States
            </button>
          </div>
          <button onClick={() => setStep('entity')} disabled={!country}
            className="w-full mt-6 py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40">
            Continue
          </button>
        </div>
      )}

      {step === 'entity' && (
        <div className="mt-6">
          <p className={labelCls}>How will you receive earnings?</p>
          <div className="space-y-2.5">
            <button onClick={() => setEntityType('individual')}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-colors ${entityType === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
              <User className="w-5 h-5 text-blue-500 shrink-0" />
              <span className="flex-1 text-sm font-bold text-gray-900">As an individual</span>
              {entityType === 'individual' && <Check className="w-4 h-4 text-blue-500" />}
            </button>
            <button onClick={() => setEntityType('company')}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-colors ${entityType === 'company' ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
              <Building2 className="w-5 h-5 text-blue-500 shrink-0" />
              <span className="flex-1 text-sm font-bold text-gray-900">As a registered business</span>
              {entityType === 'company' && <Check className="w-4 h-4 text-blue-500" />}
            </button>
          </div>
          <button onClick={() => setStep('identity')} className="w-full mt-6 py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl">
            Continue
          </button>
        </div>
      )}

      {step === 'identity' && (
        <div className="mt-6 space-y-3">
          {entityType === 'company' && (
            <div>
              <label className={labelCls}>Registered business name</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputCls} />
            </div>
          )}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pt-1">
            {entityType === 'company' ? 'Business representative' : 'Your details'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>First name</label><input value={firstName} onChange={e => setFirstName(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Last name</label><input value={lastName} onChange={e => setLastName(e.target.value)} className={inputCls} /></div>
          </div>
          <div>
            <label className={labelCls}>Date of birth</label>
            <div className="grid grid-cols-3 gap-2">
              <input value={dobDay} onChange={e => setDobDay(e.target.value)} placeholder="DD" inputMode="numeric" className={inputCls} />
              <input value={dobMonth} onChange={e => setDobMonth(e.target.value)} placeholder="MM" inputMode="numeric" className={inputCls} />
              <input value={dobYear} onChange={e => setDobYear(e.target.value)} placeholder="YYYY" inputMode="numeric" className={inputCls} />
            </div>
          </div>
          <div><label className={labelCls}>Address</label><input value={addrLine1} onChange={e => setAddrLine1(e.target.value)} className={inputCls} /></div>
          <div className="grid grid-cols-3 gap-2">
            <input value={addrCity} onChange={e => setAddrCity(e.target.value)} placeholder="City" className={inputCls} />
            <input value={addrProvince} onChange={e => setAddrProvince(e.target.value)} placeholder={isCA ? 'Province' : 'State'} className={inputCls} />
            <input value={addrPostal} onChange={e => setAddrPostal(e.target.value)} placeholder={isCA ? 'Postal code' : 'ZIP code'} className={inputCls} />
          </div>
          <div><label className={labelCls}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} type="tel" className={inputCls} /></div>

          <label className="flex items-start gap-2.5 pt-2 cursor-pointer">
            <input type="checkbox" checked={tosAccepted} onChange={e => setTosAccepted(e.target.checked)} className="mt-0.5" />
            <span className="text-[11px] text-gray-400 leading-relaxed">
              By continuing, you agree to Filmons' payout terms, which include{' '}
              <a href="https://stripe.com/connect-account/legal" target="_blank" rel="noreferrer" className="underline">Stripe's Connected Account Agreement</a>.
            </span>
          </label>

          <button onClick={submitIdentity} disabled={!identityValid || saving}
            className="w-full mt-2 py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}
          </button>
        </div>
      )}

      {step === 'requirement' && activeRequirement && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-gray-500 leading-relaxed">One more thing — required by our payment processor to verify your identity for payouts.</p>
          <div>
            <label className={labelCls}>{KNOWN_FOLLOWUP_FIELDS[activeRequirement].label}</label>
            <input value={idNumber} onChange={e => setIdNumber(e.target.value)} inputMode="numeric" maxLength={KNOWN_FOLLOWUP_FIELDS[activeRequirement].maxLength} className={inputCls} />
          </div>
          <button onClick={submitRequirement} disabled={!idNumber.trim() || saving}
            className="w-full mt-2 py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}
          </button>
        </div>
      )}

      {step === 'bank' && (
        <div className="mt-6 space-y-3">
          <p className={labelCls}>{isCA ? 'Canadian bank account' : 'U.S. bank account'}</p>
          <div>
            <label className={labelCls}>Account holder name</label>
            <input value={accountHolder} onChange={e => setAccountHolder(e.target.value)} className={inputCls} />
          </div>
          {isCA ? (
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Institution #</label><input value={institutionNumber} onChange={e => setInstitutionNumber(e.target.value)} inputMode="numeric" maxLength={3} className={inputCls} /></div>
              <div><label className={labelCls}>Transit #</label><input value={transitNumber} onChange={e => setTransitNumber(e.target.value)} inputMode="numeric" maxLength={5} className={inputCls} /></div>
            </div>
          ) : (
            <div>
              <label className={labelCls}>Routing number</label>
              <input value={routingNumber} onChange={e => setRoutingNumber(e.target.value)} inputMode="numeric" maxLength={9} className={inputCls} />
            </div>
          )}
          <div>
            <label className={labelCls}>Account number</label>
            <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} inputMode="numeric" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Account type</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button onClick={() => setAccountType('chequing')}
                className={`py-3 rounded-2xl border-2 text-sm font-bold ${accountType === 'chequing' ? 'border-blue-500 bg-blue-50 text-gray-900' : 'border-gray-100 text-gray-500'}`}>
                {isCA ? 'Chequing' : 'Checking'}
              </button>
              <button onClick={() => setAccountType('savings')}
                className={`py-3 rounded-2xl border-2 text-sm font-bold ${accountType === 'savings' ? 'border-blue-500 bg-blue-50 text-gray-900' : 'border-gray-100 text-gray-500'}`}>
                Savings
              </button>
            </div>
          </div>

          <button onClick={submitBank} disabled={!bankValid || saving}
            className="w-full mt-4 py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Landmark className="w-4 h-4" /> Save Payout Method</>}
          </button>
          <p className="text-[11px] text-gray-400 leading-relaxed mt-2">
            Only masked details (e.g. •••• 4821) are ever shown after saving.
          </p>
        </div>
      )}
    </div>
  );
}
