/**
 * FILMONS Learning — Sign In (filmons.app/learning/login)
 *
 * Signs into the one shared FILMONS account (no separate Learning
 * account). Three ways in:
 *   - Continue with FILMONS: "Continue as [Name]" when this browser is
 *     already signed in to FILMONS (never applied automatically -- see
 *     LearningSessionContext); otherwise the main FILMONS sign-in page, with
 *     every method it offers (email, phone, Google, Apple).
 *   - Continue with Google: main app's OAuth callback, which also handles
 *     new Google accounts and verified linking onto an existing account.
 *   - Continue with email: email + password, right here.
 * Lands on `?returnTo=` (the course/checkout that sent the user here) or
 * Learning home. See lib/learningAuth.ts for how the destination survives
 * the main-app steps along the way.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useFilmonsSession, useLearningSession } from '../context/LearningSessionContext';
import { User } from '../types';
import { pendingAuthStep } from '../lib/authReturnUrl';
import {
  continueInFilmons,
  learningSignupPath,
  redirectToCanonicalLearningAuth,
  resolveLearningReturnTo,
  startLearningGoogleAuth,
} from '../lib/learningAuth';
import { GoogleIcon, LearningAuthLayout } from '../components/learning/LearningAuthLayout';

type View = 'options' | 'email';

function initials(name?: string): string {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
}

const optionBtn =
  'auth-btn-fx w-full flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-60';
const inputCls =
  'auth-input-fx w-full rounded-2xl border bg-gray-50 px-4 py-3.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white transition-colors';

export function LearningLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = resolveLearningReturnTo(searchParams.get('returnTo'));
  const prefillEmail = searchParams.get('email') ?? '';
  // The real FILMONS session -- Learning pages only see it after sign-in here.
  const { user, deviceVerified, login, logout } = useFilmonsSession();
  const { startLearningSession } = useLearningSession();

  const [redirecting] = useState(() => redirectToCanonicalLearningAuth());
  const [view, setView] = useState<View>(prefillEmail ? 'email' : 'options');
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<{ title: string; body: string; action?: 'signup' | 'google' } | null>(null);
  // Set when this page itself just signed the user in -- finishes as soon
  // as the new-device check for that session has resolved.
  const [justSignedIn, setJustSignedIn] = useState(false);

  // Sends a signed-in user on: through any main-app step they still owe
  // (new device, email verification, onboarding -- the same gates Root
  // applies on FILMONS), else straight to the Learning destination.
  const finish = (u: User) => {
    const step = pendingAuthStep(u, deviceVerified);
    if (step) { continueInFilmons(step, returnTo); return; }
    startLearningSession(u.id);
    navigate(returnTo, { replace: true });
  };

  useEffect(() => {
    if (justSignedIn && user && deviceVerified !== null) finish(user);
  }, [justSignedIn, user, deviceVerified]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEmailLogin = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError({ title: 'Enter your email and password', body: '' }); return; }
    setError(null);
    setLoading(true);
    try {
      // Switching accounts: drop the current session first so the
      // new-device check below can't resolve against the old one.
      if (user) await logout();
      await login(email.trim().toLowerCase(), password);
      setJustSignedIn(true);
    } catch (err: any) {
      const msg: string = err?.message || '';
      if (err?.code === 'OAUTH_ONLY') {
        const usesGoogle = (err.providers || []).includes('google');
        setError({
          title: usesGoogle ? 'This account uses Google' : 'This account has no password',
          body: usesGoogle
            ? 'You created this FILMONS account with Google. Continue with Google to sign in.'
            : 'Sign in with the method you used to create this FILMONS account.',
          action: usesGoogle ? 'google' : undefined,
        });
      } else if (msg === 'EMAIL_NOT_FOUND') {
        setError({ title: 'No account with this email', body: 'Check the spelling, or create a FILMONS account to start learning.', action: 'signup' });
      } else if (msg.toLowerCase().includes('incorrect') || msg.toLowerCase().includes('invalid')) {
        setError({ title: 'Incorrect password', body: 'The password you entered is incorrect. Please try again.' });
      } else {
        toast.error(msg || 'Something went wrong. Please try again.');
      }
      setLoading(false);
    }
  };

  const handleGoogle = async (expectedEmail?: string) => {
    if (googleLoading) return;
    setGoogleLoading(true);
    const err = await startLearningGoogleAuth(returnTo, expectedEmail);
    // On success the browser is already leaving for Google.
    if (err) { toast.error(err); setGoogleLoading(false); }
  };

  const handleContinueWithFilmons = () => {
    if (user) {
      if (deviceVerified === null) { setJustSignedIn(true); return; } // finishes once the check resolves
      finish(user);
      return;
    }
    continueInFilmons('/login', returnTo);
  };

  const forgotHref = `/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`;

  if (redirecting) return null;

  return (
    <LearningAuthLayout>
      {view === 'options' ? (
        <>
          <h1 className="text-2xl sm:text-[26px] font-black tracking-tight text-gray-900 leading-tight">Welcome to FILMONS Learning</h1>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">Learn new skills. Grow your creative career.</p>

          <div className="mt-8 space-y-3">
            {user ? (
              <button type="button" onClick={handleContinueWithFilmons} disabled={justSignedIn} className={`${optionBtn} border-blue-200 bg-blue-50/60 hover:bg-blue-50 hover:border-blue-300`}>
                {user.avatar
                  ? <img src={user.avatar} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
                  : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">{initials(user.name)}</span>}
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate">Continue as {user.name}</span>
                  {user.email && <span className="block truncate text-xs font-normal text-gray-500">{user.email}</span>}
                </span>
                {justSignedIn
                  ? <span className="h-4 w-4 shrink-0 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                  : <ArrowRight className="h-4 w-4 shrink-0 text-blue-600" />}
              </button>
            ) : (
              <button type="button" onClick={handleContinueWithFilmons} className={optionBtn}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-900 text-[11px] font-black text-white">F</span>
                <span className="flex-1 text-center pr-6">Continue with FILMONS</span>
              </button>
            )}

            <button type="button" onClick={() => handleGoogle()} disabled={googleLoading} className={optionBtn}>
              <GoogleIcon className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-center pr-5">{googleLoading ? 'Opening Google…' : 'Continue with Google'}</span>
            </button>

            <button type="button" onClick={() => { setView('email'); setError(null); }} className={optionBtn}>
              <Mail className="h-5 w-5 shrink-0 text-gray-700" strokeWidth={1.75} />
              <span className="flex-1 text-center pr-5">Continue with email</span>
            </button>
          </div>

          {user && (
            <p className="mt-4 text-center text-xs text-gray-400">
              Not {user.name?.split(' ')[0] || 'you'}?{' '}
              <button type="button" onClick={() => logout()} className="font-semibold text-gray-600 hover:text-gray-900 hover:underline">
                Use a different account
              </button>
            </p>
          )}
        </>
      ) : (
        <>
          <button type="button" onClick={() => { setView('options'); setError(null); }}
            className="-ml-1 mb-4 flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> All sign-in options
          </button>
          <h1 className="text-2xl font-black tracking-tight text-gray-900">Sign in with email</h1>
          <p className="mt-1.5 text-sm text-gray-500">Use the email and password for your FILMONS account.</p>

          <form onSubmit={handleEmailLogin} className="mt-7 space-y-3" noValidate>
            <label className="block">
              <span className="sr-only">Email</span>
              <input value={email} onChange={e => { setEmail(e.target.value); setError(null); }}
                type="email" inputMode="email" autoComplete="email" placeholder="Email" autoFocus={!prefillEmail}
                className={`${inputCls} border-gray-200 focus:border-blue-400`} />
            </label>
            <label className="relative block">
              <span className="sr-only">Password</span>
              <input value={password} onChange={e => { setPassword(e.target.value); setError(null); }}
                type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="Password" autoFocus={!!prefillEmail}
                className={`${inputCls} pr-12 ${error?.title === 'Incorrect password' ? 'border-red-400 focus:border-red-400' : 'border-gray-200 focus:border-blue-400'}`} />
              <button type="button" onClick={() => setShowPw(p => !p)} aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </label>

            {error && (
              <div className="auth-pop-error rounded-2xl bg-red-50 border border-red-100 px-4 py-3" role="alert">
                <p className="text-sm font-bold text-red-600">{error.title}</p>
                {error.body && <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{error.body}</p>}
                {error.action === 'google' && (
                  <button type="button" onClick={() => handleGoogle(email.trim())} className="mt-2 flex items-center gap-2 text-xs font-bold text-blue-600 hover:underline">
                    <GoogleIcon className="h-3.5 w-3.5" /> Continue with Google
                  </button>
                )}
                {error.action === 'signup' && (
                  <Link to={learningSignupPath(returnTo)} className="mt-2 inline-block text-xs font-bold text-blue-600 hover:underline">
                    Create an account
                  </Link>
                )}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="auth-btn-fx w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-colors disabled:opacity-60">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </>
      )}

      <div className="mt-7 border-t border-gray-100 pt-6 space-y-2.5 text-center text-sm">
        <p>
          <a href={forgotHref} onClick={e => { e.preventDefault(); continueInFilmons(forgotHref, returnTo); }}
            className="font-semibold text-blue-600 hover:underline">
            Forgot password?
          </a>
        </p>
        <p className="text-gray-500">
          New to FILMONS?{' '}
          <Link to={learningSignupPath(returnTo)} className="font-bold text-gray-900 hover:underline">Create an account</Link>
        </p>
      </div>
    </LearningAuthLayout>
  );
}
