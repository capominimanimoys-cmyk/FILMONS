/**
 * Filmons — Sign In Flow
 * Splash → Method → Email Login → Security Check (new device) → Home
 */
import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router';
import { Eye, EyeOff, ArrowLeft, Mail, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { supabase } from '../../lib/supabase';
import { getOAuthRedirectUrl } from '../lib/appUrl';
import { toast } from 'sonner';
import { FilmonsLogo } from '../components/FilmonsLogo';
import FilmonsLoader from '../components/FilmonsLoader';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { authApi } from '../lib/api';
import { consumePendingReturnUrl } from '../lib/authReturnUrl';

type Screen = 'splash' | 'method' | 'email' | 'email_not_found' | 'oauth_only' | 'security';

// Desktop-only single-field detection: a bare '@' means email, otherwise
// treated as a phone attempt if what's left after stripping formatting is a
// plausible CA/US number (10 digits, or 11 starting with '1') -- the same
// digits authApi.normalizePhone itself expects, so no separate E.164
// formatting is needed here before handing off to signinWithPhone/
// completePhoneSignin (both already normalize internally, same as
// PhoneLogin.tsx's own fullPhone does).
function isLikelyPhone(v: string): boolean {
  const trimmed = v.trim();
  if (!trimmed || trimmed.includes('@')) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

// ── Cinematic background ───────────────────────────────────────────────────
function CinematicBg() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950"/>
      {/* Film grain overlay */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage:'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")', backgroundSize: '256px 256px' }}/>
      {/* Ambient glows */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full bg-blue-600 opacity-10 blur-[120px]"/>
      <div className="absolute bottom-1/4 right-1/3 w-64 h-64 rounded-full bg-indigo-500 opacity-10 blur-[80px]"/>
      {/* Slow moving particles */}
      {[...Array(6)].map((_, i) => (
        <div key={i} className="absolute w-1 h-1 rounded-full bg-white opacity-20"
          style={{
            left: `${15 + i * 15}%`, top: `${20 + i * 10}%`,
            animation: `float ${4 + i}s ease-in-out infinite alternate`,
            animationDelay: `${i * 0.8}s`,
          }}/>
      ))}
      <style>{`
        @keyframes float { from { transform: translateY(0px); } to { transform: translateY(-20px); } }
      `}</style>
    </div>
  );
}

// ── OAuth logos ───────────────────────────────────────────────────────────
function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

