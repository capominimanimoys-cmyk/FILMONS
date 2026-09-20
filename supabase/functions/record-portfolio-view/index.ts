// Records a Portfolio view and, when the atomic DB function says one is
// due, sends the aggregated "N people viewed your portfolio" email. All of
// the race-condition-sensitive counting logic lives in
// fn_record_portfolio_view (see supabase/migrations/
// 20240519000000_portfolio_view_notifications.sql) -- this function is
// just the thin HTTP wrapper + the one thing SQL can't do itself, the
// actual EmailJS send.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };

async function selectOne(table: string, filter: string): Promise<any | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&select=*&limit=1`, { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

import { sendPortfolioViewEmail } from '../_shared/notificationEmails.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { viewerId, ownerId } = await req.json();
    if (!viewerId || !ownerId) return json({ error: 'Missing fields' }, 400);
    if (viewerId === ownerId) return json({ recorded: false, reason: 'self' });

    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_record_portfolio_view`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ p_viewer_id: viewerId, p_owner_id: ownerId }),
    });
    if (!rpcRes.ok) {
      console.error('fn_record_portfolio_view failed:', await rpcRes.text());
      return json({ recorded: false }, 500);
    }
    const rows = await rpcRes.json();
    const result = Array.isArray(rows) ? rows[0] : rows;
    const unreadCount: number = result?.unread_count ?? 0;
    const shouldEmail: boolean = !!result?.should_email;

    if (!shouldEmail || unreadCount <= 0) {
      return json({ recorded: unreadCount > 0, unreadCount, emailed: false });
    }

    const [owner, settings] = await Promise.all([
      selectOne('profiles', `id=eq.${ownerId}`),
      selectOne('notification_settings', `user_id=eq.${ownerId}`),
    ]);
    // Analytics (portfolio_view_events, already written by the RPC above)
    // always counts regardless of this setting -- only the notification/
    // email is gated by it.
    const emailAllowed = settings?.notif_portfolio_views ?? true;
    if (!owner?.email || !emailAllowed) {
      return json({ recorded: true, unreadCount, emailed: false, reason: !owner?.email ? 'no_email' : 'disabled' });
    }

    await sendPortfolioViewEmail({ toEmail: owner.email, toName: owner.name, viewCount: unreadCount });
    return json({ recorded: true, unreadCount, emailed: true });
  } catch (e) {
    console.error('record-portfolio-view error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
