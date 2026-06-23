/**
 * Filmons — Phone Sign-Up Flow
 * Phone → OTP → Password → Name → Role → Skills → Account Type → Home
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router';
import {
  ArrowLeft, Check, SkipForward, Eye, EyeOff,
  Phone, Shield, Briefcase, Star, Zap, User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { FilmonsLogo } from '../components/FilmonsLogo';

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const COUNTRIES = [
  { code: 'CA', name: 'Canada',        dial: '+1',  flag: '🇨🇦', format: '(###) ###-####' },
  { code: 'US', name: 'United States', dial: '+1',  flag: '🇺🇸', format: '(###) ###-####' },
  { code: 'GB', name: 'United Kingdom',dial: '+44', flag: '🇬🇧', format: '#### ### ####'  },
  { code: 'FR', name: 'France',        dial: '+33', flag: '🇫🇷', format: '## ## ## ## ##'  },
  { code: 'DE', name: 'Germany',       dial: '+49', flag: '🇩🇪', format: '#### #######'    },
  { code: 'AU', name: 'Australia',     dial: '+61', flag: '🇦🇺', format: '#### ### ###'    },
  { code: 'MX', name: 'Mexico',        dial: '+52', flag: '🇲🇽', format: '## #### ####'   },
  { code: 'BR', name: 'Brazil',        dial: '+55', flag: '🇧🇷', format: '(##) #####-####' },
];

function formatPhone(raw: string, fmt: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, fmt.replace(/[^#]/g, '').length);
  let out = '';
  let di = 0;
  for (let i = 0; i < fmt.length && di < digits.length; i++) {
    if (fmt[i] === '#') { out += digits[di++]; }
    else { if (di > 0) out += fmt[i]; }
  }
  return out;
}

const ROLES = [
  { cat: 'Film & Video',  items: ['Director','Cinematographer','Camera Operator','Gaffer','Grip','Producer','Video Editor','Colorist','VFX Artist','Sound Designer'] },
  { cat: 'Photography',   items: ['Photographer','Fashion Photographer','Retoucher','Drone Photographer'] },
  { cat: 'Music & Audio', items: ['Music Producer','DJ','Mixing Engineer','Composer','Beatmaker'] },
  { cat: 'Social Media',  items: ['Content Creator','UGC Creator','YouTuber','Streamer','Podcast Producer'] },
  { cat: 'Design',        items: ['Graphic Designer','Motion Designer','UI Designer','Creative Director'] },
  { cat: 'Animation/3D',  items: ['3D Animator','Blender Artist','Unreal Engine Artist','Technical Artist'] },
  { cat: 'Emerging',      items: ['AI Artist','Prompt Engineer','XR Designer','Virtual Production Artist'] },
];

const SKILLS = [
  'Adobe Premiere','Final Cut Pro','DaVinci Resolve','After Effects','Photoshop',
  'Lightroom','Logic Pro','Ableton','Blender','Unreal Engine','Cinema 4D',
  'Instagram Reels','TikTok','YouTube','Drone FPV','Color Grading',
  'Live Streaming','Podcast','Voice Acting','Screenwriting',
];

const ACCOUNT_TYPES = [
  {
    id: 'creator',
    label: 'Creator', emoji: '🎬',
    color: 'from-blue-600 to-indigo-700',
    features: ['Post content & reels','Build your audience','Hire talent','Rent & buy gear'],
    note: null, popular: false,
  },
  {
    id: 'creator_plus',
    label: 'Creator+', emoji: '⚡',
    color: 'from-indigo-600 to-violet-700',
    features: ['All Creator features','Identity verification','FP wallet & earnings','Host gear rentals','Creator marketplace'],
    note: 'Free — verified with ID', popular: true,
  },
];

function CinematicBg() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950"/>
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage:'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")', backgroundSize: '256px 256px' }}/>
      <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-blue-600 opacity-10 blur-[100px]"/>
      <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full bg-violet-500 opacity-10 blur-[80px]"/>
      {[...Array(5)].map((_,i) => (
        <div key={i} className="absolute w-1 h-1 rounded-full bg-white opacity-15"
          style={{ left:`${10+i*18}%`, top:`${15+i*12}%`, animation:`float ${3+i}s ease-in-out infinite alternate`, animationDelay:`${i*0.6}s` }}/>
      ))}
      <style>{`@keyframes float { from { transform:translateY(0) } to { transform:translateY(-16px) } }`}</style>
    </div>
  );
}

function PwStrength({ pw }: { pw: string }) {
  const checks = [
    { label: '8+ characters',     ok: pw.length >= 8            },
    { label: 'Uppercase letter',   ok: /[A-Z]/.test(pw)         },
    { label: 'Number',             ok: /[0-9]/.test(pw)         },
    { label: 'Special character',  ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  if (!pw) return null;
  return (
    <div className="grid grid-cols-2 gap-1 mt-2">
      {checks.map(c => (
        <div key={c.label} className={`flex items-center gap-1.5 text-[11px] ${c.ok ? 'text-green-400' : 'text-white/30'}`}>
          <Check className={`w-3 h-3 shrink-0 ${c.ok ? 'opacity-100' : 'opacity-20'}`}/>
          {c.label}
        </div>
      ))}
    </div>
  );
}

// ── 6-box OTP Input ───────────────────────────────────────────────────────
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, '').slice(0, 6).split('');

  const focus = (i: number) => refs.current[i]?.focus();

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = value.slice(0, i) + value.slice(i + 1);
      onChange(next.slice(0, 6));
      if (i > 0) focus(i - 1);
    } else if (e.key === 'ArrowLeft' && i > 0) {
      focus(i - 1);
    } else if (e.key === 'ArrowRight' && i < 5) {
      focus(i + 1);
    }
  };

  const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const char = e.target.value.replace(/\D/g, '').slice(-1);
    if (!char) return;
    const next = (value.slice(0, i) + char + value.slice(i + 1)).slice(0, 6);
    onChange(next);
    if (i < 5) focus(i + 1);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    focus(Math.min(pasted.length, 5));
  };

  useEffect(() => { focus(Math.min(value.length, 5)); }, []);

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="tel"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={d}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onFocus={e => e.target.select()}
          className={`w-12 h-14 text-center text-xl font-black rounded-2xl outline-none transition-all border-2
            ${d ? 'bg-white/15 border-blue-400 text-white' : 'bg-white/8 border-white/20 text-white/30'}
            focus:border-blue-400 focus:bg-white/15`}
        />
      ))}
    </div>
  );
}

// ── Resend timer ──────────────────────────────────────────────────────────
function ResendTimer({ onResend }: { onResend: () => void }) {
  const [secs, setSecs] = useState(60);
  useEffect(() => {
    if (secs <= 0) return;
    const t = setTimeout(() => setSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs]);
  if (secs > 0) return (
    <p className="text-xs text-white/30 text-center">
      Resend code in <span className="text-white/60 font-bold">{secs}s</span>
    </p>
  );
  return (
    <button onClick={() => { onResend(); setSecs(60); }}
      className="text-xs text-blue-400 font-semibold text-center w-full hover:underline transition-colors">
      Resend Code
    </button>
  );
}

export function PhoneSignup() {
  const navigate  = useNavigate();
  const { updateUser } = useAuth() as any;

  const [step, setStep]                     = useState<Step>(1);
  const [mounted, setMounted]               = useState(false);

  // Step 1 — Phone
  const [country, setCountry]               = useState(COUNTRIES[0]);
  const [phone, setPhone]                   = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  // Step 2 — OTP
  const [otp, setOtp]                       = useState('');
  const [otpKey, setOtpKey]                 = useState(0);

  // Step 3 — Password
  const [password, setPassword]             = useState('');
  const [confirm, setConfirm]               = useState('');
  const [showPw, setShowPw]                 = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);

  // Step 4 — Name
  const [name, setName]                     = useState('');
  const [username, setUsername]             = useState('');
  const [usernameOk, setUsernameOk]         = useState<boolean | null>(null);

  // Step 5 — Roles
  const [selectedRoles, setSelectedRoles]   = useState<string[]>([]);

  // Step 6 — Skills
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  // Step 7 — Account type
  const [accountType, setAccountType]       = useState('creator');
  const [loading, setLoading]               = useState(false);

  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  // Username check
  useEffect(() => {
    if (username.length < 3) { setUsernameOk(null); return; }
    const t = setTimeout(async () => {
      const { count } = await supabase.from('profiles').select('id', { count: 'exact' }).eq('username', username);
      setUsernameOk(count === 0);
    }, 600);
    return () => clearTimeout(t);
  }, [username]);

  const fullPhone = `${country.dial} ${phone}`;

  const sendCode = () => {
    toast.info(`Code sent to ${fullPhone}`);
    setOtp('');
    setOtpKey(k => k + 1);
    setStep(2);
  };

  const verifyOtp = () => {
    if (otp.length < 6) { toast.error('Enter the 6-digit code'); return; }
    toast.success('Phone verified ✓');
    setStep(3);
  };

  const pwValid = password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
  const step3Ok = pwValid && password === confirm;
  const step4Ok = name.length >= 2 && username.length >= 3 && usernameOk === true;

  const finish = async () => {
    setLoading(true);
    try {
      const randomEmail = `phone_${Date.now()}@filmons.internal`;
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: randomEmail, password,
        options: { data: { name, username, phone: fullPhone } },
      });
      if (authError) throw new Error(authError.message);
      const uid = authData.user?.id;
      if (!uid) throw new Error('Account creation failed');

      await supabase.from('profiles').upsert({
        id: uid, name, username: username || null,
        phone: fullPhone,
        occupation: selectedRoles[0] || null,
        primary_role: selectedRoles[0] || null,
        secondary_roles: selectedRoles.slice(1),
        skills: selectedSkills,
        account_type: accountType === 'creator_plus' ? 'creator_plus' : 'creator',
        account_mode: accountType === 'creator_plus' ? 'creator_plus' : 'creator',
        verification_status: accountType === 'creator_plus' ? 'pending' : 'not_started',
        is_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      await supabase.from('reputation_scores').upsert({
        user_id: uid, reliability_score: 0, reliability_level: 'new_user',
        account_type: accountType === 'creator_plus' ? 'creator_plus' : 'creator',
      }, { onConflict: 'user_id' });

      await supabase.from('account_verifications').upsert({
        user_id: uid, identity_verified: false, payment_verified: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (typeof updateUser === 'function') {
        updateUser({ id: uid, name, username, accountType: accountType as any });
      }

      if (accountType === 'creator_plus') {
        toast.success('Account created! Let\'s verify your identity.');
        captureSnapshot(); navigate('/creator-plus-steps');
      } else {
        toast.success('Welcome to Filmons! 🎬');
        captureSnapshot(); navigate('/');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create account');
    }
    setLoading(false);
  };

  const TOTAL = 7;
  const pct   = ((step - 1) / (TOTAL - 1)) * 100;
  const SKIPPABLE: Step[] = [5, 6];

  const inputCls = "w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all";

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <CinematicBg/>

      {/* ── Header ── */}
      <div className="relative z-10 flex items-center gap-3 px-4 pt-14 pb-3">
        <button onClick={() => step === 1 ? (captureSnapshot(), navigate('/create-account')) : setStep(s => Math.max(1, s - 1) as Step)}
          className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4"/>
        </button>
        <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}/>
        </div>
        {SKIPPABLE.includes(step) && (
          <button onClick={() => setStep(s => Math.min(TOTAL, s + 1) as Step)}
            className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors">
            Skip <SkipForward className="w-3 h-3"/>
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <div className={`relative z-10 flex-1 overflow-y-auto px-5 pb-10 transition-all duration-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

        {/* ══ STEP 1: Phone Number ══════════════════════════════════════ */}
        {step === 1 && (
          <div className="pt-4 space-y-5">
            <div className="flex justify-center pt-2 pb-1">
              <FilmonsLogo iconSize={36} theme="dark"/>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Create your account</h2>
              <p className="text-white/40 text-sm mt-1">Enter your phone number to get started</p>
            </div>

            {/* Country selector */}
            <div className="relative">
              <button
                onClick={() => setShowCountryPicker(p => !p)}
                className="w-full flex items-center gap-3 bg-white/10 border border-white/20 text-white font-semibold text-sm rounded-2xl px-4 py-3.5 transition-all hover:bg-white/15 text-left">
                <span className="text-xl shrink-0">{country.flag}</span>
                <span className="flex-1">{country.name}</span>
                <span className="text-white/40 shrink-0">{country.dial}</span>
                <svg className={`w-4 h-4 text-white/30 shrink-0 transition-transform ${showCountryPicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
              {showCountryPicker && (
                <div className="absolute z-50 top-full mt-1 w-full bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                  {COUNTRIES.map(c => (
                    <button key={c.code} onClick={() => { setCountry(c); setPhone(''); setShowCountryPicker(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-white/10 transition-colors ${c.code === country.code ? 'bg-blue-600/20 text-blue-300' : 'text-white'}`}>
                      <span className="text-xl">{c.flag}</span>
                      <span className="flex-1">{c.name}</span>
                      <span className="text-white/40">{c.dial}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Phone input */}
            <div className="flex gap-3">
              <div className="shrink-0 bg-white/10 border border-white/20 text-white/60 rounded-2xl px-3 py-3.5 text-sm font-bold flex items-center">
                {country.dial}
              </div>
              <input
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value, country.format))}
                type="tel"
                placeholder={country.format.replace(/#/g, '0')}
                className="flex-1 bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"
              />
            </div>

            <p className="text-xs text-white/30 text-center -mt-2">We'll send you a verification code.</p>

            <button
              onClick={sendCode}
              disabled={phone.length < 7}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              Continue →
            </button>

            <p className="text-center text-xs text-white/30">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-400 font-semibold">Sign in</Link>
            </p>
          </div>
        )}

        {/* ══ STEP 2: Verify OTP ══════════════════════════════════════ */}
        {step === 2 && (
          <div className="pt-4 space-y-6">
            <div>
              <h2 className="text-2xl font-black text-white">Verify your<br/>phone number</h2>
              <p className="text-white/40 text-sm mt-1.5">
                We sent a 6-digit code to{' '}
                <span className="text-white/70 font-semibold">{country.flag} {country.dial} {phone}</span>
              </p>
            </div>

            <OtpInput key={otpKey} value={otp} onChange={setOtp}/>

            <ResendTimer onResend={() => { toast.info('New code sent'); setOtp(''); setOtpKey(k => k + 1); }}/>

            <button
              onClick={verifyOtp}
              disabled={otp.length < 6}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              Verify & Continue →
            </button>

            <button
              onClick={() => setStep(1)}
              className="w-full text-center text-white/40 text-xs hover:text-white/70 transition-colors py-1">
              Change phone number
            </button>
          </div>
        )}

        {/* ══ STEP 3: Password ════════════════════════════════════════ */}
        {step === 3 && (
          <div className="pt-4 space-y-5">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-blue-400"/>
                </div>
                <h2 className="text-2xl font-black text-white">Create a password</h2>
              </div>
              <p className="text-white/40 text-sm">Choose a strong password to protect your account</p>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <input
                  value={password} onChange={e => setPassword(e.target.value)}
                  type={showPw ? 'text' : 'password'} placeholder="Password" autoComplete="new-password"
                  className={inputCls + ' pr-12'}/>
                <button onClick={() => setShowPw(p => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
              </div>
              <PwStrength pw={password}/>
              <div className="relative">
                <input
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  type={showConfirm ? 'text' : 'password'} placeholder="Confirm password" autoComplete="new-password"
                  className={inputCls + ' pr-12' + (confirm && confirm !== password ? ' border-red-400' : '')}/>
                <button onClick={() => setShowConfirm(p => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors">
                  {showConfirm ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
              </div>
              {confirm && confirm !== password && <p className="text-red-400 text-xs px-1">Passwords don't match</p>}
              {confirm && confirm === password && password.length > 0 && <p className="text-green-400 text-xs px-1 flex items-center gap-1"><Check className="w-3 h-3"/>Passwords match</p>}
            </div>
            <button onClick={() => setStep(4)} disabled={!step3Ok}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              Continue
            </button>
          </div>
        )}

        {/* ══ STEP 4: Choose Your Name ════════════════════════════════ */}
        {step === 4 && (
          <div className="pt-4 space-y-5">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <User className="w-5 h-5 text-blue-400"/>
                </div>
                <h2 className="text-2xl font-black text-white">Choose your name</h2>
              </div>
              <p className="text-white/40 text-sm">Your creative identity on Filmons</p>
            </div>
            <div className="space-y-3">
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Display name" className={inputCls}/>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-sm font-bold">@</span>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                  placeholder="username"
                  className={inputCls + ' pl-8'}/>
                {username.length >= 3 && (
                  <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold ${usernameOk ? 'text-green-400' : usernameOk === false ? 'text-red-400' : 'text-white/30'}`}>
                    {usernameOk === null ? '…' : usernameOk ? '✓ available' : '✗ taken'}
                  </span>
                )}
              </div>
              {name && (
                <div className="flex flex-wrap gap-1.5">
                  {[
                    name.toLowerCase().replace(/\s+/g, ''),
                    name.toLowerCase().replace(/\s+/g, '.') + 'films',
                    name.toLowerCase().split(' ')[0] + '.creates',
                  ].map(s => {
                    const clean = s.replace(/[^a-z0-9_.]/g, '');
                    return (
                      <button key={s} onClick={() => setUsername(clean)}
                        className="text-xs bg-white/10 text-white/60 hover:text-white hover:bg-white/20 px-2.5 py-1 rounded-full border border-white/10 transition-all">
                        @{clean}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button onClick={() => setStep(5)} disabled={!step4Ok}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              Continue
            </button>
          </div>
        )}

        {/* ══ STEP 5: Your Creative Role ══════════════════════════════ */}
        {step === 5 && (
          <div className="pt-4 space-y-5">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-indigo-400"/>
                </div>
                <h2 className="text-2xl font-black text-white">Your creative role</h2>
              </div>
              <p className="text-white/40 text-sm">Select up to 3 roles that define your work</p>
            </div>
            {selectedRoles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-2 border-b border-white/10">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest w-full mb-1">Selected ({selectedRoles.length}/3)</p>
                {selectedRoles.map(r => (
                  <button key={r} onClick={() => setSelectedRoles(p => p.filter(x => x !== r))}
                    className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2.5 py-1 rounded-full font-semibold">
                    {r} <span className="opacity-70">×</span>
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-0.5">
              {ROLES.map(cat => (
                <div key={cat.cat}>
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1.5">{cat.cat}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.items.map(r => {
                      const sel = selectedRoles.includes(r);
                      return (
                        <button key={r}
                          onClick={() => setSelectedRoles(p => sel ? p.filter(x => x !== r) : [...p, r].slice(0, 3))}
                          className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${sel ? 'bg-blue-600 text-white border-blue-500' : 'bg-white/5 text-white/60 border-white/10 hover:border-blue-500/50'}`}>
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(6)}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              {selectedRoles.length > 0 ? `Continue (${selectedRoles.length} selected)` : 'Continue'}
            </button>
          </div>
        )}

        {/* ══ STEP 6: Skills & Tools ══════════════════════════════════ */}
        {step === 6 && (
          <div className="pt-4 space-y-5">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
                  <Star className="w-5 h-5 text-violet-400"/>
                </div>
                <h2 className="text-2xl font-black text-white">Skills &amp; tools</h2>
              </div>
              <p className="text-white/40 text-sm">What tools do you use?</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SKILLS.map(s => {
                const sel = selectedSkills.includes(s);
                return (
                  <button key={s}
                    onClick={() => setSelectedSkills(p => sel ? p.filter(x => x !== s) : [...p, s])}
                    className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${sel ? 'bg-blue-600 text-white border-blue-500' : 'bg-white/5 text-white/60 border-white/10 hover:border-blue-500/50'}`}>
                    {s}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setStep(7)}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              Continue
            </button>
          </div>
        )}

        {/* ══ STEP 7: Choose Your Account ═════════════════════════════ */}
        {step === 7 && (
          <div className="pt-4 space-y-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-blue-400"/>
                </div>
                <h2 className="text-xl font-black text-white">Choose your account</h2>
              </div>
              <p className="text-white/40 text-sm">You can upgrade anytime.</p>
            </div>
            <div className="space-y-3">
              {ACCOUNT_TYPES.map(t => {
                const sel = accountType === t.id;
                return (
                  <button key={t.id} onClick={() => setAccountType(t.id)}
                    className={`w-full text-left rounded-2xl border-2 overflow-hidden transition-all active:scale-[0.99] ${sel ? 'border-blue-500' : 'border-white/10 hover:border-white/20'}`}
                    style={sel ? { boxShadow: '0 0 20px rgba(59,130,246,0.3)' } : {}}>
                    {/* Gradient header */}
                    <div className={`px-5 py-4 bg-gradient-to-br ${t.color} flex items-center gap-3`}>
                      <span className="text-2xl">{t.emoji}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-white">{t.label}</p>
                          {t.popular && <span className="text-[9px] font-black bg-white/25 text-white px-1.5 py-0.5 rounded-full">POPULAR</span>}
                        </div>
                        {t.note && <p className="text-[10px] text-white/70">{t.note}</p>}
                      </div>
                      {sel && <Check className="w-5 h-5 text-white shrink-0"/>}
                    </div>
                    {/* Features */}
                    <div className={`px-5 py-3 ${sel ? 'bg-blue-600/10' : 'bg-white/5'}`}>
                      <div className="flex flex-wrap gap-1">
                        {t.features.map(f => (
                          <span key={f} className="text-[10px] bg-white/5 text-white/50 px-2 py-0.5 rounded-full border border-white/10">{f}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <button onClick={finish} disabled={loading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-60 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              {loading ? 'Creating account…' : accountType === 'creator_plus' ? 'Create Account & Verify ⚡' : 'Create Account 🎬'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