// ── OAuth button ───────────────────────────────────────────────────────────
function OAuthBtn({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="w-full flex items-center gap-3 active:scale-[0.98] border font-semibold text-sm rounded-2xl px-4 py-3.5 transition-all backdrop-blur-sm bg-white hover:bg-gray-50 border-white/80 text-gray-800 shadow-sm disabled:opacity-60 touch-manipulation">
      <span className="w-5 h-5 shrink-0 flex items-center justify-center">
        {loading ? <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin"/> : <GoogleLogo size={20}/>}
      </span>
      <span className="flex-1 text-left">{loading ? 'Connecting…' : 'Continue with Google'}</span>
    </button>
  );
}

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated, isGuest, enterGuestMode, setUserDirectly } = useAuth() as any;

  // If a pre-filled email arrives via ?email=..., skip straight to the email screen.
  // If the user was already in guest mode (browsing then tapping Sign In), skip the splash.
  const prefillEmail = searchParams.get('email') ?? '';

  // A guest-gated action (see SearchOverlay's handleGuestSeeMore) can send
  // a custom heading/subtitle instead of the default "Welcome back" copy,
  // e.g. "Sign up to see more listings" -- purely cosmetic, every existing
  // auth method below stays exactly as-is.
  const customHeading = searchParams.get('heading');
  const customSub      = searchParams.get('sub');

  const [screen, setScreen] = useState<Screen>(
    prefillEmail ? 'email' : (isGuest ? 'method' : 'splash')
  );
  const [email,    setEmail]    = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading,  setLoading]  = useState(false);
  const [otp,      setOtp]      = useState('');
  const [pwError,  setPwError]  = useState('');
  const [oauthOnlyProviders, setOauthOnlyProviders] = useState<string[]>([]);
  const [oauthLoading, setOauthLoading] = useState(false);

  // Single source of truth for where a successful sign-in lands -- every
  // auth path below (email/password, phone OTP, OAuth) sets isAuthenticated
  // via context rather than navigating directly, so a guest-gated "See
  // more" (SearchOverlay) that stashed a pending return URL always gets
  // honored regardless of which method the user actually signed in with,
  // and there's no risk of two navigate() calls racing and one clobbering
  // the other's destination.
  useEffect(() => { if (isAuthenticated) { captureSnapshot(); navigate(consumePendingReturnUrl(), { replace: true }); } }, [isAuthenticated]);

  // Splash auto-advances via FilmonsLoader's onComplete (skipped when email is pre-filled)

  const goBack = () => {
    if (screen === 'email')    setScreen('method');
    else if (screen === 'security') setScreen('email');
    else { captureSnapshot(); navigate(-1); }
  };

  const handleEmailLogin = async () => {
    if (!email || !password) { toast.error('Enter your email and password'); return; }
    setPwError('');
    setLoading(true);
    try {
      await login(email, password);
      // Navigation itself happens in the isAuthenticated effect above (the
      // single source of truth for post-auth destination) once login()'s
      // context update lands -- calling captureSnapshot() here still
      // matters, it has to run before that navigation fires.
      captureSnapshot();
    } catch (e: any) {
      const msg: string = e?.message || '';
      if (e?.code === 'OAUTH_ONLY') {
        setOauthOnlyProviders(e.providers || []);
        setScreen('oauth_only');
      } else if (msg === 'EMAIL_NOT_FOUND') {
        setScreen('email_not_found');
      } else if (msg.includes('confirm') || msg.includes('Confirm')) {
        toast.error(msg, { duration: 6000, description: 'Check your inbox and click the confirmation link, then try again.' });
      } else if (msg.toLowerCase().includes('incorrect') || msg.toLowerCase().includes('invalid')) {
        setPwError('Email or password is incorrect.');
      } else {
        toast.error(msg || 'Something went wrong. Please try again.');
      }
    }
    setLoading(false);
  };

  const handleOAuth = async (provider: 'google' | 'apple', expectedEmail?: string) => {
    // Without this guard, a slow network round-trip to Supabase's
    // /authorize endpoint before the actual redirect fires left the
    // button looking unresponsive — nothing disabled it and there was no
    // visual feedback, so a user would tap it again (and again),
    // spawning multiple concurrent OAuth attempts.
    if (oauthLoading) return;
    setOauthLoading(true);
    // When this flow started from a specific known email (the "this
    // account uses Google" screen), remember it — OAuthCallback.tsx
    // checks the returned identity against this and refuses to log in
    // as a different account if Google silently authenticated the
    // wrong one (e.g. a different Google account already active in
    // this browser).
    if (expectedEmail) sessionStorage.setItem('fm_expected_login_email', expectedEmail.toLowerCase());
    else sessionStorage.removeItem('fm_expected_login_email');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      // Forces Google's account chooser instead of silently reusing
      // whichever Google account is already active in the browser.
      options: { redirectTo: getOAuthRedirectUrl(), queryParams: { prompt: 'select_account' } },
    });
    if (error) { toast.error(error.message); setOauthLoading(false); }
    // On success the browser is navigating away to Google — no need to
    // reset the loading state, the component is about to unmount anyway.
  };

  // ── Desktop only: the single "Email or phone number" field has no phone
  // + password mechanism to call, since this app has never had one -- only
  // phone + OTP (the same Twilio-backed flow /phone-login already uses via
  // authApi.signinWithPhone/completePhoneSignin). A detected phone number
  // swaps the card into that same code-verification step instead of
  // treating whatever's in the Password field as a phone password.
  const [desktopPhoneStep, setDesktopPhoneStep] = useState<'idle' | 'code'>('idle');
  const [desktopPhoneOtp,  setDesktopPhoneOtp]  = useState('');

  const handleDesktopSignIn = async () => {
    if (!email.trim()) { toast.error('Enter your email or phone number'); return; }
    if (isLikelyPhone(email)) {
      setPwError(''); setLoading(true);
      try {
        await authApi.signinWithPhone(email);
        toast.success(`Code sent to ${email}`);
        setDesktopPhoneOtp('');
        setDesktopPhoneStep('code');
      } catch (e: any) {
        const msg: string = e?.message || 'Failed to send code';
        toast.error(msg.includes('No account found') ? 'No account found with this number' : msg);
      }
      setLoading(false);
      return;
    }
    if (!email.includes('@')) { toast.error('Enter a valid email or phone number'); return; }
    handleEmailLogin();
  };

  const handleDesktopVerifyPhone = async () => {
    if (desktopPhoneOtp.length !== 6) { toast.error('Enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const user = await authApi.completePhoneSignin(email, desktopPhoneOtp);
      setUserDirectly(user, 'phone');
      // Navigation happens in the isAuthenticated effect above, same as
      // handleEmailLogin -- see its comment.
      captureSnapshot();
    } catch (e: any) {
      toast.error('Invalid code', { description: e instanceof Error ? e.message : 'Verification failed' });
    }
    setLoading(false);
  };

  // ── DESKTOP (lg:1024px+) two-column panel — shared by 'method' and
  // 'email' screens, which collapse into one direct email+password form on
  // desktop instead of mobile's multi-step chooser. Mobile markup in those
  // two branches is untouched, just wrapped in lg:hidden alongside this.
  const desktopPanel = (
    <div className="hidden lg:flex relative z-10 flex-1 items-center">
      <div className="flex-1 flex flex-col justify-center px-16 xl:px-24">
        <FilmonsLogo iconSize={40} theme="dark"/>
        <p className="text-white/70 text-lg font-semibold mt-3">The Creator's Marketplace</p>
        <p className="text-white/40 text-sm mt-6 max-w-sm leading-relaxed">
          Connect, create, rent, and grow with creators.
        </p>
      </div>
      <div className="flex-1 flex items-center justify-center px-16 xl:px-24">
        <div className="auth-pop-main w-full max-w-[440px] bg-white rounded-3xl shadow-2xl p-10">
          {desktopPhoneStep === 'code' ? (
            <>
              <p className="text-2xl font-black text-gray-900">Enter your code</p>
              <p className="text-sm text-gray-500 mt-1 mb-7">We sent a 6-digit code to <span className="font-semibold text-gray-700">{email}</span>.</p>
              <input value={desktopPhoneOtp}
                onChange={e => setDesktopPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => e.key === 'Enter' && handleDesktopVerifyPhone()}
                type="tel" inputMode="numeric" placeholder="000000" maxLength={6} autoFocus
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-300 rounded-2xl px-4 py-4 text-2xl font-black text-center tracking-[0.4em] outline-none focus:border-blue-400 focus:bg-white transition-all"/>
              <button onClick={handleDesktopVerifyPhone} disabled={loading || desktopPhoneOtp.length < 6}
                className="mt-5 w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl transition-all active:scale-[0.98] disabled:opacity-60 shadow-lg shadow-blue-900/20">
                {loading ? 'Verifying…' : 'Verify & Sign In'}
              </button>
              <button onClick={() => { setDesktopPhoneStep('idle'); setDesktopPhoneOtp(''); }}
                className="w-full text-center text-gray-400 text-xs font-semibold mt-4 hover:text-gray-600 transition-colors">
                Use a different email or phone number
              </button>
            </>
          ) : (
            <>
              <p className="text-2xl font-black text-gray-900">{customHeading || 'Welcome back'}</p>
              <p className="text-sm text-gray-500 mt-1 mb-7">{customSub || 'Sign in to your FILMONS account.'}</p>
              <div className="space-y-3">
                <input value={email} onChange={e => { setEmail(e.target.value); setPwError(''); }}
                  type="text" placeholder="Email or phone number" autoComplete="username"
                  onKeyDown={e => e.key === 'Enter' && handleDesktopSignIn()}
                  className="auth-input-fx w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white transition-all"/>
                <div className="relative">
                  <input value={password} onChange={e => { setPassword(e.target.value); setPwError(''); }}
                    type={showPw ? 'text' : 'password'} placeholder="Password" autoComplete="current-password"
                    onKeyDown={e => e.key === 'Enter' && handleDesktopSignIn()}
                    className={`auth-input-fx w-full bg-gray-50 border text-gray-900 placeholder-gray-400 rounded-2xl px-4 py-3.5 pr-12 text-sm outline-none focus:bg-white transition-all ${pwError ? 'border-red-400 focus:border-red-400' : 'border-gray-200 focus:border-blue-400'}`}/>
                  <button onClick={() => setShowPw(p => !p)} type="button"
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                  </button>
                </div>
                {pwError && <p className="auth-pop-error text-red-500 text-xs font-medium px-1 leading-snug">{pwError}</p>}
                <div className="flex justify-end">
                  <Link to="/forgot-password" className="text-xs text-blue-600 font-semibold hover:underline">Forgot password?</Link>
                </div>
              </div>
              <button onClick={handleDesktopSignIn} disabled={loading}
                className="auth-btn-fx mt-5 w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl transition-all disabled:opacity-60 shadow-lg shadow-blue-900/20">
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-gray-100"/>
                <p className="text-gray-400 text-xs font-semibold">OR</p>
                <div className="flex-1 h-px bg-gray-100"/>
              </div>
              <div className="space-y-2.5">
                <button onClick={() => handleOAuth('google')} disabled={oauthLoading}
                  className="w-full flex items-center gap-3 justify-center border border-gray-200 font-semibold text-sm text-gray-800 rounded-2xl px-4 py-3.5 hover:bg-gray-50 transition-all disabled:opacity-60">
                  {oauthLoading ? <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin"/> : <GoogleLogo size={18}/>}
                  {oauthLoading ? 'Connecting…' : 'Continue with Google'}
                </button>
                <button onClick={() => { enterGuestMode(); captureSnapshot(); navigate('/'); }}
                  className="w-full flex items-center justify-center font-semibold text-sm text-gray-500 rounded-2xl px-4 py-3.5 hover:bg-gray-50 transition-all">
                  Continue as Guest
                </button>
              </div>
              <p className="text-center text-xs text-gray-400 mt-6">
                Don't have an account?{' '}
                <Link to="/create-account" className="text-blue-600 font-semibold hover:underline">Create one</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // ── SPLASH ──────────────────────────────────────────────────────────────
  if (screen === 'splash') {
    return <FilmonsLoader onComplete={() => setScreen('method')} />;
  }

  // ── METHOD SELECTOR ──────────────────────────────────────────────────────
  if (screen === 'method') {
    return (
      <AuthScreenLayout>
        <CinematicBg/>
        {desktopPanel}
        <div className="auth-pop-main lg:hidden relative z-10 flex flex-col flex-1 px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          {/* Logo top */}
          <div className="flex justify-center pt-16 pb-10">
            <FilmonsLogo iconSize={32} theme="dark"/>
          </div>
          {/* Headline */}
          <div className="text-center mb-8">
            <p className="text-2xl font-black text-white">{customHeading || 'Welcome back'}</p>
            <p className="text-white/50 text-sm mt-1">{customSub || 'Sign in to your Filmons account'}</p>
          </div>
          {/* Methods */}
          <div className="space-y-3">
            <OAuthBtn onClick={() => handleOAuth('google')} loading={oauthLoading}/>
            <button onClick={() => setScreen('email')}
              className="w-full flex items-center gap-3 bg-white text-gray-900 font-semibold text-sm rounded-2xl px-4 py-3.5 hover:bg-gray-100 active:scale-[0.98] transition-all touch-manipulation">
              <Mail className="w-5 h-5 text-gray-500 shrink-0"/>
              <span className="flex-1 text-left">Continue with Email</span>
            </button>
            <button onClick={() => { captureSnapshot(); navigate('/phone-login'); }}
              className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-sm rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-all touch-manipulation">
              <Phone className="w-5 h-5 shrink-0"/>
              <span className="flex-1 text-left">Continue with Phone</span>
            </button>
          </div>
          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/10"/>
            <p className="text-white/30 text-xs font-medium">New to Filmons?</p>
            <div className="flex-1 h-px bg-white/10"/>
          </div>
          <Link to="/create-account"
            className="w-full text-center py-3.5 border-2 border-white/20 text-white font-bold text-sm rounded-2xl hover:bg-white/5 transition-colors">
            Create Account
          </Link>
          <button onClick={() => { enterGuestMode(); captureSnapshot(); navigate('/'); }}
            className="text-white/30 text-xs font-medium text-center mt-4 hover:text-white/60 transition-colors min-h-[44px] w-full">
            Continue as Guest
          </button>
        </div>
      </AuthScreenLayout>
    );
  }

  // ── EMAIL LOGIN ──────────────────────────────────────────────────────────
  if (screen === 'email') {
    return (
      <AuthScreenLayout>
        <CinematicBg/>
        {desktopPanel}
        <div className="auth-pop-main lg:hidden relative z-10 flex flex-col flex-1 px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-y-auto">
          <button onClick={goBack} className="flex items-center gap-2 text-white/60 pt-14 pb-6 w-fit hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4"/> Back
          </button>
          <div className="mb-6">
            <p className="text-2xl font-black text-white">Sign in</p>
            <p className="text-white/50 text-sm mt-1">Enter your email and password</p>
          </div>
          <div className="space-y-3">
            {/* Email */}
            <div className="group">
              <input value={email} onChange={e => { setEmail(e.target.value); setPwError(''); }}
                type="email" placeholder="Email address" autoComplete="email"
                onKeyDown={e => e.key === 'Enter' && handleEmailLogin()}
                className="auth-input-fx w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"/>
            </div>
            {/* Password */}
            <div className="relative">
              <input value={password} onChange={e => { setPassword(e.target.value); setPwError(''); }}
                type={showPw ? 'text' : 'password'} placeholder="Password" autoComplete="current-password"
                onKeyDown={e => e.key === 'Enter' && handleEmailLogin()}
                className={`auth-input-fx w-full bg-white/10 border text-white placeholder-white/40 rounded-2xl px-4 py-3.5 pr-12 text-sm outline-none focus:bg-white/15 transition-all ${pwError ? 'border-red-400 focus:border-red-400' : 'border-white/20 focus:border-blue-400'}`}/>
              <button onClick={() => setShowPw(p => !p)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors">
                {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </button>
            </div>
            {/* Inline password error */}
            {pwError && (
              <p className="auth-pop-error text-red-400 text-xs font-medium px-1 leading-snug">
                {pwError}
              </p>
            )}
            {/* Remember + Forgot */}
            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 text-xs text-white/50 cursor-pointer">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                  className="w-3.5 h-3.5 accent-blue-500"/>
                Remember me
              </label>
              <Link to="/forgot-password" className="text-xs text-blue-400 font-semibold hover:underline">
                Forgot password?
              </Link>
            </div>
          </div>
          <button onClick={handleEmailLogin} disabled={loading}
            className="auth-btn-fx mt-5 w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl transition-all disabled:opacity-60 shadow-lg shadow-blue-900/30">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/10"/>
            <p className="text-white/30 text-xs">or</p>
            <div className="flex-1 h-px bg-white/10"/>
          </div>
          <div className="space-y-2.5">
            <OAuthBtn onClick={() => handleOAuth('google')} loading={oauthLoading}/>
          </div>
          <p className="text-center text-xs text-white/30 mt-6">
            Don't have an account?{' '}
            <Link to="/create-account" className="text-blue-400 font-semibold hover:underline">Create one</Link>
          </p>
        </div>
      </AuthScreenLayout>
    );
  }

  // ── EMAIL NOT FOUND ──────────────────────────────────────────────────────
  if (screen === 'email_not_found') {
    return (
      <AuthScreenLayout>
        <CinematicBg/>
        <div className="auth-pop-main relative z-10 flex flex-col flex-1 px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-y-auto">
          {/* Back */}
          <button
            onClick={() => setScreen('email')}
            className="flex items-center gap-2 text-white/60 pt-14 pb-6 w-fit hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4"/> Back
          </button>

          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative w-20 h-20">
              <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                <Mail className="w-9 h-9 text-white/50"/>
              </div>
              {/* ✕ badge */}
              <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center border-2 border-[#0f172a] shadow-lg">
                <span className="text-white text-xs font-black leading-none">✕</span>
              </div>
            </div>
          </div>

          {/* Title + message */}
          <div className="text-center mb-5">
            <p className="text-2xl font-black text-white mb-2">Email not found</p>
            <p className="text-white/60 text-sm leading-relaxed">
              We couldn't find a Filmons account with this email address.
            </p>
          </div>

          {/* Email pill */}
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2">
              <Mail className="w-3.5 h-3.5 text-white/40 shrink-0"/>
              <span className="text-white/80 text-sm font-medium truncate max-w-[240px]">{email}</span>
            </div>
          </div>

          {/* CTA copy */}
          <p className="text-center text-white/40 text-xs leading-relaxed mb-6 px-2">
            New to Filmons? Create your account in a few seconds and start connecting with creators, clients, and marketplace hosts.
          </p>

          {/* Primary CTA */}
          <button
            onClick={() => { captureSnapshot(); navigate(`/create-account?email=${encodeURIComponent(email)}`); }}
            className="auth-btn-fx w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl transition-all shadow-lg shadow-blue-900/30 mb-3"
          >
            Create account with this email
          </button>

          {/* Secondary */}
          <button
            onClick={() => setScreen('email')}
            className="w-full py-3.5 border border-white/20 hover:bg-white/5 text-white font-semibold text-sm rounded-2xl transition-all active:scale-[0.98] mb-5"
          >
            Try another email
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/10"/>
            <p className="text-white/30 text-xs font-medium">or sign up with</p>
            <div className="flex-1 h-px bg-white/10"/>
          </div>

          {/* OAuth + Phone alternatives */}
          <div className="space-y-3 pb-8">
            <OAuthBtn onClick={() => handleOAuth('google')} loading={oauthLoading}/>
            <button
              onClick={() => { captureSnapshot(); navigate('/phone-login'); }}
              className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-sm rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-all"
            >
              <Phone className="w-5 h-5 shrink-0"/>
              <span className="flex-1 text-left">Continue with Phone Number</span>
            </button>
          </div>
        </div>
      </AuthScreenLayout>
    );
  }

  // ── ACCOUNT USES GOOGLE/APPLE — no email/password identity on file ───────
  if (screen === 'oauth_only') {
    const providerLabel = oauthOnlyProviders.includes('google') ? 'Google' : oauthOnlyProviders.includes('apple') ? 'Apple' : 'a social account';
    const provider: 'google' | 'apple' = oauthOnlyProviders.includes('apple') ? 'apple' : 'google';
    return (
      <AuthScreenLayout>
        <CinematicBg/>
        <div className="auth-pop-main relative z-10 flex flex-col flex-1 px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-y-auto">
          <button
            onClick={() => setScreen('email')}
            className="flex items-center gap-2 text-white/60 pt-14 pb-6 w-fit hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4"/> Back
          </button>

          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
              <GoogleLogo size={32}/>
            </div>
          </div>

          <div className="text-center mb-6">
            <p className="text-2xl font-black text-white mb-2">Continue to your account</p>
            <p className="text-white/60 text-sm leading-relaxed">This account was created with {providerLabel}.</p>
          </div>

          <button
            onClick={() => handleOAuth(provider, email)}
            className="auth-btn-fx w-full py-4 bg-white hover:bg-gray-100 text-gray-900 font-black text-sm rounded-2xl transition-all shadow-lg mb-4 flex items-center justify-center gap-2.5"
          >
            <GoogleLogo size={18}/> Continue with {providerLabel}
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/10"/>
            <p className="text-white/30 text-xs">or</p>
            <div className="flex-1 h-px bg-white/10"/>
          </div>

          <p className="text-center text-white/40 text-xs mb-3">Want to also sign in with email and password?</p>
          <button
            onClick={() => { captureSnapshot(); navigate(`/forgot-password?email=${encodeURIComponent(email)}`); }}
            className="w-full py-3.5 border border-white/20 hover:bg-white/5 text-white font-semibold text-sm rounded-2xl transition-all active:scale-[0.98]"
          >
            Set Up Password
          </button>
        </div>
      </AuthScreenLayout>
    );
  }

  // ── SECURITY / OTP ───────────────────────────────────────────────────────
  return (
    <AuthScreenLayout>
      <CinematicBg/>
      <div className="auth-pop-main relative z-10 flex flex-col flex-1 px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <button onClick={goBack} className="flex items-center gap-2 text-white/60 pt-14 pb-6 w-fit hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4"/> Back
        </button>
        <div className="mb-6">
          <p className="text-2xl font-black text-white">Security Check</p>
          <p className="text-white/50 text-sm mt-1">We sent a 6-digit code to <span className="text-white/80">{email}</span></p>
        </div>
        <input value={otp} onChange={e => setOtp(e.target.value.slice(0,6))}
          type="tel" placeholder="000000" maxLength={6}
          className="auth-input-fx w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl px-4 py-4 text-2xl font-black text-center tracking-[0.4em] outline-none focus:border-blue-400 focus:bg-white/15 transition-all"/>
        <button onClick={() => { if (otp.length === 6) { captureSnapshot(); navigate('/'); } else { toast.error('Enter the 6-digit code'); } }}
          className="auth-btn-fx mt-4 w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl hover:bg-blue-700 transition-all">
          Verify &amp; Sign In
        </button>
        <button className="text-white/40 text-xs text-center mt-4 hover:text-white/70 transition-colors">
          Resend code
        </button>
      </div>
    </AuthScreenLayout>
  );
}