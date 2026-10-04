/**
 * FILMONS Learning — Create Account (filmons.app/learning/signup)
 *
 * Creates a regular FILMONS account (the same account used on the main
 * FILMONS platform), via Google or email. Email signup collects name,
 * email, password and Terms/Privacy acceptance here, then hands off to
 * the main app's /verify-email (6-digit code) -> /onboarding, and finally
 * back to `?returnTo=` or Learning home -- see lib/learningAuth.ts.
 */
import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { ArrowLeft, Check, Eye, EyeOff, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useFilmonsSession } from '../context/LearningSessionContext';
import { PW_RULES, startEmailSignup } from '../lib/emailSignup';
import {
  continueInFilmons,
  learningLoginPath,
  redirectToCanonicalLearningAuth,
  resolveLearningReturnTo,
  startLearningGoogleAuth,
} from '../lib/learningAuth';
import { filmonsOrigin } from '../lib/learningOrigin';
import { GoogleIcon, LearningAuthLayout } from '../components/learning/LearningAuthLayout';

const optionBtn =
  'auth-btn-fx w-full flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-60';
const inputCls =
  'auth-input-fx w-full rounded-2xl border bg-gray-50 px-4 py-3.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white transition-colors';

export function LearningSignup() {
  const [searchParams] = useSearchParams();
  const returnTo = resolveLearningReturnTo(searchParams.get('returnTo'));
  const { user } = useFilmonsSession();

  const [redirecting] = useState(() => redirectToCanonicalLearningAuth());
  const [view, setView] = useState<'options' | 'email'>('options');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [existing, setExisting] = useState<{ email: string; provider: 'google' | 'apple' | null } | null>(null);

  const rules = PW_RULES.map(r => ({ ...r, met: r.test(password) }));
  const nameValid = name.trim().length >= 2;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const pwValid = rules.every(r => r.met);
  const canSubmit = nameValid && emailValid && pwValid && agreed;

  if (redirecting) return null;
  // Already signed in -- the sign-in page offers "Continue as [Name]".
  if (user && !loading) return <Navigate to={learningLoginPath(returnTo)} replace />;

  const handleGoogle = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    const err = await startLearningGoogleAuth(returnTo);
    if (err) { toast.error(err); setGoogleLoading(false); }
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setSubmitAttempted(true);
    if (!canSubmit || loading) return;
    setLoading(true);
    setExisting(null);
    try {
      const res = await startEmailSignup(name, email, password);
      if (res.status === 'exists') { setExisting({ email: res.email, provider: res.provider }); setLoading(false); return; }
      if (res.status === 'send_failed') { toast.error('Could not send verification email. Please try again.'); setLoading(false); return; }
      // Code sent -- /verify-email creates the account once it checks out.
      continueInFilmons('/verify-email', returnTo);
    } catch (err: any) {
      toast.error(err?.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const legalLink = (path: string, label: string) => (
    <a href={`${filmonsOrigin()}${path}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-700 underline hover:text-gray-900">{label}</a>
  );

  return (
    <LearningAuthLayout>
      {view === 'options' ? (
        <>
          <h1 data-pop className="text-2xl sm:text-[26px] font-black tracking-tight text-gray-900 leading-tight">Create your FILMONS account</h1>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            Start learning today. Your account also works across FILMONS.
          </p>

          <div className="mt-8 space-y-3">
            <button type="button" onClick={handleGoogle} disabled={googleLoading} data-pop className={optionBtn}>
              <GoogleIcon className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-center pr-5">{googleLoading ? 'Opening Google…' : 'Sign up with Google'}</span>
            </button>
            <button type="button" onClick={() => setView('email')} data-pop className={optionBtn}>
              <Mail className="h-5 w-5 shrink-0 text-gray-700" strokeWidth={1.75} />
              <span className="flex-1 text-center pr-5">Sign up with email</span>
            </button>
          </div>

          <p className="mt-5 text-center text-xs leading-relaxed text-gray-400">
            By signing up with Google, you agree to the FILMONS {legalLink('/terms-conditions', 'Terms')} and {legalLink('/privacy-policy', 'Privacy Policy')}.
          </p>
        </>
      ) : (
        <>
          <button type="button" onClick={() => { setView('options'); setExisting(null); }}
            className="-ml-1 mb-4 flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> All sign-up options
          </button>
          <h1 data-pop className="text-2xl font-black tracking-tight text-gray-900">Sign up with email</h1>
          <p className="mt-1.5 text-sm text-gray-500">We'll send a code to verify your email.</p>

          <form data-pop onSubmit={handleSubmit} className="mt-7 space-y-3" noValidate>
            <div>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" autoComplete="name" autoFocus aria-label="Full name"
                className={`${inputCls} ${submitAttempted && !nameValid ? 'border-red-400' : 'border-gray-200 focus:border-blue-400'}`} />
              {submitAttempted && !nameValid && <p className="mt-1 px-1 text-xs text-red-500">Enter your name.</p>}
            </div>
            <div>
              <input value={email} onChange={e => { setEmail(e.target.value); setExisting(null); }} type="email" inputMode="email" placeholder="Email" autoComplete="email" aria-label="Email"
                className={`${inputCls} ${submitAttempted && !emailValid ? 'border-red-400' : 'border-gray-200 focus:border-blue-400'}`} />
              {submitAttempted && !emailValid && <p className="mt-1 px-1 text-xs text-red-500">Enter a valid email address.</p>}
            </div>
            <div>
              <div className="relative">
                <input value={password} onChange={e => setPassword(e.target.value)} type={showPw ? 'text' : 'password'} placeholder="Password" autoComplete="new-password" aria-label="Password"
                  className={`${inputCls} pr-12 ${submitAttempted && !pwValid ? 'border-red-400' : 'border-gray-200 focus:border-blue-400'}`} />
                <button type="button" onClick={() => setShowPw(p => !p)} aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {(password || submitAttempted) && (
                <ul className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 px-1">
                  {rules.map(r => (
                    <li key={r.id} className={`flex items-center gap-1.5 text-[11px] ${r.met ? 'text-green-600' : 'text-gray-400'}`}>
                      <Check className={`h-3 w-3 shrink-0 ${r.met ? 'opacity-100' : 'opacity-30'}`} strokeWidth={3} />
                      {r.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label className="flex items-start gap-3 pt-1 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-blue-600" />
              <span className={`text-xs leading-relaxed ${submitAttempted && !agreed ? 'text-red-500' : 'text-gray-500'}`}>
                I agree to the FILMONS {legalLink('/terms-conditions', 'Terms of Service')} and {legalLink('/privacy-policy', 'Privacy Policy')}.
              </span>
            </label>

            {existing && (
              <div className="auth-pop-error rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3" role="alert">
                <p className="text-sm font-bold text-gray-900">You already have a FILMONS account</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                  <span className="font-semibold">{existing.email}</span> is already registered
                  {existing.provider === 'google' ? ' with Google' : ''}. Sign in to use it for Learning.
                </p>
                {existing.provider === 'google' ? (
                  <button type="button" onClick={() => startLearningGoogleAuth(returnTo, existing.email).then(err => err && toast.error(err))}
                    className="mt-2 flex items-center gap-2 text-xs font-bold text-blue-600 hover:underline">
                    <GoogleIcon className="h-3.5 w-3.5" /> Continue with Google
                  </button>
                ) : (
                  <Link to={learningLoginPath(returnTo, { email: existing.email })} className="mt-2 inline-block text-xs font-bold text-blue-600 hover:underline">
                    Sign in instead
                  </Link>
                )}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="auth-btn-fx w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-colors disabled:opacity-60">
              {loading ? 'Sending code…' : 'Create account'}
            </button>
          </form>
        </>
      )}

      <div className="mt-7 border-t border-gray-100 pt-6 text-center text-sm text-gray-500">
        Already have a FILMONS account?{' '}
        <Link to={learningLoginPath(returnTo)} className="font-bold text-gray-900 hover:underline">Sign in</Link>
      </div>
    </LearningAuthLayout>
  );
}
