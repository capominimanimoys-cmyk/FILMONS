// Atomically claims an email or phone identity for a profile via
// account_identities (UNIQUE(provider, provider_identifier)) — the single
// enforcement point every "does this email/phone already belong to someone
// else" check in the app should go through, instead of each flow writing
// its own check-then-insert (race-prone) query.
//
// Used by: Settings email/phone change (needs to distinguish "already
// yours" from "already someone else's" without leaking account info), and
// as a fast non-authoritative pre-check before signup. Plain signup's
// authoritative protection is the profiles.email/phone unique index
// instead (see 20240215000000_unique_contact_info.sql) — simpler than a
// claim-then-rollback dance, since no profiles.id exists yet at signup time.
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

function normalize(provider: string, value: string): string {
  if (provider === 'phone') return value.replace(/\D/g, '');
  return value.trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const { profileId, provider, value, dryRun } = await req.json();
    if (!profileId || !provider || !value) {
      return new Response(JSON.stringify({ error: 'Missing profileId, provider, or value' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const identifier = normalize(provider, value);
    if (!identifier) {
      return new Response(JSON.stringify({ error: 'Invalid value' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // dryRun: just report availability, never claims — used for fast UX
    // feedback while typing, before the user has actually verified anything.
    if (dryRun) {
      const res = await fetch(rest(`/account_identities?provider=eq.${provider}&provider_identifier=eq.${encodeURIComponent(identifier)}&select=profile_id&limit=1`), { headers: H });
      const rows = await res.json();
      const existing = Array.isArray(rows) ? rows[0] : null;
      if (!existing) return new Response(JSON.stringify({ available: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ available: existing.profile_id === profileId }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Atomic claim: INSERT ... ON CONFLICT DO NOTHING is race-safe — two
    // simultaneous claims for the same identifier can never both succeed.
    // PostgREST needs the conflict target spelled out via on_conflict= to
    // use ignore-duplicates resolution (it doesn't infer it from the
    // table's own unique constraint).
    const insertRes = await fetch(rest('/account_identities?on_conflict=provider,provider_identifier'), {
      method: 'POST',
      headers: { ...H, Prefer: 'return=representation,resolution=ignore-duplicates' },
      body: JSON.stringify({ profile_id: profileId, provider, provider_identifier: identifier }),
    });
    const inserted = await insertRes.json();
    if (Array.isArray(inserted) && inserted.length > 0) {
      return new Response(JSON.stringify({ claimed: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // No row returned — either a conflict, or (rarely) an actual insert
    // error. Check who actually owns it.
    const checkRes = await fetch(rest(`/account_identities?provider=eq.${provider}&provider_identifier=eq.${encodeURIComponent(identifier)}&select=profile_id&limit=1`), { headers: H });
    const rows = await checkRes.json();
    const owner = Array.isArray(rows) ? rows[0] : null;

    if (owner?.profile_id === profileId) {
      return new Response(JSON.stringify({ claimed: true, already_linked: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (owner) {
      // Deliberately no other identifying info about the owning account.
      return new Response(JSON.stringify({ error: 'already_in_use' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Could not claim identity' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('claim-identity error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
