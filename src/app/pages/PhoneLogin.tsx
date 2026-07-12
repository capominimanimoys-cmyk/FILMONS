import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router';
import { ArrowLeft, CheckCircle, Smartphone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { FilmonsLogo } from '../components/FilmonsLogo';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const COUNTRIES = [
  { code: 'CA', name: 'Canada',        dial: '+1', flag: '🇨🇦', format: '(###) ###-####' },
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸', format: '(###) ###-####' },
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

function CinematicBg() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950"/>
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")', backgroundSize: '256px 256px' }}/>
      <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-blue-600 opacity-10 blur-[100px]"/>
      <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full bg-violet-500 opacity-10 blur-[80px]"/>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="absolute w-1 h-1 rounded-full bg-white opacity-15"
          style={{ left: `${10 + i * 18}%`, top: `${15 + i * 12}%`, animation: `float ${3 + i}s ease-in-out infinite alternate`, animationDelay: `${i * 0.6}s` }}/>
      ))}
      <style>{`@keyframes float { from { transform:translateY(0) } to { transform:translateY(-16px) } }`}</style>
    </div>
  );
}

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

  useEffect(() => { focus(0); }, []);

  return (
    <div className="flex gap-2.5 justify-center" onPaste={handlePaste}>
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
          className={`w-12 h-14 text-center text-xl font-black rounded-2xl outline-none transition-all border-2 caret-blue-400
            ${d ? 'bg-white/15 border-blue-400 text-white' : 'bg-white/10 border-white/25 text-white'}
            focus:border-blue-400 focus:bg-white/15`}
        />
      ))}
    </div>
  );
}

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

export function PhoneLogin() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();

  const [step, setStep]                         = useState<1 | 2>(1);
  const [mounted, setMounted]                   = useState(false);
  const [country, setCountry]                   = useState(COUNTRIES[0]);
  const [phone, setPhone]                       = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [otp, setOtp]                           = useState('');
  const [otpKey, setOtpKey]                     = useState(0);
  const [isLoading, setIsLoading]               = useState(false);

  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  const fullPhone = `${country.dial}${phone.replace(/\D/g, '')}`;

  const handleSendCode = async () => {
    if (phone.length < 7) { toast.error('Enter a valid phone number'); return; }
    setIsLoading(true);
    try {
      await authApi.signinWithPhone(fullPhone);
      toast.success(`Code sent to ${country.flag} ${country.dial} ${phone}`);
      setOtp('');
      setOtpKey(k => k + 1);
      setStep(2);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send code';
      if (msg.includes('No account found')) {
        toast.error('No account found', { description: 'Please sign up first.' });
      } else if (msg.includes('timed out')) {
        toast.error('Taking longer than usual', { description: 'The SMS service is slow right now — please try again.' });
      } else {
        toast.error('Failed to send code', { description: msg });
      }
    }
    setIsLoading(false);
  };

  const handleVerifyCode = async () => {
    if (otp.length !== 6) { toast.error('Enter the 6-digit code'); return; }
    setIsLoading(true);
    try {
      const user = await authApi.completePhoneSignin(fullPhone, otp);
      updateUser(user);

      fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/send-login-sms`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
          body: JSON.stringify({ phone: fullPhone, name: user.name }),
        }
      )
        .then(async res => { const d = await res.json(); if (!res.ok) console.error('SMS failed:', d); })
        .catch(err => console.error('SMS error:', err));

      toast.success('Welcome back!', { description: `Signed in as ${user.name}`, icon: <CheckCircle className="w-4 h-4"/> });
      captureSnapshot(); navigate('/');
    } catch (error) {
      toast.error('Invalid code', { description: error instanceof Error ? error.message : 'Verification failed' });
    }
    setIsLoading(false);
  };

  const handleResend = async () => {
    setIsLoading(true);
    try {
      await authApi.sendPhoneOTP(fullPhone);
      toast.success('New code sent!');
      setOtp('');
      setOtpKey(k => k + 1);
    } catch {
      toast.error('Failed to resend code');
    }
    setIsLoading(false);
  };

  const pct = ((step - 1) / 1) * 100;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <CinematicBg/>

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-4 pt-14 pb-3">
        <button
          onClick={() => step === 1 ? (captureSnapshot(), navigate('/login')) : setStep(1)}
          className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4"/>
        </button>
        <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}/>
        </div>
      </div>

      {/* Content */}
      <div className={`relative z-10 flex-1 overflow-y-auto px-5 pb-10 transition-all duration-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

        {/* ── STEP 1: Phone Number ─────────────────────────────────── */}
        {step === 1 && (
          <div className="pt-4 space-y-5">
            <div className="flex justify-center pt-2 pb-1">
              <FilmonsLogo iconSize={36} theme="dark"/>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Sign in with phone</h2>
              <p className="text-white/40 text-sm mt-1">Enter your number to receive a verification code</p>
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
                onKeyDown={e => e.key === 'Enter' && handleSendCode()}
                type="tel"
                placeholder={country.format.replace(/#/g, '0')}
                className="flex-1 bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"
              />
            </div>

            <p className="text-xs text-white/30 text-center -mt-2">We'll send you a one-time verification code.</p>

            <button
              onClick={handleSendCode}
              disabled={phone.length < 7 || isLoading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              {isLoading
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>Sending code…</span>
                : 'Continue →'}
            </button>

            <p className="text-center text-xs text-white/30">
              Don't have an account?{' '}
              <Link to="/phone-signup" className="text-blue-400 font-semibold">Sign up with phone</Link>
            </p>
          </div>
        )}

        {/* ── STEP 2: OTP ─────────────────────────────────────────── */}
        {step === 2 && (
          <div className="pt-4 space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-blue-400"/>
                </div>
                <h2 className="text-2xl font-black text-white">Verify your<br/>phone number</h2>
              </div>
              <p className="text-white/40 text-sm mt-1.5">
                We sent a 6-digit code to{' '}
                <span className="text-white/70 font-semibold">{country.flag} {country.dial} {phone}</span>
              </p>
            </div>

            <OtpInput key={otpKey} value={otp} onChange={setOtp}/>

            <ResendTimer onResend={handleResend}/>

            <button
              onClick={handleVerifyCode}
              disabled={otp.length < 6 || isLoading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              {isLoading ? 'Verifying…' : 'Verify & Sign In →'}
            </button>

            <button
              onClick={() => setStep(1)}
              className="w-full text-center text-white/40 text-xs hover:text-white/70 transition-colors py-1">
              Change phone number
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
