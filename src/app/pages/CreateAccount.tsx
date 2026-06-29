/**
 * Create Account — step 1 of the signup flow.
 * Collects only: Name, Email, Password, Confirm Password.
 * Sends a 6-digit code to the email and redirects to /verify-email.
 * All profile setup (username, role, bio, etc.) happens in /onboarding.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { EMAILJS_CONFIG, sendEmail } from '../lib/emailjs-config';
import { toast } from 'sonner';
import { FilmonsLogo } from '../components/FilmonsLogo';
import { supabase } from '../../lib/supabase';

export const PENDING_SIGNUP_KEY = 'filmons_pending_signup';

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function CreateAccount() {
  const navigate = useNavigate();

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [showCf,   setShowCf]   = useState(false);
  const [loading,  setLoading]  = useState(false);

  const pwStrong  = password.length >= 8;
  const pwMatch   = password === confirm && confirm.length > 0;
  const canSubmit = name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && pwStrong && pwMatch;

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      const normalEmail = email.trim().toLowerCase();

      // Check if an account already exists for this email
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', normalEmail)
        .maybeSingle();

      if (existing) {
        toast.error('An account with this email already exists. Please sign in.');
        setLoading(false);
        return;
      }

      const code      = genCode();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min

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

  const handleOAuth = async (provider: 'google') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-gray-950">
      {/* Ambient gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950" />
        <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-blue-600 opacity-10 blur-[100px]" />
        <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full bg-violet-500 opacity-10 blur-[80px]" />
      </div>

      <div className="relative z-10 flex flex-col flex-1 overflow-y-auto px-5 pt-16 pb-10">
        <div className="flex flex-col items-center mb-10">
          <FilmonsLogo iconSize={36} theme="dark" className="mb-8" />
          <h1 className="text-2xl font-black text-white mb-1">Create your account</h1>
          <p className="text-white/40 text-sm text-center">Join the Filmons creative community</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 w-full max-w-sm mx-auto">
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
              required
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
              required
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
                placeholder="Min 8 characters"
                autoComplete="new-password"
                required
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-2xl px-4 py-3.5 pr-11 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {password.length > 0 && !pwStrong && (
              <p className="text-xs text-red-400 mt-1">At least 8 characters required</p>
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
                required
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-2xl px-4 py-3.5 pr-11 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowCf(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              >
                {showCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirm.length > 0 && password !== confirm && (
              <p className="text-xs text-red-400 mt-1">Passwords don't match</p>
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
        <div className="flex items-center gap-3 my-5 w-full max-w-sm mx-auto">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-white/25 font-semibold">OR</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Google OAuth */}
        <button
          onClick={() => handleOAuth('google')}
          className="w-full max-w-sm mx-auto flex items-center justify-center gap-3 py-3.5 rounded-2xl bg-white/10 border border-white/15 text-white text-sm font-bold hover:bg-white/15 active:scale-[0.98] transition-all"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <p className="text-center text-white/30 text-xs mt-6 max-w-xs mx-auto">
          By creating an account you agree to our{' '}
          <Link to="/terms-conditions" className="text-blue-400 hover:text-blue-300">Terms</Link>
          {' & '}
          <Link to="/privacy-policy" className="text-blue-400 hover:text-blue-300">Privacy Policy</Link>.
        </p>

        <p className="text-center text-white/35 text-sm mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-400 font-bold hover:text-blue-300">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
