/**
 * Filmons — Sign In Flow
 * Splash → Method → Email Login → Security Check (new device) → Home
 */
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { Eye, EyeOff, ArrowLeft, Mail, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { FilmonsLogo } from '../components/FilmonsLogo';

type Screen = 'splash' | 'method' | 'email' | 'security';

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
      <style>{`@keyframes float { from { transform: translateY(0px); } to { transform: translateY(-20px); } }`}</style>
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
function OAuthBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 active:scale-[0.98] border font-semibold text-sm rounded-2xl px-4 py-3.5 transition-all backdrop-blur-sm bg-white hover:bg-gray-50 border-white/80 text-gray-800 shadow-sm">
      <span className="w-5 h-5 shrink-0 flex items-center justify-center">
        <GoogleLogo size={20}/>
      </span>
      <span className="flex-1 text-left">Continue with Google</span>
    </button>
  );
}

export function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth() as any;

  const [screen, setScreen] = useState<Screen>('splash');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading,  setLoading]  = useState(false);
  const [otp,      setOtp]      = useState('');
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => { setTimeout(() => setMounted(true), 100); }, []);
  useEffect(() => { if (isAuthenticated) { captureSnapshot(); navigate('/'); } }, [isAuthenticated]);

  // Auto-advance splash after 2s
  useEffect(() => {
    if (screen === 'splash') {
      const t = setTimeout(() => setScreen('method'), 2200);
      return () => clearTimeout(t);
    }
  }, [screen]);

  const goBack = () => {
    if (screen === 'email')    setScreen('method');
    else if (screen === 'security') setScreen('email');
    else { captureSnapshot(); navigate(-1); }
  };

  const handleEmailLogin = async () => {
    if (!email || !password) { toast.error('Enter your email and password'); return; }
    setLoading(true);
    try {
      await login(email, password);
      captureSnapshot(); navigate('/');
    } catch (e: any) {
      const msg: string = e?.message || 'Incorrect email or password';
      if (msg.includes('confirm') || msg.includes('Confirm')) {
        toast.error(msg, { duration: 6000, description: 'Check your inbox and click the confirmation link, then try again.' });
      } else {
        toast.error(msg);
      }
    }
    setLoading(false);
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(error.message);
  };

  // ── SPLASH ──────────────────────────────────────────────────────────────
  if (screen === 'splash') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden">
        <CinematicBg/>
        <div className={`relative z-10 flex flex-col items-center gap-4 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <FilmonsLogo iconSize={48} theme="dark"/>
          <p className="text-white/60 text-sm font-medium tracking-[0.2em] uppercase mt-2">
            Create. Connect. Film.
          </p>
        </div>
      </div>
    );
  }

  // ── METHOD SELECTOR ──────────────────────────────────────────────────────
  if (screen === 'method') {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden">
        <CinematicBg/>
        <div className="relative z-10 flex flex-col h-full px-5 py-safe">
          {/* Logo top */}
          <div className="flex justify-center pt-16 pb-10">
            <FilmonsLogo iconSize={32} theme="dark"/>
          </div>
          {/* Headline */}
          <div className="text-center mb-8">
            <p className="text-2xl font-black text-white">Welcome back</p>
            <p className="text-white/50 text-sm mt-1">Sign in to your Filmons account</p>
          </div>
          {/* Methods */}
          <div className="space-y-3">
            <OAuthBtn onClick={() => handleOAuth('google')}/>
            <button onClick={() => setScreen('email')}
              className="w-full flex items-center gap-3 bg-white text-gray-900 font-semibold text-sm rounded-2xl px-4 py-3.5 hover:bg-gray-100 active:scale-[0.98] transition-all">
              <Mail className="w-5 h-5 text-gray-500 shrink-0"/>
              <span className="flex-1 text-left">Continue with Email</span>
            </button>
            <button onClick={() => { captureSnapshot(); navigate('/phone-login'); }}
              className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-sm rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-all">
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
          <button onClick={() => { captureSnapshot(); navigate('/'); }}
            className="text-white/30 text-xs font-medium text-center mt-4 hover:text-white/60 transition-colors">
            Continue as Guest
          </button>
        </div>
      </div>
    );
  }

  // ── EMAIL LOGIN ──────────────────────────────────────────────────────────
  if (screen === 'email') {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden">
        <CinematicBg/>
        <div className="relative z-10 flex flex-col h-full px-5">
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
              <input value={email} onChange={e => setEmail(e.target.value)}
                type="email" placeholder="Email address" autoComplete="email"
                onKeyDown={e => e.key === 'Enter' && handleEmailLogin()}
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"/>
            </div>
            {/* Password */}
            <div className="relative">
              <input value={password} onChange={e => setPassword(e.target.value)}
                type={showPw ? 'text' : 'password'} placeholder="Password" autoComplete="current-password"
                onKeyDown={e => e.key === 'Enter' && handleEmailLogin()}
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl px-4 py-3.5 pr-12 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"/>
              <button onClick={() => setShowPw(p => !p)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors">
                {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </button>
            </div>
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
            className="mt-5 w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl transition-all active:scale-[0.98] disabled:opacity-60 shadow-lg shadow-blue-900/30">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/10"/>
            <p className="text-white/30 text-xs">or</p>
            <div className="flex-1 h-px bg-white/10"/>
          </div>
          <div className="space-y-2.5">
            <OAuthBtn onClick={() => handleOAuth('google')}/>
          </div>
          <p className="text-center text-xs text-white/30 mt-6">
            Don't have an account?{' '}
            <Link to="/create-account" className="text-blue-400 font-semibold hover:underline">Create one</Link>
          </p>
        </div>
      </div>
    );
  }

  // ── SECURITY / OTP ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <CinematicBg/>
      <div className="relative z-10 flex flex-col h-full px-5">
        <button onClick={goBack} className="flex items-center gap-2 text-white/60 pt-14 pb-6 w-fit hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4"/> Back
        </button>
        <div className="mb-6">
          <p className="text-2xl font-black text-white">Security Check</p>
          <p className="text-white/50 text-sm mt-1">We sent a 6-digit code to <span className="text-white/80">{email}</span></p>
        </div>
        <input value={otp} onChange={e => setOtp(e.target.value.slice(0,6))}
          type="tel" placeholder="000000" maxLength={6}
          className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl px-4 py-4 text-2xl font-black text-center tracking-[0.4em] outline-none focus:border-blue-400 focus:bg-white/15 transition-all"/>
        <button onClick={() => { if (otp.length === 6) { captureSnapshot(); navigate('/'); } else { toast.error('Enter the 6-digit code'); } }}
          className="mt-4 w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl hover:bg-blue-700 transition-all active:scale-[0.98]">
          Verify &amp; Sign In
        </button>
        <button className="text-white/40 text-xs text-center mt-4 hover:text-white/70 transition-colors">
          Resend code
        </button>
      </div>
    </div>
  );
}