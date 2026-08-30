// Authoritative, server-pushed payment confirmation. This — not the
// browser calling back to stripe-charge/verify after the redirect — is
// the only trusted trigger for crediting the host/Filmons wallets. A
// closed tab before the redirect completes previously meant Stripe was
// paid but nothing got recorded on our side; this closes that gap, and
// Stripe's own redelivery-on-failure guarantee means we must also be
// idempotent (handled by fn_finalize_payment's idempotency-key insert).
//
// Requires STRIPE_WEBHOOK_SECRET (from the Stripe dashboard's webhook
// endpoint settings) and STRIPE_SECRET_KEY (already configured for
// stripe-charge) as environment variables.
import { syncPayoutMethodFromStripeAccount } from '../_shared/payoutMethodSync.ts';
import { sendPayoutFailedEmail } from '../_shared/notificationEmails.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const timestamp = parts['t'];
  const sig = parts['v1'];
  if (!timestamp || !sig) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`RPC ${fn} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const REST_H = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};
function rest(path: string) {
  return `${SUPABASE_URL}/rest/v1${path}`;
}
async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: REST_H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

// EmailJS's public key + service/template ids are meant to be client-
// embedded (not secrets) — same values already used in
// src/app/lib/emailjs-config.ts. This is a best-effort fallback
// confirmation email, sent only when the browser never returns to run
// Checkout.tsx's finalizeOrder (which sends the full agreement/receipt
// documents) — it deliberately doesn't try to replicate that HTML
// generation server-side, just points both parties at Dashboard → Orders.
const EMAILJS_SERVICE_ID = 'service_s6wwjtj';
const EMAILJS_PUBLIC_KEY = 'iSSpIM-AeV9uUQ7Jt';
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY') || '';
const EMAILJS_TEMPLATE_RENTAL_AGREEMENT = 'template_synqixt';

async function sendFallbackEmail(params: Record<string, unknown>) {
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_RENTAL_AGREEMENT,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: params,
      }),
    });
    if (!res.ok) console.warn('EmailJS fallback send failed:', res.status, await res.text());
  } catch (e) {
    console.warn('EmailJS fallback send threw:', e);
  }
}

// Generic subject/message template (same one request-payout/manage-hire-
// request use) for Hire From Portfolio's payment-confirmed email — the
// rental-agreement template above expects agreement/receipt URLs that
// don't exist for this flow.
const EMAILJS_TEMPLATE_ADMIN_NOTIFICATION = 'template_rd3nhik';
async function sendGenericNotificationEmail(toEmail: string, toName: string | null | undefined, subject: string, message: string) {
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: EMAILJS_SERVICE_ID, template_id: EMAILJS_TEMPLATE_ADMIN_NOTIFICATION, user_id: EMAILJS_PUBLIC_KEY, accessToken: EMAILJS_PRIVATE_KEY, template_params: { to_email: toEmail, to_name: toName || 'there', subject, message } }),
    });
    if (!res.ok) console.warn('Hire payment-confirmed email failed:', res.status, await res.text());
  } catch (e) { console.warn('Hire payment-confirmed email threw:', e); }
}

async function insertNotification(row: Record<string, unknown>) {
  await fetch(rest('/notifications'), {
    method: 'POST', headers: { ...REST_H, Prefer: 'return=minimal' }, body: JSON.stringify(row),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (!WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const payload = await req.text();
  const sigHeader = req.headers.get('stripe-signature') || '';
  const valid = await verifyStripeSignature(payload, sigHeader, WEBHOOK_SECRET);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const event = JSON.parse(payload);

    // A subscription that has genuinely ended (period ended after
    // cancel_at_period_end, or payment ultimately failed past retries) —
    // this is what actually implements "access continues until period end,
    // then reverts": Stripe itself keeps a canceling subscription live
    // until the period truly ends and only fires this once it does.
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data?.object;
      const profile = await selectOne('profiles', `stripe_subscription_id=eq.${sub?.id}`);
      if (profile) {
        await rpc('fn_deactivate_subscription', { p_user_id: profile.id });
      }
      return new Response(JSON.stringify({ received: true, deactivated: !!profile }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Authoritative background sync for the Payout Method Stripe Connect
    // flow — fires whenever the connected account's status/external
    // account changes, independent of whether the browser ever returns to
    // payout-connect-status's fast-path GET.
    if (event.type === 'account.updated') {
      const account = event.data?.object;
      const profile = account?.id ? await selectOne('profiles', `stripe_connect_account_id=eq.${account.id}`) : null;
      let synced = null;
      if (profile) {
        try { synced = await syncPayoutMethodFromStripeAccount(profile.id, account.id); }
        catch (e) { console.warn('account.updated sync failed:', e); }
      }
      return new Response(JSON.stringify({ received: true, synced: !!synced }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Confirms an automated payout's money actually arrived at the host's
    // bank — request-payout already flips the row to 'sent' synchronously
    // right after creating the Payout; this is the later, authoritative
    // "it landed" signal Stripe pushes async.
    if (event.type === 'payout.paid') {
      const payout = event.data?.object;
      const row = payout?.id ? await selectOne('payout_requests', `stripe_payout_id=eq.${payout.id}`) : null;
      if (row && row.status !== 'paid') {
        await fetch(rest(`/payout_requests?id=eq.${row.id}`), {
          method: 'PATCH', headers: { ...REST_H, Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'paid', completed_at: new Date().toISOString() }),
        });
        await insertNotification({ user_id: row.host_id, actor_id: null, actor_name: 'Filmons', type: 'payout_paid', title: `Your $${Number(row.amount).toFixed(2)} CAD payout has arrived`, is_read: false });
      }
      return new Response(JSON.stringify({ received: true, updated: !!row }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Stripe couldn't complete the payout after request-payout already
    // reported it as 'sent' (e.g. the bank rejected it after dispatch) --
    // reverse the reservation the same way a synchronous failure does, so
    // the host's available balance is never silently short.
    if (event.type === 'payout.failed') {
      const payout = event.data?.object;
      const row = payout?.id ? await selectOne('payout_requests', `stripe_payout_id=eq.${payout.id}`) : null;
      if (row && row.status !== 'failed') {
        await rpc('fn_reverse_payout_request', { p_payout_request_id: row.id });
        await fetch(rest(`/payout_requests?id=eq.${row.id}`), {
          method: 'PATCH', headers: { ...REST_H, Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'failed', admin_notes: payout.failure_message || null, completed_at: new Date().toISOString() }),
        });
        const host = await selectOne('profiles', `id=eq.${row.host_id}`);
        await sendPayoutFailedEmail({ toEmail: host?.email, toName: host?.name, amount: Number(row.amount), currency: row.currency || 'CAD', withdrawalId: row.id }).catch(() => {});
        await insertNotification({ user_id: row.host_id, actor_id: null, actor_name: 'Filmons', type: 'payout_failed', title: `Your $${Number(row.amount).toFixed(2)} CAD payout could not be completed`, is_read: false });
      }
      return new Response(JSON.stringify({ received: true, updated: !!row }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (event.type !== 'checkout.session.completed') {
      // Acknowledge everything else — Stripe retries on non-2xx.
      return new Response(JSON.stringify({ received: true, ignored: event.type }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const session = event.data?.object;
    const meta = session?.metadata || {};

    // Professional/Business subscription activation — never frontend-driven.
    // Only this webhook (Stripe-confirmed payment) ever calls
    // fn_activate_subscription.
    if (meta.charge_type === 'subscription') {
      if (!meta.user_id || !meta.plan || !session.subscription) {
        return new Response(JSON.stringify({ received: true, skipped: 'no user_id/plan/subscription' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const SK = Deno.env.get('STRIPE_SECRET_KEY');
      const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, { headers: { Authorization: `Bearer ${SK}` } });
      const sub = await subRes.json();
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;

      await rpc('fn_activate_subscription', {
        p_user_id: meta.user_id, p_plan: meta.plan,
        p_customer_id: session.customer || null, p_subscription_id: session.subscription,
        p_period_end: periodEnd,
      });

      // Plan switch (e.g. Professional -> Business) — cancel the old
      // subscription immediately now that the new one is active, so the
      // user is never left paying for two plans at once.
      if (meta.previous_subscription_id && meta.previous_subscription_id !== session.subscription) {
        await fetch(`https://api.stripe.com/v1/subscriptions/${meta.previous_subscription_id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${SK}` },
        }).catch(() => {});
      }

      return new Response(JSON.stringify({ received: true, activated: meta.plan }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Boost purchases are a separate charge type — pure platform revenue,
    // no host-earning leg, so they route to fn_finalize_boost_payment
    // instead of the rental-payment path below.
    if (meta.charge_type === 'boost') {
      if (!meta.boost_id) {
        return new Response(JSON.stringify({ received: true, skipped: 'no boost_id' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const amount = parseFloat(meta.total_budget || '0') || (session.amount_total ? session.amount_total / 100 : 0);
      const processed = await rpc('fn_finalize_boost_payment', {
        p_idempotency_key: event.id,
        p_boost_id: meta.boost_id,
        p_amount: amount,
        p_currency: 'CAD',
      });
      return new Response(JSON.stringify({ received: true, processed }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Emergency Listing upgrades — same "pure platform revenue, no
    // host-earning leg" shape as boost above, but fixed-tier pricing
    // (72_hour/7_day) instead of a variable budget, so it gets its own
    // finalize function rather than being forced through
    // fn_finalize_boost_payment's budget/duration_days assumptions.
    if (meta.charge_type === 'emergency') {
      if (!meta.emergency_id) {
        return new Response(JSON.stringify({ received: true, skipped: 'no emergency_id' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const amount = parseFloat(meta.amount || '0') || (session.amount_total ? session.amount_total / 100 : 0);
      const processed = await rpc('fn_finalize_emergency_payment', {
        p_idempotency_key: event.id,
        p_emergency_id: meta.emergency_id,
        p_amount: amount,
        p_currency: 'CAD',
      });
      return new Response(JSON.stringify({ received: true, processed }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Paid Opportunity hire funding — a separate charge type so it can
    // never fall through into the generic rental path below even though it
    // also carries host-earning-shaped metadata. Worker earnings are only
    // ever created here, after Stripe confirms payment — never at "Choose
    // Applicant" or "Accept Offer" time.
    if (meta.charge_type === 'opportunity') {
      if (!meta.transaction_id || !meta.worker_id || !meta.owner_id) {
        return new Response(JSON.stringify({ received: true, skipped: 'no transaction_id/worker_id/owner_id' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const grossAmount = parseFloat(meta.gross_amount || '0');
      const feeAmount = parseFloat(meta.fee_amount || '0');
      const netAmount = parseFloat(meta.net_amount || '0');
      const holdReviewDays = parseInt(meta.hold_review_days || '7', 10);

      // A real orders row -- this is what makes dispute-gating
      // (fn_release_pending_earnings already checks orders.dispute_status)
      // and admin volume/revenue reporting work with zero new code.
      const orderId = `OPP-${meta.transaction_id}`;
      await fetch(rest('/orders'), {
        method: 'POST', headers: { ...REST_H, Prefer: 'return=minimal,resolution=ignore-duplicates' },
        body: JSON.stringify({
          id: orderId, type: 'opportunity', status: 'paid',
          host_id: meta.worker_id, renter_id: meta.owner_id,
          listing_title: meta.listing_title || null, listing_type: 'Opportunity',
          total_amount: grossAmount, subtotal: grossAmount, seller_fee_amount: feeAmount, seller_fee_rate: grossAmount ? feeAmount / grossAmount : 0,
          currency: 'CAD', payment_method: 'Credit/Debit Card',
          dispute_status: 'none', refund_status: 'none',
          stripe_payment_intent_id: session.payment_intent || null,
          conversation_id: meta.conversation_id || null,
          paid_at: new Date().toISOString(),
        }),
      });

      const processed = await rpc('fn_finalize_opportunity_payment', {
        p_idempotency_key: event.id,
        p_transaction_id: meta.transaction_id,
        p_order_id: orderId,
        p_worker_id: meta.worker_id,
        p_owner_id: meta.owner_id,
        p_gross_amount: grossAmount,
        p_fee_amount: feeAmount,
        p_net_amount: netAmount,
        p_currency: 'CAD',
        p_hold_review_days: holdReviewDays,
        p_stripe_session_id: session.id,
        p_stripe_payment_intent_id: session.payment_intent || null,
      });

      if (processed) {
        const app = await selectOne('opportunity_applications', `id=eq.${meta.application_id}`);
        if (app?.conversation_id) {
          await fetch(rest('/messages'), {
            method: 'POST', headers: { ...REST_H, Prefer: 'return=minimal' },
            body: JSON.stringify({
              id: crypto.randomUUID(), conversation_id: app.conversation_id, sender_id: 'system', sender_name: 'Filmons',
              content: null, type: 'system',
              metadata: { systemText: `Payment secured ✓ — $${netAmount.toFixed(2)} is held for the creator and becomes available once the opportunity is confirmed complete.` },
              created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_deleted: false, is_pinned: false,
            }),
          }).catch(() => {});
        }
        await insertNotification({ user_id: meta.owner_id, actor_id: null, actor_name: 'Filmons', type: 'system_notification', title: `Payment secured ✓ — held for creator on ${meta.listing_title || 'your opportunity'}`, conversation_id: app?.conversation_id || null, is_read: false });
        await insertNotification({ user_id: meta.worker_id, actor_id: null, actor_name: 'Filmons', type: 'payment_received', title: `$${netAmount.toFixed(2)} on hold for ${meta.listing_title || 'your opportunity'}`, conversation_id: app?.conversation_id || null, is_read: false });

        const workerProfile = await selectOne('profiles', `id=eq.${meta.worker_id}`);
        if (workerProfile?.email) {
          sendGenericNotificationEmail(
            workerProfile.email, workerProfile.name,
            'Payment secured — you can start your FILMONS opportunity',
            `Your opportunity is officially confirmed!\n\nPayment for "${meta.listing_title || 'your opportunity'}" has been successfully secured.\n\nService Amount: $${netAmount.toFixed(2)} CAD\nPayment: Secured\nWallet Status: On Hold\n\nThe full service amount is now shown in your Filmons Wallet as On Hold. Complete the agreed work and mark it complete when finished — funds move to Available once the owner confirms completion.`,
          ).catch(() => {});
        }
      }

      return new Response(JSON.stringify({ received: true, processed }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Hire From Portfolio funding — same shape as the 'opportunity' branch
    // above (role names swapped: host earns here, not the metadata's
    // generic "worker"). Earnings are only ever created here, after Stripe
    // confirms payment — never at "Accept" or "terms agreed" time.
    if (meta.charge_type === 'hire') {
      if (!meta.transaction_id || !meta.host_id || !meta.requester_id) {
        return new Response(JSON.stringify({ received: true, skipped: 'no transaction_id/host_id/requester_id' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const grossAmount = parseFloat(meta.gross_amount || '0');
      const feeAmount = parseFloat(meta.fee_amount || '0');
      const netAmount = parseFloat(meta.net_amount || '0');
      const holdReviewDays = parseInt(meta.hold_review_days || '7', 10);

      const orderId = `HIRE-${meta.transaction_id}`;
      await fetch(rest('/orders'), {
        method: 'POST', headers: { ...REST_H, Prefer: 'return=minimal,resolution=ignore-duplicates' },
        body: JSON.stringify({
          id: orderId, type: 'hire', status: 'paid',
          host_id: meta.host_id, renter_id: meta.requester_id,
          listing_title: meta.project_title || null, listing_type: 'Direct Hire',
          total_amount: grossAmount, subtotal: grossAmount, seller_fee_amount: feeAmount, seller_fee_rate: grossAmount ? feeAmount / grossAmount : 0,
          currency: 'CAD', payment_method: 'Credit/Debit Card',
          dispute_status: 'none', refund_status: 'none',
          stripe_payment_intent_id: session.payment_intent || null,
          conversation_id: meta.conversation_id || null,
          paid_at: new Date().toISOString(),
        }),
      });

      const processed = await rpc('fn_finalize_hire_payment', {
        p_idempotency_key: event.id,
        p_transaction_id: meta.transaction_id,
        p_order_id: orderId,
        p_host_id: meta.host_id,
        p_requester_id: meta.requester_id,
        p_gross_amount: grossAmount,
        p_fee_amount: feeAmount,
        p_net_amount: netAmount,
        p_currency: 'CAD',
        p_hold_review_days: holdReviewDays,
        p_stripe_session_id: session.id,
        p_stripe_payment_intent_id: session.payment_intent || null,
      });

      if (processed) {
        if (meta.conversation_id) {
          await fetch(rest('/messages'), {
            method: 'POST', headers: { ...REST_H, Prefer: 'return=minimal' },
            body: JSON.stringify({
              id: crypto.randomUUID(), conversation_id: meta.conversation_id, sender_id: 'system', sender_name: 'Filmons',
              content: null, type: 'system',
              metadata: { systemText: `Payment secured ✓ — $${netAmount.toFixed(2)} is held for the host and becomes available once the work is confirmed complete.` },
              created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_deleted: false, is_pinned: false,
            }),
          }).catch(() => {});
        }
        await insertNotification({ user_id: meta.requester_id, actor_id: null, actor_name: 'Filmons', type: 'system_notification', title: `Payment secured ✓ — held for host on ${meta.project_title || 'your hire'}`, conversation_id: meta.conversation_id || null, is_read: false });
        await insertNotification({ user_id: meta.host_id, actor_id: null, actor_name: 'Filmons', type: 'payment_received', title: `$${netAmount.toFixed(2)} on hold for ${meta.project_title || 'your hire'}`, conversation_id: meta.conversation_id || null, is_read: false });

        const hostProfile = await selectOne('profiles', `id=eq.${meta.host_id}`);
        if (hostProfile?.email) {
          sendGenericNotificationEmail(
            hostProfile.email, hostProfile.name,
            'Hire payment confirmed on Filmons ✓',
            `"${meta.project_title || 'Your hire'}" is funded — $${netAmount.toFixed(2)} CAD is held in your Filmons Wallet and becomes available once the work is confirmed complete.`,
          ).catch(() => {});
        }
      }

      return new Response(JSON.stringify({ received: true, processed }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const hostId = meta.host_id;
    const subtotal = parseFloat(meta.subtotal || '0');
    const buyerFeeAmount = parseFloat(meta.buyer_fee_amount || '0');
    const sellerFeeAmount = parseFloat(meta.seller_fee_amount || '0');

    if (!hostId || !subtotal) {
      // Not a rental/marketplace payment (or missing metadata) — nothing
      // to credit. Acknowledge so Stripe doesn't keep retrying.
      return new Response(JSON.stringify({ received: true, skipped: 'no host_id/subtotal' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const availableAt = meta.rental_end_date
      ? new Date(new Date(meta.rental_end_date).getTime() + 48 * 3600 * 1000).toISOString()
      : new Date(Date.now() + 48 * 3600 * 1000).toISOString();

    const processed = await rpc('fn_finalize_payment', {
      p_idempotency_key: event.id,
      p_order_id: session.id,
      p_host_id: hostId,
      p_subtotal: subtotal,
      p_seller_fee_amount: sellerFeeAmount,
      p_buyer_fee_amount: buyerFeeAmount,
      p_currency: 'CAD',
      p_available_at: availableAt,
    });

    // Guaranteed-to-run confirmation fallback — only on first processing
    // (never on a Stripe redelivery of the same event), and only best-
    // effort: none of this blocks the wallet credit above, which already
    // happened. If the browser does successfully return to Checkout.tsx,
    // finalizeOrder still runs its full flow (real agreement/receipt
    // documents, its own order upsert) independently of this.
    if (processed && meta.agreement_id) {
      try {
        const agRow = await selectOne('rental_agreements', `id=eq.${meta.agreement_id}`);
        const hostProfile = await selectOne('profiles', `id=eq.${hostId}`);
        if (agRow) {
          const details = agRow.rental_details_snapshot || {};
          const total = subtotal + buyerFeeAmount;
          const orderId = `ORD-${agRow.agreement_number}`;
          const receiptId = `RCP-${String(agRow.agreement_number).split('-')[1] || Date.now()}`;
          const renterName = [agRow.legal_first_name, agRow.legal_last_name].filter(Boolean).join(' ') || 'Renter';

          // Minimal order record — best-effort; if finalizeOrder also runs
          // client-side later it'll hit a duplicate-key conflict on this
          // same id and just skip (documents are looked up via
          // rental_agreement_id, not stored redundantly on this row).
          await fetch(rest('/orders'), {
            method: 'POST', headers: { ...REST_H, Prefer: 'return=minimal,resolution=ignore-duplicates' },
            body: JSON.stringify({
              id: orderId, type: details.listingType === 'service' ? 'service' : (details.listingMode === 'sale' ? 'sale' : 'rental'),
              status: 'paid', renter_id: agRow.renter_id, host_id: hostId,
              renter_name: renterName, renter_email: agRow.verified_email, host_name: hostProfile?.name || null,
              listing_title: details.listingTitle || null, listing_type: details.listingType || 'Rental',
              start_date: details.startDate || null, duration: details.duration || 1, duration_type: details.durationType || 'day',
              total_amount: total, payment_method: 'Credit/Debit Card', currency: 'CAD', transaction_id: session.id,
              agreement_id: agRow.agreement_number, receipt_id: receiptId, rental_agreement_id: agRow.id,
              conversation_id: meta.conversation_id || null, message_id: meta.message_id || null,
              paid_at: new Date().toISOString(), subtotal, buyer_fee_rate: parseFloat(meta.buyer_fee_rate || '0'),
              buyer_fee_amount: buyerFeeAmount, seller_fee_rate: 0, seller_fee_amount: sellerFeeAmount,
              fee_config_version: meta.fee_config_version || null,
              stripe_payment_intent_id: session.payment_intent || null,
            }),
          });

          // ignore-duplicates on the insert above means this never
          // overwrites stripe_payment_intent_id if finalizeOrder's own
          // client-side insert already created the row first — patch it in
          // regardless, refunds need it and there's nothing else that sets it.
          if (session.payment_intent) {
            await fetch(rest(`/orders?id=eq.${orderId}`), {
              method: 'PATCH', headers: { ...REST_H, Prefer: 'return=minimal' },
              body: JSON.stringify({ stripe_payment_intent_id: session.payment_intent }),
            });
          }

          if (hostId) {
            await insertNotification({
              user_id: hostId, actor_id: agRow.renter_id, actor_name: renterName,
              type: 'payment_received', title: `Payment received from ${renterName}`,
              conversation_id: meta.conversation_id || null, is_read: false,
            });
          }

          const sharedParams = {
            ref_no: agRow.agreement_number, renter_name: renterName, renter_email: agRow.verified_email || '',
            renter_phone: agRow.verified_phone || '', host_name: hostProfile?.name || '—',
            listing_title: details.listingTitle || '—', listing_type: details.listingType || 'Rental',
            start_date: details.startDate || '—', duration: `${details.duration || 1} ${details.durationType || 'day'}(s)`,
            payment_method: 'Credit/Debit Card', total_amount: `$${total.toFixed(2)}`, agreement_url: '', receipt_url: '',
            greeting_message: 'Your payment is confirmed! View your rental agreement and receipt anytime from Dashboard → Orders.',
            year: String(new Date().getFullYear()),
          };
          if (agRow.verified_email) {
            sendFallbackEmail({ ...sharedParams, to_email: agRow.verified_email, to_name: renterName, reply_to: 'filmons481@gmail.com' });
          }
          if (hostProfile?.email) {
            sendFallbackEmail({ ...sharedParams, to_email: hostProfile.email, to_name: hostProfile.name || 'Host', reply_to: agRow.verified_email || 'filmons481@gmail.com' });
          }
        }
      } catch (e) {
        console.warn('Confirmation fallback failed (wallet credit already succeeded):', e);
      }
    }

    return new Response(JSON.stringify({ received: true, processed }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('stripe-webhook error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
