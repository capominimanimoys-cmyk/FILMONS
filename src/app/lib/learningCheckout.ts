// Starts a Stripe Checkout for a paid course or an accepted live-session
// booking (edge function learning-charge). The instructor's earnings are
// deposited in their FILMONS Wallet by stripe-webhook once Stripe confirms
// the payment -- nothing here credits anyone.
import { supabase } from '../../lib/supabase';

type Target = { kind: 'course'; courseId: string } | { kind: 'live_session'; applicationId: string };

const withParams = (href: string, extra: Record<string, string>) => {
  const u = new URL(href);
  Object.entries(extra).forEach(([k, v]) => u.searchParams.set(k, v));
  // Stripe substitutes the literal placeholder, so it must not be URL-encoded.
  return u.toString().replace(encodeURIComponent('{CHECKOUT_SESSION_ID}'), '{CHECKOUT_SESSION_ID}');
};

/** Redirects to Stripe. Resolves with an error message only if it could not start. */
export async function startLearningCheckout(userId: string, target: Target, returnTo: string = window.location.href): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('learning-charge', {
    body: { userId, ...target, successUrl: withParams(returnTo, { paid: '1', session_id: '{CHECKOUT_SESSION_ID}' }), cancelUrl: returnTo },
  });
  if (error || !data?.url) {
    let msg: string = data?.error || 'Could not start payment';
    if (!data?.error && (error as any)?.context?.json) {
      try { const b = await (error as any).context.json(); if (b?.error) msg = b.error; } catch {}
    }
    return msg;
  }
  window.location.assign(data.url);
  return null;
}

/** After returning from Stripe the webhook may land a few seconds later:
 *  poll `check` until it is true (or give up after ~15s). */
export async function waitForPayment(check: () => Promise<boolean>, tries = 8, gapMs = 2000): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await check()) return true;
    await new Promise(r => setTimeout(r, gapMs));
  }
  return false;
}
