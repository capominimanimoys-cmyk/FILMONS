// Thin client wrapper around the claim-identity Edge Function — the single
// atomic enforcement point for "can this email/phone be claimed by this
// profile" (see supabase/functions/claim-identity/index.ts). Every signup,
// sign-in-linking, and settings-change flow that needs to check or claim an
// identity should go through this instead of writing its own ad hoc query.
import { projectId, publicAnonKey } from '/utils/supabase/info';

const EDGE = `https://${projectId}.supabase.co/functions/v1/claim-identity`;

export type IdentityProvider = 'email' | 'phone' | 'google';

async function call(body: Record<string, unknown>) {
  const res = await fetch(EDGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, ...data };
}

/** Fast, non-authoritative check — does NOT claim, just reports availability. */
export async function checkIdentityAvailable(profileId: string, provider: IdentityProvider, value: string): Promise<boolean> {
  try {
    const { ok, available } = await call({ profileId, provider, value, dryRun: true });
    return ok ? !!available : true; // fail open on network error — the real claim below is the authoritative guard
  } catch {
    return true;
  }
}

/**
 * Atomically claims the identity for profileId. Returns:
 * - { claimed: true } — success (new claim or already yours)
 * - { claimed: false, alreadyInUse: true } — belongs to a different account; no other info revealed
 * - { claimed: false, error: string } — unexpected failure
 */
export async function claimIdentity(profileId: string, provider: IdentityProvider, value: string): Promise<{ claimed: boolean; alreadyInUse?: boolean; error?: string }> {
  try {
    const { ok, claimed, error } = await call({ profileId, provider, value });
    if (ok && claimed) return { claimed: true };
    if (error === 'already_in_use') return { claimed: false, alreadyInUse: true };
    return { claimed: false, error: error || 'Could not verify uniqueness' };
  } catch (e: any) {
    return { claimed: false, error: e?.message || 'Network error' };
  }
}
