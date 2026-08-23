// Server-verified mutations for hire_requests — the Portfolio "Hire" flow's
// equivalent of manage-application. Same client-asserted-identity-but-
// server-verified-ownership trust model as delete-listing/manage-application.
//
// Role mapping vs. Opportunity Payments (manage-application): there the
// "owner" hires an "applicant"/"worker". Here the REQUESTER (who clicked
// Hire) is the owner-equivalent (pays), and the HOST (the creator whose
// portfolio it is) is the applicant/worker-equivalent (does the work,
// gets paid). Gating below mirrors manage-application's
// APPLICANT_GATED/owner-gated split with roles swapped accordingly.
//
// One hire_requests row is the single source of truth for negotiation
// status; hire_transactions is the single source of truth for money,
// created only once terms are accepted.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}
async function updateOne(table: string, filter: string, patch: Record<string, unknown>) {
  await fetch(rest(`/${table}?${filter}`), { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
}
async function insertOne(table: string, row: Record<string, unknown>) {
  await fetch(rest(`/${table}`), { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(row) }).catch(() => {});
}
async function insertReturning(table: string, row: Record<string, unknown>) {
  const res = await fetch(rest(`/${table}`), { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(row) });
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? rows[0] : null;
}

import { computeBreakdown } from '../_shared/pricing.ts';

function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function projTitle(t: string | null | undefined) { return t ? `"${t}"` : 'this hire request'; }

async function pushNotification(row: { user_id: string; actor_id?: string | null; actor_name?: string; type: string; title: string; conversation_id?: string | null }) {
  if (!row.user_id || row.user_id === row.actor_id) return;
  await insertOne('notifications', { user_id: row.user_id, actor_id: row.actor_id || null, actor_name: row.actor_name || '', type: row.type, title: row.title, conversation_id: row.conversation_id || null, is_read: false });
}

async function insertSystemMessage(conversationId: string | null | undefined, text: string) {
  if (!conversationId) return;
  const now = new Date().toISOString();
  await insertOne('messages', {
    id: crypto.randomUUID(), conversation_id: conversationId, sender_id: 'system', sender_name: 'Filmons',
    content: null, type: 'system', metadata: { systemText: text },
    created_at: now, updated_at: now, is_deleted: false, is_pinned: false,
  });
  await updateOne('conversations', `id=eq.${conversationId}`, { updated_at: now });
}

// Same generic template request-payout/admin-process-payout already use
// successfully (dynamic subject/message fields) — every Hire email works
// immediately, no dependency on new unbuilt EmailJS dashboard templates.
const EMAILJS_SERVICE_ID = 'service_s6wwjtj';
const EMAILJS_PUBLIC_KEY = 'iSSpIM-AeV9uUQ7Jt';
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY') || '';
const EMAILJS_TEMPLATE_ADMIN_NOTIFICATION = 'template_rd3nhik';
async function sendHireEmail(toEmail: string | null | undefined, toName: string | null | undefined, subject: string, message: string) {
  if (!toEmail) return;
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: EMAILJS_SERVICE_ID, template_id: EMAILJS_TEMPLATE_ADMIN_NOTIFICATION, user_id: EMAILJS_PUBLIC_KEY, accessToken: EMAILJS_PRIVATE_KEY, template_params: { to_email: toEmail, to_name: toName || 'there', subject, message } }),
    });
    if (!res.ok) console.warn('Hire EmailJS send failed:', res.status, await res.text());
  } catch (e) { console.warn('Hire EmailJS send threw:', e); }
}

const OPEN = new Set(['sent', 'countered']);

