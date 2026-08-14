// The only path that can resolve a payout_request. Funds are already
// reserved (moved out of available_balance) at request time by
// fn_request_payout — 'approve'/'mark_processing'/'paid' never touch
// balances again, they only move payout_requests.status forward. 'reject'
// is the one action that moves money: it creates a reversal ledger entry
// that returns the reserved amount to available_balance, since a
// rejected payout means the money never actually left.
//
// Every action writes an immutable payout_audit_log row and best-effort
// notifies + emails the host — this endpoint is the only place an admin
// can move a payout request forward, so it's also the only place that
// needs to record who did what.
//
// Requires a verified admin token (X-Admin-Token) — see _shared/adminAuth.ts.
// The verified name is used for processed_by/audit_log, not the client body.
import { verifyAdminToken } from '../_shared/adminAuth.ts';

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

// EmailJS's public key + service/template ids are meant to be client-
// embedded (not secrets) — same values already used in
// src/app/lib/emailjs-config.ts. Reuses the generic "adminNotification"
// template since there's no payout-specific template in the dashboard yet
// — best-effort only, failures are swallowed the same way the wallet's
// other server-side email sends already do.
const EMAILJS_SERVICE_ID = 'service_s6wwjtj';
const EMAILJS_PUBLIC_KEY = 'iSSpIM-AeV9uUQ7Jt';
const EMAILJS_TEMPLATE_ADMIN_NOTIFICATION = 'template_rd3nhik';

async function sendHostEmail(toEmail: string | null | undefined, toName: string, subject: string, message: string) {
  if (!toEmail) return;
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ADMIN_NOTIFICATION,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: { to_email: toEmail, to_name: toName, subject, message },
      }),
    });
    if (!res.ok) console.warn('EmailJS payout notification failed:', res.status, await res.text());
  } catch (e) {
    console.warn('EmailJS payout notification threw:', e);
  }
}

const VALID_ACTIONS = ['approve', 'mark_processing', 'paid', 'reject'] as const;
type Action = typeof VALID_ACTIONS[number];

// action -> { from statuses it's valid from, to status, audit_log action label }
const TRANSITIONS: Record<Action, { from: string[]; to: string; auditAction: string }> = {
  approve:         { from: ['requested', 'under_review'], to: 'approved',   auditAction: 'approved' },
  mark_processing: { from: ['requested', 'under_review', 'approved'], to: 'processing', auditAction: 'marked_processing' },
  paid:            { from: ['approved', 'processing'], to: 'paid',         auditAction: 'marked_paid' },
  reject:          { from: ['requested', 'under_review', 'approved', 'processing'], to: 'rejected', auditAction: 'rejected' },
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
      await fetch(rest('/wallet_transactions'), {
        method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({
          wallet_id: payout.wallet_id, transaction_type: 'reversal', amount: Number(payout.amount),
          currency: payout.currency, balance_type: 'available', status: 'reversed',
          description: `Payout rejected — funds returned to available balance${reason ? `: ${reason}` : ''}`,
          completed_at: new Date().toISOString(),
        }),
      });

      const wallet = await selectOne('wallets', `id=eq.${payout.wallet_id}`);
      if (wallet) {
        await fetch(rest(`/wallets?id=eq.${payout.wallet_id}`), {
          method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({ available_balance: Number(wallet.available_balance) + Number(payout.amount) }),
        });
      }
    } else if (action === 'paid') {
      // Balance was already debited at request time — just settle the
      // reservation's ledger entry status so the ledger reads correctly.
      await fetch(rest(`/wallet_transactions?wallet_id=eq.${payout.wallet_id}&transaction_type=eq.payout&status=eq.processing&amount=eq.${-Number(payout.amount)}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'paid_out', completed_at: new Date().toISOString() }),
      });
    }
    // approve / mark_processing never touch balances — status-only moves.

    const patchBody: Record<string, unknown> = { status: transition.to, processed_by: adminName || 'Admin' };
    if (action === 'reject') patchBody.rejection_reason = reason;
    if (action === 'paid') { patchBody.payment_reference = paymentReference; patchBody.admin_notes = notes || null; patchBody.processed_at = new Date().toISOString(); }
    if (action === 'reject') patchBody.processed_at = new Date().toISOString();

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
    const amountStr = `$${Number(payout.amount).toFixed(2)} ${payout.currency}`;

    const notifByAction: Record<Action, { type: string; message: string; subject: string } | null> = {
      approve: null, // status-only step, no separate host-facing notification
      mark_processing: {
        type: 'payout_processing',
        subject: 'Your Filmons payout is being processed',
        message: `Your payout request for ${amountStr} is now being processed.`,
      },
      paid: {
        type: 'payout_paid',
        subject: 'Your Filmons payout has been sent',
        message: `Your payout of ${amountStr} has been sent (reference: ${paymentReference}).`,
      },
      reject: {
        type: 'payout_rejected',
        subject: 'Your Filmons payout request was rejected',
        message: `Your payout request for ${amountStr} was rejected: ${reason}. The funds have been returned to your available balance.`,
      },
    };
    const notif = notifByAction[action];
    if (notif) {
      await insertNotification({
        user_id: payout.host_id, actor_id: null, actor_name: 'Filmons',
        type: notif.type, title: notif.subject, is_read: false,
      });
      await sendHostEmail(host?.email, hostName, notif.subject, notif.message);
    }

    return new Response(JSON.stringify({ success: true, status: transition.to }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('admin-process-payout error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
