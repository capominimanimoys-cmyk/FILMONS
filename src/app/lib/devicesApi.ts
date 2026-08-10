/**
 * Active Devices API
 * Registers + fetches devices from active_devices table.
 * User-Agent parsed client-side (no server needed).
 *
 * Device identity: a random token generated once and kept in localStorage
 * (see getSessionToken) — a privacy-conscious per-browser identifier, not
 * fingerprinting off IP/UA (both of those can and do change).
 *
 * Session enforcement caveat: this app has no server that validates a
 * session token on every request (see AuthContext.tsx — auth is a
 * `profiles` row cached in localStorage, not a real backend session). So
 * "signing out" a remote device here only flips its DB row; that device
 * only finds out the next time it calls checkCurrentDeviceStatus(), which
 * AuthContext runs on its existing 2-minute heartbeat and on window focus —
 * not instant, best-effort within that window.
 */
import { supabase } from '../../lib/supabase';
import { sendNewDeviceSignInEmail } from './emailjs-config';

export interface ActiveDevice {
  id:              string;
  user_id:         string;
  is_current:      boolean;
  device_name:     string;
  device_type:     'mobile' | 'tablet' | 'desktop';
  browser:         string;
  os:              string;
  city:            string | null;
  region:          string | null;
  country:         string | null;
  ip_address:      string | null;
  sign_in_method:  string | null;
  last_active_at:  string;
  created_at:      string;
  is_active:       boolean;
  logged_out_at:   string | null;
  revoked_at:      string | null;
  session_token:   string | null;
}

export interface SecurityAuditEntry {
  id:         string;
  action:     'successful_signin' | 'new_device_signin' | 'device_signed_out' | 'all_others_revoked' | 'password_changed' | 'device_removed';
  detail:     string | null;
  created_at: string;
}

const SIGN_IN_METHOD_LABEL: Record<string, string> = {
  email:  'Signed in with email',
  phone:  'Signed in with phone',
  google: 'Signed in with Google',
  apple:  'Signed in with Apple',
};
export const signInMethodLabel = (m?: string | null) => (m && SIGN_IN_METHOD_LABEL[m]) || 'Signed in';

// ── User-Agent parser (no external library needed) ───────────────────────────
function parseUA(ua: string): { device_name: string; device_type: 'mobile'|'tablet'|'desktop'; browser: string; os: string } {
  const u = ua.toLowerCase();

  // OS
  let os = 'Unknown OS';
  if (u.includes('iphone'))          os = 'iOS';
  else if (u.includes('ipad'))       os = 'iPadOS';
  else if (u.includes('mac os x'))   os = 'macOS';
  else if (u.includes('android'))    os = 'Android';
  else if (u.includes('windows nt')) os = 'Windows';
  else if (u.includes('linux'))      os = 'Linux';
  else if (u.includes('cros'))       os = 'ChromeOS';

  // Device type + name
  let device_type: 'mobile'|'tablet'|'desktop' = 'desktop';
  let device_name = 'Computer';
  if (u.includes('ipad')) {
    device_type = 'tablet'; device_name = 'iPad';
  } else if (u.includes('iphone')) {
    device_type = 'mobile';
    // Try to detect model
    const m = ua.match(/iPhone\s?OS\s?([\d_]+)/i);
    device_name = 'iPhone';
    if (m) {
      const v = parseInt(m[1].replace(/_/g,'.').split('.')[0]);
      if (v >= 18) device_name = 'iPhone 16';
      else if (v >= 17) device_name = 'iPhone 15';
      else if (v >= 16) device_name = 'iPhone 14';
      else if (v >= 15) device_name = 'iPhone 13';
    }
  } else if (u.includes('android') && u.includes('mobile')) {
    device_type = 'mobile';
    const m = ua.match(/;\s*([^;)]+)\sBuild\//i);
    device_name = m ? m[1].trim() : 'Android Phone';
  } else if (u.includes('android')) {
    device_type = 'tablet';
    const m = ua.match(/;\s*([^;)]+)\sBuild\//i);
    device_name = m ? m[1].trim() : 'Android Tablet';
  } else if (u.includes('mac os x')) {
    device_name = 'MacBook';
  } else if (u.includes('windows')) {
    device_name = 'Windows PC';
  } else if (u.includes('cros')) {
    device_name = 'Chromebook';
  } else if (u.includes('linux')) {
    device_name = 'Linux PC';
  }

  // Browser
  let browser = 'Unknown Browser';
  if (u.includes('edg/'))              browser = 'Edge';
  else if (u.includes('opr/') || u.includes('opera')) browser = 'Opera';
  else if (u.includes('samsungbrowser')) browser = 'Samsung Browser';
  else if (u.includes('firefox/'))     browser = 'Firefox';
  else if (u.includes('chrome/') && !u.includes('chromium')) browser = 'Chrome';
  else if (u.includes('safari/') && u.includes('version/')) browser = 'Safari';
  else if (u.includes('chromium'))     browser = 'Chromium';

  return { device_name, device_type, browser, os };
}

// ── Session token (stable per browser, not tied to auth) ─────────────────────
function getSessionToken(): string {
  const KEY = '__fm_dev_token__';
  let t = localStorage.getItem(KEY);
  if (!t) {
    t = 'tok_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(KEY, t);
  }
  return t;
}

async function logAudit(userId: string, deviceId: string | null, action: SecurityAuditEntry['action'], detail?: string) {
  await supabase.from('security_audit_log').insert({ user_id: userId, device_id: deviceId, action, detail: detail || null })
    .then(() => {}, () => {});
}

