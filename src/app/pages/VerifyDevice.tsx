/**
 * /verify-device — New Browser / First Sign-In Verification.
 * Reached only via Root.tsx's redirect when deviceVerified === false.
 * A code is sent automatically on landing here; entering it correctly
 * trusts this browser (server sets the HttpOnly cookie) and returns the
 * user to wherever they were headed before authentication.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sendVerificationCode, verifyDeviceCode } from '../lib/deviceVerification';
import { toast } from 'sonner';
import { FilmonsLogo } from '../components/FilmonsLogo';

function Bg() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-blue-950" />
      <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-blue-600 opacity-[0.08] blur-[120px]" />
    </div>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}

// Only same-origin relative paths are ever navigated to — never an
// arbitrary value from router state, which would otherwise be an open
// redirect vector.
function safeDestination(from: unknown): string {
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) return from;
  return '/';
}

export function VerifyDevice() {
  const { user, logout, setDeviceVerified } = useAuth() as any;
  const navigate = useNavigate();
  const location = useLocation();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const sentOnce = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const startCooldown = (ms: number) => {
    const seconds = Math.max(1, Math.ceil(ms / 1000));
    setResendIn(seconds);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() =>
      setResendIn(n => { if (n <= 1) { clearInterval(timerRef.current); return 0; } return n - 1; }), 1000);
  };
  useEffect(() => () => clearInterval(timerRef.current), []);

  const send = async () => {
    if (!user?.id) return;
    const res = await sendVerificationCode(user.id);
    if (res.success) startCooldown(60_000);
    else if (res.retryInMs) startCooldown(res.retryInMs);
    else if (res.error) toast.error(res.error);
  };

  useEffect(() => {
    if (sentOnce.current || !user?.id) return;
    sentOnce.current = true;
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const verify = async () => {
    if (!user?.id || code.length < 6) return;
    setLoading(true);
    setError('');
    const res = await verifyDeviceCode(user.id, code);
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Incorrect code');
      return;
    }
    setDeviceVerified(true);
    navigate(safeDestination(location.state?.from), { replace: true });
  };

  const useAnotherAccount = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (!user) return null;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <Bg />
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-12">
        <div className="pt-14 pb-6">
          <FilmonsLogo iconSize={20} theme="dark" />
        </div>

        <div className="max-w-sm mx-auto pt-4 space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-blue-500/15 border border-blue-400/30 flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-blue-400" strokeWidth={1.75} />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-2xl font-black text-white">Verify it's you</h1>
            <p className="text-white/55 text-sm leading-relaxed">
              We noticed you're signing in from a new browser or device.
              For your security, we've sent a 6-digit verification code to:
            </p>
            <p className="text-white font-bold text-sm">{user.email ? maskEmail(user.email) : 'your account email'}</p>
          </div>

          <div className="space-y-3">
            <input
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              type="tel" inputMode="numeric" placeholder="000000" maxLength={6} autoFocus
              onKeyDown={e => e.key === 'Enter' && verify()}
              onPaste={e => { setCode(e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)); e.preventDefault(); }}
              className="w-full bg-white/10 border border-white/20 text-white placeholder-white/20 rounded-2xl px-4 py-5 text-3xl font-black text-center tracking-[0.6em] outline-none focus:border-blue-400 focus:bg-white/15 transition-all"
            />
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <button
              onClick={verify} disabled={code.length < 6 || loading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 transition-all active:scale-[0.98] shadow-lg shadow-blue-900/30"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </div>

          <div className="text-center space-y-3">
            <p className="text-white/40 text-xs">
              Didn't receive the code?{' '}
              <button
                onClick={send} disabled={resendIn > 0}
                className="font-semibold"
                style={{ color: resendIn > 0 ? 'rgba(255,255,255,0.25)' : '#60a5fa' }}
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </p>
            <button
              onClick={useAnotherAccount}
              className="inline-flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs font-medium transition-colors"
            >
              <ArrowLeft className="w-3 h-3" /> Use another account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
