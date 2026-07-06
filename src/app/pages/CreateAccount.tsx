/**
 * Create Account — step 1 of the email signup flow.
 * Collects: Name, Email, Password, Confirm Password.
 * Password rules are validated live; submit is disabled until all pass.
 * Sends a 6-digit code and redirects to /verify-email.
 * All profile setup (username, role, bio, etc.) happens in /onboarding.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Eye, EyeOff, Loader2, Phone } from 'lucide-react';
import { EMAILJS_CONFIG, sendEmail } from '../lib/emailjs-config';
import { toast } from 'sonner';
import { FilmonsLogo } from '../components/FilmonsLogo';
import { supabase } from '../../lib/supabase';

export const PENDING_SIGNUP_KEY = 'filmons_pending_signup';

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const PW_RULES = [
  { id: 'len',     label: 'At least 8 characters',         test: (p: string) => p.length >= 8 },
  { id: 'upper',   label: 'At least one uppercase letter',  test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower',   label: 'At least one lowercase letter',  test: (p: string) => /[a-z]/.test(p) },
  { id: 'num',     label: 'At least one number',            test: (p: string) => /[0-9]/.test(p) },
  { id: 'special', label: 'At least one special character', test: (p: string) => /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]/.test(p) },
  { id: 'space',   label: 'No spaces',                      test: (p: string) => p.length > 0 && !/\s/.test(p) },
];

function pwStrength(password: string): { label: string; color: string; pct: number } | null {
  if (!password) return null;
  const met = PW_RULES.filter(r => r.test(password)).length;
  if (met <= 2) return { label: 'Weak',        color: '#ef4444', pct: 25  };
  if (met <= 3) return { label: 'Fair',        color: '#f59e0b', pct: 50  };
  if (met <= 5) return { label: 'Strong',      color: '#3b82f6', pct: 75  };
  return           { label: 'Very Strong', color: '#22c55e', pct: 100 };
}

export function CreateAccount() {
  const navigate = useNavigate();

  const [name,            setName]            = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirm,         setConfirm]         = useState('');
  const [showPw,          setShowPw]          = useState(false);
  const [showCf,          setShowCf]          = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const rules      = PW_RULES.map(r => ({ ...r, met: r.test(password) }));
  const allRulesMet = rules.every(r => r.met);
  const emailValid  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const pwMatch     = password === confirm && confirm.length > 0;
  const canSubmit   = name.trim().length >= 2 && emailValid && allRulesMet && pwMatch;
  const strength    = pwStrength(password);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setSubmitAttempted(true);
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      const normalEmail = email.trim().toLowerCase();

      const { data: existing } = await supabase
        .from('profiles')
        .select('id, profile_meta')
        .eq('email', normalEmail)
        .maybeSingle();

      if (existing) {
        // Detect the original signup provider from profile_meta (never guess)
        const meta     = existing.profile_meta as any;
        const provider = meta?.provider as string | undefined;
        const knownProvider = provider === 'google' || provider === 'apple' ? provider : null;

        const params = new URLSearchParams({ email: normalEmail });
        if (knownProvider) params.set('provider', knownProvider);
        navigate(`/email-already-exists?${params.toString()}`);
        setLoading(false);
        return;
      }

      const code      = genCode();
      const expiresAt = Date.now() + 10 * 60 * 1000;

      sessionStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({
        name: name.trim(), email: normalEmail, password, code, expiresAt,
      }));

      const { success } = await sendEmail(EMAILJS_CONFIG.templates.emailVerification, {
        to_email:          normalEmail,
        to_name:           name.trim(),
        verification_code: code,
        user_email:        normalEmail,
        expires_in:        '10 minutes',
        subject:           'Verify your Filmons email',
      });

      if (!success) {
        toast.error('Could not send verification email. Please try again.');
        setLoading(false);
        return;
      }

      navigate('/verify-email');
    } catch (e: any) {
      toast.error(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-gray-950">
      {/* Ambient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950" />
        <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-blue-600 opacity-10 blur-[100px]" />
        <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full bg-violet-500 opacity-10 blur-[80px]" />
      </div>

      <div className="relative z-10 flex flex-col flex-1 overflow-y-auto px-5 pt-14 pb-10">
        <div className="flex flex-col items-center mb-8">
          <FilmonsLogo iconSize={34} theme="dark" className="mb-7" />
          <h1 className="text-2xl font-black text-white mb-1">Create your account</h1>
          <p className="text-white/40 text-sm text-center">Join the Filmons creative community</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm mx-auto" noValidate>

          {/* Full Name */}
          <div>
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"
            />
          </div>

          {/* Password */}
          <div>
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a password"
                autoComplete="new-password"
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-2xl px-4 py-3.5 pr-11 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Live password rules */}
            {password.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-wider mb-2">
                  Your password must contain:
                </p>
                {rules.map(rule => {
                  const color = rule.met
                    ? 'text-green-400'
                    : submitAttempted
                      ? 'text-red-400'
                      : 'text-white/35';
                  return (
                    <div key={rule.id} className={`flex items-center gap-2 text-xs ${color} transition-colors`}>
                      <span className="w-3 shrink-0 text-center font-bold">
                        {rule.met ? '✓' : '○'}
                      </span>
                      {rule.label}
                    </div>
                  );
                })}

                {/* Strength bar */}
                {strength && (
                  <div className="pt-2">
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-400"
                        style={{ width: `${strength.pct}%`, background: strength.color }}
                      />
                    </div>
                    <p className="text-[10px] font-semibold mt-1" style={{ color: strength.color }}>
                      {strength.label}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showCf ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                autoComplete="new-password"
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-2xl px-4 py-3.5 pr-11 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowCf(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                aria-label={showCf ? 'Hide password' : 'Show password'}
              >
                {showCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirm.length > 0 && (
              <p className={`text-xs mt-1.5 font-medium ${pwMatch ? 'text-green-400' : 'text-red-400'}`}>
                {pwMatch ? '✓ Passwords match' : 'Passwords do not match'}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-40 active:scale-[0.98] transition-all mt-2"
            style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              : 'Create Account →'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6 w-full max-w-sm mx-auto">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[11px] text-white/25 font-semibold whitespace-nowrap">or continue with</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* OAuth & Phone buttons */}
        <div className="space-y-3 w-full max-w-sm mx-auto">
          {/* Google */}
          <button
            onClick={() => handleOAuth('google')}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl bg-white/10 border border-white/15 text-white text-sm font-bold hover:bg-white/15 active:scale-[0.98] transition-all min-h-[44px]"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Phone */}
          <button
            onClick={() => navigate('/signup/phone')}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl bg-white/10 border border-white/15 text-white text-sm font-bold hover:bg-white/15 active:scale-[0.98] transition-all min-h-[44px]"
          >
            <Phone className="w-4 h-4 shrink-0" />
            Continue with Phone Number
          </button>
        </div>

        <p className="text-center text-white/30 text-xs mt-7 max-w-xs mx-auto">
          By creating an account you agree to our{' '}
          <Link to="/terms-conditions" className="text-blue-400 hover:text-blue-300">Terms</Link>
          {' & '}
          <Link to="/privacy-policy" className="text-blue-400 hover:text-blue-300">Privacy Policy</Link>.
        </p>

        <p className="text-center text-white/35 text-sm mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-400 font-bold hover:text-blue-300">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
