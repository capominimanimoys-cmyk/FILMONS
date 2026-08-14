// Releases pending host earnings whose available_at has passed, moving
// them from pending_balance to available_balance. Triggered on a schedule
// by .github/workflows/release-pending-earnings.yml (hourly) — matches
// this repo's existing pattern of GitHub Actions doing operational work,
// and needs no pg_cron dependency (which may not be enabled on this
// Supabase plan).
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_release_pending_earnings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: '{}',
    });
    if (!res.ok) throw new Error(`RPC failed: ${res.status} ${await res.text()}`);
    const released = await res.json();
    return new Response(JSON.stringify({ success: true, released }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('release-pending-earnings error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
