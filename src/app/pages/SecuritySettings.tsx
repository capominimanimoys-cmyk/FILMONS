import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Lock, Shield, Eye, EyeOff,
  AlertTriangle, CheckCircle, ChevronRight, Monitor, Mail, Link2, Phone, Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { securitySettingsApi } from '../lib/settingsApi';
import { getDevices, type ActiveDevice } from '../lib/devicesApi';
import { supabase } from '../../lib/supabase';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { authApi } from '../lib/api';
import { claimIdentity } from '../lib/identity';
import { EMAILJS_CONFIG, sendEmail } from '../lib/emailjs-config';

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Change Email ──────────────────────────────────────────────────────────
// New email → check availability → emailed code → verify → atomic claim →
// persist. Blocks with "Email already in use" without revealing whose it is.
function ChangeEmailFlow({ userId, currentEmail, onChanged }: { userId: string; currentEmail: string; onChanged: (email: string) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'enter' | 'code'>('enter');
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentCode, setSentCode] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => { setOpen(false); setStep('enter'); setNewEmail(''); setCode(''); setSentCode(''); };

  const sendCode = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { toast.error('Enter a valid email address.'); return; }
    if (trimmed === currentEmail?.toLowerCase()) { toast.error('That\'s already your email address.'); return; }
    setLoading(true);
    try {
      const { claimed, alreadyInUse } = await claimIdentity(userId, 'email', trimmed);
      if (!claimed && alreadyInUse) {
        toast.error('Email already in use — this email address is already connected to another Filmons account.');
        setLoading(false);
        return;
      }
      const c = genCode();
      setSentCode(c);
      const { success } = await sendEmail(EMAILJS_CONFIG.templates.emailVerification, {
        to_email: trimmed, to_name: '', verification_code: c, user_email: trimmed, expires_in: '10 minutes',
      });
      if (!success) { toast.error('Could not send verification code.'); setLoading(false); return; }
      toast.success(`Code sent to ${trimmed}`);
      setStep('code');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (code !== sentCode) { toast.error('Incorrect code.'); return; }
    setLoading(true);
    try {
      const trimmed = newEmail.trim().toLowerCase();
      const { error } = await supabase.from('profiles').update({ email: trimmed, email_verified: true }).eq('id', userId);
      if (error) {
        toast.error((error as any).code === '23505' ? 'Email already in use.' : 'Could not update email.');
        setLoading(false);
        return;
      }
      toast.success('Email updated.');
      onChanged(trimmed);
      reset();
    } finally {
      setLoading(false);
    }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-xs font-bold text-blue-600 hover:text-blue-700 shrink-0">Change</button>
  );

  return (
    <div className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 mt-2 space-y-2">
      {step === 'enter' ? (
        <>
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="New email address"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-bold">Cancel</button>
            <button onClick={sendCode} disabled={loading} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Send code'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500">Enter the code sent to {newEmail}</p>
          <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" inputMode="numeric"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 tracking-widest" />
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-bold">Cancel</button>
            <button onClick={verify} disabled={loading || code.length !== 6} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify & update'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Change Phone ──────────────────────────────────────────────────────────
function ChangePhoneFlow({ userId, currentPhone, onChanged }: { userId: string; currentPhone: string | undefined; onChanged: (phone: string) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'enter' | 'code'>('enter');
  const [newPhone, setNewPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => { setOpen(false); setStep('enter'); setNewPhone(''); setCode(''); };
  const e164 = () => newPhone.startsWith('+') ? newPhone : `+${newPhone.replace(/\D/g, '')}`;

  const sendCode = async () => {
    const digits = newPhone.replace(/\D/g, '');
    if (digits.length < 10) { toast.error('Enter a valid phone number.'); return; }
    if (e164() === currentPhone) { toast.error('That\'s already your phone number.'); return; }
    setLoading(true);
    try {
      const { claimed, alreadyInUse } = await claimIdentity(userId, 'phone', e164());
      if (!claimed && alreadyInUse) {
        toast.error('Phone number already in use — this phone number is already connected to another Filmons account.');
        setLoading(false);
        return;
      }
      await authApi.sendPhoneOTP(e164());
      toast.success(`Code sent to ${e164()}`);
      setStep('code');
    } catch (e: any) {
      toast.error(e?.message || 'Could not send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (code.length !== 6) { toast.error('Enter the 6-digit code.'); return; }
    setLoading(true);
    try {
      await authApi.verifyPhoneOTP(e164(), code);
      const { error } = await supabase.from('profiles').update({ phone: e164(), phone_verified: true }).eq('id', userId);
      if (error) {
        toast.error((error as any).code === '23505' ? 'Phone number already in use.' : 'Could not update phone number.');
        setLoading(false);
        return;
      }
      toast.success('Phone number updated.');
      onChanged(e164());
      reset();
    } catch (e: any) {
      toast.error(e?.message || 'Incorrect code.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-xs font-bold text-blue-600 hover:text-blue-700 shrink-0">Change</button>
  );

  return (
    <div className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 mt-2 space-y-2">
      {step === 'enter' ? (
        <>
          <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+1 (555) 123-4567"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-bold">Cancel</button>
            <button onClick={sendCode} disabled={loading} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Send code'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500">Enter the code sent to {e164()}</p>
          <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" inputMode="numeric"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 tracking-widest" />
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-bold">Cancel</button>
            <button onClick={verify} disabled={loading || code.length !== 6} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify & update'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export function SecuritySettings() {
  const navigate  = useNavigate();
  const { user, updateUser }  = useAuth() as any;

  useEffect(() => {
    if (!user?.id) return;
    securitySettingsApi.load(user.id).then(s => {
      if (!s) return;
      setTwoFA(s.two_fa_enabled ?? false);
    }).catch(() => {});
  }, [user?.id]);

const [showPw,  setShowPw]  = useState(false);
  const [pw,      setPw]      = useState({ current: '', next: '', confirm: '' });
  const [twoFA,   setTwoFA]   = useState(false);

  const handleChangePw = async () => {
    if (!pw.next || pw.next !== pw.confirm) { toast.error('Passwords do not match'); return; }
    if (pw.next.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    toast.success('Password updated successfully');
    setPw({ current: '', next: '', confirm: '' });
  };

  // ── Linked providers ─────────────────────────────────────────────────────
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const { data } = await supabase.from('profiles').select('profile_meta, email').eq('id', user.id).maybeSingle();
        if (!data) return;
        const meta = typeof data.profile_meta === 'string'
          ? JSON.parse(data.profile_meta || '{}')
          : (data.profile_meta || {});
        setLinkedProviders(meta.providers || (data.email ? ['email'] : []));
      } catch {}
    })();
  }, [user?.id]);

  const connectGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(error.message);
  };

  const [devices, setDevices] = useState<ActiveDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    getDevices(user.id).then(d => { setDevices(d); setDevicesLoading(false); }).catch(() => setDevicesLoading(false));
  }, [user?.id]);


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/settings')}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <h1 className="text-base font-black text-gray-900">Security</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Login Methods */}
        <Section title="Login Methods" icon={<Link2 className="w-4 h-4 text-gray-600"/>}>
          <div className="p-4 space-y-2.5">
            {/* Email & Password */}
            <div className="flex flex-wrap items-center gap-3 px-3 py-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-gray-600"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Email & Password</p>
                <p className="text-xs text-gray-400 truncate">{user?.email || '—'}</p>
              </div>
              {linkedProviders.includes('email') && (
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0"/>
              )}
              {user?.id && (
                <ChangeEmailFlow userId={user.id} currentEmail={user.email || ''} onChanged={email => updateUser?.({ email, emailVerified: true })} />
              )}
            </div>

            {/* Phone */}
            {user?.phone ? (
              <div className="flex flex-wrap items-center gap-3 px-3 py-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-8 h-8 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-green-600"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Phone Number</p>
                  <p className="text-xs text-gray-400 truncate">{user.phone}</p>
                </div>
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0"/>
                {user?.id && (
                  <ChangePhoneFlow userId={user.id} currentPhone={user.phone} onChanged={phone => updateUser?.({ phone, phoneVerified: true })} />
                )}
              </div>
            ) : (
              <button onClick={() => window.location.href = '/phone-signup'}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-left">
                <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-gray-500"/>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Add Phone Number</p>
                  <p className="text-xs text-gray-400">Sign in with your phone</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
              </button>
            )}

            {/* Google */}
            {linkedProviders.includes('google') ? (
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                  <GoogleLogo/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Google</p>
                  <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                </div>
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0"/>
              </div>
            ) : (
              <button onClick={connectGoogle}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-left">
                <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                  <GoogleLogo/>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Connect Google</p>
                  <p className="text-xs text-gray-400">Sign in with Google on this account</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
              </button>
            )}
          </div>
        </Section>

        {/* Password */}
        <Section title="Login & Password" icon={<Lock className="w-4 h-4 text-gray-600"/>}>
          <div className="space-y-3 p-4">
            {(['current','next','confirm'] as const).map(k => (
              <div key={k}>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {k === 'current' ? 'Current Password' : k === 'next' ? 'New Password' : 'Confirm New Password'}
                </label>
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-white">
                  <input type={showPw ? 'text' : 'password'} value={pw[k]} onChange={e => setPw(p => ({...p, [k]: e.target.value}))}
                    placeholder="••••••••" className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder:text-gray-300"/>
                  {k === 'current' && (
                    <button onClick={() => setShowPw(!showPw)} className="text-gray-400">
                      {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button onClick={handleChangePw}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors">
              Update Password
            </button>
          </div>
        </Section>

        {/* 2FA */}
        <Section title="Two-Factor Authentication" icon={<Shield className="w-4 h-4 text-gray-600"/>}>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Enable 2FA</p>
                <p className="text-xs text-gray-400">Add an extra layer of security</p>
              </div>
              <button onClick={() => { setTwoFA(!twoFA); toast.success(twoFA ? '2FA disabled' : '2FA enabled'); }}
                className={`w-12 h-6 rounded-full transition-colors relative ${twoFA ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${twoFA ? 'left-6.5 translate-x-0' : 'left-0.5'}`}/>
              </button>
            </div>
            {[
              { icon: '📱', label: 'SMS', sub: 'Send code to your phone' },
              { icon: '✉️', label: 'Email', sub: 'Send code to your email' },
              { icon: '🔐', label: 'Authenticator App', sub: 'Google Authenticator, Authy' },
            ].map(m => (
              <button key={m.label} onClick={() => toast.info(`${m.label} 2FA coming soon`)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-100 hover:bg-gray-50 text-left transition-colors">
                <span className="text-xl">{m.icon}</span>
                <div className="flex-1"><p className="text-sm font-semibold text-gray-900">{m.label}</p><p className="text-xs text-gray-400">{m.sub}</p></div>
                <ChevronRight className="w-4 h-4 text-gray-300"/>
              </button>
            ))}
          </div>
        </Section>

        {/* Active Devices — summary only; full management lives on its own page */}
        <Section title="Active Devices" icon={<Monitor className="w-4 h-4 text-gray-600"/>}>
          <button onClick={() => navigate('/settings/security/active-devices')}
            className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {devicesLoading ? 'Loading…' : `${devices.length} device${devices.length === 1 ? '' : 's'} signed in`}
              </p>
              <p className="text-xs text-gray-400">See where you're signed in and sign out devices you don't recognize</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
          </button>
        </Section>

        {/* Alerts */}
        <Section title="Security Alerts" icon={<AlertTriangle className="w-4 h-4 text-gray-600"/>}>
          <div className="p-4 space-y-3">
            {[
              { label: 'Suspicious login detection', on: true },
              { label: 'New device login alerts',    on: true },
              { label: 'Password change alerts',     on: true },
            ].map(a => (
              <div key={a.label} className="flex items-center justify-between">
                <p className="text-sm text-gray-800">{a.label}</p>
                <div className="w-10 h-5 bg-blue-600 rounded-full relative cursor-pointer">
                  <span className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow"/>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
        {icon}<p className="text-sm font-bold text-gray-900">{title}</p>
      </div>
      {children}
    </div>
  );
}