// ── Register (or refresh) the current device on sign-in ──────────────────────
// signInMethod is only passed by actual sign-in call sites (login,
// completeLogin, setUserDirectly) — callers that just refresh cached profile
// fields don't touch this at all, so routine app usage never logs a
// "sign-in" event.
export async function registerDevice(userId: string, signInMethod?: string): Promise<void> {
  const ua      = navigator.userAgent;
  const parsed  = parseUA(ua);
  const token   = getSessionToken();

  // Try to get approximate location + this browser's public IP from a free
  // IP API (no key needed) — same call serves both.
  let city: string | null = null;
  let region: string | null = null;
  let country: string | null = null;
  let ip: string | null = null;
  try {
    const geo = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
    if (geo.ok) {
      const gd = await geo.json();
      city    = gd.city         ?? null;
      region  = gd.region       ?? null;
      country = gd.country_name ?? null;
      ip      = gd.ip           ?? null;
    }
  } catch { /* silent — location/IP are optional */ }

  const { data: existing } = await supabase
    .from('active_devices')
    .select('id')
    .eq('user_id', userId)
    .eq('session_token', token)
    .maybeSingle();
  const isNewDevice = !existing;

  // Mark all previous current sessions as not current
  await supabase
    .from('active_devices')
    .update({ is_current: false })
    .eq('user_id', userId)
    .eq('is_current', true)
    .neq('session_token', token);

  const patch: Record<string, unknown> = {
    user_id:       userId,
    session_token: token,
    is_current:    true,
    is_active:     true,
    device_name:   parsed.device_name,
    device_type:   parsed.device_type,
    browser:       parsed.browser,
    os:            parsed.os,
    raw_user_agent: ua,
    city, region, country, ip_address: ip,
    last_active_at: new Date().toISOString(),
    revoked_at: null,
    logged_out_at: null,
  };
  if (signInMethod) patch.sign_in_method = signInMethod;

  const { data: saved } = await supabase.from('active_devices')
    .upsert(patch, { onConflict: 'session_token' })
    .select('id').maybeSingle();

  // Only log/notify for an actual sign-in event, not a background refresh.
  if (!signInMethod) return;

  const deviceLabel = `${parsed.browser} on ${parsed.os}`;
  if (isNewDevice) {
    await logAudit(userId, saved?.id || null, 'new_device_signin', deviceLabel);
    try {
      const { data: profile } = await supabase.from('profiles').select('email, name').eq('id', userId).maybeSingle();
      if (profile?.email) {
        await sendNewDeviceSignInEmail(profile.email, profile.name || 'there', {
          device: deviceLabel,
          location: [city, country].filter(Boolean).join(', ') || 'Unknown location',
          ipAddress: ip || 'Unknown',
          signInMethod: signInMethodLabel(signInMethod),
          date: new Date().toLocaleString('en-CA', { dateStyle: 'long', timeStyle: 'short' }),
        });
      }
    } catch { /* best-effort — never block sign-in on email delivery */ }
  } else {
    await logAudit(userId, saved?.id || null, 'successful_signin', deviceLabel);
  }
}

// ── Fetch devices for display ─────────────────────────────────────────────────
export async function getDevices(userId: string): Promise<ActiveDevice[]> {
  const token = getSessionToken();
  const { data } = await supabase
    .from('active_devices')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('last_active_at', { ascending: false });
  if (!data) return [];
  // Ensure current flag is correct client-side too, and always sort current first.
  const rows = (data as ActiveDevice[]).map(d => ({ ...d, is_current: d.session_token === token }));
  return rows.sort((a, b) => (a.is_current === b.is_current ? 0 : a.is_current ? -1 : 1));
}

// ── Log out a single (other) device ───────────────────────────────────────────
export async function logoutDevice(deviceId: string, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabase.from('active_devices').update({
    is_active: false, is_current: false, logged_out_at: now, revoked_at: now,
  }).eq('id', deviceId);
  await logAudit(userId, deviceId, 'device_signed_out');
}

// ── Log out all except current ────────────────────────────────────────────────
export async function logoutAllOtherDevices(userId: string): Promise<void> {
  const token = getSessionToken();
  const now = new Date().toISOString();
  await supabase.from('active_devices').update({
    is_active: false, is_current: false, logged_out_at: now, revoked_at: now,
  }).eq('user_id', userId).neq('session_token', token);
  await logAudit(userId, null, 'all_others_revoked');
}

// ── Has this device been signed out remotely? ─────────────────────────────────
// Polled from AuthContext's existing heartbeat — see module comment above for
// why this can't be instant.
export async function checkCurrentDeviceStatus(userId: string): Promise<boolean> {
  const token = getSessionToken();
  const { data } = await supabase
    .from('active_devices')
    .select('is_active')
    .eq('user_id', userId)
    .eq('session_token', token)
    .maybeSingle();
  return data ? !!data.is_active : true; // no row yet (first load) — don't force a logout
}

// ── Recent Login Activity ─────────────────────────────────────────────────────
export async function getRecentActivity(userId: string, limit = 20): Promise<SecurityAuditEntry[]> {
  const { data } = await supabase
    .from('security_audit_log')
    .select('id, action, detail, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// ── Time ago helper ───────────────────────────────────────────────────────────
export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)               return 'Just now';
  if (diff < 3600)             return `${Math.round(diff/60)} min ago`;
  if (diff < 86400)            return `${Math.round(diff/3600)} hr ago`;
  if (diff < 86400 * 2)        return 'Yesterday';
  if (diff < 86400 * 7)        return `${Math.round(diff/86400)} days ago`;
  return new Date(iso).toLocaleDateString('en-CA', { month:'short', day:'numeric' });
}
