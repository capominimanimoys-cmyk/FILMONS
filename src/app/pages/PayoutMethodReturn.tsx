// Stripe Account Link return_url/refresh_url target. Calls the fast-path
// status GET (payout-connect-status) — the account.updated webhook is the
// authoritative sync, this just avoids making the user wait on it.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, AlertTriangle, Loader2, Landmark, CreditCard, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { walletApi, type SafePayoutMethodResult } from '../lib/walletApi';
import { sendPayoutMethodChangedEmail } from '../lib/emailjs-config';
import { getDeviceLabel } from '../lib/devicesApi';

export function PayoutMethodReturn() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<SafePayoutMethodResult | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login', { replace: true }); return; }
    if (!user?.id) return;
    (async () => {
      const res = await walletApi.getPayoutConnectStatus(user.id);
      setLoading(false);
      if (!res.success) { setErrored(true); return; }
      setResult(res.payoutMethod);
      if (res.payoutMethod?.status === 'ready') {
        notifyChanged().catch(() => {});
      }
    })();
  }, [isAuthenticated, user?.id]); // eslint-disable-line

  const notifyChanged = async () => {
    if (!user?.id) return;
    const { supabase } = await import('../../lib/supabase');
    await supabase.from('notifications').insert({
      user_id: user.id, actor_id: null, actor_name: 'Filmons',
      type: 'system_notification', title: `Payout method updated — •••• ${result?.last4 || ''}`,
      is_read: false,
    }).then(() => {}, () => {});
    if (!user.email) return;
    try {
      await sendPayoutMethodChangedEmail(user.email, user.name || 'there', {
        last4: result?.last4 || '',
        device: getDeviceLabel(),
        location: 'Unknown',
      });
    } catch {}
  };

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  }

  if (errored || !result || result.status !== 'ready') {
    return (
      <div className="max-w-md mx-auto px-5 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-7 h-7 text-amber-500" /></div>
        <h1 className="text-lg font-black text-gray-900">Payout method not completed</h1>
        <p className="text-sm text-gray-500 mt-2">We couldn't finish setting up your payout method.</p>
        <div className="flex gap-2.5 mt-6">
          <button onClick={() => navigate('/wallet/payout-method')} className="flex-1 py-3 bg-blue-600 text-white font-black text-sm rounded-2xl">Try Again</button>
          <button onClick={() => navigate('/contact-support')} className="flex-1 py-3 border-2 border-gray-200 text-gray-700 font-black text-sm rounded-2xl">Contact Support</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-5 py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="w-7 h-7 text-green-600" /></div>
      <h1 className="text-lg font-black text-gray-900">Payout method ready ✓</h1>
      <div className="bg-gray-50 rounded-2xl p-4 mt-6 text-left space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{result.method === 'card' ? 'Card Type' : 'Bank'}</span>
          <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            {result.method === 'card' ? <CreditCard className="w-3.5 h-3.5 text-blue-500" /> : <Landmark className="w-3.5 h-3.5 text-blue-500" />}
            {result.displayName}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{result.method === 'card' ? 'Card' : 'Account'}</span>
          <span className="text-sm font-bold text-gray-900">•••• {result.last4 || '----'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Country</span>
          <span className="text-sm font-bold text-gray-900">{result.country === 'CA' ? 'Canada' : result.country === 'US' ? 'United States' : result.country || '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Status</span>
          <span className="text-sm font-bold text-green-600">Ready ✓</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Instant Payout</span>
          <span className={`text-sm font-bold flex items-center gap-1 ${result.instantPayoutEligible ? 'text-amber-600' : 'text-gray-400'}`}>
            {result.instantPayoutEligible && <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />}
            {result.instantPayoutEligible ? 'Eligible' : 'Not Eligible'}
          </span>
        </div>
      </div>
      <button onClick={() => navigate('/wallet')} className="w-full mt-6 py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl">Done</button>
    </div>
  );
}
