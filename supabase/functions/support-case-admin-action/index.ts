// The only path an admin can use to act on a support case — reply,
// internal note, assign, change priority/status. RLS on support_cases/
// support_messages is open (FOR ALL USING(true), same trust model as the
// rest of this app's tables), so a raw client insert COULD forge an
// 'agent' message; this endpoint exists so agent identity is verified
// server-side instead, and so a customer-facing reply reliably triggers
// the notification+email every time.
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

const EMAILJS_SERVICE_ID = 'service_s6wwjtj';
const EMAILJS_PUBLIC_KEY = 'iSSpIM-AeV9uUQ7Jt';
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY') || '';
const EMAILJS_TEMPLATE_ADMIN_NOTIFICATION = 'template_rd3nhik';

async function notifyCustomer(userId: string, caseNumber: string, caseId: string) {
  await fetch(rest('/notifications'), {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: userId, actor_id: null, actor_name: 'Filmons Support',
      type: 'support_reply', title: 'Filmons Support replied', is_read: false,
      conversation_id: caseId,
    }),
  }).catch(() => {});

  const user = await selectOne('profiles', `id=eq.${userId}`);
  if (!user?.email) return;
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ADMIN_NOTIFICATION,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: user.email, to_name: user.name || 'there',
          subject: `Filmons Support replied — case ${caseNumber}`,
          message: `There's an update on your support case ${caseNumber}. Open the Filmons app to view the response.`,
        },
      }),
    });
    if (!res.ok) console.warn('EmailJS support-reply email failed:', res.status, await res.text());
  } catch (e) {
    console.warn('EmailJS support-reply email threw:', e);
  }
}

const VALID_ACTIONS = ['reply', 'internal_note', 'assign_to_me', 'set_priority', 'set_status'] as const;
type Action = typeof VALID_ACTIONS[number];

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

    const { caseId, action, content, priority, status } = await req.json() as {
      caseId?: string; action?: Action; content?: string; priority?: string; status?: string;
    };
    if (!caseId || !action || !VALID_ACTIONS.includes(action)) {
      return new Response(JSON.stringify({ error: 'Missing caseId or invalid action' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const supportCase = await selectOne('support_cases', `id=eq.${caseId}`);
    if (!supportCase) return new Response(JSON.stringify({ error: 'Case not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (action === 'reply' || action === 'internal_note') {
      if (!content?.trim()) {
        return new Response(JSON.stringify({ error: 'Message content is required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      await fetch(rest('/support_messages'), {
        method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({
          case_id: caseId, sender_type: 'agent', sender_id: admin.adminId, sender_name: admin.name,
          content: content.trim(), is_internal_note: action === 'internal_note',
        }),
      });
      if (action === 'reply') {
        // A customer-facing reply moves the case to waiting on them, unless
        // it's already in a terminal state.
        if (!['resolved', 'closed'].includes(supportCase.status)) patch.status = 'waiting_for_customer';
        if (!supportCase.assigned_admin_id) patch.assigned_admin_id = admin.adminId;
      }
    } else if (action === 'assign_to_me') {
      patch.assigned_admin_id = admin.adminId;
      if (supportCase.status === 'waiting_for_agent') patch.status = 'in_review';
    } else if (action === 'set_priority') {
      if (!['low', 'normal', 'high', 'urgent'].includes(priority || '')) {
        return new Response(JSON.stringify({ error: 'Invalid priority' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      patch.priority = priority;
    } else if (action === 'set_status') {
      if (!['open', 'waiting_for_agent', 'in_review', 'waiting_for_customer', 'resolved', 'closed'].includes(status || '')) {
        return new Response(JSON.stringify({ error: 'Invalid status' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      patch.status = status;
      if (status === 'resolved') patch.resolved_at = new Date().toISOString();
      if (status === 'closed') patch.closed_at = new Date().toISOString();
      await fetch(rest('/support_messages'), {
        method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({
          case_id: caseId, sender_type: 'system', sender_name: 'System',
          content: `${admin.name} marked this case as ${status}.`,
        }),
      });
    }

    await fetch(rest(`/support_cases?id=eq.${caseId}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });

    if (action === 'reply') {
      await notifyCustomer(supportCase.user_id, supportCase.case_number, caseId);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('support-case-admin-action error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
