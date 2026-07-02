/**
 * VerifyEmail — step 2 of the signup flow.
 * Reads pending signup from sessionStorage, lets the user enter the 6-digit code,
 * then creates the auth user + profile row and redirects to /onboarding.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Loader2, Mail, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { EMAILJS_CONFIG, sendEmail } from '../lib/emailjs-config';
import { useAuth } from '../context/AuthContext';
import { PENDING_SIGNUP_KEY } from './CreateAccount';
import type { User } from '../types';
import { FilmonsLogo } from '../components/FilmonsLogo';

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
  const { completeLogin } = useAuth();
  const [pending,   setPending]  = useState<PendingSignup | null>(null);
  const [digits,    setDigits]   = useState(['', '', '', '', '', '']);
  const [loading,   setLoading]  = useState(false);
  const [resending, setResending] = useState(false);
  const [editEmail, setEditEmail] = useState(false);
  const [newEmail,  setNewEmail]  = useState('');
  const inputRefs   = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const p = readPending();
    if (!p) { navigate('/create-account', { replace: true }); return; }
    setPending(p);
    setNewEmail(p.email);
  }, [navigate]);

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

  const handleVerify = async () => {
    if (!pending || !full || loading) return;
    setLoading(true);
    try {
      if (Date.now() > pending.expiresAt) {
        toast.error('Code expired. Please request a new one.');
        setLoading(false);
        return;
      }
      if (code !== pending.code) {
        toast.error('Incorrect code. Please try again.');
        setLoading(false);
        return;
      }

      // Create the Supabase auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: pending.email,
        password: pending.password,
      });
      if (authError || !authData.user) {
        toast.error(authError?.message || 'Failed to create account.');
        setLoading(false);
        return;
      }

      // Create the profile row — email_verified = true since we just verified
      const { error: profileError } = await supabase.from('profiles').upsert({
        id:             authData.user.id,
        email:          pending.email,
        name:           pending.name,
        email_verified: true,
        account_type:   'creator',
        account_mode:   'creator',
        created_at:     new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'id' });

      if (profileError) {
        toast.error('Account created but profile setup failed. Please contact support.');
        setLoading(false);
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

      await completeLogin(pending.email, pending.password, undefined, user);
      sessionStorage.removeItem(PENDING_SIGNUP_KEY);
      navigate('/onboarding', { replace: true });
    } catch (e: any) {
      toast.error(e?.message || 'Something went wrong.');
    } finally {
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
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-gray-950">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950" />
        <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-blue-600 opacity-10 blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col flex-1 overflow-y-auto px-5 pt-14 pb-10">
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
          <p className="text-white/30 text-xs text-center max-w-xs mt-2">
            Didn't receive the email? Check your <span className="text-white/50">spam or junk folder</span>. It may take a few minutes to arrive.
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

        <div className="w-full max-w-sm mx-auto space-y-3">
          <button
            onClick={handleVerify}
            disabled={!full || loading}
            className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-40 active:scale-[0.98] transition-all"
            style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              : 'Verify →'}
          </button>

          <button
            onClick={handleResend}
            disabled={resending}
            className="w-full py-3.5 rounded-2xl font-bold text-white/60 text-sm border border-white/10 hover:border-white/20 hover:text-white/80 disabled:opacity-40 transition-all"
          >
            {resending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Resend Code'}
          </button>

          <p className="text-[11px] text-white/25 text-center -mt-1">
            Still haven't received it? Try resending or check spam.
          </p>

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
    </div>
  );
}
