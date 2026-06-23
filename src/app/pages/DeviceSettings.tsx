import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Monitor, Smartphone, Tablet,
  LogOut, Globe, AlertTriangle, Wifi,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import {
  registerDevice, getDevices, logoutDevice,
  logoutAllOtherDevices, timeAgo, type ActiveDevice,
} from '../lib/devicesApi';
import { toast } from 'sonner';

function DeviceIcon({ type }: { type: ActiveDevice['device_type'] }) {
  if (type === 'mobile') return <Smartphone className="w-5 h-5"/>;
  if (type === 'tablet') return <Tablet className="w-5 h-5"/>;
  return <Monitor className="w-5 h-5"/>;
}

export function DeviceSettings() {
  const navigate  = useNavigate();
  const { user, logout }  = useAuth();

  const [devices,        setDevices]        = useState<ActiveDevice[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [confirmId,      setConfirmId]      = useState<string | null>(null);
  const [sessionExp,     setSessionExp]     = useState('30 days');

  // Register current device + load list
  useEffect(() => {
    if (!user?.id) return;
    registerDevice(user.id)
      .then(() => getDevices(user.id))
      .then(d => { setDevices(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user?.id]);

  // Log out a remote device
  const handleLogout = async (id: string) => {
    await logoutDevice(id);
    setDevices(prev => prev.filter(d => d.id !== id));
    setConfirmId(null);
    toast.success('Device logged out');
  };

  // Log out the current device → full sign-out
  const handleLogoutCurrent = async (id: string) => {
    await logoutDevice(id);
    toast.success('Signing out…');
    setTimeout(() => logout(), 600);
  };

  // Log out all other devices
  const handleLogoutAll = async () => {
    if (!user?.id) return;
    await logoutAllOtherDevices(user.id);
    setDevices(prev => prev.filter(d => d.is_current));
    toast.success('All other devices logged out');
  };

  const others = devices.filter(d => !d.is_current);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => { captureSnapshot(); navigate(-1); }}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700"/>
        </button>
        <h1 className="text-base font-black text-gray-900">Linked Devices</h1>
      </div>

      <div className="max-w-lg mx-auto py-4 space-y-5">

        {/* ── Active devices (real UA data) ── */}
        <div className="mx-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">ACTIVE DEVICES</p>

          {loading ? (
            <div className="space-y-2">
              {[1,2].map(i => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-gray-100"/>)}
            </div>
          ) : devices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
              <Wifi className="w-8 h-8 text-gray-200 mx-auto mb-2"/>
              <p className="text-sm text-gray-400">No active devices found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map(d => (
                <div key={d.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${
                  d.is_current ? 'border-blue-200' : 'border-gray-100'}`}>

                  {/* Device info */}
                  <div className="flex items-start gap-3 p-4">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                      d.is_current ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'}`}>
                      <DeviceIcon type={d.device_type}/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-sm font-bold text-gray-900">{d.device_name}</p>
                        {d.is_current && (
                          <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                            Current Session
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{d.browser} · {d.os}</p>
                      {(d.city || d.country) && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Globe className="w-3 h-3 shrink-0"/>
                          {[d.city, d.country].filter(Boolean).join(', ')}
                        </p>
                      )}
                      <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${
                        d.is_current ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          d.is_current ? 'bg-green-500' : 'bg-gray-300'}`}/>
                        Last active: {timeAgo(d.last_active_at)}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  {!d.is_current && confirmId !== d.id && (
                    <div className="border-t border-gray-50 px-4 py-2.5">
                      <button onClick={() => handleLogout(d.id)}
                        className="flex items-center gap-1.5 text-xs font-bold text-red-500 hover:text-red-600 transition-colors">
                        <LogOut className="w-3.5 h-3.5"/> Log Out Device
                      </button>
                    </div>
                  )}

                  {/* Current device logout */}
                  {d.is_current && confirmId !== d.id && (
                    <div className="border-t border-blue-100 px-4 py-2.5">
                      <button onClick={() => setConfirmId(d.id)}
                        className="flex items-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-500 transition-colors">
                        <LogOut className="w-3.5 h-3.5"/> Log Out This Device
                      </button>
                    </div>
                  )}

                  {/* Confirmation panel */}
                  {confirmId === d.id && (
                    <div className="border-t border-red-100 bg-red-50 px-4 py-3 space-y-2">
                      <p className="text-xs font-bold text-red-700">
                        {d.is_current ? 'Sign out of this device?' : 'Log out this device?'}
                      </p>
                      <p className="text-[11px] text-red-500 leading-relaxed">
                        {d.is_current
                          ? "You'll be signed out and redirected to the login screen."
                          : "This device will be removed from your active sessions."}
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmId(null)}
                          className="flex-1 py-2 border border-gray-200 bg-white text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50 transition-colors">
                          Cancel
                        </button>
                        <button onClick={() => d.is_current ? handleLogoutCurrent(d.id) : handleLogout(d.id)}
                          className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition-colors">
                          {d.is_current ? 'Yes, Sign Out' : 'Log Out'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Log out all others */}
          {others.length > 0 && (
            <button onClick={handleLogoutAll}
              className="w-full mt-3 py-3 border-2 border-red-200 text-red-500 text-sm font-bold rounded-2xl hover:bg-red-50 transition-colors">
              Log Out All Other Devices ({others.length})
            </button>
          )}
        </div>

        {/* ── Session controls ── */}
        <div className="mx-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">SESSION CONTROLS</p>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3.5">
            <p className="text-sm font-semibold text-gray-900 mb-2">Auto Session Expiration</p>
            <div className="flex gap-2 flex-wrap">
              {['7 days', '30 days', 'Never'].map(opt => (
                <button key={opt} onClick={() => { setSessionExp(opt); toast.success('Saved'); }}
                  className={`text-xs px-3 py-1.5 rounded-full font-semibold border transition-all ${
                    sessionExp === opt
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Security tip ── */}
        <div className="mx-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 pb-24">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"/>
            <div>
              <p className="text-xs font-bold text-amber-800">Security Tip</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                Only keep devices you recognize. Log out of shared or public computers after each session.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}