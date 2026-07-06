/**
 * SignupPhone — phone-number account creation.
 * Route: /signup/phone
 *
 * Step 1 — Full Name + Phone number (CA/US only)
 *   • Checks for existing phone in profiles → /phone-already-exists
 *   • Sends OTP via edge function
 * Step 2 — SMS OTP verification
 *   • Verifies OTP
 *   • Upserts profiles row (name, phone, phone_verified=true, onboarding_completed=false)
 *   • Brief success animation → /onboarding
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router';
import { ArrowLeft, Smartphone, Check } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { FilmonsLogo } from '../components/FilmonsLogo';
import { supabase } from '../../lib/supabase';

// ── Shared helpers ────────────────────────────────────────────────────────────

const COUNTRIES = [
  { code: 'CA', name: 'Canada',        dial: '+1', flag: '🇨🇦', format: '(###) ###-####' },
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸', format: '(###) ###-####' },
];

function formatPhone(raw: string, fmt: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, fmt.replace(/[^#]/g, '').length);
  let out = '';
  let di  = 0;
  for (let i = 0; i < fmt.length && di < digits.length; i++) {
    if (fmt[i] === '#') { out += digits[di++]; }
    else { if (di > 0) out += fmt[i]; }
  }
  return out;
}

function phoneDigits(formatted: string) {
  return formatted.replace(/\D/g, '');
}

// ── Background ────────────────────────────────────────────────────────────────

function CinematicBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950"/>
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
        backgroundSize: '256px 256px',
      }}/>
      <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-blue-600 opacity-10 blur-[100px]"/>
      <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full bg-violet-500 opacity-10 blur-[80px]"/>
    </div>
  );
}

// ── OTP input ─────────────────────────────────────────────────────────────────

function OtpInput({ value, onChange, hasError }: {
  value: string;
  onChange: (v: string) => void;
  hasError: boolean;
}) {
  const refs   = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, '').slice(0, 6).split('');
  const focus  = (i: number) => refs.current[i]?.focus();

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = value.slice(0, i) + value.slice(i + 1);
      onChange(next.slice(0, 6));
      if (i > 0) focus(i - 1);
    } else if (e.key === 'ArrowLeft'  && i > 0) focus(i - 1);
    else if   (e.key === 'ArrowRight' && i < 5) focus(i + 1);
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

  useEffect(() => { focus(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          aria-label={`Digit ${i + 1} of 6`}
          className={`w-12 h-14 text-center text-xl font-black rounded-2xl outline-none transition-all border-2 ${
            hasError
              ? 'bg-red-500/10 border-red-500/60 text-red-300'
              : d
                ? 'bg-white/15 border-blue-400 text-white'
                : 'bg-white/8 border-white/20 text-white/30'
          } focus:border-blue-400 focus:bg-white/15`}
        />
      ))}
    </div>
  );
}

// ── Resend timer ──────────────────────────────────────────────────────────────

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
    <button
      onClick={() => { onResend(); setSecs(60); }}
      className="text-sm text-blue-400 font-semibold text-center w-full hover:text-blue-300 transition-colors min-h-[44px]"
    >
      Resend Code
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Step = 'form' | 'otp' | 'success';

const ic = 'w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all';

export function SignupPhone() {
  const navigate = useNavigate();
  const { updateUser } = useAuth() as any;

  const [step,    setStep]    = useState<Step>('form');
  const [mounted, setMounted] = useState(false);

  // Step 1 fields
  const [fullName,           setFullName]           = useState('');
  const [country,            setCountry]            = useState(COUNTRIES[0]);
  const [phone,              setPhone]              = useState('');
  const [showCountryPicker,  setShowCountryPicker]  = useState(false);
  const [nameError,          setNameError]          = useState('');
  const [phoneError,         setPhoneError]         = useState('');

  // Step 2 fields
  const [otp,        setOtp]        = useState('');
  const [otpKey,     setOtpKey]     = useState(0);
  const [otpError,   setOtpError]   = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  const digits   = phoneDigits(phone);
  const fullE164 = `${country.dial}${digits}`;
  const isPhoneComplete = digits.length === 10;

  const canSend = fullName.trim().length >= 2 && isPhoneComplete && !loading;

  // ── Step 1: send OTP ───────────────────────────────────────────────────────
  const handleSend = async () => {
    setNameError('');
    setPhoneError('');

    if (fullName.trim().length < 2) {
      setNameError('Please enter your full name.');
      return;
    }
    if (!isPhoneComplete) {
      setPhoneError('Enter a valid Canadian or United States phone number.');
      return;
    }

    setLoading(true);
    try {
      // Check for existing phone number in profiles (direct query — no edge fn roundtrip)
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', fullE164)
        .maybeSingle();

      if (existing) {
        const params = new URLSearchParams({ phone, dial: country.dial, flag: country.flag });
        navigate(`/phone-already-exists?${params.toString()}`);
        return;
      }

      // Send OTP via edge function
      await authApi.sendPhoneOTP(fullE164);
      toast.success(`Code sent to ${country.flag} ${country.dial} ${phone}`);
      setOtp('');
      setOtpKey(k => k + 1);
      setStep('otp');
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('already registered')) {
        const params = new URLSearchParams({ phone, dial: country.dial, flag: country.flag });
        navigate(`/phone-already-exists?${params.toString()}`);
      } else {
        setPhoneError(msg || 'Failed to send verification code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: verify OTP → create profile → onboarding ──────────────────────
  const handleVerify = async () => {
    if (otp.length !== 6) { setOtpError('Enter the 6-digit code.'); return; }
    setOtpError('');
    setLoading(true);
    try {
      // Verify OTP and create the Filmons user via edge function
      const user = await authApi.completePhoneSignup(fullE164, otp, fullName.trim());

      // Ensure the profiles row has the correct phone-signup fields
      if (user?.id) {
        await supabase.from('profiles').upsert({
          id:                       user.id,
          name:                     fullName.trim(),
          phone:                    fullE164,
          phone_verified:           true,
          onboarding_completed:     false,
          profile_setup_percentage: 0,
          updated_at:               new Date().toISOString(),
        }, { onConflict: 'id' });
      }

      // Update auth context — mark phone verified, onboarding not yet done
      updateUser({ ...user, phoneVerified: true, profileSetupCompleted: false });

      setStep('success');
      // Brief success animation then redirect to onboarding
      setTimeout(() => navigate('/onboarding', { replace: true }), 1400);

    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg.toLowerCase().includes('expired')) {
        setOtpError('This verification code has expired. Request a new one.');
      } else if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('incorrect') || msg.toLowerCase().includes('wrong')) {
        setOtpError('The verification code is incorrect. Please try again.');
      } else {
        setOtpError(msg || 'Verification failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    try {
      await authApi.sendPhoneOTP(fullE164);
      setOtp('');
      setOtpKey(k => k + 1);
      setOtpError('');
      toast.success('New code sent!');
    } catch {
      toast.error('Failed to resend code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden">
        <CinematicBg/>
        <div className="relative z-10 flex flex-col items-center justify-center h-full gap-5 px-6 text-center">
          <style>{`
            @keyframes sp-pop { 0%{transform:scale(0.5);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
            @keyframes sp-check { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
            @keyframes sp-ring { 0%{transform:scale(0.8);opacity:0} 100%{transform:scale(1.6);opacity:0} }
            @keyframes sp-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
          `}</style>
          <div className="relative flex items-center justify-center"
            style={{ animation: 'sp-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
            <div className="absolute w-24 h-24 rounded-full border-2 border-blue-400/40"
              style={{ animation: 'sp-ring 1.2s ease-out 0.3s infinite' }}/>
            <div className="w-20 h-20 rounded-full bg-green-600/20 border-2 border-green-500 flex items-center justify-center">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <polyline points="8,21 16,29 32,13" stroke="#4ade80" strokeWidth="3.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="40" strokeDashoffset="40"
                  style={{ animation: 'sp-check 0.4s ease 0.35s forwards' }}/>
              </svg>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-2xl font-black text-white">Phone number verified</p>
            <p className="text-white/50 text-sm">Setting up your profile…</p>
          </div>
          <div className="flex gap-2">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-blue-500"
                style={{ animation: `sp-bounce 1s ease infinite`, animationDelay: `${i * 0.2}s` }}/>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <CinematicBg/>

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-4 pt-14 pb-3">
        <button
          onClick={() => step === 'otp' ? setStep('form') : navigate('/create-account')}
          aria-label="Go back"
          className="w-9 h-9 flex items-center justify-center text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4"/>
        </button>
        {/* Progress bar */}
        <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: step === 'form' ? '50%' : '100%' }}
          />
        </div>
        <span className="text-[10px] text-white/25 font-bold w-10 text-right">
          {step === 'form' ? '1 / 2' : '2 / 2'}
        </span>
      </div>

      {/* Scrollable body */}
      <div className={`relative z-10 flex-1 overflow-y-auto px-5 pb-12 transition-all duration-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

        {/* ── STEP 1: Name + Phone ──────────────────────────────────────────── */}
        {step === 'form' && (
          <div className="pt-4 space-y-5 max-w-sm mx-auto">
            <div className="flex justify-center py-2">
              <FilmonsLogo iconSize={32} theme="dark"/>
            </div>

            <div>
              <h1 className="text-2xl font-black text-white">Create your account with phone</h1>
              <p className="text-white/45 text-sm mt-1.5">
                Enter your name and phone number. We'll send you a verification code.
              </p>
            </div>

            {/* Full Name */}
            <div>
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => { setFullName(e.target.value); setNameError(''); }}
                placeholder="Your full name"
                autoComplete="name"
                className={`${ic}${nameError ? ' border-red-500/70' : ''}`}
              />
              {nameError && <p className="text-red-400 text-xs mt-1.5 px-1" role="alert">{nameError}</p>}
            </div>

            {/* Country selector */}
            <div>
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">
                Country
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCountryPicker(p => !p)}
                  aria-expanded={showCountryPicker}
                  className="w-full flex items-center gap-3 bg-white/10 border border-white/20 text-white font-semibold text-sm rounded-2xl px-4 py-3.5 transition-all hover:bg-white/15 text-left"
                >
                  <span className="text-xl shrink-0 leading-none">{country.flag}</span>
                  <span className="flex-1">{country.name}</span>
                  <span className="text-white/40 shrink-0 font-mono">{country.dial}</span>
                  <svg className={`w-4 h-4 text-white/30 shrink-0 transition-transform ${showCountryPicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>
                {showCountryPicker && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                    {COUNTRIES.map(c => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => { setCountry(c); setPhone(''); setShowCountryPicker(false); setPhoneError(''); }}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm text-left transition-colors min-h-[44px] ${
                          c.code === country.code ? 'bg-blue-600/20 text-blue-300' : 'text-white hover:bg-white/10'
                        }`}
                      >
                        <span className="text-xl leading-none">{c.flag}</span>
                        <span className="flex-1">{c.name}</span>
                        <span className="text-white/40 font-mono">{c.dial}</span>
                        {c.code === country.code && <Check className="w-4 h-4 text-blue-400 shrink-0"/>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Phone number */}
            <div>
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">
                Phone Number
              </label>
              <div className="flex gap-3">
                <div className="shrink-0 bg-white/10 border border-white/20 text-white/60 rounded-2xl px-3 py-3.5 text-sm font-bold flex items-center select-none">
                  {country.dial}
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => { setPhone(formatPhone(e.target.value, country.format)); setPhoneError(''); }}
                  onKeyDown={e => e.key === 'Enter' && canSend && handleSend()}
                  placeholder={country.format.replace(/#/g, '0')}
                  autoComplete="tel-national"
                  inputMode="numeric"
                  className={`flex-1 bg-white/10 border text-white placeholder-white/30 rounded-2xl px-4 py-3.5 text-sm outline-none focus:bg-white/15 transition-all ${
                    phoneError ? 'border-red-500/70 focus:border-red-400' : 'border-white/20 focus:border-blue-400'
                  }`}
                />
              </div>
              {phoneError && <p className="text-red-400 text-xs mt-1.5 px-1" role="alert">{phoneError}</p>}
              {!phoneError && (
                <p className="text-[11px] text-white/25 mt-1.5 px-1">
                  Standard messaging rates may apply.
                </p>
              )}
            </div>

            {/* Send code button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="w-full min-h-[52px] py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Sending…</>
              ) : (
                <><Smartphone className="w-4 h-4"/> Send Verification Code</>
              )}
            </button>

            {/* Secondary action */}
            <div className="text-center space-y-3 pt-1">
              <Link
                to="/create-account"
                className="block text-sm text-white/40 hover:text-white/70 transition-colors min-h-[44px] flex items-center justify-center"
              >
                Use Email Instead
              </Link>
              <p className="text-xs text-white/25">
                Already have an account?{' '}
                <Link to="/login" className="text-blue-400 font-semibold hover:text-blue-300">Sign in</Link>
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 2: OTP ──────────────────────────────────────────────────── */}
        {step === 'otp' && (
          <div className="pt-4 space-y-6 max-w-sm mx-auto">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 shrink-0 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mt-0.5">
                <Smartphone className="w-5 h-5 text-blue-400"/>
              </div>
              <div>
                <h1 className="text-2xl font-black text-white leading-tight">Verify your<br/>phone number</h1>
                <p className="text-white/45 text-sm mt-1.5">
                  We sent a 6-digit code to{' '}
                  <span className="text-white/80 font-semibold">{country.flag} {country.dial} {phone}</span>
                </p>
              </div>
            </div>

            <OtpInput key={otpKey} value={otp} onChange={v => { setOtp(v); setOtpError(''); }} hasError={!!otpError}/>

            {otpError ? (
              <p className="text-red-400 text-xs text-center -mt-2" role="alert">{otpError}</p>
            ) : (
              <div className="-mt-2"/>
            )}

            <ResendTimer key={otpKey} onResend={handleResend}/>

            <button
              type="button"
              onClick={handleVerify}
              disabled={otp.length < 6 || loading}
              className="w-full min-h-[52px] py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Verifying code…</>
              ) : 'Verify Phone Number'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('form'); setOtp(''); setOtpError(''); }}
              className="w-full text-center text-white/40 text-sm hover:text-white/70 transition-colors min-h-[44px]"
            >
              Change Phone Number
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
