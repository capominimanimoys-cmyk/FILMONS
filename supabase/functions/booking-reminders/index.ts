// Booking reminder emails — 3 days and 24 hours before a confirmed
// rental/marketplace order's start_date, to both host and renter. Cron-
// triggered (see .github/workflows/booking-reminders.yml), same pattern as
// boost-expire/emergency-expire: a scheduled anon-bearer POST to a
// dedicated edge function, --no-verify-jwt.
//
// Idempotency via claimEmailEvent (booking_reminder_3d:<order_id> /
// booking_reminder_24h:<order_id>) rather than a stored "reminder sent"
// column -- this runs every 30 minutes, so without it every tick within
// the same calendar day would re-send. A date only ever matches one of
// the two windows below on any given day, so a booking created with a
// start_date less than 3 days out simply never matches the 3-day window
// at all and only ever gets the 24-hour one -- "skip reminders already in
// the past" falls out of the date-window check itself, nothing extra
// needed for it.
import { claimEmailEvent } from '../_shared/emailEvents.ts';
import { sendBookingReminderEmail } from '../_shared/notificationEmails.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };

function rest(path: string) {
  return `${SUPABASE_URL}/rest/v1${path}`;
}

async function selectMany(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

async function selectOne(table: string, filter: string) {
  const rows = await selectMany(table, `${filter}&limit=1`);
  return rows[0] || null;
}

function todayPlusDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function sendForWindow(dateStr: string, timeframe: '3 days' | '24 hours', eventPrefix: string) {
  const orders = await selectMany('orders', `start_date=eq.${dateStr}&status=eq.paid&select=id,listing_title,host_id,renter_id,renter_name,renter_email,duration,duration_type`);
  let sent = 0;
  for (const order of orders) {
    // 'days'-only, same scope as the date-blocking feature -- an hourly
    // service booking has no captured time-of-day to remind about
    // meaningfully.
    if (order.duration_type && order.duration_type !== 'day' && order.duration_type !== 'days') continue;

    const claimed = await claimEmailEvent(`${eventPrefix}:${order.id}`);
    if (!claimed) continue;

    const [host, renter] = await Promise.all([
      order.host_id ? selectOne('profiles', `id=eq.${order.host_id}`) : null,
      order.renter_id ? selectOne('profiles', `id=eq.${order.renter_id}`) : null,
    ]);

    if (host?.email) {
      await sendBookingReminderEmail({
        toEmail: host.email, toName: host.name, recipientRole: 'host',
        listingTitle: order.listing_title || 'your listing', bookingDate: dateStr,
        timeframe, orderId: order.id,
      });
    }
    const renterEmail = renter?.email || order.renter_email;
    if (renterEmail) {
      await sendBookingReminderEmail({
        toEmail: renterEmail, toName: renter?.name || order.renter_name, recipientRole: 'renter',
        listingTitle: order.listing_title || 'your booking', bookingDate: dateStr,
        timeframe, orderId: order.id,
      });
    }
    sent++;
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sent3d = await sendForWindow(todayPlusDays(3), '3 days', 'booking_reminder_3d');
    const sent24h = await sendForWindow(todayPlusDays(1), '24 hours', 'booking_reminder_24h');
    return new Response(JSON.stringify({ ok: true, sent3d, sent24h }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('booking-reminders error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
