// The only path that can delete (soft-delete) a listing. Ownership is
// verified against the listing's real user_id column server-side — the
// client can't bypass this by hiding the menu or calling the route
// directly (same client-asserted-userId trust model as the rest of this
// app's edge functions, e.g. rental-agreement-sign).
//
// Soft delete only: sets is_active = false. Never a hard DELETE — orders,
// rental agreements, receipts, and wallet transactions all reference
// listing_id and must never cascade-lose their listing context.
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

function rentalEndDate(startDate: string, duration: number, durationType: string): Date {
  const start = new Date(startDate);
  const unit = (durationType || 'day').toLowerCase();
  const days = unit.startsWith('hour') ? Math.ceil((duration || 1) / 24)
    : unit.startsWith('week') ? (duration || 1) * 7
    : unit.startsWith('month') ? (duration || 1) * 30
    : (duration || 1); // day(s) — default
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(days, 1));
  return end;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const { listingId, userId } = await req.json();
    if (!listingId || !userId) {
      return new Response(JSON.stringify({ error: 'Missing listingId or userId' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const listing = await selectOne('listings', `id=eq.${listingId}`);
    if (!listing) return new Response(JSON.stringify({ error: 'Listing not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (listing.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'You do not own this listing' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (listing.is_active === false) {
      return new Response(JSON.stringify({ success: true, already_deleted: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Orders don't track a real lifecycle status (every row is only ever
    // created after payment succeeds, so status is always 'paid') — an
    // "active or upcoming" rental is derived from whether its rental
    // period has ended yet, not from a status enum.
    const ordersRes = await fetch(
      rest(`/orders?listing_id=eq.${listingId}&select=id,start_date,duration,duration_type,dispute_status&order=start_date.desc`),
      { headers: H },
    );
    const orders: any[] = await ordersRes.json();

    const now = new Date();
    const blocking = (orders || []).find(o => {
      if (o.dispute_status === 'disputed') return true;
      if (!o.start_date) return false;
      return rentalEndDate(o.start_date, o.duration, o.duration_type) >= now;
    });

    if (blocking) {
      return new Response(JSON.stringify({
        error: 'active_rental',
        message: "This listing is connected to an active or upcoming rental. Complete or resolve the rental before deleting the listing.",
      }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    await fetch(rest(`/listings?id=eq.${listingId}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
    });

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('delete-listing error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
