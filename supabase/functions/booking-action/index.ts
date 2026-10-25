// Participant actions on an active booking:
//   returned        -- the renter records the equipment as returned (server timestamp + optional note / photo evidence),
//                      so a delayed host confirmation can't create extra late fees.
//   work_submitted  -- the service provider submits the work; the customer then confirms it or reports a problem.
// Auth: the caller's Supabase JWT.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
const rest = (p: string) => `${SUPABASE_URL}/rest/v1${p}`;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer /i, '');
    const userRes = token ? await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_KEY } }) : null;
    const caller = userRes?.ok ? await userRes.json() : null;
    if (!caller?.id) return json({ error: 'Please sign in again.' }, 401);

    const { orderId, action, note, evidence } = await req.json();
    const oRes = await fetch(rest(`/orders?id=eq.${encodeURIComponent(orderId || '')}&select=*&limit=1`), { headers: H });
    const order = (await oRes.json())?.[0];
    if (!order) return json({ error: 'Booking not found' }, 404);
    if (order.completed_at) return json({ error: 'This booking is already finished.' }, 400);
    if (order.refund_status === 'refunded') return json({ error: 'This booking was refunded.' }, 400);

    const patch = async (body: Record<string, unknown>) => fetch(rest(`/orders?id=eq.${encodeURIComponent(orderId)}`), { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    const notify = (user_id: string, title: string) => fetch(rest('/notifications'), {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id, actor_id: null, actor_name: 'Filmons', type: 'system_notification', is_read: false, conversation_id: order.conversation_id || null, title }),
    }).catch(() => {});

    if (action === 'returned') {
      if (order.type === 'service') return json({ error: 'Only rentals can be marked returned.' }, 400);
      if (order.renter_id !== caller.id) return json({ error: 'Only the renter can record a return.' }, 403);
      if (order.returned_at) return json({ success: true, returnedAt: order.returned_at });
      const returnedAt = new Date().toISOString();
      const ev = Array.isArray(evidence) ? evidence.filter((u: unknown) => typeof u === 'string').slice(0, 6) : [];
      await patch({ returned_at: returnedAt, returned_note: typeof note === 'string' ? note.slice(0, 1000) : null, returned_evidence: ev });
      await notify(order.host_id, `${order.renter_name || 'The renter'} says ${order.listing_title || 'the equipment'} was returned. Please check it and tap “Rental finished”.`);
      return json({ success: true, returnedAt });
    }

    if (action === 'work_submitted') {
      if (order.type !== 'service') return json({ error: 'Only services can be submitted.' }, 400);
      if (order.host_id !== caller.id) return json({ error: 'Only the provider can submit the work.' }, 403);
      if (order.work_submitted_at) return json({ success: true });
      await patch({ work_submitted_at: new Date().toISOString() });
      await notify(order.renter_id, `${order.host_name || 'Your provider'} submitted the work for ${order.listing_title || 'your service'}. Please confirm it’s complete or report a problem.`);
      return json({ success: true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('booking-action error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
