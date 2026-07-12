import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
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
      <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-blue-600 opacity-10 blur-[100px]"/>
      <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full bg-violet-500 opacity-10 blur-[80px]"/>
    </div>
  );
}

function OtpInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
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

  return (
    <div className="flex gap-3 justify-center" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="tel"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={d}
          disabled={disabled}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onFocus={e => e.target.select()}
          className={`w-12 h-14 text-center text-2xl font-black rounded-2xl outline-none transition-all
            border-2 caret-blue-400
            ${disabled
              ? 'bg-white/5 border-white/10 text-white/20 cursor-not-allowed'
              : d
                ? 'bg-white/20 border-blue-400 text-white shadow-lg shadow-blue-900/20'
                : 'bg-white/10 border-white/40 text-white'
            }
            focus:border-blue-400 focus:bg-white/15`}
        />
      ))}
    </div>
  );
}

function ResendTimer({ onResend, disabled }: { onResend: () => void; disabled?: boolean }) {
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
      onClick={() => { if (!disabled) { onResend(); setSecs(60); } }}
      disabled={disabled}
      className="text-xs text-blue-400 font-semibold text-center w-full hover:underline transition-colors disabled:opacity-40">
      Resend Code
    </button>
  );
}

export function PhoneLogin() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();

  const [country, setCountry]                   = useState(COUNTRIES[0]);
  const [phone, setPhone]                       = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [otp, setOtp]                           = useState('');
  const [codeSent, setCodeSent]                 = useState(false);
  const [sending, setSending]                   = useState(false);
  const [verifying, setVerifying]               = useState(false);

  const fullPhone = `${country.dial}${phone.replace(/\D/g, '')}`;

  const handleSendCode = async () => {
    if (phone.length < 7) { toast.error('Enter a valid phone number'); return; }
    setSending(true);
    try {
      await authApi.signinWithPhone(fullPhone);
      setCodeSent(true);
      setOtp('');
      toast.success(`Code sent to ${country.flag} ${country.dial} ${phone}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send code';
      if (msg.includes('No account found')) {
        toast.error('No account found', { description: 'Please sign up first.' });
      } else if (msg.includes('timed out')) {
        toast.error('Taking longer than usual — please try again');
      } else {
        toast.error('Failed to send code', { description: msg });
      }
    }
    setSending(false);
  };

  const handleVerify = async () => {
    if (otp.length !== 6) { toast.error('Enter all 6 digits'); return; }
    setVerifying(true);
    try {
      const user = await authApi.completePhoneSignin(fullPhone, otp);
      updateUser(user);
      fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/send-login-sms`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
          body: JSON.stringify({ phone: fullPhone, name: user.name }) }
      ).catch(() => {});
      toast.success('Welcome back!', { description: `Signed in as ${user.name}`, icon: <CheckCircle className="w-4 h-4"/> });
      captureSnapshot(); navigate('/');
    } catch (error) {
      toast.error('Invalid code', { description: error instanceof Error ? error.message : 'Verification failed' });
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setSending(true);
    try {
      await authApi.sendPhoneOTP(fullPhone);
      setOtp('');
      toast.success('New code sent!');
    } catch {
      toast.error('Failed to resend — please try again');
    }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <CinematicBg/>

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-4 pt-14 pb-4">
        <button
          onClick={() => { captureSnapshot(); navigate('/login'); }}
          className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4"/>
        </button>
        <FilmonsLogo iconSize={24} theme="dark"/>
      </div>

      {/* Scrollable content */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-10 space-y-6">

        {/* Title */}
        <div>
          <h1 className="text-2xl font-black text-white">Sign in with phone</h1>
          <p className="text-white/40 text-sm mt-1">Enter your number, then the code we send you</p>
        </div>

        {/* ── Phone number ── */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block">
            Phone Number
          </label>

          {/* Country picker */}
          <div className="relative">
            <button
              onClick={() => setShowCountryPicker(p => !p)}
              className="w-full flex items-center gap-3 bg-white/10 border border-white/20 text-white font-semibold text-sm rounded-2xl px-4 py-3.5 hover:bg-white/15 text-left transition-all">
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
            <div className="shrink-0 bg-white/10 border border-white/20 text-white/60 rounded-2xl px-3 py-3.5 text-sm font-bold flex items-center min-w-[52px] justify-center">
              {country.dial}
            </div>
            <input
              value={phone}
              onChange={e => { setPhone(formatPhone(e.target.value, country.format)); setCodeSent(false); }}
              onKeyDown={e => e.key === 'Enter' && handleSendCode()}
              type="tel"
              placeholder={country.format.replace(/#/g, '0')}
              className="flex-1 bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"
            />
          </div>

          <button
            onClick={handleSendCode}
            disabled={phone.length < 7 || sending || verifying}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2">
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin"/> Sending code…</>
              : codeSent
                ? <><CheckCircle className="w-4 h-4 text-green-400"/> Code sent — resend?</>
                : 'Send Verification Code →'}
          </button>
        </div>

        {/* ── Divider ── */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10"/>
          <span className="text-[11px] text-white/25 font-semibold">Enter your code below</span>
          <div className="flex-1 h-px bg-white/10"/>
        </div>

        {/* ── OTP boxes — ALWAYS VISIBLE ── */}
        <div className="space-y-4">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block text-center">
            {codeSent
              ? `6-digit code sent to ${country.flag} ${country.dial} ${phone}`
              : 'Your 6-digit verification code'}
          </label>

          <OtpInput value={otp} onChange={setOtp} disabled={!codeSent && otp.length === 0} />

          {codeSent && <ResendTimer key={phone} onResend={handleResend} disabled={sending || verifying}/>}

          <button
            onClick={handleVerify}
            disabled={otp.length < 6 || verifying || sending}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2">
            {verifying
              ? <><Loader2 className="w-4 h-4 animate-spin"/> Verifying…</>
              : 'Verify & Sign In →'}
          </button>
        </div>

        <p className="text-center text-xs text-white/30">
          Don't have an account?{' '}
          <Link to="/signup/phone" className="text-blue-400 font-semibold">Sign up with phone</Link>
        </p>

      </div>
    </div>
  );
}
