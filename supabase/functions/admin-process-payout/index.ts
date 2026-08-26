// The only path that can resolve a payout_request. Funds are already
// reserved (moved out of available_balance) at request time by
// fn_request_payout — 'approve'/'mark_processing'/'paid' never touch
// balances again, they only move payout_requests.status forward. 'reject'
// and 'mark_failed' are the actions that move money: they create a
// reversal ledger entry that returns the reserved amount to
// available_balance, since neither means the money actually left.
//
// Every action writes an immutable payout_audit_log row and best-effort
// notifies + emails the host — this endpoint is the only place an admin
// can move a payout request forward, so it's also the only place that
// needs to record who did what.
//
// Requires a verified admin token (X-Admin-Token) — see _shared/adminAuth.ts.
// The verified name is used for processed_by/audit_log, not the client body.
import { verifyAdminToken } from '../_shared/adminAuth.ts';
import {
  sendCashOutApprovedEmail, sendCashOutSentEmail,
  sendCashOutRejectedEmail, sendCashOutFailedEmail,
} from '../_shared/notificationEmails.ts';

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

async function insertNotification(row: Record<string, unknown>) {
  await fetch(rest('/notifications'), {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(row),
  }).catch(() => {});
}

async function insertAuditLog(row: Record<string, unknown>) {
  await fetch(rest('/payout_audit_log'), {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(row),
  }).catch(() => {});
}

