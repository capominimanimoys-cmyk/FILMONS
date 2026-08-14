// The only path that can mark a payout_request 'paid' and create the
// corresponding ledger entry that decrements a host wallet's
// available_balance — admin console calls this instead of updating
// payout_requests/wallets directly, so a payout can never be marked paid
// without the balance actually being debited (or vice versa).
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const { payoutRequestId, action, adminName, notes } = await req.json(); // action: 'paid' | 'rejected'
    if (!payoutRequestId || !['paid', 'rejected'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Missing payoutRequestId or invalid action' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const payout = await selectOne('payout_requests', `id=eq.${payoutRequestId}`);
    if (!payout) return new Response(JSON.stringify({ error: 'Payout request not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (payout.status !== 'requested' && payout.status !== 'processing') {
      return new Response(JSON.stringify({ error: `Payout is already ${payout.status}` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (action === 'paid') {
      const wallet = await selectOne('wallets', `id=eq.${payout.wallet_id}`);
      if (!wallet || Number(wallet.available_balance) < Number(payout.amount)) {
        return new Response(JSON.stringify({ error: 'Insufficient available balance' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      await fetch(rest('/wallet_transactions'), {
        method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({
          wallet_id: payout.wallet_id, transaction_type: 'payout', amount: -Number(payout.amount),
          currency: payout.currency, balance_type: 'available', status: 'paid_out',
          description: `Payout to host`, completed_at: new Date().toISOString(),
        }),
      });

      await fetch(rest(`/wallets?id=eq.${payout.wallet_id}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ available_balance: Number(wallet.available_balance) - Number(payout.amount) }),
      });
    }

    await fetch(rest(`/payout_requests?id=eq.${payoutRequestId}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: action, processed_at: new Date().toISOString(), processed_by: adminName || 'Admin', notes: notes || null }),
    });

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('admin-process-payout error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
