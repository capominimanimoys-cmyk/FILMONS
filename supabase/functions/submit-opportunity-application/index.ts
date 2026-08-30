// Server-verified submission of an Opportunity application — replaces
// ApplyModal.tsx's old direct client insert. Enforces the application
// entitlement (2 for Creator/Creator+, 5 for Professional, unlimited for
// Business) atomically via fn_submit_opportunity_application
// (pg_advisory_xact_lock keyed on applicant+window), so two simultaneous
// submissions can't both slip past the same limit. The reset window is
// resolved per-tier (weekly for Creator/Professional, monthly for
// Creator+/Business — see _shared/entitlements.ts's `window` field). The
// account tier used to resolve the limit is looked up fresh from
// `profiles` here, never trusted from the client — same trust model as
// delete-listing.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

import { ENTITLEMENTS, normalizeTier } from '../_shared/entitlements.ts';
import { windowStart } from '../_shared/limitWindow.ts';
import { claimEmailEvent } from '../_shared/emailEvents.ts';
import { sendNewApplicationEmail } from '../_shared/notificationEmails.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const {
      userId, listingId, ownerId, message, portfolioUrl, resumeUrl,
      demoReelUrl, availability, expectedRate, customAnswers,
    } = await req.json();
    if (!userId || !listingId || !ownerId) return json({ error: 'Missing required fields' }, 400);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile) return json({ error: 'Profile not found' }, 404);
    const tier = normalizeTier(profile.account_type);
    const limit = ENTITLEMENTS[tier].applications;

    const res = await fetch(rest('/rpc/fn_submit_opportunity_application'), {
      method: 'POST', headers: H,
      body: JSON.stringify({
        p_applicant_id: userId, p_listing_id: listingId, p_owner_id: ownerId, p_limit: limit,
        p_message: message || null, p_portfolio_url: portfolioUrl || null, p_resume_url: resumeUrl || null,
        p_demo_reel_url: demoReelUrl || null, p_availability: availability || null,
        p_expected_rate: expectedRate || null, p_custom_answers: customAnswers || {},
        p_window_start: windowStart(ENTITLEMENTS[tier].window).toISOString(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = typeof data === 'object' ? (data.message || data.error || '') : String(data);
      if (msg.includes('limit_reached')) return json({ error: 'limit_reached', plan: tier, limit }, 403);
      console.error('fn_submit_opportunity_application error:', data);
      return json({ error: 'Could not submit application' }, 500);
    }
    claimEmailEvent(`application_received:${data.id}`).then(async claimed => {
      if (!claimed) return;
      const [listing, owner] = await Promise.all([
        selectOne('listings', `id=eq.${encodeURIComponent(listingId)}`),
        selectOne('profiles', `id=eq.${ownerId}`),
      ]);
      await sendNewApplicationEmail({
        toEmail: owner?.email, toName: owner?.name,
        opportunityTitle: listing?.title || 'your opportunity',
        applicantName: profile.name || profile.username || 'A creator',
        applicationUrl: `https://filmons.app/listing/${listingId}/applicants`,
      });
    }).catch(() => {});

    return json({ success: true, application: data });
  } catch (e) {
    console.error('submit-opportunity-application error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
