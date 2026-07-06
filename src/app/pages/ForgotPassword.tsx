/**
 * Filmons — Forgot Password
 * Flow: Email → EmailJS OTP verify identity → Supabase magic link OTP → New password → Done
 *
 * No Supabase recovery email needed.
 * EmailJS OTP verifies the user owns the email.
 * Supabase signInWithOtp creates a real session.
 * supabase.auth.updateUser() sets the new password.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router';
import { ArrowLeft, Eye, EyeOff, Check, ShieldCheck, Monitor, CheckCircle2 } from 'lucide-react';
import { captureSnapshot } from '../lib/smartAnimate';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { EMAILJS_CONFIG, sendEmail } from '../lib/emailjs-config';
import { toast } from 'sonner';
import { FilmonsLogo } from '../components/FilmonsLogo';

type Step = 'email' | 'otp' | 'password' | 'sessions' | 'done';

const PW_RULES = [
  { label: '8+ characters',    test: (p: string) => p.length >= 8 },
  { label: 'Uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Number',           test: (p: string) => /[0-9]/.test(p) },
  { label: 'Special char',     test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function Bg() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-blue-950"/>
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage:'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundSize:'256px 256px' }}/>
      <div className="absolute top-1/4 left-1/3 w-80 h-80 rounded-full bg-blue-600 opacity-[0.08] blur-[120px]"/>
    </div>
  );
}

function mask(email: string) {
  const [l, d] = email.split('@');
  return `${l.slice(0,2)}${'*'.repeat(Math.max(0, l.length-2))}@${d}`;
}

export function ForgotPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth() as any;

  const prefillEmail = searchParams.get('email') ?? '';

  const [step,     setStep]     = useState<Step>('email');
  const [email,    setEmail]    = useState(prefillEmail);
  const [otp,      setOtp]      = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [signOutAll, setSignOutAll] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const pwValid = PW_RULES.every(r => r.test(password));
  const score   = PW_RULES.filter(r => r.test(password)).length;
  const swColor = ['','#ef4444','#f59e0b','#22c55e','#3b82f6'][score];

  const countdown = () => {
    setResendIn(30);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() =>
      setResendIn(n => { if (n <= 1) { clearInterval(timerRef.current); return 0; } return n - 1; }), 1000);
  };
  useEffect(() => () => clearInterval(timerRef.current), []);

  const ic = "w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all";

  // ── 1. Send EmailJS OTP ─────────────────────────────────────────────────
  const sendCode = async () => {
    if (!email.includes('@')) { setError('Enter a valid email address'); return; }
    setLoading(true); setError('');
    try {
      const { data: profile } = await supabase.from('profiles').select('id,name').eq('email', email.toLowerCase()).maybeSingle();
      if (!profile) { setError('No account found with this email'); setLoading(false); return; }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      sessionStorage.setItem('fm_fp_code',    code);
      sessionStorage.setItem('fm_fp_email',   email.toLowerCase());
      sessionStorage.setItem('fm_fp_expires', String(Date.now() + 10 * 60 * 1000));

      await sendEmail(EMAILJS_CONFIG.templates.emailVerification, {
        to_email: email, to_name: profile.name || email.split('@')[0],
        verification_code: code, user_email: email,
        expires_in: '10 minutes', subject: 'Reset your Filmons password',
      });

      setStep('otp');
      countdown();
      toast.success('Recovery code sent to ' + email);
    } catch (e: any) {
      setError(e?.message || 'Failed to send code');
    }
    setLoading(false);
  };

  // ── 2. Verify EmailJS OTP → then use Supabase magic link to get session ─
  const verifyOtp = async () => {
    setError('');
    const stored  = sessionStorage.getItem('fm_fp_code');
    const storedE = sessionStorage.getItem('fm_fp_email');
    const exp     = Number(sessionStorage.getItem('fm_fp_expires') || 0);

    if (Date.now() > exp)              { setError('Code expired — request a new one'); return; }
    if (storedE !== email.toLowerCase()) { setError('Email mismatch'); return; }
    if (otp !== stored)                { setError('Incorrect code — try again'); return; }

    setLoading(true);
    try {
      // Identity verified via EmailJS OTP.
      // Now request a Supabase magic-link OTP to establish a real auth session.
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase(),
        options: { shouldCreateUser: false },
      });
      if (otpErr) throw new Error(otpErr.message);

      // Store email for the Supabase OTP verification step
      sessionStorage.setItem('fm_fp_supabase_email', email.toLowerCase());
      // Move straight to password step — we'll verify the Supabase OTP there
      // using the code Supabase sends (or reuse our verified identity to skip)
      setStep('password');
    } catch (e: any) {
      // If Supabase OTP fails (e.g. email provider issues), still allow reset
      // by storing verified state and using a server-side update
      sessionStorage.setItem('fm_fp_verified', '1');
      setStep('password');
    }
    setLoading(false);
  };

  const resend = async () => { if (resendIn > 0) return; setOtp(''); setError(''); await sendCode(); };

  // ── 3. Set new password via SECURITY DEFINER RPC ───────────────────────
  const updatePw = async () => {
    if (!pwValid)             { setError('Password does not meet requirements'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    try {
      // Call the reset_user_password RPC (SECURITY DEFINER — runs as superuser)
      // Identity already verified via EmailJS OTP above
      const { data, error: rpcError } = await supabase.rpc('reset_user_password', {
        p_email:    email.toLowerCase(),
        p_password: password,
      });

      if (rpcError) throw new Error(rpcError.message);
      if (!data?.success) throw new Error(data?.error || 'Password update failed');

      cleanup();
      setStep('sessions');
    } catch (e: any) {
      setError(e?.message || 'Password update failed — please try again');
    }
    setLoading(false);
  };

  const cleanup = () => {
    ['fm_fp_code','fm_fp_email','fm_fp_expires','fm_fp_supabase_email','fm_fp_verified'].forEach(k => sessionStorage.removeItem(k));
  };

  // ── 4. Sessions + auto sign-in ──────────────────────────────────────────
  const finish = async () => {
    setLoading(true);
    try {
      if (signOutAll) await supabase.auth.signOut({ scope: 'global' });
      await login(email, password);
      setStep('done');
      setTimeout(() => { captureSnapshot(); navigate('/'); }, 2000);
    } catch {
      setStep('done');
      setTimeout(() => { captureSnapshot(); navigate('/login'); }, 2000);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <Bg/>
      {step !== 'done' && (
        <div className="relative z-10 pt-14 px-5 flex items-center justify-between">
          <button onClick={() => {
            if (step === 'otp')           setStep('email');
            else if (step === 'password') setStep('otp');
            else if (step === 'sessions') setStep('password');
            else { captureSnapshot(); navigate('/login'); }
          }} className="flex items-center gap-2 text-white/50 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4"/> Back
          </button>
          <FilmonsLogo iconSize={20} theme="dark"/>
        </div>
      )}

      <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-12">

        {/* ── EMAIL ── */}
        {step === 'email' && (
          <div className="pt-6 space-y-5">
            <div>
              <h1 className="text-2xl font-black text-white">Forgot your password?</h1>
              <p className="text-white/50 text-sm mt-1.5">Enter your email to recover your account.</p>
            </div>
            <input value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
              type="email" placeholder="Email address" autoFocus
              onKeyDown={e => e.key === 'Enter' && sendCode()}
              className={ic}/>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button onClick={sendCode} disabled={loading || !email.includes('@')}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              {loading ? 'Sending…' : 'Send Recovery Code'}
            </button>
            <p className="text-center text-xs text-white/30">
              Remember it? <Link to="/login" className="text-blue-400 font-semibold">Sign in</Link>
            </p>
          </div>
        )}

        {/* ── OTP ── */}
        {step === 'otp' && (
          <div className="pt-6 space-y-5">
            <div>
              <h1 className="text-2xl font-black text-white">Enter recovery code</h1>
              <p className="text-white/50 text-sm mt-1.5">
                6-digit code sent to <span className="text-white/80 font-semibold">{mask(email)}</span>
              </p>
            </div>
            <input value={otp}
              onChange={e => { setOtp(e.target.value.replace(/\D/g,'').slice(0,6)); setError(''); }}
              type="tel" placeholder="000000" maxLength={6} autoFocus
              onPaste={e => { setOtp(e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6)); e.preventDefault(); }}
              className="w-full bg-white/10 border border-white/20 text-white placeholder-white/20 rounded-2xl px-4 py-5 text-3xl font-black text-center tracking-[0.6em] outline-none focus:border-blue-400 focus:bg-white/15 transition-all"/>
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <button onClick={verifyOtp} disabled={otp.length < 6 || loading}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              {loading ? 'Verifying…' : 'Verify Code'}
            </button>
            <button onClick={resend} disabled={resendIn > 0}
              className="w-full text-center text-xs py-1 font-semibold transition-colors"
              style={{ color: resendIn > 0 ? 'rgba(255,255,255,0.2)' : '#60a5fa' }}>
              {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
          </div>
        )}

        {/* ── NEW PASSWORD ── */}
        {step === 'password' && (
          <div className="pt-6 space-y-4">
            <div>
              <h1 className="text-2xl font-black text-white">Create new password</h1>
              <p className="text-white/50 text-sm mt-1.5">Identity verified — choose a strong password.</p>
            </div>
            <div className="relative">
              <input value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                type={showPw ? 'text' : 'password'} placeholder="New password" autoFocus
                className={ic + ' pr-12'}/>
              <button onClick={() => setShowPw(p => !p)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </button>
            </div>
            {password.length > 0 && (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {[1,2,3,4].map(i => <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
                    style={{ background: score >= i ? swColor : 'rgba(255,255,255,0.1)' }}/>)}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {PW_RULES.map(r => <div key={r.label}
                    className={`flex items-center gap-1.5 text-[11px] ${r.test(password)?'text-green-400':'text-white/25'}`}>
                    <Check className="w-2.5 h-2.5 shrink-0"/> {r.label}</div>)}
                </div>
              </div>
            )}
            <input value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }}
              type="password" placeholder="Confirm new password"
              className={ic + (confirm && confirm !== password ? ' border-red-500' : '')}/>
            {confirm && confirm !== password && <p className="text-red-400 text-xs">Passwords don't match</p>}
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button onClick={updatePw} disabled={!pwValid || password !== confirm || loading}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              {loading ? 'Updating…' : 'Set New Password'}
            </button>
          </div>
        )}

        {/* ── SESSIONS ── */}
        {step === 'sessions' && (
          <div className="pt-6 space-y-5">
            <div>
              <h1 className="text-2xl font-black text-white">Almost done</h1>
              <p className="text-white/50 text-sm mt-1.5">Sign out of other devices for security?</p>
            </div>
            <div className="space-y-2">
              {[
                { v: true,  Icon: ShieldCheck, iconBg: 'bg-blue-500/15',  iconColor: 'text-blue-400',  label: 'Sign out all other devices',    sub: 'Recommended — revokes all active sessions' },
                { v: false, Icon: Monitor,     iconBg: 'bg-white/[0.06]', iconColor: 'text-white/50',  label: 'Keep trusted devices signed in', sub: 'Only this device uses the new password'    },
              ].map(o => (
                <button key={String(o.v)} onClick={() => setSignOutAll(o.v)}
                  className={`w-full flex items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-all active:scale-[0.99] ${
                    signOutAll === o.v ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                  <div className={`w-10 h-10 rounded-xl ${o.iconBg} flex items-center justify-center shrink-0`}>
                    <o.Icon className={`w-5 h-5 ${o.iconColor}`} strokeWidth={1.75}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{o.label}</p>
                    <p className="text-xs text-white/40 mt-0.5">{o.sub}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                    signOutAll === o.v ? 'border-blue-400 bg-blue-400' : 'border-white/20'}`}>
                    {signOutAll === o.v && <Check className="w-3 h-3 text-white"/>}
                  </div>
                </button>
              ))}
            </div>
            <button onClick={finish} disabled={loading}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-60 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              {loading ? 'Signing in…' : 'Continue'}
            </button>
          </div>
        )}

        {/* ── DONE ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-4 px-4">
            <style>{`
              @keyframes fp-pop   { 0%{transform:scale(0.5);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
              @keyframes fp-check { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
              @keyframes fp-ring  { 0%{transform:scale(0.8);opacity:0} 100%{transform:scale(1.6);opacity:0} }
              @keyframes fp-dot   { 0%,100%{transform:scale(0.7);opacity:0.3} 50%{transform:scale(1.2);opacity:1} }
            `}</style>

            {/* Animated check circle */}
            <div className="relative flex items-center justify-center" style={{ animation: 'fp-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
              {/* Ripple ring */}
              <div className="absolute w-24 h-24 rounded-full border-2 border-blue-400/50"
                style={{ animation: 'fp-ring 1s ease-out 0.3s infinite' }}/>
              {/* Circle bg */}
              <div className="w-20 h-20 rounded-full bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <polyline points="8,21 16,29 32,13" stroke="#60a5fa" strokeWidth="3.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray="40" strokeDashoffset="40"
                    style={{ animation: 'fp-check 0.4s ease 0.35s forwards' }}/>
                </svg>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-2xl font-black text-white tracking-tight">Password updated!</p>
              <p className="text-white/50 text-sm">Signing you in to Filmons…</p>
            </div>

            {/* Bouncing dots */}
            <div className="flex gap-2 pt-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-blue-500"
                  style={{ animation: 'fp-dot 1s ease infinite', animationDelay: `${i * 0.2}s` }}/>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}