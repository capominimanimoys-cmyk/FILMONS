// Calendar reminder delivery -- sends a FILMONS notification (linking to the
// activity on /calendar) for scheduled, confirmed activities whose reminder
// time has arrived. Cron-triggered every 15 minutes (see
// .github/workflows/calendar-reminders.yml), same pattern as booking-reminders.
//
// remind_at / title / message are computed client-side (calendarApi.ts) and
// refreshed whenever the calendar loads, so this function needs no knowledge of
// the source tables. Reminders exist only for scheduled activities -- purchases,
// enrollments, cash in and cash out never get one.
//
// Idempotent: a reminder is claimed by setting sent_at only where it is still
// NULL, so overlapping ticks can never notify twice. A reminder whose window
// has already passed (the user switched it on too late) is marked sent without
// notifying. Users can turn reminders off in Notification settings
// (notif_calendar_reminders).
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
const rest = (path: string) => `${SUPABASE_URL}/rest/v1${path}`;

// A tick may run late; beyond this the reminder is stale and skipped.
const GRACE_MS = 45 * 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const now = Date.now();
    const res = await fetch(
      rest(`/calendar_reminders?sent_at=is.null&enabled=is.true&remind_at=lte.${new Date(now).toISOString()}&select=*&limit=500`),
      { headers: H },
    );
    const rows = await res.json();
    let sent = 0;
    for (const r of Array.isArray(rows) ? rows : []) {
      // Claim first (sent_at still null) so a parallel tick can't double-send.
      const claim = await fetch(rest(`/calendar_reminders?id=eq.${r.id}&sent_at=is.null`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
        body: JSON.stringify({ sent_at: new Date().toISOString() }),
      });
      const claimed = await claim.json();
      if (!Array.isArray(claimed) || claimed.length === 0) continue;

      const due = new Date(r.remind_at).getTime();
      const start = new Date(r.start_at).getTime();
      if (now - due > GRACE_MS) continue;               // stale: marked, not sent
      if (r.remind_before !== 'day' && start <= now) continue; // already started

      // Respect the user's Notification settings -> Calendar reminders switch.
      const sres = await fetch(rest(`/notification_settings?user_id=eq.${r.user_id}&select=notif_calendar_reminders&limit=1`), { headers: H });
      const srows = await sres.json();
      if (Array.isArray(srows) && srows[0]?.notif_calendar_reminders === false) continue;

      await fetch(rest('/notifications'), {
        method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify({
          user_id: r.user_id,
          actor_name: 'FILMONS Calendar',
          type: 'calendar_reminder',
          title: r.title,
          body: r.message,
          entity_type: 'calendar',
          entity_id: r.event_key,
          message_id: `calrem:${r.id}:${r.remind_at}`,
          is_read: false,
        }),
      });
      sent++;
    }
    return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('calendar-reminders error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
