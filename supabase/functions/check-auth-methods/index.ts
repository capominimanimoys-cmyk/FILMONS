// Ground truth for "what auth methods does this email actually have" —
// reads the real auth.users/auth.identities record via Supabase's Admin
// API (service-role only, never callable with the anon key from the
// client). Replaces the old fragile heuristic in authApi.signin that
// guessed "unconfirmed" vs "wrong password" from whether
// supabase.auth.resend() happened to succeed — that guess was wrong for
// Google-only accounts (which have no email/password identity and were
// being misreported as "email not confirmed").
//
// This project does NOT have Supabase Auth's automatic identity linking
// enabled (confirmed by OAuthCallback.tsx's own custom "email already
// has a Filmons account" handling -- that code path only exists because
// Google sign-in creates a BRAND NEW, separate auth.users row for an
// email that already has a password account, rather than merging into
// it). Merely clicking "Continue with Google" on a matching email is
// enough to create that second row, even if the user never finishes
// linking it. So there can be MULTIPLE auth.users rows sharing one
// email, each with only one identity provider on it -- picking just the
// first match (the old `.find()`) could return the Google-only row and
// wrongly report the email as having no password identity at all. Every
// row for this email is aggregated below instead, so a password
// identity on ANY of them is never lost because of a stray, possibly
// abandoned OAuth attempt on another row.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { email } = await req.json();
    if (!email) return json({ error: 'Missing email' }, 400);

    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email.toLowerCase())}`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('check-auth-methods admin lookup failed:', data);
      return json({ error: 'Could not check account' }, 500);
    }

    // Different GoTrue versions return either a bare array or { users: [...] }.
    // The admin list endpoint's `?email=` filter isn't guaranteed to be an
    // exact match either, so this still re-checks equality itself.
    const users = Array.isArray(data) ? data : (data.users || []);
    const matches = users.filter((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());

    if (matches.length === 0) return json({ exists: false, providers: [], emailConfirmed: false });

    // Union providers/confirmation across every row for this email — see
    // the file header for why more than one row can exist.
    //
    // `identities[].provider` is NOT a reliable source on its own -- this
    // was the actual root cause of a real "wrong password shows a social-
    // account message" bug: for a genuine email/password account, GoTrue
    // doesn't always populate the `identities` sub-array (it was designed
    // to track LINKED identities, and behavior around whether a plain
    // password signup gets its own entry there has varied across GoTrue
    // versions/configs). Since this whole function only ever runs after
    // signInWithPassword has already FAILED, an empty `identities` array
    // was silently read as "no email/password identity exists at all",
    // producing an OAUTH_ONLY classification with an empty providers list
    // -- which is exactly why Login.tsx's providerLabel fell through to
    // the generic "a social account" wording instead of naming Google:
    // there was no real provider in the list at all, empty or otherwise.
    // `app_metadata.provider`/`app_metadata.providers` is GoTrue's own
    // summary of what the user actually signed up/in with and is far more
    // consistently populated -- unioned in alongside `identities` instead
    // of relied on exclusively, so either source finding "email" is
    // enough to correctly rule out OAUTH_ONLY.
    const providerSet = new Set<string>();
    let emailConfirmed = false;
    for (const u of matches) {
      for (const i of (u.identities || [])) if (i.provider) providerSet.add(i.provider);
      if (u.app_metadata?.provider) providerSet.add(u.app_metadata.provider);
      for (const p of (u.app_metadata?.providers || [])) if (p) providerSet.add(p);
      if (u.email_confirmed_at) emailConfirmed = true;
    }

    console.log(`check-auth-methods: email="${email}" matchedRows=${matches.length} providers=${JSON.stringify(Array.from(providerSet))}`);

    return json({
      exists: true,
      providers: Array.from(providerSet),
      emailConfirmed,
    });
  } catch (e) {
    console.error('check-auth-methods error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
