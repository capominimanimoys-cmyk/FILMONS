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
const EMAILJS_TEMPLATE_CASE_OPENED = 'template_g16trrb';
const EMAILJS_TEMPLATE_SUPPORT_REPLY = 'template_j3qh0mb';

// Guest cases (user_id null, guest_name/guest_email set instead) have no
// profiles row and no in-app notification target -- email is their only
// channel. Shared by both notifyCustomer and notifyCustomerCaseOpened so
// neither has to re-derive who "the customer" actually is.
async function resolveCustomer(supportCase: Record<string, any>) {
  const isGuest = !supportCase.user_id;
  if (isGuest) {
    return { isGuest, toEmail: supportCase.guest_email as string | undefined, toName: supportCase.guest_name || 'there' };
  }
  const user = await selectOne('profiles', `id=eq.${supportCase.user_id}`);
  return { isGuest, toEmail: user?.email as string | undefined, toName: user?.name || 'there' };
}

async function sendEmailJs(templateId: string, params: Record<string, unknown>) {
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID, template_id: templateId,
        user_id: EMAILJS_PUBLIC_KEY, accessToken: EMAILJS_PRIVATE_KEY,
        template_params: params,
      }),
    });
    if (!res.ok) console.warn(`EmailJS ${templateId} send failed:`, res.status, await res.text());
  } catch (e) {
    console.warn(`EmailJS ${templateId} send threw:`, e);
  }
}

async function notifyCustomer(supportCase: Record<string, any>, caseNumber: string, caseId: string, agentName: string, replyContent: string) {
  const { isGuest, toEmail, toName } = await resolveCustomer(supportCase);

  if (!isGuest) {
    await fetch(rest('/notifications'), {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: supportCase.user_id, actor_id: null, actor_name: 'Filmons Support',
        type: 'support_reply', title: 'Filmons Support replied', is_read: false,
        conversation_id: caseId,
      }),
    }).catch(() => {});
  }

  if (!toEmail) return;
  const preview = replyContent.length > 240 ? replyContent.slice(0, 237) + '...' : replyContent;
  await sendEmailJs(EMAILJS_TEMPLATE_SUPPORT_REPLY, {
    to_email: toEmail, to_name: toName, case_number: caseNumber, agent_name: agentName,
    message_preview: preview,
  });
}

// Fires once, the first time a case is assigned (see the assign_to_me
// branch below) -- not on every "reply", and never on reassignment.
async function notifyCustomerCaseOpened(supportCase: Record<string, any>, caseNumber: string, agentName: string) {
  const { toEmail, toName } = await resolveCustomer(supportCase);
  if (!toEmail) return;
  await sendEmailJs(EMAILJS_TEMPLATE_CASE_OPENED, {
    to_email: toEmail, to_name: toName, case_number: caseNumber, agent_name: agentName,
  });
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
      await notifyCustomer(supportCase, supportCase.case_number, caseId, admin.name, content!.trim());
    } else if (action === 'assign_to_me' && !supportCase.assigned_admin_id) {
      // Only the first time a case is picked up -- not on every
      // reassignment -- so this reads as "we've started reviewing your
      // case", not a notification the customer gets repeatedly.
      await notifyCustomerCaseOpened(supportCase, supportCase.case_number, admin.name);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('support-case-admin-action error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
