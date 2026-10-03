// Releases pending host earnings whose available_at has passed, moving
// them from pending_balance to available_balance. Also runs the
// Opportunity/Hire auto-release + reminder passes on the same hourly
// tick — see 20240314000000_opportunity_hire_auto_release.sql. Triggered
// on a schedule by .github/workflows/release-pending-earnings.yml
// (hourly) — matches this repo's existing pattern of GitHub Actions
// doing operational work, and needs no pg_cron dependency (which may
// not be enabled on this Supabase plan).
//
// Runs the Stripe-availability reconciliation pass first (see
// sync-stripe-balance-availability, whose logic is inlined here so this
// single hourly tick always has fresh payout_availability_status before
// fn_release_pending_earnings runs — otherwise a row could sit an extra
// hour "confirmed available" by Stripe but not yet reflected here).
// fn_release_pending_earnings itself refuses to release anything still
// flagged payout_availability_status = 'pending', regardless of date.
import { fetchStripeAvailability, fetchBalanceTransaction } from '../_shared/stripeBalanceAvailability.ts';
import { releaseOpportunityEarning } from '../_shared/opportunityRelease.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

const STRIPE_SYNC_BATCH_LIMIT = 200;

async function syncStripeAvailability(): Promise<{ checked: number; updated: number; nowAvailable: number }> {
  const res = await fetch(
    rest(
      `/wallet_transactions?balance_type=eq.pending&status=eq.pending` +
      `&stripe_payment_intent_id=not.is.null` +
      `&or=(payout_availability_status.is.null,payout_availability_status.eq.pending)` +
      `&select=id,stripe_payment_intent_id,stripe_balance_transaction_id&limit=${STRIPE_SYNC_BATCH_LIMIT}`,
    ),
    { headers: H },
  );
  const rows: Array<{ id: string; stripe_payment_intent_id: string; stripe_balance_transaction_id: string | null }> = await res.json().catch(() => []);

  let checked = 0, updated = 0, nowAvailable = 0;
  for (const row of rows || []) {
    checked++;
    const avail = row.stripe_balance_transaction_id
      ? await fetchBalanceTransaction(row.stripe_balance_transaction_id)
      : await fetchStripeAvailability(row.stripe_payment_intent_id);
    if (!avail.balanceTransactionId || !avail.availableOn) continue;

    // fn_sync_stripe_balance_transaction RETURNS void -- checked via
    // res.ok directly (not the shared rpc() helper above, which can't
    // distinguish a void function's empty-body success from a failure;
    // both parse-fail to the same fallback value).
    const syncRes = await fetch(rest('/rpc/fn_sync_stripe_balance_transaction'), {
      method: 'POST', headers: H,
      body: JSON.stringify({
        p_wallet_transaction_id: row.id,
        p_stripe_charge_id: avail.chargeId,
        p_stripe_balance_transaction_id: avail.balanceTransactionId,
        p_stripe_available_on: avail.availableOn,
        p_payout_availability_status: avail.payoutStatus,
      }),
    });
    if (syncRes.ok) { updated++; if (avail.payoutStatus === 'available') nowAvailable++; }
    else console.error('fn_sync_stripe_balance_transaction failed:', syncRes.status, await syncRes.text());
  }
  return { checked, updated, nowAvailable };
}

async function rpc(fn: string, args: Record<string, unknown> = {}) {
  const res = await fetch(rest(`/rpc/${fn}`), { method: 'POST', headers: H, body: JSON.stringify(args) });
  if (!res.ok) { console.error(`${fn} failed:`, res.status, await res.text()); return []; }
  return res.json().catch(() => []);
}
async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}
async function deleteNotifications(filter: string) {
  await fetch(rest(`/notifications?${filter}`), { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } }).catch(() => {});
}
async function insertNotification(row: Record<string, unknown>) {
  await fetch(rest('/notifications'), { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ is_read: false, ...row }) }).catch(() => {});
}

const EMAILJS_SERVICE_ID = 'service_s6wwjtj';
const EMAILJS_PUBLIC_KEY = 'iSSpIM-AeV9uUQ7Jt';
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY') || '';
const EMAILJS_TEMPLATE_ADMIN_NOTIFICATION = 'template_rd3nhik';
async function sendEmail(toEmail: string | null | undefined, toName: string | null | undefined, subject: string, message: string) {
  if (!toEmail) return;
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID, template_id: EMAILJS_TEMPLATE_ADMIN_NOTIFICATION,
        user_id: EMAILJS_PUBLIC_KEY, accessToken: EMAILJS_PRIVATE_KEY,
        template_params: { to_email: toEmail, to_name: toName || 'there', subject, message },
      }),
    });
    if (!res.ok) console.warn('Auto-release email failed:', res.status, await res.text());
  } catch (e) { console.warn('Auto-release email threw:', e); }
}

