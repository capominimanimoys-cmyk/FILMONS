/**
 * VerifyEmail — step 2 of the signup flow.
 * Reads pending signup from sessionStorage, lets the user enter the 6-digit code,
 * then creates the auth user + profile row and redirects to /onboarding.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Loader2, LoaderCircle, Mail, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { EMAILJS_CONFIG, sendEmail, sendWelcomeEmail } from '../lib/emailjs-config';
import { useAuth } from '../context/AuthContext';
import { PENDING_SIGNUP_KEY } from './CreateAccount';
import type { User } from '../types';
import { FilmonsLogo } from '../components/FilmonsLogo';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { claimIdentity } from '../lib/identity';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface PendingSignup {
  name: string;
  email: string;
  password: string;
  code: string;
  expiresAt: number;
}

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function readPending(): PendingSignup | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SIGNUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function VerifyEmail() {
  const navigate   = useNavigate();
  const { completeLogin, user, isAuthenticated } = useAuth() as any;
  const [pending,   setPending]  = useState<PendingSignup | null>(null);
  const [digits,    setDigits]   = useState(['', '', '', '', '', '']);
  const [loading,   setLoading]  = useState(false);
  const [resending, setResending] = useState(false);
  const [editEmail, setEditEmail] = useState(false);
  const [newEmail,  setNewEmail]  = useState('');
  const inputRefs   = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const p = readPending();
    if (!p) {
      if (isAuthenticated && user?.id) {
        // Already logged in with no pending verification — fix the stuck loop by
        // marking email as verified in the DB and going home. Routed through
        // the service-role server (not a direct anon-key update) for the same
        // RLS reason as the profile-creation call below.
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/users/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
          body: JSON.stringify({ emailVerified: true }),
        }).catch(() => {});
        navigate('/', { replace: true });
      } else {
        navigate('/create-account', { replace: true });
      }
      return;
    }
    setPending(p);
    setNewEmail(p.email);
  }, [navigate, isAuthenticated, user?.id]);

  const code = digits.join('');
  const full  = code.length === 6;

  const handleDigit = (i: number, val: string) => {
    const ch = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = ch;
    setDigits(next);
    if (ch && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  // Verify code → authenticate → create the minimum profile → redirect.
  // Nothing else runs before the redirect -- no notifications, analytics,
  // onboarding data, preferences, or portfolio init. claimIdentity below is
  // the one exception, and it's deliberately fire-and-forget (never
  // awaited), not part of this critical path.
  //
  // Bounded to VERIFY_TIMEOUT_MS total so the loader can never spin
  // indefinitely -- a genuinely slow/broken network still resolves to the
  // timeout error UI within a fixed window instead of hanging forever.
  const VERIFY_TIMEOUT_MS = 15_000;

  const handleVerify = async () => {
    if (!pending || !full || loading) return;

    if (Date.now() > pending.expiresAt) {
      toast.error('Code expired. Please request a new one.');
      return;
    }
    if (code !== pending.code) {
      toast.error('Incorrect verification code', { description: 'Check the code and try again.' });
      return;
    }

    setLoading(true);
    const t0 = performance.now();
    const mark = (stage: string) => console.log(`[verify] ${stage} (+${Math.round(performance.now() - t0)}ms)`);
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), VERIFY_TIMEOUT_MS);

    try {
      mark('OTP verified, starting auth');

      // 1. Authenticate — the one call this step actually needs Supabase
      // Auth for. AbortController can't cancel supabase-js's own signUp()
      // call directly, but Promise.race still bounds how long we wait on
      // it before giving up and showing the timeout error.
      const signUpPromise = supabase.auth.signUp({ email: pending.email, password: pending.password });
      const { data: authData, error: authError } = await Promise.race([
        signUpPromise,
        new Promise<never>((_, reject) => abort.signal.addEventListener('abort', () => reject(new Error('TIMEOUT')))),
      ]);
      mark('session received');

      if (authError || !authData.user) {
        // CreateAccount.tsx already checks for this via checkAuthMethods
        // before a code is ever sent, so reaching it here should be rare
        // (a genuine race between two concurrent signup attempts for the
        // same email). Still handled gracefully rather than surfacing
        // Supabase's raw "User already registered" wording.
        if (authError?.message?.toLowerCase().includes('already registered')) {
          toast.error('This email is already registered. Please sign in instead.');
          navigate(`/email-already-exists?email=${encodeURIComponent(pending.email)}`);
          return;
        }
        toast.error(authError?.message || 'Failed to create account.');
        return;
      }

      // 2. Create (or, if a retry hit this exact id again, confirm) the
      // minimal profile row via the service-role server endpoint, not a
      // direct client upsert — right after supabase.auth.signUp(), this
      // browser has no real Supabase Auth session yet (email confirmation
      // is required, so signUp() returns no session), which means an
      // anon-key write here is running as an unauthenticated request. The
      // profiles table's RLS UPDATE/INSERT policies check auth.uid() = id,
      // which is null in that state, so a direct .upsert() call here would
      // silently no-op or 42501 instead of actually creating the row —
      // exactly the "orphaned auth user, no profile" dead-end this flow
      // used to hit. The server's /users endpoint (profiles.create in
      // supabase/functions/server/profiles.tsx) writes with the service
      // role key over a direct Postgres connection, bypassing RLS entirely,
      // and is idempotent on this id (a repeat of this exact request
      // returns the already-created row instead of erroring).
      mark('profile lookup/creation started');
      const profileRes = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({
          id: authData.user.id, email: pending.email, name: pending.name,
          emailVerified: true, accountType: 'creator', accountMode: 'creator',
        }),
        signal: abort.signal,
      });
      mark('profile creation completed');
      if (!profileRes.ok) {
        const profileData = await profileRes.json().catch(() => ({}));
        if (profileRes.status === 409) {
          toast.error('This email address is already connected to another Filmons account.');
        } else {
          toast.error('Account created but profile setup failed. Please contact support.');
        }
        console.error('[signup] profile creation failed:', profileRes.status, profileData);
        return;
      }

      // Build the initial User object and start the session
      const user: User = {
        id:                   authData.user.id,
        email:                pending.email,
        name:                 pending.name,
        accountType:          'creator',
        accountMode:          'creator',
        isVerified:           false,
        verificationStatus:   'not_started',
        profileSetupCompleted: false,
        emailVerified:        true,
        followers:            [],
        following:            [],
      };

      // completeLogin(preloadedUser) itself is synchronous (cache + a
      // fire-and-forget device registration) — no extra network wait here.
      await completeLogin(pending.email, pending.password, undefined, user, 'email');
      sessionStorage.removeItem(PENDING_SIGNUP_KEY);
      mark('redirect started');
      navigate('/onboarding', { replace: true });

      // Everything below is non-critical setup, deliberately fired after
      // the redirect already happened rather than awaited before it.
      claimIdentity(authData.user.id, 'email', pending.email).catch(() => {});
      sendWelcomeEmail(pending.email, pending.name).catch(() => {});
    } catch (e: any) {
      if (e?.message === 'TIMEOUT' || e?.name === 'AbortError') {
        toast.error("We couldn't finish verification", {
          description: 'Your code may have expired or there may be a connection issue.',
        });
      } else {
        toast.error(e?.message || 'Something went wrong.');
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pending || resending) return;
    setResending(true);
    try {
      const newCode    = genCode();
      const expiresAt  = Date.now() + 10 * 60 * 1000;
      const updated    = { ...pending, code: newCode, expiresAt };
      sessionStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(updated));
      setPending(updated);

      const { success } = await sendEmail(EMAILJS_CONFIG.templates.emailVerification, {
        to_email:          pending.email,
        to_name:           pending.name,
        verification_code: newCode,
        user_email:        pending.email,
        expires_in:        '10 minutes',
      });

      if (success) {
        toast.success('New code sent! Also check your spam or junk folder.');
        setDigits(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      } else {
        toast.error('Could not send email. Please try again.');
      }
    } finally {
      setResending(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!pending || resending) return;
    const trimmed = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    setResending(true);
    try {
      const newCode   = genCode();
      const expiresAt = Date.now() + 10 * 60 * 1000;
      const updated   = { ...pending, email: trimmed, code: newCode, expiresAt };
      sessionStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(updated));
      setPending(updated);

      const { success } = await sendEmail(EMAILJS_CONFIG.templates.emailVerification, {
        to_email:          trimmed,
        to_name:           pending.name,
        verification_code: newCode,
        user_email:        trimmed,
        expires_in:        '10 minutes',
      });

      if (success) {
        toast.success(`Code sent to ${trimmed}`);
        setDigits(['', '', '', '', '', '']);
        setEditEmail(false);
        inputRefs.current[0]?.focus();
      } else {
        toast.error('Could not send email. Please try again.');
      }
    } finally {
      setResending(false);
    }
  };

  if (!pending) return null;

  return (
    <AuthScreenLayout className="bg-gray-950">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950" />
        <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-blue-600 opacity-10 blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col flex-1 overflow-y-auto px-5"
        style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))', paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))' }}>
        <Link to="/create-account" className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-sm mb-10 w-fit">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex flex-col items-center mb-10">
          <FilmonsLogo iconSize={32} theme="dark" className="mb-8" />
          <div className="w-14 h-14 rounded-2xl bg-blue-600/20 flex items-center justify-center mb-5">
            <Mail className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">Verify your email</h1>
          <p className="text-white/40 text-sm text-center max-w-xs">
            We sent a 6-digit verification code to{' '}
            <span className="text-white/70 font-semibold">{pending.email}</span>
          </p>
        </div>

        {/* Code input */}
        <div className="flex gap-2.5 justify-center mb-8" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className="w-12 h-14 text-center text-xl font-black text-white bg-white/10 border-2 border-white/20 rounded-2xl outline-none focus:border-blue-400 focus:bg-white/15 transition-all caret-blue-400"
            />
          ))}
        </div>

        {/* Subtle, non-alert helper text -- placed between the code inputs
            and Resend Code per spec, not styled as a warning. */}
        <p className="text-[12px] text-white/35 text-center mb-4">
          Didn't receive the code? Check your spam or junk folder.
        </p>

        <div className="w-full max-w-sm mx-auto space-y-3">
          <button
            onClick={handleVerify}
            disabled={!full || loading}
            className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-40 active:scale-[0.98] transition-all"
            style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}
          >
            {loading
              ? <span className="flex items-center justify-center gap-2"><LoaderCircle className="w-4 h-4 animate-spin" /> Verifying</span>
              : 'Verify →'}
          </button>

          <button
            onClick={handleResend}
            disabled={resending}
            className="w-full py-3.5 rounded-2xl font-bold text-white/60 text-sm border border-white/10 hover:border-white/20 hover:text-white/80 disabled:opacity-40 transition-all"
          >
            {resending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Resend Code'}
          </button>

          {!editEmail ? (
            <button
              onClick={() => setEditEmail(true)}
              className="w-full py-3 text-blue-400 text-sm font-semibold hover:text-blue-300 transition-colors"
            >
              Change Email
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="New email address"
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setEditEmail(false)}
                  className="flex-1 py-3 rounded-2xl border border-white/15 text-white/50 text-sm font-semibold hover:text-white/70 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleChangeEmail}
                  disabled={resending}
                  className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 disabled:opacity-40 transition-all"
                >
                  {resending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Update & Resend'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthScreenLayout>
  );
}
