// Is this browser already trusted for this user? No cookie and no
// matching (non-revoked, non-expired) trusted_devices row are treated
// identically as "not trusted" — this naturally covers both a genuine
// first-ever sign-in and any later untrusted browser with no special-
// casing needed.
import { hashSecret, readCookie, corsHeadersFor } from '../_shared/deviceAuth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

// Configurable, single source of truth (server-side only, per the "do
// not hard-code throughout the frontend" requirement) — a trusted
// device still needs re-verification once its last real authentication
// (not just activity) is older than this, independent of the 90-day
// cookie/row expiry itself.
const REAUTH_DAYS = Number(Deno.env.get('TRUSTED_DEVICE_REAUTH_DAYS')) || 30;

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const rawToken = readCookie(req, 'fm_device');
    if (!rawToken) return new Response(JSON.stringify({ trusted: false }), { headers: { ...cors, 'Content-Type': 'application/json' } });

    const tokenHash = await hashSecret(rawToken);
    const nowIso = new Date().toISOString();
    const res = await fetch(
      rest(`/trusted_devices?user_id=eq.${userId}&device_token_hash=eq.${tokenHash}&revoked_at=is.null&expires_at=gt.${nowIso}&select=id,last_authenticated_at&limit=1`),
      { headers: H },
    );
    const rows = await res.json();
    const match = Array.isArray(rows) ? rows[0] : null;

    if (!match) return new Response(JSON.stringify({ trusted: false }), { headers: { ...cors, 'Content-Type': 'application/json' } });

    // Activity (last_used_at) bumps on every check regardless — it's just
    // "was this device seen recently," not a security decision. Whether
    // this check counts as *trusted* depends on last_authenticated_at
    // (only ever set by a real code verification), separately.
    fetch(rest(`/trusted_devices?id=eq.${match.id}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ last_used_at: nowIso }),
    }).catch(() => {});

    const daysSinceAuth = (Date.now() - new Date(match.last_authenticated_at).getTime()) / 86_400_000;
    const trusted = daysSinceAuth <= REAUTH_DAYS;

    return new Response(JSON.stringify({ trusted }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('device-check error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
