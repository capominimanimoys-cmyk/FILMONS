// Finalizes a rental agreement. This is the ONLY code path allowed to set
// status='signed' on a rental_agreements row (also enforced by a DB trigger,
// see 20240213000000_rental_agreements_v2.sql) — the browser can create and
// update a 'draft'/'ready_to_sign' row directly (matching this app's
// existing client-trust model everywhere else), but the actual rental
// rules, pricing, and party identities that go into the signed snapshot are
// re-derived here from the DB, not accepted from the client. Runs with the
// service-role key the Supabase platform injects automatically.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function rest(path: string) {
  return `${SUPABASE_URL}/rest/v1${path}`;
}
const H = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'apikey': SERVICE_KEY,
};

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function patch(table: string, filter: string, body: Record<string, unknown>) {
  const res = await fetch(rest(`/${table}?${filter}`), {
    method: 'PATCH',
    headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function insertAudit(row: Record<string, unknown>) {
  await fetch(rest('/rental_agreement_audit_log'), {
    method: 'POST', headers: { ...H, 'Prefer': 'return=minimal' }, body: JSON.stringify(row),
  }).catch(() => {});
}

const AGREEMENT_TERMS_VERSION = '2026.1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const { agreementId, renterId, messageId, listingId } = await req.json();
    if (!agreementId || !renterId) {
      return new Response(JSON.stringify({ error: 'Missing agreementId or renterId' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // 1. Load the draft — must exist, must belong to the caller.
    const draft = await selectOne('rental_agreements', `id=eq.${agreementId}`);
    if (!draft) return new Response(JSON.stringify({ error: 'Agreement not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (draft.renter_id !== renterId) {
      return new Response(JSON.stringify({ error: 'Agreement does not belong to this renter' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (draft.status === 'signed') {
      return new Response(JSON.stringify({ success: true, agreement: draft, already_signed: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // 2. Required fields must actually be present — never trust a client
    // claim of "ready to sign" without checking.
    const missing: string[] = [];
    if (!draft.legal_first_name || !draft.legal_last_name) missing.push('legal name');
    if (!draft.date_of_birth) missing.push('date of birth');
    if (!draft.address_line1 || !draft.city || !draft.postal_code) missing.push('address');
    if (!draft.id_front_path) missing.push('government ID');
    if (!draft.proof_of_address_path) missing.push('proof of address');
    if (!draft.signature_path) missing.push('signature');
    if (missing.length) {
      return new Response(JSON.stringify({ error: `Missing required information: ${missing.join(', ')}` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // 3. Re-derive verified contact info server-side — the client's copy is
    // never trusted for this, only used to decide whether to show the
    // "contact verification required" screen before ever reaching here.
    const profile = await selectOne('profiles', `id=eq.${renterId}`);
    if (!profile) return new Response(JSON.stringify({ error: 'Renter profile not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (!profile.email_verified || !profile.phone_verified) {
      return new Response(JSON.stringify({ error: 'Contact verification required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // 4. Re-derive the rental details from the authoritative payment-request
    // message (Checkout.tsx's source of truth before an `orders` row exists)
    // and the listing's current rental rules — not from anything the client
    // sent alongside the sign request.
    let rentalDetails: Record<string, unknown> = {};
    if (messageId) {
      const msg = await selectOne('messages', `id=eq.${messageId}`);
      const meta = typeof msg?.metadata === 'string' ? JSON.parse(msg.metadata) : msg?.metadata;
      if (meta?.paymentRequest) {
        const pr = meta.paymentRequest;
        rentalDetails = {
          listingTitle: pr.listingTitle, listingType: pr.listingType, listingMode: pr.listingMode,
          startDate: pr.startDate, duration: pr.duration, durationType: pr.durationType,
          amount: pr.amount,
        };
      }
    }

    let rulesSnapshot: Record<string, unknown> = {};
    let hostId = draft.host_id;
    if (listingId) {
      const listing = await selectOne('listings', `id=eq.${listingId}`);
      if (listing) {
        rulesSnapshot = { requirements: listing.requirements || null, cancellation: listing.cancellation || null };
        hostId = listing.user_id || hostId;
      }
    }

    const now = new Date().toISOString();
    const agreementNumber = draft.agreement_number || `FLM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    const signed = await patch('rental_agreements', `id=eq.${agreementId}`, {
      agreement_number: agreementNumber,
      host_id: hostId,
      verified_email: profile.email,
      verified_phone: profile.phone,
      rental_rules_snapshot: rulesSnapshot,
      rental_details_snapshot: rentalDetails,
      pricing_snapshot: { amount: rentalDetails.amount ?? draft.pricing_snapshot?.amount ?? null, currency: 'CAD' },
      agreement_terms_version: AGREEMENT_TERMS_VERSION,
      id_verification_status: 'provided',
      address_verification_status: 'provided',
      status: 'signed',
      signed_at: now,
    });

    if (!signed) {
      return new Response(JSON.stringify({ error: 'Failed to finalize agreement' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    await insertAudit({ agreement_id: agreementId, action: 'signed', actor_id: renterId, actor_role: 'renter' });

    return new Response(JSON.stringify({ success: true, agreement: signed }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('rental-agreement-sign error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
