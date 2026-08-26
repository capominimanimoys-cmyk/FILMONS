// Wallet -> Payout Settings -> Add/Change Payout Method.
//
// Manual entry, not Stripe Connect — FILMONS is in a temporary manual-
// payout phase where every cash-out is sent by a human admin outside any
// payment processor, so there's nothing for Stripe onboarding to actually
// gate here. Only offers methods FILMONS can actually fulfill manually:
// bank transfer (everywhere) and Interac e-Transfer (Canada only, per
// FILMONS's own eligibility rule). Deliberately no debit/credit card
// option — FILMONS has no way to manually push money onto a card number
// typed into a form; presenting that as a cash-out destination would be
// a promise the platform can't keep.
//
// Existing Stripe-Connect-backed payout_methods rows (provider='stripe')
// from before this change are untouched and keep working — this only
// changes what *new* payout-method setup looks like.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Landmark, Mail, Loader2, Check, Globe } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { walletApi, type PayoutMethodType } from '../lib/walletApi';
import { VerifyItsYouGate } from '../components/VerifyItsYouGate';

type Country = 'CA' | 'OTHER';

export function PayoutMethodSetup() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);

  const [country, setCountry] = useState<Country | null>(null);
  const [method, setMethod] = useState<PayoutMethodType | null>(null);
  const [saving, setSaving] = useState(false);

  // Interac fields
  const [interacEmail, setInteracEmail] = useState('');
  const [interacName, setInteracName] = useState('');

  // Bank transfer fields
  const [accountHolder, setAccountHolder] = useState('');
  const [institutionNumber, setInstitutionNumber] = useState('');
  const [transitNumber, setTransitNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  if (!isAuthenticated || !user) return null;
  if (!stepUpToken) return <VerifyItsYouGate onVerified={setStepUpToken} />;

  const canSave =
    method === 'interac' ? interacEmail.trim().length > 3 && interacName.trim().length > 1 :
    method === 'bank_transfer' ? [accountHolder, institutionNumber, transitNumber, accountNumber].every(v => v.trim().length > 0) :
    false;

  const handleSave = async () => {
    if (!method || !canSave) return;
    setSaving(true);
    const details = method === 'interac'
      ? { email: interacEmail.trim(), name: interacName.trim() }
      : { accountHolder: accountHolder.trim(), institutionNumber: institutionNumber.trim(), transitNumber: transitNumber.trim(), accountNumber: accountNumber.trim() };
    const res = await walletApi.savePayoutMethod(user.id, method, details as any);
    setSaving(false);
    if (res.success) { toast.success('Payout method saved'); navigate('/wallet'); }
    else toast.error(res.error || 'Could not save payout method');
  };

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 -ml-2 mb-2">
        <ArrowLeft className="w-4 h-4 text-gray-500" />
      </button>
      <h1 className="text-xl font-black text-gray-900">Add a payout method</h1>
      <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
        Cash-outs are processed manually by FILMONS and typically arrive within 1–2 business days after approval. Tell us where to send your money.
      </p>

      {!country ? (
        <div className="mt-6">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Country</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={() => setCountry('CA')} className="py-3 rounded-xl border-2 border-gray-100 text-sm font-bold text-gray-600 hover:border-blue-300">
              🇨🇦 Canada
            </button>
            <button onClick={() => setCountry('OTHER')} className="py-3 rounded-xl border-2 border-gray-100 text-sm font-bold text-gray-600 hover:border-blue-300">
              🌍 Other
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Choose payout method</p>
            <div className="space-y-2.5">
              <button onClick={() => setMethod('bank_transfer')}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-colors ${method === 'bank_transfer' ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
                <Landmark className="w-5 h-5 text-blue-500 shrink-0" />
                <span className="flex-1 text-sm font-bold text-gray-900">🏦 Bank Account</span>
                {method === 'bank_transfer' && <Check className="w-4 h-4 text-blue-500" />}
              </button>
              {country === 'CA' && (
                <button onClick={() => setMethod('interac')}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-colors ${method === 'interac' ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
                  <Mail className="w-5 h-5 text-blue-500 shrink-0" />
                  <span className="flex-1 text-sm font-bold text-gray-900">🇨🇦 Interac e-Transfer</span>
                  {method === 'interac' && <Check className="w-4 h-4 text-blue-500" />}
                </button>
              )}
            </div>
          </div>

          {method === 'interac' && (
            <div className="mt-5 space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Interac email</label>
                <input value={interacEmail} onChange={e => setInteracEmail(e.target.value)} type="email" placeholder="you@example.com"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Full name</label>
                <input value={interacName} onChange={e => setInteracName(e.target.value)} placeholder="As it appears on your account"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-400" />
              </div>
            </div>
          )}

          {method === 'bank_transfer' && (
            <div className="mt-5 space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Account holder name</label>
                <input value={accountHolder} onChange={e => setAccountHolder(e.target.value)}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Institution #</label>
                  <input value={institutionNumber} onChange={e => setInstitutionNumber(e.target.value)}
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Transit #</label>
                  <input value={transitNumber} onChange={e => setTransitNumber(e.target.value)}
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Account number</label>
                <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-400" />
              </div>
            </div>
          )}

          {method && (
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="w-full mt-6 py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Payout Method'}
            </button>
          )}

          <p className="text-[11px] text-gray-400 leading-relaxed mt-4">
            Only masked details (e.g. •••• 4821) are ever shown after saving. Cash-outs are reviewed and sent manually by FILMONS — never automated.
          </p>
        </>
      )}
    </div>
  );
}
