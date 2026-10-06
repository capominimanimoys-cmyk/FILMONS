// Creates the Stripe Checkout Session for a paid FILMONS Learning purchase:
//   kind 'course'        -> a paid course
//   kind 'live_session'  -> an accepted live-session booking awaiting payment
// The amount is always read from the database here (never from the
// client). Nothing is credited to anyone on its own: stripe-webhook calls
// fn_finalize_learning_payment once Stripe confirms payment, which
// deposits the instructor's net earnings in their FILMONS Wallet.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
const rest = (path: string) => `${SUPABASE_URL}/rest/v1${path}`;
const PLATFORM_FEE_BPS = 800; // 8% -- same as server/learning.tsx and course_transactions.fee_bps

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] ?? null : null;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);

  // GET /learning-charge/verify?session_id=... -- UI confirmation only; the
  // webhook is what actually settles the payment.
  if (req.method === 'GET' && url.pathname.endsWith('/verify')) {
    const sessionId = url.searchParams.get('session_id');
    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!sessionId) return json({ error: 'Missing session_id' }, 400);
    if (!SK) return json({ error: 'Stripe not configured' }, 500);
    const session = await (await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${SK}` } })).json();
    if (session.error) return json({ error: session.error.message }, 400);
    return json({ paid: session.payment_status === 'paid' });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userId, kind, courseId, applicationId, successUrl, cancelUrl } = await req.json();
    if (!userId || !kind || !successUrl || !cancelUrl) return json({ error: 'Missing required fields' }, 400);
    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);

    let name = '', gross = 0, currency = 'CAD', instructorId = '', refId = '';
    const meta: Record<string, string> = { platform: 'filmons', buyer_id: userId };

    if (kind === 'course') {
      if (!courseId) return json({ error: 'Missing courseId' }, 400);
      const course = await selectOne('courses', `id=eq.${courseId}`);
      if (!course || course.status !== 'published') return json({ error: 'This course is not available' }, 404);
      if (course.instructor_id === userId) return json({ error: 'You can’t buy your own course' }, 400);
      if (course.is_free || !(Number(course.price) > 0)) return json({ error: 'This course is free' }, 400);
      const enrolled = await selectOne('course_enrollments', `user_id=eq.${userId}&course_id=eq.${courseId}&status=eq.active`);
      if (enrolled) return json({ error: 'You already have this course' }, 400);
      name = `Course — ${course.title}`; gross = round2(Number(course.price)); currency = course.currency || 'CAD'; instructorId = course.instructor_id;
      const fee = round2(gross * PLATFORM_FEE_BPS / 10000);
      const ins = await fetch(rest('/course_transactions'), {
        method: 'POST', headers: { ...H, Prefer: 'return=representation' },
        body: JSON.stringify({ course_id: courseId, buyer_id: userId, instructor_id: instructorId, gross_amount: gross, fee_bps: PLATFORM_FEE_BPS, fee_amount: fee, net_amount: round2(gross - fee), currency, status: 'pending' }),
      });
      const row = (await ins.json())?.[0];
      if (!row?.id) return json({ error: 'Could not start checkout' }, 500);
      refId = row.id;
      Object.assign(meta, { charge_type: 'learning_course', ref_id: refId, course_id: courseId, instructor_id: instructorId, title: course.title });
    } else if (kind === 'live_session') {
      if (!applicationId) return json({ error: 'Missing applicationId' }, 400);
      const app = await selectOne('live_session_applications', `id=eq.${applicationId}`);
      if (!app || app.student_id !== userId) return json({ error: 'Booking not found' }, 404);
      if (app.status !== 'awaiting_payment') return json({ error: 'This booking is not waiting for payment' }, 400);
      const session = await selectOne('live_sessions', `id=eq.${app.session_id}`);
      if (!session) return json({ error: 'Session not found' }, 404);
      gross = round2(Number(app.fee)); currency = app.currency || session.currency || 'CAD'; instructorId = session.instructor_id; refId = app.id;
      if (!(gross > 0)) return json({ error: 'Nothing to pay' }, 400);
      name = `Live session — ${session.title}`;
      Object.assign(meta, { charge_type: 'learning_live', ref_id: refId, instructor_id: instructorId, title: session.title });
    } else return json({ error: 'Unknown kind' }, 400);

    const fee = round2(gross * PLATFORM_FEE_BPS / 10000);
    const net = round2(gross - fee);
    Object.assign(meta, { gross_amount: String(gross), fee_amount: String(fee), net_amount: String(net), currency });

    const params = new URLSearchParams({
      mode: 'payment',
      'line_items[0][price_data][currency]': currency.toLowerCase(),
      'line_items[0][price_data][product_data][name]': name,
      'line_items[0][price_data][unit_amount]': String(Math.round(gross * 100)),
      'line_items[0][quantity]': '1',
      success_url: successUrl, cancel_url: cancelUrl,
    });
    for (const [k, v] of Object.entries(meta)) params.set(`metadata[${k}]`, v);

    const session = await (await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST', headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
    })).json();
    if (session.error) return json({ error: session.error.message }, 400);
    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    console.error('learning-charge error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
