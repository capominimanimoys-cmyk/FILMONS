import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Monitor, Smartphone, Tablet, MapPin, Clock, ShieldCheck,
  LogOut, Globe, ChevronDown, AlertTriangle, Loader2, X, CheckCircle,
  KeyRound, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  getDevices, logoutDevice, logoutAllOtherDevices, getRecentActivity,
  timeAgo, signInMethodLabel, type ActiveDevice, type SecurityAuditEntry,
} from '../lib/devicesApi';

function deviceIcon(type: ActiveDevice['device_type']) {
  return type === 'mobile' ? Smartphone : type === 'tablet' ? Tablet : Monitor;
}

// ── Confirmation modal — shared shape for both sign-out flows ────────────────
function ConfirmModal({ title, description, confirmLabel, onCancel, onConfirm, loading }: {
  title: string; description: string; confirmLabel: string;
  onCancel: () => void; onConfirm: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onCancel}>
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
          <LogOut className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <h3 className="font-black text-gray-900 text-base">{title}</h3>
          <p className="text-sm text-gray-500 mt-1.5">{description}</p>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── "Don't recognize this device?" guidance disclosure ────────────────────────
function SuspiciousDeviceHelp({ onSignOut, navigate }: { onSignOut: () => void; navigate: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-xs font-semibold text-amber-600 hover:text-amber-700">
        <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Don't recognize this device?</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2.5 bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2">
          <p className="text-xs text-amber-800">
            Approximate locations from IP addresses can be inaccurate — a different city doesn't always mean a stranger. If you're still unsure:
          </p>
          <ol className="text-xs text-amber-800 space-y-1 list-decimal list-inside">
            <li>Sign out that device below</li>
            <li>Change your password, if email/password sign-in is enabled</li>
            <li>Sign out of all other devices if you're not sure which one it is</li>
            <li>Review your linked phone/email sign-in methods</li>
            <li>Check your recent login activity</li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={onSignOut} className="text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-full transition-colors">
              Sign out this device
            </button>
            <button onClick={() => navigate('/settings/security')} className="text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-full transition-colors">
              Review security settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const ACTIVITY_LABEL: Record<SecurityAuditEntry['action'], { label: string; icon: React.ReactNode }> = {
  successful_signin:  { label: 'Successful sign-in',      icon: <CheckCircle className="w-4 h-4 text-green-500" /> },
  new_device_signin:  { label: 'New device sign-in',      icon: <ShieldCheck className="w-4 h-4 text-blue-500" /> },
  device_signed_out:  { label: 'Device signed out',       icon: <LogOut className="w-4 h-4 text-gray-400" /> },
  all_others_revoked: { label: 'All other sessions revoked', icon: <LogOut className="w-4 h-4 text-red-500" /> },
  password_changed:   { label: 'Password changed',        icon: <KeyRound className="w-4 h-4 text-amber-500" /> },
  device_removed:     { label: 'Device removed',          icon: <X className="w-4 h-4 text-gray-400" /> },
};

export function ActiveDevices() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [devices, setDevices] = useState<ActiveDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [signOutTarget, setSignOutTarget] = useState<ActiveDevice | null>(null);
  const [signOutAllOpen, setSignOutAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [activity, setActivity] = useState<SecurityAuditEntry[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);

  const load = () => {
    if (!user?.id) return;
    setLoading(true);
    getDevices(user.id).then(setDevices).finally(() => setLoading(false));
  };

  useEffect(load, [user?.id]); // eslint-disable-line

  useEffect(() => {
    if (!activityOpen || !user?.id || activityLoaded) return;
    getRecentActivity(user.id).then(a => { setActivity(a); setActivityLoaded(true); });
  }, [activityOpen, user?.id, activityLoaded]);

  const confirmSignOut = async () => {
    if (!signOutTarget || !user?.id) return;
    setBusy(true);
    try {
      await logoutDevice(signOutTarget.id, user.id);
      toast.success('Device signed out');
      setSignOutTarget(null);
      load();
    } catch {
      toast.error('Failed to sign out that device');
    }
    setBusy(false);
  };

  const confirmSignOutAll = async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      await logoutAllOtherDevices(user.id);
      toast.success('Signed out of all other devices');
      setSignOutAllOpen(false);
      load();
    } catch {
      toast.error('Failed to sign out other devices');
    }
    setBusy(false);
  };

  const others = devices.filter(d => !d.is_current);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/settings/security')}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <h1 className="text-base font-black text-gray-900">Active Devices</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div>
          <h2 className="text-lg font-black text-gray-900">Active devices</h2>
          <p className="text-sm text-gray-500 mt-0.5">These devices are currently signed in to your Filmons account.</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-32 rounded-2xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : devices.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">
            No active devices found.
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map(d => {
              const Icon = deviceIcon(d.device_type);
              return (
                <div key={d.id} className={`bg-white rounded-2xl border p-4 shadow-sm transition-all ${
                  d.is_current ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-100'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                      d.is_current ? 'bg-blue-100' : 'bg-gray-100'}`}>
                      <Icon className={`w-5 h-5 ${d.is_current ? 'text-blue-600' : 'text-gray-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{d.browser} on {d.os}</p>
                        {d.is_current && (
                          <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-600 text-white">
                            <ShieldCheck className="w-3 h-3" /> This device
                          </span>
                        )}
                      </div>
                      {(d.city || d.region || d.country) && (
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                          {[d.city, d.region, d.country].filter(Boolean).join(', ')}
                        </p>
                      )}
                      {d.ip_address && (
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Globe className="w-3 h-3 text-gray-300 shrink-0" /> {d.ip_address}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-300 shrink-0" />
                        Last active: {timeAgo(d.last_active_at)}
                      </p>
                      {d.sign_in_method && (
                        <p className="text-xs text-gray-400 mt-0.5">{signInMethodLabel(d.sign_in_method)}</p>
                      )}
                    </div>
                  </div>

                  {!d.is_current && (
                    <>
                      <button onClick={() => setSignOutTarget(d)}
                        className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 border border-red-200 text-red-500 text-xs font-bold rounded-xl hover:bg-red-50 transition-colors">
                        <LogOut className="w-3.5 h-3.5" /> Sign out
                      </button>
                      <SuspiciousDeviceHelp onSignOut={() => setSignOutTarget(d)} navigate={navigate} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {others.length > 0 && (
          <button onClick={() => setSignOutAllOpen(true)}
            className="w-full py-3 border border-red-200 text-red-600 text-sm font-bold rounded-2xl hover:bg-red-50 transition-colors">
            Sign out of all other devices
          </button>
        )}

        {/* Recent Login Activity */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button onClick={() => setActivityOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <History className="w-4 h-4 text-gray-500" /> Recent Login Activity
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${activityOpen ? 'rotate-180' : ''}`} />
          </button>
          {activityOpen && (
            <div className="border-t border-gray-50">
              {!activityLoaded ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />)}
                </div>
              ) : activity.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No recent activity yet.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {activity.map(a => (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                        {ACTIVITY_LABEL[a.action]?.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{ACTIVITY_LABEL[a.action]?.label || a.action}</p>
                        <p className="text-xs text-gray-400">
                          {a.detail ? `${a.detail} · ` : ''}
                          {new Date(a.created_at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {signOutTarget && (
        <ConfirmModal
          title="Sign out this device?"
          description="This device will immediately lose access to your Filmons account and will need to sign in again."
          confirmLabel="Sign out device"
          loading={busy}
          onCancel={() => setSignOutTarget(null)}
          onConfirm={confirmSignOut}
        />
      )}
      {signOutAllOpen && (
        <ConfirmModal
          title="Sign out of all other devices?"
          description="This will sign your Filmons account out everywhere except the device you're currently using."
          confirmLabel="Sign out all"
          loading={busy}
          onCancel={() => setSignOutAllOpen(false)}
          onConfirm={confirmSignOutAll}
        />
      )}
    </div>
  );
}
