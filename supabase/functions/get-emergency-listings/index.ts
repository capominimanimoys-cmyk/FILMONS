// Server-gated read of Emergency listings — Professional/Business only.
// Emergency status is real, still-active data on ordinary `listings` rows
// (is_emergency=true, emergency_expires_at in the future), and this app's
// `listings` table has a fully permissive RLS policy (USING (true) — see
// 20240210000000_listings_rls_fix.sql's own comment on why: auth.uid() is
// always null here, so real per-row RLS isn't achievable without a wider
// auth migration). That means the ONLY place this restriction can actually
// be enforced — not just hidden in the UI — is a dedicated endpoint that
// never even runs the listings query for a disallowed caller. Every
// Emergency-listing read in the app (the /search/category/all preview AND
// the dedicated /search/category/emergency page) must go through this
// function instead of a direct `supabase.from('listings')` call, or this
// gate does nothing.
//
// Same trust model as every other tier check in this app (e.g.
// submit-opportunity-application): the caller's account_type is re-derived
// fresh from `profiles` by the userId given, never trusted from the
// request body directly. There is no real Supabase Auth session to bind a
// userId to server-side in this app's current architecture, so this is not
// stronger than that -- it is exactly as strong, and closes the specific
// gap this feature asked for (a restricted-tier user's own normal app
// traffic, via any route into this page, resolves the same way every time).
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

import { isProfessional } from '../_shared/entitlements.ts';

const LISTING_COLUMNS = 'id, user_id, title, description, price, city, listing_type, listing_mode, service_category, tags, images, videos, contact_methods, pricing_packages, created_at, metadata, boosted, is_emergency, emergency_plan, emergency_expires_at';

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userId, query, priceMin, priceMax, from = 0, to = 29 } = await req.json();

    // Guest (no userId at all) is denied before anything else runs.
    if (!userId) return json({ error: 'professional_required' }, 403);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile || !isProfessional(profile.account_type)) {
      return json({ error: 'professional_required' }, 403);
    }

    const params = new URLSearchParams();
    params.set('select', LISTING_COLUMNS);
    params.append('is_active', 'eq.true');
    params.append('is_emergency', 'eq.true');
    params.append('emergency_expires_at', `gt.${new Date().toISOString()}`);
    const term = typeof query === 'string' ? query.trim() : '';
    // Matches every WORD of a multi-word query separately (OR'd across
    // title/description/city), not the raw phrase as one literal
    // substring -- a query like "vancouver photographer" would otherwise
    // never match anything, since no listing's fields literally contain
    // that exact contiguous phrase. See CategoryResults.tsx's
    // termOrClause() for the client-side twin of this.
    if (term) {
      const words = term.split(/\s+/).filter(Boolean);
      const orParts = words.flatMap(w => [`title.ilike.%${w}%`, `description.ilike.%${w}%`, `city.ilike.%${w}%`]);
      params.set('or', `(${orParts.join(',')})`);
    }
    if (priceMin != null) params.append('price', `gte.${priceMin}`);
    if (priceMax != null) params.append('price', `lte.${priceMax}`);
    params.set('order', 'created_at.desc');
    params.set('limit', String(Math.max(0, (to - from) + 1)));
    params.set('offset', String(Math.max(0, from)));

    // moderation_status may not exist yet on every environment (same
    // retry-without-it fallback as withModerationFilter() client-side) --
    // tried first WITH it, retried without on a missing-column error.
    const withMod = new URLSearchParams(params); withMod.append('moderation_status', 'eq.active');
    let res = await fetch(rest(`/listings?${withMod.toString()}`), { headers: { ...H, Prefer: 'count=exact' } });
    if (!res.ok) {
      const errBody = await res.clone().json().catch(() => ({}));
      if (errBody?.code === '42703') {
        res = await fetch(rest(`/listings?${params.toString()}`), { headers: { ...H, Prefer: 'count=exact' } });
      }
    }
    if (!res.ok) {
      console.error('get-emergency-listings query failed:', await res.text());
      return json({ error: 'Could not load listings' }, 500);
    }

    const data = await res.json();
    const contentRange = res.headers.get('content-range') || ''; // "0-4/23" or "*/0"
    const total = Number(contentRange.split('/')[1]) || data.length;

    return json({ listings: data, total });
  } catch (e) {
    console.error('get-emergency-listings error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
