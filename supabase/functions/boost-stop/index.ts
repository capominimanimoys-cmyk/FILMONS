// Owner-initiated stop of an active boost. Client-asserted userId,
// server-verified against listing_boosts.owner_id (same trust model as
// delete-listing). No refund of unused budget — this app has no billing
// model for partial refunds yet, so the UI must say so plainly before
// calling this, not this function's job to invent one.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const { boostId, userId } = await req.json();
    if (!boostId || !userId) {
      return new Response(JSON.stringify({ error: 'Missing boostId or userId' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const boost = await selectOne('listing_boosts', `id=eq.${boostId}`);
    if (!boost) return new Response(JSON.stringify({ error: 'Boost not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (boost.owner_id !== userId) {
      return new Response(JSON.stringify({ error: 'You do not own this boost' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (boost.status !== 'active' && boost.status !== 'paused') {
      return new Response(JSON.stringify({ success: true, already_stopped: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    await fetch(rest(`/listing_boosts?id=eq.${boostId}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'stopped', ends_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });

    // Only clear the listing's boosted flag if no other active boost remains.
    const otherActiveRes = await fetch(
      rest(`/listing_boosts?listing_id=eq.${boost.listing_id}&status=eq.active&id=neq.${boostId}&select=id&limit=1`),
      { headers: H },
    );
    const otherActive = await otherActiveRes.json();
    if (!Array.isArray(otherActive) || otherActive.length === 0) {
      await fetch(rest(`/listings?id=eq.${boost.listing_id}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ boosted: false }),
      });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('boost-stop error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