async function applyAction(hr: any, action: string, userId: string, payload: Record<string, any>): Promise<{ ok: true; hireRequest: any } | { ok: false; status: number; error: string }> {
  const isRequester = hr.requester_id === userId;
  const isHost = hr.host_id === userId;
  if (!isRequester && !isHost) return { ok: false, status: 403, error: 'Not a party to this hire request' };

  const HOST_GATED = new Set(['mark_work_completed', 'mark_viewed']);
  const REQUESTER_GATED = new Set(['cancel_hire_request', 'confirm_completion']);
  const EITHER_GATED = new Set(['counter_offer', 'accept_current_terms', 'decline_current_terms', 'report_problem']);
  if (HOST_GATED.has(action) && !isHost) return { ok: false, status: 403, error: 'Only the creator can do this' };
  if (REQUESTER_GATED.has(action) && !isRequester) return { ok: false, status: 403, error: 'Only the requester can do this' };
  if (EITHER_GATED.has(action) && !isHost && !isRequester) return { ok: false, status: 403, error: 'Not a party to this hire request' };

  const now = new Date().toISOString();
  const requester = await selectOne('profiles', `id=eq.${hr.requester_id}`);
  const host = await selectOne('profiles', `id=eq.${hr.host_id}`);

  switch (action) {
    case 'mark_viewed':
      if (hr.status === 'sent' && !hr.viewed_at) await updateOne('hire_requests', `id=eq.${hr.id}`, { viewed_at: now });
      return { ok: true, hireRequest: { ...hr, viewed_at: hr.viewed_at || now } };

    case 'counter_offer': {
      if (!OPEN.has(hr.status)) return { ok: false, status: 400, error: 'This hire request is no longer open to negotiation' };
      const amount = Number(payload?.amount);
      if (!amount || amount <= 0) return { ok: false, status: 400, error: 'A valid counter amount is required' };
      const patch: Record<string, unknown> = {
        budget_amount: amount, last_offer_by: userId, status: 'countered', updated_at: now,
      };
      if (payload?.pricingType) patch.pricing_type = payload.pricingType;
      if (payload?.startDate) patch.start_date = payload.startDate;
      if (payload?.endDate) patch.end_date = payload.endDate;
      if (payload?.message) patch.message = payload.message;
      await updateOne('hire_requests', `id=eq.${hr.id}`, patch);
      const otherPartyId = isHost ? hr.requester_id : hr.host_id;
      const otherProfile = isHost ? requester : host;
      await insertSystemMessage(hr.conversation_id, `Counter offer: $${amount.toFixed(2)} CAD${payload?.message ? ` — "${payload.message}"` : ''}`);
      await pushNotification({ user_id: otherPartyId, actor_id: userId, actor_name: (isHost ? host : requester)?.name || '', type: 'system_notification', title: `New counter offer for ${projTitle(hr.project_title)}`, conversation_id: hr.conversation_id });
      await sendHireEmail(otherProfile?.email, otherProfile?.name, `You have a counter offer on Filmons`, `${(isHost ? host : requester)?.name || 'Someone'} sent a counter offer of $${amount.toFixed(2)} CAD for "${hr.project_title}".`);
      return { ok: true, hireRequest: { ...hr, ...patch } };
    }

    case 'accept_current_terms': {
      if (!OPEN.has(hr.status)) return { ok: false, status: 400, error: 'This hire request is no longer open' };
      if (hr.last_offer_by && hr.last_offer_by === userId) return { ok: false, status: 400, error: 'Waiting on the other party to respond to your own offer' };
      const gross = Number(hr.budget_amount || 0);
      if (!gross || gross <= 0) return { ok: false, status: 400, error: 'No budget amount set on this hire request' };
      const breakdown = await computeBreakdown({ subtotal: gross, context: 'hire' });
      const txn = await insertReturning('hire_transactions', {
        hire_request_id: hr.id, requester_id: hr.requester_id, host_id: hr.host_id,
        gross_amount: breakdown.subtotal, fee_rate: breakdown.sellerFeeRate, fee_amount: breakdown.sellerFeeAmount,
        net_amount: round2(breakdown.subtotal - breakdown.sellerFeeAmount), currency: hr.currency || 'CAD',
      });
      if (!txn) return { ok: false, status: 500, error: 'Could not accept these terms' };
      await updateOne('hire_requests', `id=eq.${hr.id}`, { status: 'accepted', updated_at: now });
      await insertSystemMessage(hr.conversation_id, `Terms agreed ✓ — $${breakdown.subtotal.toFixed(2)} · Filmons Fee $${breakdown.sellerFeeAmount.toFixed(2)} · Host earns $${(breakdown.subtotal - breakdown.sellerFeeAmount).toFixed(2)}`);
      const otherPartyId = isHost ? hr.requester_id : hr.host_id;
      const otherProfile = isHost ? requester : host;
      await pushNotification({ user_id: otherPartyId, actor_id: userId, actor_name: (isHost ? host : requester)?.name || '', type: 'system_notification', title: `Terms agreed for ${projTitle(hr.project_title)} — ready to pay`, conversation_id: hr.conversation_id });
      await sendHireEmail(otherProfile?.email, otherProfile?.name, `Hire terms agreed on Filmons`, `Terms for "${hr.project_title}" are agreed at $${breakdown.subtotal.toFixed(2)} CAD.`);
      return { ok: true, hireRequest: { ...hr, status: 'accepted' } };
    }

    case 'decline_current_terms': {
      if (!OPEN.has(hr.status)) return { ok: false, status: 400, error: 'This hire request is no longer open' };
      await updateOne('hire_requests', `id=eq.${hr.id}`, { status: 'declined', decline_reason: payload?.reason || null, updated_at: now });
      await insertSystemMessage(hr.conversation_id, 'The hire request was declined.');
      const otherPartyId = isHost ? hr.requester_id : hr.host_id;
      const otherProfile = isHost ? requester : host;
      await pushNotification({ user_id: otherPartyId, actor_id: userId, actor_name: (isHost ? host : requester)?.name || '', type: 'system_notification', title: `Your hire request for ${projTitle(hr.project_title)} was declined`, conversation_id: hr.conversation_id });
      await sendHireEmail(otherProfile?.email, otherProfile?.name, `Update on your Filmons hire request`, `"${hr.project_title}" was declined.`);
      return { ok: true, hireRequest: { ...hr, status: 'declined' } };
    }

    case 'cancel_hire_request': {
      if (!OPEN.has(hr.status)) return { ok: false, status: 400, error: 'This hire request can no longer be cancelled' };
      await updateOne('hire_requests', `id=eq.${hr.id}`, { status: 'cancelled', updated_at: now });
      await insertSystemMessage(hr.conversation_id, 'The hire request was cancelled.');
      await pushNotification({ user_id: hr.host_id, actor_id: userId, actor_name: requester?.name || '', type: 'system_notification', title: `A hire request for ${projTitle(hr.project_title)} was cancelled`, conversation_id: hr.conversation_id });
      return { ok: true, hireRequest: { ...hr, status: 'cancelled' } };
    }

    case 'mark_work_completed': {
      if (hr.status !== 'hired') return { ok: false, status: 400, error: 'This hire has not been funded yet' };
      await updateOne('hire_transactions', `hire_request_id=eq.${hr.id}`, { work_status: 'marked_complete_by_worker', marked_complete_at: now, auto_release_reminder_sent: false, updated_at: now });
      await insertSystemMessage(hr.conversation_id, 'The creator marked this work as completed — awaiting your confirmation.');
      await pushNotification({ user_id: hr.requester_id, actor_id: userId, actor_name: host?.name || '', type: 'system_notification', title: `Marked complete — confirm completion for ${projTitle(hr.project_title)}`, conversation_id: hr.conversation_id });
      return { ok: true, hireRequest: hr };
    }

    case 'confirm_completion': {
      const txn = await selectOne('hire_transactions', `hire_request_id=eq.${hr.id}`);
      if (!txn || txn.payment_status !== 'funded') return { ok: false, status: 400, error: 'No funded payment to release' };
      await updateOne('hire_transactions', `id=eq.${txn.id}`, { work_status: 'completed', completed_at: now, hold_released_at: now, updated_at: now });
      // Flip the held wallet_transactions row's available_at to now — the
      // existing hourly fn_release_pending_earnings cron does the rest,
      // exactly like Opportunity Payments' confirm_completion.
      await updateOne('wallet_transactions', `order_id=eq.${txn.order_id}&transaction_type=eq.hire_earning&balance_type=eq.pending`, { available_at: now });
      await updateOne('hire_requests', `id=eq.${hr.id}`, { status: 'completed', updated_at: now });
      await insertSystemMessage(hr.conversation_id, `Work confirmed complete — the remaining $${Number(txn.held_amount).toFixed(2)} is now available.`);
      await pushNotification({ user_id: txn.host_id, actor_id: userId, actor_name: requester?.name || '', type: 'payment_released', title: `Your remaining earnings for ${projTitle(hr.project_title)} are now available`, conversation_id: hr.conversation_id });
      await sendHireEmail(host?.email, host?.name, `Hire completed on Filmons ✓`, `"${hr.project_title}" is confirmed complete — the remaining $${Number(txn.held_amount).toFixed(2)} CAD is now available in your wallet.`);
      return { ok: true, hireRequest: { ...hr, status: 'completed' } };
    }

    case 'report_problem': {
      const txn = await selectOne('hire_transactions', `hire_request_id=eq.${hr.id}`);
      if (!txn || !txn.order_id) return { ok: false, status: 400, error: 'No funded payment on this hire to report a problem with' };
      await updateOne('orders', `id=eq.${txn.order_id}`, { dispute_status: 'disputed', disputed_at: now });
      await insertSystemMessage(hr.conversation_id, 'A problem was reported — the held funds will stay frozen until Filmons resolves it.');
      const otherPartyId = isHost ? hr.requester_id : hr.host_id;
      await pushNotification({ user_id: otherPartyId, actor_id: userId, actor_name: (isHost ? host : requester)?.name || '', type: 'system_notification', title: `A problem was reported for ${projTitle(hr.project_title)}`, conversation_id: hr.conversation_id });
      return { ok: true, hireRequest: hr };
    }

    default:
      return { ok: false, status: 400, error: 'Unknown action' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const { action, userId, hireRequestId, ...payload } = body || {};
    if (!action || !userId) return json({ error: 'Missing action or userId' }, 400);

    if (action === 'send_hire_request') {
      const {
        conversationId, hostId, serviceListingId, serviceLabel, isCustom,
        projectTitle, description, referenceLinks, portfolioItemId,
        workType, streetAddress, city, province, postalCode, country,
        dateType, startDate, endDate, startTime, endTime,
        pricingType, useCreatorRate, budgetAmount, currency, message,
      } = payload;
      if (!conversationId || !hostId || !serviceLabel || !projectTitle || !description || !workType || !dateType || !pricingType) {
        return json({ error: 'Missing required fields' }, 400);
      }
      if (hostId === userId) return json({ error: 'You cannot hire yourself' }, 400);

      const hr = await insertReturning('hire_requests', {
        conversation_id: conversationId, requester_id: userId, host_id: hostId,
        service_listing_id: serviceListingId || null, service_label: serviceLabel, is_custom: !!isCustom,
        project_title: projectTitle, description, reference_links: referenceLinks || null, portfolio_item_id: portfolioItemId || null,
        work_type: workType, street_address: streetAddress || null, city: city || null, province: province || null, postal_code: postalCode || null, country: country || null,
        date_type: dateType, start_date: startDate || null, end_date: endDate || null, start_time: startTime || null, end_time: endTime || null,
        pricing_type: pricingType, use_creator_rate: !!useCreatorRate, budget_amount: budgetAmount ?? null, currency: currency || 'CAD',
        message: message || null, last_offer_by: userId, status: 'sent',
      });
      if (!hr) return json({ error: 'Could not create hire request' }, 500);

      const requester = await selectOne('profiles', `id=eq.${userId}`);
      const host = await selectOne('profiles', `id=eq.${hostId}`);

      await insertOne('messages', {
        id: crypto.randomUUID(), conversation_id: conversationId, sender_id: userId, sender_name: requester?.name || '',
        content: null, type: 'hire',
        metadata: { hireCard: { hireRequestId: hr.id, requesterId: userId, hostId } },
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_deleted: false, is_pinned: false,
      });
      await updateOne('conversations', `id=eq.${conversationId}`, { updated_at: new Date().toISOString() });

      await pushNotification({ user_id: hostId, actor_id: userId, actor_name: requester?.name || '', type: 'system_notification', title: `${requester?.name || 'Someone'} wants to hire you for ${projTitle(projectTitle)}`, conversation_id: conversationId });
      await sendHireEmail(host?.email, host?.name, `New Hire Request on Filmons`, `${requester?.name || 'Someone'} wants to hire you for "${projectTitle}".`);

      return json({ success: true, hireRequest: hr });
    }

    if (!hireRequestId) return json({ error: 'Missing hireRequestId' }, 400);
    const hr = await selectOne('hire_requests', `id=eq.${hireRequestId}`);
    if (!hr) return json({ error: 'Hire request not found' }, 404);

    const result = await applyAction(hr, action, userId, payload);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ success: true, hireRequest: result.hireRequest });
  } catch (e) {
    console.error('manage-hire-request error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
