// Wallet -> Payout Settings -> Add/Change Payout Method. Gated behind
// VerifyItsYouGate; once past that, collects only a country (first-time
// only) and hands off to Stripe's own hosted onboarding for the actual
// sensitive details — Filmons never sees or stores them.
//
// Deliberately no card-vs-bank picker here — a debit/credit card is a way
// to PAY Filmons, not a payout destination a host chooses upfront. Stripe's
// Connect onboarding itself determines what identity/payout information is
// actually required and collects the real destination (bank account,
// eligible debit card for Instant Payouts, etc.); Filmons doesn't get to
// (and shouldn't try to) decide that in its own UI beforehand. An earlier
// version of this screen had exactly that picker, but the selection was
// never even sent to payout-connect-start — purely decorative.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { walletApi } from '../lib/walletApi';
import { VerifyItsYouGate } from '../components/VerifyItsYouGate';

export function PayoutMethodSetup() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);
  const [needsCountry, setNeedsCountry] = useState(false);
  const [country, setCountry] = useState<'CA' | 'US' | null>(null);
  const [checkingAccount, setCheckingAccount] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login', { replace: true }); return; }
  }, [isAuthenticated]); // eslint-disable-line

  useEffect(() => {
    if (!stepUpToken || !user?.id) return;
    (async () => {
      const { data } = await supabase.from('profiles').select('stripe_connect_account_id').eq('id', user.id).maybeSingle();
      setNeedsCountry(!data?.stripe_connect_account_id);
      setCheckingAccount(false);
    })();
  }, [stepUpToken, user?.id]);

  if (!isAuthenticated || !user) return null;

  if (!stepUpToken) {
    return <VerifyItsYouGate onVerified={setStepUpToken} />;
  }

  const continueSecurely = async () => {
    if (needsCountry && !country) { toast.error('Select your country to continue'); return; }
    setStarting(true);
    const origin = window.location.origin;
    const returnUrl = `${origin}/wallet/payout-method/return`;
    const res = await walletApi.startPayoutConnect(user.id, stepUpToken, returnUrl, returnUrl, needsCountry ? country! : undefined);
    setStarting(false);
    if (res.url) window.location.href = res.url;
    else toast.error(res.error || 'Could not start payout method setup');
  };

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 -ml-2 mb-2">
        <ArrowLeft className="w-4 h-4 text-gray-500" />
      </button>
      <h1 className="text-xl font-black text-gray-900">Set up your payout account</h1>
      <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
        To receive money from rentals and projects, Stripe needs to verify your identity and payout information. This usually takes only a few minutes.
      </p>

      {checkingAccount ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
      ) : (
        <>
          <div className="mt-6 flex items-start gap-3 bg-blue-50 rounded-2xl p-4">
            <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed">
              Stripe securely collects whatever it needs for your situation — usually a bank account, your legal name, and address. Filmons never sees or stores this information.
            </p>
          </div>

          {needsCountry && (
            <div className="mt-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Country</p>
              <div className="grid grid-cols-2 gap-2.5">
                {(['CA', 'US'] as const).map(c => (
                  <button key={c} onClick={() => setCountry(c)}
                    className={`py-3 rounded-xl border-2 text-sm font-bold transition-colors ${country === c ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-600'}`}>
                    {c === 'CA' ? 'Canada' : 'United States'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 bg-gray-50 rounded-2xl p-4 space-y-3">
            <div>
              <p className="text-xs font-bold text-gray-900">Standard Payout</p>
              <p className="text-xs text-gray-400">Typically 2–3 business days · Free</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900">Instant Payout</p>
              <p className="text-xs text-gray-400">Usually within minutes when eligible · 2% Filmons fee</p>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">Instant Payout eligibility depends on the payout destination you set up with Stripe — not every account qualifies.</p>
          </div>

          <button
            onClick={continueSecurely}
            disabled={starting || (needsCountry && !country)}
            className="w-full mt-6 py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue with Stripe'}
          </button>
        </>
      )}
    </div>
  );
}
