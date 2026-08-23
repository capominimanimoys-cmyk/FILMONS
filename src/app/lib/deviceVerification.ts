// Client for the device-check / device-send-code / device-verify-code
// edge functions. All three need credentials: 'include' — the trust
// cookie is HttpOnly, so it's never read directly in JS, only carried
// automatically by the browser on these credentialed requests.
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getDeviceLabel } from './devicesApi';

const BASE = `https://${projectId}.supabase.co/functions/v1`;

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