// Auto-approval only ever happens under the explicit opportunity_payment_config
// policy (auto_approval_enabled + auto_release_days). Each auto-approved
// record goes through the same provider release step as a manual approval.
async function notifyOpportunityReleased(rows: any[]) {
  for (const r of rows) {
    const releaseStatus = await releaseOpportunityEarning(r.order_id);
    const listing = await selectOne('listings', `id=eq.${r.listing_id}`);
    const app = await selectOne('opportunity_applications', `id=eq.${r.application_id}`);
    const title = listing?.title || 'your opportunity';
    await deleteNotifications(`user_id=eq.${r.owner_id}&application_id=eq.${r.application_id}&type=in.(work_submitted,work_approval_reminder)`);
    await insertNotification({
      user_id: r.worker_id, actor_id: null, actor_name: 'Filmons', type: 'work_approved',
      title: releaseStatus === 'available'
        ? `Your work for ${title} was approved automatically. $${Number(r.net_amount).toFixed(2)} is available in your FILMONS wallet.`
        : `Your work for ${title} was approved automatically. Payment processing.`,
      application_id: r.application_id, listing_id: r.listing_id, conversation_id: app?.conversation_id || null,
    });
    await insertNotification({
      user_id: r.owner_id, actor_id: null, actor_name: 'Filmons', type: 'system_notification',
      title: `Work for ${title} was approved automatically under the FILMONS approval policy`,
      application_id: r.application_id, listing_id: r.listing_id, conversation_id: app?.conversation_id || null,
    });
  }
}
// Fires once per work record when its earning actually becomes
// withdrawable, whichever path released it.
async function notifyOpportunityAvailable(rows: any[]) {
  for (const r of rows) {
    const listing = await selectOne('listings', `id=eq.${r.listing_id}`);
    const worker = await selectOne('profiles', `id=eq.${r.worker_id}`);
    const app = await selectOne('opportunity_applications', `id=eq.${r.application_id}`);
    const title = listing?.title || 'your opportunity';
    const net = Number(r.net_amount).toFixed(2);
    await insertNotification({
      user_id: r.worker_id, actor_id: null, actor_name: 'Filmons', type: 'work_payment_available',
      title: `$${net} from ${title} is available in your FILMONS wallet`,
      application_id: r.application_id, listing_id: r.listing_id, conversation_id: app?.conversation_id || null,
    });
    sendEmail(worker?.email, worker?.name, 'Earnings available — FILMONS',
      `$${net} CAD from "${title}" is now available in your FILMONS wallet and can be withdrawn.`,
    ).catch(() => {});
  }
}
async function notifyHireReleased(rows: any[]) {
  for (const r of rows) {
    const hr = await selectOne('hire_requests', `id=eq.${r.hire_request_id}`);
    const host = await selectOne('profiles', `id=eq.${r.host_id}`);
    const title = hr?.project_title || 'your hire';
    await insertNotification({ user_id: r.host_id, actor_id: null, actor_name: 'Filmons', type: 'payment_released', title: `$${Number(r.net_amount).toFixed(2)} from ${title} is now available` });
    await insertNotification({ user_id: r.requester_id, actor_id: null, actor_name: 'Filmons', type: 'system_notification', title: `Funds for ${title} were automatically released` });
    sendEmail(host?.email, host?.name, 'Funds released — FILMONS',
      `$${Number(r.net_amount).toFixed(2)} CAD from "${title}" is now available in your Filmons Wallet.\n\nThis was released automatically after the requester didn't confirm or report an issue within the review window.`,
    ).catch(() => {});
  }
}
async function notifyOpportunityReminders(rows: any[]) {
  for (const r of rows) {
    const [listing, worker, app] = await Promise.all([
      selectOne('listings', `id=eq.${r.listing_id}`),
      selectOne('profiles', `id=eq.${r.worker_id}`),
      selectOne('opportunity_applications', `id=eq.${r.application_id}`),
    ]);
    const title = listing?.title || 'your opportunity';
    const name = worker?.name || 'Your applicant';
    let suffix = '';
    if (r.auto_release_at) {
      const days = Math.max(0, Math.ceil((new Date(r.auto_release_at).getTime() - Date.now()) / 86_400_000));
      suffix = days > 0
        ? ` Under the FILMONS approval policy it will be approved automatically in ${days} day${days === 1 ? '' : 's'}.`
        : ' Under the FILMONS approval policy it will be approved automatically soon.';
    }
    await insertNotification({
      user_id: r.owner_id, actor_id: r.worker_id, actor_name: name, type: 'work_approval_reminder',
      title: `Reminder: ${name} is waiting for you to approve their work on ${title}.${suffix}`,
      application_id: r.application_id, listing_id: r.listing_id, conversation_id: app?.conversation_id || null,
    });
  }
}
async function notifyHireReminders(rows: any[]) {
  for (const r of rows) {
    const hr = await selectOne('hire_requests', `id=eq.${r.hire_request_id}`);
    const title = hr?.project_title || 'your hire';
    await insertNotification({ user_id: r.requester_id, actor_id: null, actor_name: 'Filmons', type: 'system_notification', title: `Confirm completion for ${title} — funds release automatically in ${r.days_left} day` });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const stripeSync = await syncStripeAvailability().catch(e => {
      console.error('syncStripeAvailability failed (non-fatal, release still runs off whatever status is already stored):', e);
      return { checked: 0, updated: 0, nowAvailable: 0 };
    });

    const released = await rpc('fn_release_pending_earnings');

    // Auto-approval runs before reminders so a record approved this tick
    // never also gets an "awaiting approval" reminder.
    const oppReleased = await rpc('fn_auto_release_opportunity_payments');
    const [hireReleased, oppReminders, hireReminders] = await Promise.all([
      rpc('fn_auto_release_hire_payments'),
      rpc('fn_opportunity_approval_reminders'),
      rpc('fn_hire_auto_release_reminders'),
    ]);

    // After auto-approval + its immediate release attempt, so a record
    // released this tick is announced in the same run.
    await notifyOpportunityReleased(oppReleased);
    const oppAvailable = await rpc('fn_claim_opportunity_available_notifications');

    await Promise.all([
      notifyOpportunityAvailable(oppAvailable),
      notifyHireReleased(hireReleased),
      notifyOpportunityReminders(oppReminders),
      notifyHireReminders(hireReminders),
    ]);

    return new Response(JSON.stringify({
      success: true, released, stripeSync,
      autoReleased: { opportunity: oppReleased.length, hire: hireReleased.length },
      opportunityAvailable: oppAvailable.length,
      reminders: { opportunity: oppReminders.length, hire: hireReminders.length },
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('release-pending-earnings error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
