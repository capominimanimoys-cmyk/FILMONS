// "Verify It's You" — the first re-authentication gate in this app.
// Offers whichever of Password / Google / Apple / Phone OTP the signed-in
// user actually has, verifies it server-side via verify-identity, and
// hands the caller a short-lived stepUpToken on success. Nothing here is
// ever trusted client-side — every method round-trips through the edge
// function before the token is minted.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, Loader2, Mail, Phone, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { walletApi } from '../lib/walletApi';
import { getOAuthRedirectUrl } from '../lib/appUrl';

type Method = 'password' | 'google' | 'apple' | 'phone';

function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

const OAUTH_RETURN_KEY = 'filmons_verify_oauth_purpose';

export function VerifyItsYouGate({ onVerified }: { onVerified: (stepUpToken: string) => void }) {
  const { user } = useAuth();
  const [methods, setMethods] = useState<Method[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [active, setActive] = useState<Method | null>(null);

  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const { data } = await supabase.from('profiles').select('profile_meta, email, phone, phone_verified').eq('id', user.id).maybeSingle();
        const meta = typeof data?.profile_meta === 'string' ? JSON.parse(data.profile_meta || '{}') : (data?.profile_meta || {});
        const providers: string[] = meta.providers || (data?.email ? ['email'] : []);
        const list: Method[] = [];
        if (providers.includes('email') || data?.email) list.push('password');
        if (providers.includes('google')) list.push('google');
        if (providers.includes('apple')) list.push('apple');
        if (data?.phone && data?.phone_verified) list.push('phone');
        setMethods(list);
      } catch {
        setMethods(user.email ? ['password'] : []);
      } finally {
        setLoadingMethods(false);
      }
    })();
  }, [user?.id]); // eslint-disable-line

  // Returning from a Google/Apple redirect started specifically for this
  // gate — complete verification with the fresh Supabase session.
  useEffect(() => {
    const purpose = sessionStorage.getItem(OAUTH_RETURN_KEY);
    if (!purpose || !user?.id) return;
    sessionStorage.removeItem(OAUTH_RETURN_KEY);
    (async () => {
      setSubmitting(true);
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) { setSubmitting(false); return; }
      const res = await walletApi.verifyIdentity(user.id, 'oauth', { accessToken });
      setSubmitting(false);
      if (res.success && res.stepUpToken) onVerified(res.stepUpToken);
      else toast.error(res.error || 'Could not verify — please try again.');
    })();
  }, [user?.id]); // eslint-disable-line

  const doPassword = async () => {
    if (!user?.id || !password) return;
    setSubmitting(true);
    const res = await walletApi.verifyIdentity(user.id, 'password', { password });
    setSubmitting(false);
    if (res.success && res.stepUpToken) onVerified(res.stepUpToken);
    else toast.error(res.error || 'Incorrect password');
  };

  const doOAuth = async (provider: 'google' | 'apple') => {
    sessionStorage.setItem(OAUTH_RETURN_KEY, 'payout_method');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getOAuthRedirectUrl(window.location.pathname) },
    });
    if (error) { sessionStorage.removeItem(OAUTH_RETURN_KEY); toast.error(error.message); }
  };

  const sendOtp = async () => {
    if (!user?.id) return;
    setSubmitting(true);
    try {
      const { authApi } = await import('../lib/api');
      const phone = (await supabase.from('profiles').select('phone').eq('id', user.id).maybeSingle()).data?.phone;
      if (!phone) { toast.error('No verified phone on file'); setSubmitting(false); return; }
      await authApi.sendPhoneOTP(phone);
      setOtpSent(true);
    } catch (e: any) {
      toast.error(e?.message || 'Could not send code');
    }
    setSubmitting(false);
  };

  const verifyOtp = async () => {
    if (!user?.id || otp.length !== 6) return;
    setSubmitting(true);
    const { data } = await supabase.from('profiles').select('phone').eq('id', user.id).maybeSingle();
    const phone = data?.phone;
    if (!phone) { setSubmitting(false); return; }
    const res = await walletApi.verifyIdentity(user.id, 'phone', { phone, code: otp });
    setSubmitting(false);
    if (res.success && res.stepUpToken) onVerified(res.stepUpToken);
    else toast.error(res.error || 'Incorrect or expired code');
  };

  if (loadingMethods) {
    return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  }

  return (
    <div className="max-w-md mx-auto px-5 py-10">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4"><ShieldCheck className="w-7 h-7 text-blue-500" /></div>
      <h1 className="text-xl font-black text-gray-900">Verify it's you</h1>
      <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
        This is a sensitive financial action. Verify your account before adding or changing where payouts are sent.
      </p>

      {methods.length === 0 && (
        <p className="text-sm text-amber-600 mt-6">No verification method is available on your account. Contact support.</p>
      )}

      <div className="mt-6 space-y-2.5">
        {methods.includes('password') && active !== 'password' && (
          <button onClick={() => setActive('password')} className="w-full flex items-center gap-3 border-2 border-gray-100 rounded-2xl px-4 py-3.5 hover:border-blue-300 transition-colors">
            <Mail className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="text-sm font-bold text-gray-900 flex-1 text-left">Account Password</span>
          </button>
        )}
        {active === 'password' && (
          <div className="border-2 border-blue-200 rounded-2xl p-4 space-y-3">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Password" autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-10 text-sm font-semibold outline-none focus:border-blue-400"
              />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button onClick={doPassword} disabled={submitting || !password} className="w-full py-3 bg-blue-600 text-white font-black text-sm rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}
            </button>
          </div>
        )}

        {methods.includes('google') && (
          <button onClick={() => doOAuth('google')} className="w-full flex items-center gap-3 border-2 border-gray-100 rounded-2xl px-4 py-3.5 hover:border-blue-300 transition-colors">
            <GoogleLogo /><span className="text-sm font-bold text-gray-900 flex-1 text-left">Continue with Google</span>
          </button>
        )}
        {methods.includes('apple') && (
          <button onClick={() => doOAuth('apple')} className="w-full flex items-center gap-3 border-2 border-gray-100 rounded-2xl px-4 py-3.5 hover:border-blue-300 transition-colors">
            <span className="text-base leading-none"></span><span className="text-sm font-bold text-gray-900 flex-1 text-left">Continue with Apple</span>
          </button>
        )}

        {methods.includes('phone') && active !== 'phone' && (
          <button onClick={() => setActive('phone')} className="w-full flex items-center gap-3 border-2 border-gray-100 rounded-2xl px-4 py-3.5 hover:border-blue-300 transition-colors">
            <Phone className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="text-sm font-bold text-gray-900 flex-1 text-left">Text code to my phone</span>
          </button>
        )}
        {active === 'phone' && (
          <div className="border-2 border-blue-200 rounded-2xl p-4 space-y-3">
            {!otpSent ? (
              <button onClick={sendOtp} disabled={submitting} className="w-full py-3 bg-blue-600 text-white font-black text-sm rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send code'}
              </button>
            ) : (
              <>
                <input
                  type="text" inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code" autoFocus
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400 text-center tracking-[0.3em]"
                />
                <button onClick={verifyOtp} disabled={submitting || otp.length !== 6} className="w-full py-3 bg-blue-600 text-white font-black text-sm rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
