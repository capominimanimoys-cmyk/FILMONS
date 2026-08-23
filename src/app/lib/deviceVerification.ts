// Client for the device-check / device-send-code / device-verify-code
// edge functions.
//
// These three go through Vercel rewrite proxies (vercel.json:
// /api/device-check etc. -> the Supabase function) instead of hitting
// *.supabase.co directly like every other edge function call in this
// app. That's deliberate: the trust cookie is set via Set-Cookie in the
// response, and a cookie set by a *different* domain than the page
// (filmons.app calling supabase.co) is a third-party cookie — mobile
// Safari's Intelligent Tracking Prevention (and an increasing number of
// other browsers) silently drops those, so the cookie would never
// actually stick and every visit would look untrusted again. Proxying
// through the app's own origin makes it a first-party cookie instead,
// which every browser honors normally.
//
// Falls back to the direct Supabase URL on localhost, where the Vercel
// rewrite doesn't exist (Vite's dev server doesn't run vercel.json).
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getDeviceLabel } from './devicesApi';

const isLocalDev = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const BASE = isLocalDev ? `https://${projectId}.supabase.co/functions/v1` : '/api';

function deviceInfoString(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Win/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown device';
}

export async function checkTrustedDevice(userId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/device-check?userId=${encodeURIComponent(userId)}`, {
      method: 'GET',
      credentials: 'include',
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    });
    const data = await res.json().catch(() => ({}));
    return !!data.trusted;
  } catch {
    // Fail open on a network hiccup — a broken check shouldn't lock a
    // legitimate, already-trusted user out of the app entirely.
    return true;
  }
}

export async function sendVerificationCode(userId: string): Promise<{ success: boolean; error?: string; retryInMs?: number }> {
  const res = await fetch(`${BASE}/device-send-code`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify({ userId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, error: data.error || 'Could not send code', retryInMs: data.retryInMs };
  return { success: true };
}

export async function verifyDeviceCode(userId: string, code: string): Promise<{ success: boolean; error?: string; attemptsRemaining?: number }> {
  const res = await fetch(`${BASE}/device-verify-code`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify({ userId, code, browserInfo: getDeviceLabel(), deviceInfo: deviceInfoString() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, error: data.error || 'Verification failed', attemptsRemaining: data.attemptsRemaining };
  return { success: true };
}
