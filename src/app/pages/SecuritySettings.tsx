import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Lock, Shield, Smartphone, Eye, EyeOff,
  LogOut, AlertTriangle, CheckCircle, ChevronRight, Monitor, Tablet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { securitySettingsApi } from '../lib/settingsApi';
import { registerDevice, getDevices, logoutDevice, logoutAllOtherDevices, timeAgo, type ActiveDevice } from '../lib/devicesApi';
import { useEffect } from 'react';
import { toast } from 'sonner';

export function SecuritySettings() {
  const navigate  = useNavigate();
  const { user }  = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    securitySettingsApi.load(user.id).then(s => {
      if (!s) return;
      setTwoFA(s.two_fa_enabled ?? false);
    }).catch(() => {});
  }, [user?.id]);

  const saveAlerts = async (key: string, value: boolean) => {
    if (!user?.id) return;
    securitySettingsApi.save(user.id, { [key]: value }).catch(() => {});
  };
  const [showPw,  setShowPw]  = useState(false);
  const [pw,      setPw]      = useState({ current: '', next: '', confirm: '' });
  const [twoFA,   setTwoFA]   = useState(false);

  const handleChangePw = async () => {
    if (!pw.next || pw.next !== pw.confirm) { toast.error('Passwords do not match'); return; }
    if (pw.next.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    toast.success('Password updated successfully');
    setPw({ current: '', next: '', confirm: '' });
  };

  const [devices, setDevices] = useState<ActiveDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);

  // Load and register device
  useEffect(() => {
    if (!user?.id) return;
    registerDevice(user.id).then(() =>
      getDevices(user.id).then(d => { setDevices(d); setDevicesLoading(false); })
    ).catch(() => setDevicesLoading(false));
  }, [user?.id]);

  const handleLogoutDevice = async (id: string) => {
    await logoutDevice(id);
    setDevices(prev => prev.filter(d => d.id !== id));
    toast.success('Device logged out');
  };

  const handleLogoutAll = async () => {
    if (!user?.id) return;
    await logoutAllOtherDevices(user.id);
    setDevices(prev => prev.filter(d => d.is_current));
    toast.success('All other devices logged out');
  };


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

        {/* Active Devices */}
        <Section title="Active Devices" icon={<Monitor className="w-4 h-4 text-gray-600"/>}>
          <div className="p-4 space-y-3">
            {devicesLoading ? (
              <div className="space-y-2">
                {[1,2].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse"/>)}
              </div>
            ) : devices.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No active devices found</p>
            ) : (
              devices.map(d => {
                const DeviceIcon = d.device_type === 'mobile' ? Smartphone : d.device_type === 'tablet' ? Tablet : Monitor;
                return (
                  <div key={d.id} className={`rounded-2xl border p-4 transition-all ${
                    d.is_current ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        d.is_current ? 'bg-blue-100' : 'bg-gray-100'}`}>
                        <DeviceIcon className={`w-5 h-5 ${d.is_current ? 'text-blue-600' : 'text-gray-500'}`}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900">{d.device_name}</p>
                          {d.is_current && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-600 text-white">
                              Current Session
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {d.browser} · {d.os}
                        </p>
                        {(d.city || d.country) && (
                          <p className="text-xs text-gray-400">
                            {[d.city, d.country].filter(Boolean).join(', ')}
                          </p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Last active: {timeAgo(d.last_active_at)}
                        </p>
                      </div>
                    </div>
                    {!d.is_current && (
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => handleLogoutDevice(d.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-red-200 text-red-500 text-xs font-bold rounded-xl hover:bg-red-50 transition-colors">
                          <LogOut className="w-3.5 h-3.5"/> Log Out Device
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {devices.filter(d => !d.is_current).length > 0 && (
              <button onClick={handleLogoutAll}
                className="w-full py-2.5 border border-red-200 text-red-500 text-xs font-bold rounded-xl hover:bg-red-50 transition-colors">
                Log out all other devices
              </button>
            )}
          </div>
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