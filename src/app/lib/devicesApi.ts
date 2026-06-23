/**
 * Active Devices API
 * Registers + fetches devices from active_devices table.
 * User-Agent parsed client-side (no server needed).
 */
import { supabase } from '../../lib/supabase';

export interface ActiveDevice {
  id:            string;
  user_id:       string;
  is_current:    boolean;
  device_name:   string;
  device_type:   'mobile' | 'tablet' | 'desktop';
  browser:       string;
  os:            string;
  city:          string | null;
  country:       string | null;
  last_active_at: string;
  created_at:    string;
  is_active:     boolean;
  session_token: string | null;
}

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

// ── Session token (stable per browser session, not tied to auth) ─────────────
function getSessionToken(): string {
  const KEY = '__fm_dev_token__';
  let t = localStorage.getItem(KEY);
  if (!t) {
    t = 'tok_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(KEY, t);
  }
  return t;
}

// ── Register or update current device on load ─────────────────────────────────
export async function registerDevice(userId: string): Promise<void> {
  const ua      = navigator.userAgent;
  const parsed  = parseUA(ua);
  const token   = getSessionToken();

  // Try to get approximate location from a free IP API (no key needed)
  let city: string | null = null;
  let country: string | null = null;
  try {
    const geo = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
    if (geo.ok) {
      const gd = await geo.json();
      city    = gd.city    ?? null;
      country = gd.country_name ?? null;
    }
  } catch { /* silent — location is optional */ }

  // Mark all previous current sessions as not current
  await supabase
    .from('active_devices')
    .update({ is_current: false })
    .eq('user_id', userId)
    .eq('is_current', true)
    .neq('session_token', token);

  // Upsert this session
  await supabase.from('active_devices').upsert({
    user_id:       userId,
    session_token: token,
    is_current:    true,
    is_active:     true,
    device_name:   parsed.device_name,
    device_type:   parsed.device_type,
    browser:       parsed.browser,
    os:            parsed.os,
    raw_user_agent: ua,
    city,
    country,
    last_active_at: new Date().toISOString(),
  }, { onConflict: 'session_token' });
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
  // Ensure current flag is correct client-side too
  return (data as ActiveDevice[]).map(d => ({
    ...d,
    is_current: d.session_token === token,
  }));
}

// ── Log out a device ──────────────────────────────────────────────────────────
export async function logoutDevice(deviceId: string): Promise<void> {
  await supabase.from('active_devices').update({
    is_active: false, is_current: false, logged_out_at: new Date().toISOString(),
  }).eq('id', deviceId);
}

// ── Log out all except current ────────────────────────────────────────────────
export async function logoutAllOtherDevices(userId: string): Promise<void> {
  const token = getSessionToken();
  await supabase.from('active_devices').update({
    is_active: false, is_current: false, logged_out_at: new Date().toISOString(),
  }).eq('user_id', userId).neq('session_token', token);
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