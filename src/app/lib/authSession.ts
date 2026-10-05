// Guarantees no previous Supabase session survives in this browser.
//
// supabase.auth.signOut() returns early WITHOUT clearing the stored session
// when its network call fails, and Logout used to fire it un-awaited -- so a
// "logged out" browser could still hold the old account's tokens. AuthContext's
// session-recovery fallback (and OAuthCallback's getSession()) would then
// silently sign that previous account back in, e.g. choosing Gabriel's Google
// account but landing in the filmons account that was signed in before.
// Removing the persisted tokens synchronously makes that impossible.
import { supabase } from '../../lib/supabase';

export function purgeStoredSupabaseSession() {
  try {
    for (const store of [localStorage, sessionStorage]) {
      Object.keys(store)
        .filter(k => k.startsWith('sb-') && /-(auth-token|code-verifier)/.test(k))
        .forEach(k => store.removeItem(k));
    }
  } catch { /* storage unavailable */ }
}

/** Drop any existing session (locally, instantly) before starting a sign-in. */
export async function clearStaleAuthSession() {
  purgeStoredSupabaseSession();
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  purgeStoredSupabaseSession();
}
