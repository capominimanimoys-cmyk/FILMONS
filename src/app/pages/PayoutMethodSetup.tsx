// Wallet -> Payout Settings -> Add/Change Payout Method. Gated behind
// VerifyItsYouGate; once past that, collects only a country (first-time
// only) and hands off to Stripe's own hosted onboarding for the actual
// sensitive details — Filmons never sees or stores them.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, CreditCard, Landmark, Loader2, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { walletApi } from '../lib/walletApi';
import { VerifyItsYouGate } from '../components/VerifyItsYouGate';

type MethodChoice = 'card' | 'bank';

export function PayoutMethodSetup() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);
  const [choice, setChoice] = useState<MethodChoice | null>(null);
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
    if (!choice) return;
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
      <h1 className="text-xl font-black text-gray-900">Add Payout Method</h1>
      <p className="text-sm text-gray-500 mt-1.5">Choose where you'd like to receive your Filmons payouts.</p>

      {checkingAccount ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
      ) : (
        <>
          <div className="mt-6 space-y-3">
            <button
              onClick={() => setChoice('card')}
              className={`w-full text-left px-4 py-4 rounded-2xl border-2 transition-colors ${choice === 'card' ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-gray-900 flex items-center gap-2"><CreditCard className="w-4 h-4 text-blue-500" /> Debit / Eligible Card</span>
                {choice === 'card' && <Check className="w-4 h-4 text-blue-500" />}
              </div>
              <p className="text-xs text-gray-400 mt-1">Usually best for Instant Payouts when supported.</p>
            </button>
            <button
              onClick={() => setChoice('bank')}
              className={`w-full text-left px-4 py-4 rounded-2xl border-2 transition-colors ${choice === 'bank' ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-gray-900 flex items-center gap-2"><Landmark className="w-4 h-4 text-blue-500" /> Bank Transfer</span>
                {choice === 'bank' && <Check className="w-4 h-4 text-blue-500" />}
              </div>
              <p className="text-xs text-gray-400 mt-1">Receive payouts directly to your bank account.</p>
            </button>
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
            <p className="text-[11px] text-gray-400 leading-relaxed">Instant Payout eligibility depends on your connected account and payout destination — not every card qualifies.</p>
          </div>

          <button
            onClick={continueSecurely}
            disabled={!choice || starting || (needsCountry && !country)}
            className="w-full mt-6 py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue Securely'}
          </button>
          <p className="text-[11px] text-gray-400 text-center mt-3">You'll enter your details directly with Stripe. Filmons never sees or stores your full account or card number.</p>
        </>
      )}
    </div>
  );
}
