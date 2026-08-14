// Thin wrapper around fn_request_payout — replaces the old direct client
// insert into payout_requests (which never reserved anything, so a second
// simultaneous request could draw on the same available balance). This
// runs the whole check-and-reserve as one atomic DB transaction (SELECT
// ... FOR UPDATE inside the function), not a client-side check-then-insert.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function rest(path: string) {
  return `${SUPABASE_URL}/rest/v1${path}`;
}
const H = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

// Same best-effort, generic-template email pattern used by
// admin-process-payout — see that file for the caveat about there being
// no payout-specific EmailJS template yet.
const EMAILJS_SERVICE_ID = 'service_s6wwjtj';
const EMAILJS_PUBLIC_KEY = 'iSSpIM-AeV9uUQ7Jt';
const EMAILJS_TEMPLATE_ADMIN_NOTIFICATION = 'template_rd3nhik';

async function notifyHostRequested(hostId: string, amount: number) {
  const host = await selectOne('profiles', `id=eq.${hostId}`);
  const amountStr = `$${amount.toFixed(2)} CAD`;
  await fetch(rest('/notifications'), {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: hostId, actor_id: null, actor_name: 'Filmons',
      type: 'payout_requested', title: 'Your payout request was received', is_read: false,
    }),
  }).catch(() => {});

  if (!host?.email) return;
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ADMIN_NOTIFICATION,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: host.email, to_name: host.name || 'there',
          subject: 'Your Filmons payout request was received',
          message: `We've received your payout request for ${amountStr}. It's now under review — you'll be notified as it moves forward.`,
        },
      }),
    });
    if (!res.ok) console.warn('EmailJS payout-requested email failed:', res.status, await res.text());
  } catch (e) {
    console.warn('EmailJS payout-requested email threw:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const { hostId, amount, payoutMethod, payoutDestination } = await req.json();
    if (!hostId || typeof amount !== 'number' || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Missing hostId or invalid amount' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (payoutMethod && !['interac', 'bank_transfer'].includes(payoutMethod)) {
      return new Response(JSON.stringify({ error: 'Invalid payout method' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_request_payout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        p_host_id: hostId,
        p_amount: amount,
        p_currency: 'CAD',
        p_payout_method: payoutMethod || null,
        p_payout_destination: payoutDestination || null,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      const message = typeof result === 'object' && result?.message ? result.message : 'Could not request payout';
      return new Response(JSON.stringify({ error: message.includes('Insufficient') ? 'Insufficient available balance' : message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    notifyHostRequested(hostId, amount).catch(() => {});

    return new Response(JSON.stringify({ success: true, payoutRequestId: result }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('request-payout error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
