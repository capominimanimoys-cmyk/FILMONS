// Server-side gate for BROWSING the Emergency Listings category (Home.tsx's
// dedicated "Emergency" filter tab) -- distinct from the Emergency Listing
// PURCHASE flow (emergency-charge), which any listing owner can still use
// regardless of tier (see EmergencyListingFlow.tsx). Only Professional/
// Business accounts may browse the curated Emergency feed. Called before
// switching into that tab so the decision is never just the client's own
// (possibly stale) account_type.
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

// Same normalization as _shared/entitlements.ts's normalizeTier -- keep in
// sync if that file's mapping ever changes.
function normalizeTier(t: string | null | undefined): 'creator' | 'creator_plus' | 'professional' | 'business' {
  if (t === 'business') return 'business';
  if (t === 'professional') return 'professional';
  if (t === 'creator_plus' || t === 'service') return 'creator_plus';
  return 'creator';
}

const UPGRADE_MESSAGE = 'Emergency Listings are available with Professional and Business accounts.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ allowed: false, error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ allowed: false, error: 'Missing userId' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const res = await fetch(rest(`/profiles?id=eq.${userId}&select=account_type&limit=1`), { headers: H });
    const rows = await res.json();
    const profile = Array.isArray(rows) ? rows[0] : null;
    const tier = normalizeTier(profile?.account_type);
    const allowed = tier === 'professional' || tier === 'business';

    if (!allowed) {
      return new Response(JSON.stringify({ allowed: false, message: UPGRADE_MESSAGE }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ allowed: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ allowed: false, error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