async function reverseReservation(payout: any, note: string) {
  await fetch(rest('/wallet_transactions'), {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({
      wallet_id: payout.wallet_id, transaction_type: 'reversal', amount: Number(payout.amount),
      currency: payout.currency, balance_type: 'available', status: 'reversed',
      description: note, completed_at: new Date().toISOString(),
    }),
  });
  const wallet = await selectOne('wallets', `id=eq.${payout.wallet_id}`);
  if (wallet) {
    await fetch(rest(`/wallets?id=eq.${payout.wallet_id}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ available_balance: Number(wallet.available_balance) + Number(payout.amount) }),
    });
  }
}

const VALID_ACTIONS = ['approve', 'mark_processing', 'paid', 'reject', 'mark_failed'] as const;
type Action = typeof VALID_ACTIONS[number];

// action -> { from statuses it's valid from, to status, audit_log action label, timestamp column }
const TRANSITIONS: Record<Action, { from: string[]; to: string; auditAction: string; atColumn: string }> = {
  approve:         { from: ['requested', 'under_review'], to: 'approved',   auditAction: 'approved',          atColumn: 'approved_at' },
  mark_processing: { from: ['requested', 'under_review', 'approved'], to: 'processing', auditAction: 'marked_processing', atColumn: 'processing_at' },
  paid:            { from: ['approved', 'processing'], to: 'paid',         auditAction: 'marked_paid',        atColumn: 'completed_at' },
  reject:          { from: ['requested', 'under_review', 'approved', 'processing'], to: 'rejected', auditAction: 'rejected', atColumn: 'rejected_at' },
  mark_failed:     { from: ['processing'], to: 'failed', auditAction: 'marked_failed', atColumn: 'completed_at' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const admin = await verifyAdminToken(req);
    if (!admin) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const adminName = admin.name;

    const { payoutRequestId, action, reason, paymentReference, notes } = await req.json() as {
      payoutRequestId?: string; action?: Action; reason?: string; paymentReference?: string; notes?: string;
    };

    if (!payoutRequestId || !action || !VALID_ACTIONS.includes(action)) {
      return new Response(JSON.stringify({ error: 'Missing payoutRequestId or invalid action' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (action === 'reject' && !reason) {
      return new Response(JSON.stringify({ error: 'A rejection reason is required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (action === 'paid' && !paymentReference) {
      return new Response(JSON.stringify({ error: 'A payment reference is required to mark a payout paid' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const payout = await selectOne('payout_requests', `id=eq.${payoutRequestId}`);
    if (!payout) return new Response(JSON.stringify({ error: 'Payout request not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });

    const transition = TRANSITIONS[action];
    if (!transition.from.includes(payout.status)) {
      return new Response(JSON.stringify({ error: `Cannot ${action} a payout that is currently ${payout.status}` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (action === 'reject') {
      // The reservation never actually paid out — return the funds to
      // available_balance with an explicit reversal entry (the original
      // 'processing' entry from fn_request_payout is never deleted or edited).
      await reverseReservation(payout, `Payout rejected — funds returned to available balance: ${reason}`);
    } else if (action === 'mark_failed') {
      await reverseReservation(payout, 'Payout attempt failed — funds returned to available balance');
    } else if (action === 'paid') {
      // Balance was already debited at request time — just settle the
      // reservation's ledger entry status so the ledger reads correctly.
      await fetch(rest(`/wallet_transactions?wallet_id=eq.${payout.wallet_id}&transaction_type=eq.payout&status=eq.processing&amount=eq.${-Number(payout.amount)}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'paid_out', completed_at: new Date().toISOString() }),
      });
    }
    // approve / mark_processing never touch balances — status-only moves.

    const nowIso = new Date().toISOString();
    const patchBody: Record<string, unknown> = { status: transition.to, processed_by: adminName || 'Admin', [transition.atColumn]: nowIso };
    if (action === 'reject') patchBody.rejection_reason = reason;
    if (action === 'paid') { patchBody.payment_reference = paymentReference; patchBody.admin_notes = notes || null; patchBody.processed_at = nowIso; }
    if (action === 'reject') patchBody.processed_at = nowIso;

    await fetch(rest(`/payout_requests?id=eq.${payoutRequestId}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify(patchBody),
    });

    await insertAuditLog({
      payout_request_id: payoutRequestId,
      admin_name: adminName || 'Admin',
      action: transition.auditAction,
      reason: reason || null,
      notes: notes || paymentReference || null,
    });

    const host = await selectOne('profiles', `id=eq.${payout.host_id}`);
    const hostName = host?.name || 'there';
    const amount = Number(payout.amount);
    const netAmount = payout.net_amount != null ? Number(payout.net_amount) : amount;
    const feeAmount = amount - netAmount;
    const currency = payout.currency || 'CAD';
    const methodLabel = payout.payout_method || 'your payout method';

    const notifByAction: Record<Action, { type: string; title: string } | null> = {
      approve: {
        type: 'payout_approved',
        title: `Your cash-out request of $${amount.toFixed(2)} ${currency} has been approved`,
      },
      mark_processing: {
        type: 'payout_processing',
        title: `Your payout request for $${amount.toFixed(2)} ${currency} is now being processed`,
      },
      paid: {
        type: 'payout_paid',
        title: `Your $${netAmount.toFixed(2)} ${currency} payout has been sent`,
      },
      reject: {
        type: 'payout_rejected',
        title: `Your cash-out request for $${amount.toFixed(2)} ${currency} was rejected`,
      },
      mark_failed: {
        type: 'payout_failed',
        title: `Your cash-out of $${amount.toFixed(2)} ${currency} could not be completed`,
      },
    };
    const notif = notifByAction[action];
    if (notif) {
      await insertNotification({
        user_id: payout.host_id, actor_id: null, actor_name: 'Filmons',
        type: notif.type, title: notif.title, is_read: false,
      });
    }

    if (action === 'approve') {
      await sendCashOutApprovedEmail({ toEmail: host?.email, toName: hostName, amount, currency, withdrawalId: payoutRequestId }).catch(() => {});
    } else if (action === 'paid') {
      await sendCashOutSentEmail({ toEmail: host?.email, toName: hostName, netAmount, feeAmount, currency, withdrawalId: payoutRequestId, payoutMethod: methodLabel }).catch(() => {});
    } else if (action === 'reject') {
      await sendCashOutRejectedEmail({ toEmail: host?.email, toName: hostName, amount, currency, withdrawalId: payoutRequestId, reason: reason! }).catch(() => {});
    } else if (action === 'mark_failed') {
      await sendCashOutFailedEmail({ toEmail: host?.email, toName: hostName, amount, currency, withdrawalId: payoutRequestId }).catch(() => {});
    }

    return new Response(JSON.stringify({ success: true, status: transition.to }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('admin-process-payout error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
