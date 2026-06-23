const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

async function dbInsert(table: string, row: Record<string, unknown>) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(row),
  });
}

async function dbUpsert(table: string, row: Record<string, unknown>, onConflict: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);

  // ── GET /stripe-charge/verify?session_id=xxx ──────────────────
  // Called on return from Stripe to verify payment and credit FP
  if (req.method === 'GET' && url.pathname.endsWith('/verify')) {
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) return new Response(JSON.stringify({ error: 'Missing session_id' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });

    // Fetch session from Stripe
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { 'Authorization': `Bearer ${SK}` },
    });
    const session = await res.json();

    if (session.error) return new Response(JSON.stringify({ error: session.error.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (session.payment_status !== 'paid') return new Response(JSON.stringify({ error: 'Payment not completed', status: session.payment_status }), { status: 402, headers: { ...cors, 'Content-Type': 'application/json' } });

    const userId  = session.metadata?.user_id;
    const fpAmt   = parseInt(session.metadata?.fp_amount || '0');
    const cadAmt  = parseFloat(session.metadata?.cad_amount || '0');

    if (!userId || !fpAmt) return new Response(JSON.stringify({ error: 'Missing metadata' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    // Check if already credited (idempotency)
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/transactions?stripe_session_id=eq.${sessionId}&select=id`, {
      headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'apikey': SUPABASE_SERVICE_KEY },
    });
    const existing = await checkRes.json();
    if (existing?.length > 0) {
      return new Response(JSON.stringify({ success: true, already_credited: true, fp_amount: fpAmt }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Save transaction
    await dbInsert('transactions', {
      user_id:           userId,
      type:              'fp_purchase',
      fp_amount:         fpAmt,
      cad_amount:        -cadAmt,
      description:       `Purchased ⚡${fpAmt} FP — $${cadAmt.toFixed(2)} CAD via Stripe`,
      status:            'completed',
      payment_method:    'stripe_checkout',
      stripe_session_id: sessionId,
      metadata:          { cad_amount: cadAmt, fp_amount: fpAmt, stripe: true },
    });

    // Fetch current wallet balance from DB
    const walletRes = await fetch(`${SUPABASE_URL}/rest/v1/fp_wallets?user_id=eq.${userId}&select=balance,lifetime_earned,lifetime_purchased`, {
      headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'apikey': SUPABASE_SERVICE_KEY },
    });
    const wallets = await walletRes.json();
    const current = wallets?.[0] || { balance: 0, lifetime_earned: 0, lifetime_purchased: 0 };

    // Upsert fp_wallet
    await dbUpsert('fp_wallets', {
      user_id:            userId,
      balance:            (current.balance || 0) + fpAmt,
      lifetime_earned:    (current.lifetime_earned || 0) + fpAmt,
      lifetime_purchased: (current.lifetime_purchased || 0) + fpAmt,
      updated_at:         new Date().toISOString(),
    }, 'user_id');

    return new Response(JSON.stringify({ success: true, fp_amount: fpAmt, cad_amount: cadAmt }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ── POST /stripe-charge — Create Checkout Session ─────────────
  try {
    const { amount_cad, customer_email, description, success_url, cancel_url, user_id, fp_amount } = await req.json();

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });

    const params = new URLSearchParams({
      'mode':                                           'payment',
      'line_items[0][price_data][currency]':            'cad',
      'line_items[0][price_data][unit_amount]':         String(Math.round(amount_cad * 100)),
      'line_items[0][price_data][product_data][name]':  description || 'Filmons FP Purchase',
      'line_items[0][quantity]':                        '1',
      'success_url':                                    success_url,
      'cancel_url':                                     cancel_url,
      // Store metadata for verification
      'metadata[user_id]':                              user_id || '',
      'metadata[fp_amount]':                            String(fp_amount || 0),
      'metadata[cad_amount]':                           String(amount_cad),
      'metadata[platform]':                             'filmons',
    });

    if (customer_email?.includes('@')) params.set('customer_email', customer_email);

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    const session = await res.json();
    if (session.error) return new Response(JSON.stringify({ error: session.error.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});