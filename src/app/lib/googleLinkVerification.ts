// Client wrapper for the Google-account-linking email OTP challenge —
// proves the person linking a Google identity to an existing Filmons
// account actually controls that account's email, without requiring the
// account's password (see OAuthCallback.tsx for the full flow).
import { projectId, publicAnonKey } from '/utils/supabase/info';

const BASE = `https://${projectId}.supabase.co/functions/v1`;

async function call(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, ...data };
}

export async function sendGoogleLinkCode(profileId: string, googleUserId: string): Promise<{ success: boolean; error?: string; retryInMs?: number }> {
  try {
    const { ok, success, error, retryInMs } = await call('google-link-send-code', { profileId, googleUserId });
    if (ok && success) return { success: true };
    return { success: false, error: error || 'Could not send verification code', retryInMs };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' };
  }
}

export async function verifyGoogleLinkCode(profileId: string, googleUserId: string, code: string): Promise<{ success: boolean; error?: string; attemptsRemaining?: number }> {
  try {
    const { ok, success, error, attemptsRemaining } = await call('google-link-verify-code', { profileId, googleUserId, code });
    if (ok && success) return { success: true };
    return { success: false, error: error || 'Incorrect code', attemptsRemaining };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' };
  }
}
