// Sweeps active Emergency Listing periods whose expires_at has passed and
// marks them expired, clearing listings.is_emergency/emergency_plan/
// emergency_expires_at so the badge/feed-recycling/priority visibility all
// stop -- the listing itself is never touched otherwise (still active,
// still published). Same GitHub-Actions-cron pattern as boost-expire.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const nowIso = new Date().toISOString();
    const dueRes = await fetch(
      rest(`/listing_emergencies?status=eq.active&expires_at=lte.${nowIso}&select=id,listing_id`),
      { headers: H },
    );
    const due: { id: string; listing_id: string }[] = await dueRes.json();

    for (const emergency of due || []) {
      await fetch(rest(`/listing_emergencies?id=eq.${emergency.id}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'expired', updated_at: nowIso }),
      });

      // Guard against a renewal having already created a newer active row
      // for the same listing between the query above and this write --
      // only clear the listing's flag if no OTHER active period covers it.
      const otherActiveRes = await fetch(
        rest(`/listing_emergencies?listing_id=eq.${emergency.listing_id}&status=eq.active&id=neq.${emergency.id}&select=id&limit=1`),
        { headers: H },
      );
      const otherActive = await otherActiveRes.json();
      if (!Array.isArray(otherActive) || otherActive.length === 0) {
        await fetch(rest(`/listings?id=eq.${emergency.listing_id}`), {
          method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({ is_emergency: false, emergency_plan: null, emergency_expires_at: null }),
        });
      }
    }

    return new Response(JSON.stringify({ success: true, expired: (due || []).length }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('emergency-expire error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
