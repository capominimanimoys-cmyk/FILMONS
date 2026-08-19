// Sweeps active boosts whose ends_at has passed and marks them completed,
// clearing listings.boosted when no other active boost covers the listing.
// Triggered on a schedule by .github/workflows/boost-expire.yml, same
// GitHub-Actions-cron pattern as release-pending-earnings.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const nowIso = new Date().toISOString();
    const dueRes = await fetch(
      rest(`/listing_boosts?status=eq.active&ends_at=lte.${nowIso}&select=id,listing_id`),
      { headers: H },
    );
    const due: { id: string; listing_id: string }[] = await dueRes.json();

    for (const boost of due || []) {
      await fetch(rest(`/listing_boosts?id=eq.${boost.id}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'completed', updated_at: nowIso }),
      });

      const otherActiveRes = await fetch(
        rest(`/listing_boosts?listing_id=eq.${boost.listing_id}&status=eq.active&id=neq.${boost.id}&select=id&limit=1`),
        { headers: H },
      );
      const otherActive = await otherActiveRes.json();
      if (!Array.isArray(otherActive) || otherActive.length === 0) {
        await fetch(rest(`/listings?id=eq.${boost.listing_id}`), {
          method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({ boosted: false }),
        });
      }
    }

    return new Response(JSON.stringify({ success: true, expired: (due || []).length }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('boost-expire error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
