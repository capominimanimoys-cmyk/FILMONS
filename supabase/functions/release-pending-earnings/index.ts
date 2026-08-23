// Releases pending host earnings whose available_at has passed, moving
// them from pending_balance to available_balance. Also runs the
// Opportunity/Hire auto-release + reminder passes on the same hourly
// tick — see 20240314000000_opportunity_hire_auto_release.sql. Triggered
// on a schedule by .github/workflows/release-pending-earnings.yml
// (hourly) — matches this repo's existing pattern of GitHub Actions
// doing operational work, and needs no pg_cron dependency (which may
// not be enabled on this Supabase plan).
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

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

async function notifyOpportunityReleased(rows: any[]) {
  for (const r of rows) {
    const listing = await selectOne('listings', `id=eq.${r.listing_id}`);
    const worker = await selectOne('profiles', `id=eq.${r.worker_id}`);
    const title = listing?.title || 'your opportunity';
    await insertNotification({ user_id: r.worker_id, actor_id: null, actor_name: 'Filmons', type: 'payment_released', title: `$${Number(r.net_amount).toFixed(2)} from ${title} is now available` });
    await insertNotification({ user_id: r.owner_id, actor_id: null, actor_name: 'Filmons', type: 'system_notification', title: `Funds for ${title} were automatically released` });
    sendEmail(worker?.email, worker?.name, 'Funds released — FILMONS',
      `$${Number(r.net_amount).toFixed(2)} CAD from "${title}" is now available in your Filmons Wallet.\n\nThis was released automatically after the owner didn't confirm or report an issue within the review window.`,
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
    const listing = await selectOne('listings', `id=eq.${r.listing_id}`);
    const title = listing?.title || 'your opportunity';
    await insertNotification({ user_id: r.owner_id, actor_id: null, actor_name: 'Filmons', type: 'system_notification', title: `Confirm completion for ${title} — funds release automatically in ${r.days_left} day` });
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
    const released = await rpc('fn_release_pending_earnings');

    const [oppReleased, hireReleased, oppReminders, hireReminders] = await Promise.all([
      rpc('fn_auto_release_opportunity_payments'),
      rpc('fn_auto_release_hire_payments'),
      rpc('fn_opportunity_auto_release_reminders'),
      rpc('fn_hire_auto_release_reminders'),
    ]);

    await Promise.all([
      notifyOpportunityReleased(oppReleased),
      notifyHireReleased(hireReleased),
      notifyOpportunityReminders(oppReminders),
      notifyHireReminders(hireReminders),
    ]);

    return new Response(JSON.stringify({
      success: true, released,
      autoReleased: { opportunity: oppReleased.length, hire: hireReleased.length },
      reminders: { opportunity: oppReminders.length, hire: hireReminders.length },
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('release-pending-earnings error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
