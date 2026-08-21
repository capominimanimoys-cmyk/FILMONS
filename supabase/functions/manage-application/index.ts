// Server-verified mutations for opportunity_applications — shortlist / accept
// / decline / withdraw / view / mark_contacted / bulk_shortlist / bulk_decline
// / update_notes. Same client-asserted-identity-but-server-verified-ownership
// trust model as delete-listing: the client sends {applicationId, userId},
// this function looks up the real listing.user_id (or applicant_id, for
// withdraw) via the service-role key and rejects with 403 on mismatch —
// closing the gap in the old client-side-only `updateStatus()` call, which
// had no server-side re-check at all.
//
// One opportunity_applications row is the single source of truth for
// status. Both the Inbox Application Card and the Dashboard Applicants
// Manager call this same function, so there is never a second, divergent
// status model between the two surfaces.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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
async function updateOne(table: string, filter: string, patch: Record<string, unknown>) {
  await fetch(rest(`/${table}?${filter}`), {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
}
async function insertOne(table: string, row: Record<string, unknown>) {
  await fetch(rest(`/${table}`), {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  }).catch(() => {});
}

const TERMINAL = new Set(['accepted', 'rejected', 'withdrawn']);

function oppTitle(listingTitle: string | null | undefined) {
  return listingTitle ? `"${listingTitle}"` : 'this opportunity';
}

async function pushNotification(row: {
  user_id: string; actor_id?: string | null; actor_name?: string; type: string;
  title: string; conversation_id?: string | null;
}) {
  if (!row.user_id || row.user_id === row.actor_id) return;
  await insertOne('notifications', {
    user_id: row.user_id,
    actor_id: row.actor_id || null,
    actor_name: row.actor_name || '',
    type: row.type,
    title: row.title,
    conversation_id: row.conversation_id || null,
    is_read: false,
  });
}

async function insertSystemMessage(conversationId: string | null | undefined, text: string) {
  if (!conversationId) return;
  const now = new Date().toISOString();
  await insertOne('messages', {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    sender_id: 'system',
    sender_name: 'Filmons',
    content: null,
    type: 'system',
    metadata: { systemText: text },
    created_at: now,
    updated_at: now,
    is_deleted: false,
    is_pinned: false,
  });
  await updateOne('conversations', `id=eq.${conversationId}`, { updated_at: now });
}

// Applies a status transition to one application row. Returns the updated
// row, or null if the caller isn't authorized / the action doesn't apply.
async function applyAction(
  app: any,
  action: string,
  userId: string,
  payload: Record<string, any>,
): Promise<{ ok: true; application: any } | { ok: false; status: number; error: string }> {
  const listing = await selectOne('listings', `id=eq.${encodeURIComponent(app.listing_id)}`);
  const listingTitle: string | undefined = listing?.title;

  if (action === 'withdraw') {
    if (app.applicant_id !== userId) return { ok: false, status: 403, error: 'You do not own this application' };
  } else {
    if (!listing || listing.user_id !== userId) return { ok: false, status: 403, error: 'You do not own this opportunity' };
  }

  const now = new Date().toISOString();
  let patch: Record<string, unknown> | null = null;
  let notifyUserId: string | null = null;
  let notifyType = '';
  let systemText = '';

  switch (action) {
    case 'view':
      if (app.status === 'pending') patch = { status: 'viewed', viewed_at: now };
      break;
    case 'shortlist':
      if (!TERMINAL.has(app.status)) {
        patch = { status: 'shortlisted', shortlisted_at: now };
        notifyUserId = app.applicant_id; notifyType = 'application_shortlisted';
        systemText = 'You were shortlisted for this opportunity.';
      }
      break;
    case 'accept':
      if (!TERMINAL.has(app.status)) {
        patch = {
          status: 'accepted', accepted_at: now,
          accepted_details: payload && (payload.position || payload.agreedRate || payload.startDate)
            ? { position: payload.position || null, agreedRate: payload.agreedRate || null, startDate: payload.startDate || null }
            : null,
        };
        notifyUserId = app.applicant_id; notifyType = 'application_accepted';
        systemText = 'Your application was accepted.';
      }
      break;
    case 'decline':
      if (!TERMINAL.has(app.status)) {
        patch = {
          status: 'rejected', declined_at: now,
          decline_reason: payload?.reason || null,
          host_notes: payload?.hostNote ? [app.host_notes, payload.hostNote].filter(Boolean).join('\n') : app.host_notes,
        };
        notifyUserId = app.applicant_id; notifyType = 'application_rejected';
        systemText = "There's an update to your application status.";
      }
      break;
    case 'withdraw':
      if (!TERMINAL.has(app.status)) {
        patch = { status: 'withdrawn', withdrawn_at: now };
        notifyUserId = listing?.user_id || null; notifyType = 'application_withdrawn';
        systemText = 'The applicant withdrew their application.';
      }
      break;
    case 'mark_contacted':
      if (app.status === 'viewed' || app.status === 'shortlisted') {
        patch = { status: 'contacted', contacted_at: now };
      }
      break;
    case 'update_notes':
      patch = { host_notes: payload?.notes ?? null };
      break;
    default:
      return { ok: false, status: 400, error: 'Unknown action' };
  }

  if (!patch) return { ok: true, application: app }; // no-op transition — not an error

  await updateOne('opportunity_applications', `id=eq.${app.id}`, patch);
  const updated = { ...app, ...patch };

  if (notifyUserId && notifyType) {
    const actorName = action === 'withdraw' ? (await selectOne('profiles', `id=eq.${app.applicant_id}`))?.name || 'Someone' : '';
    let title = '';
    if (notifyType === 'application_shortlisted') title = `You've been shortlisted for ${oppTitle(listingTitle)}`;
    else if (notifyType === 'application_accepted') title = `Your application for ${oppTitle(listingTitle)} was accepted`;
    else if (notifyType === 'application_rejected') title = `There's an update to your application for ${oppTitle(listingTitle)}`;
    else if (notifyType === 'application_withdrawn') title = `${actorName} withdrew their application for ${oppTitle(listingTitle)}`;
    await pushNotification({
      user_id: notifyUserId, actor_id: userId, actor_name: actorName, type: notifyType,
      title, conversation_id: app.conversation_id,
    });
  }
  if (systemText) await insertSystemMessage(app.conversation_id, systemText);

  return { ok: true, application: updated };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const { action, userId, applicationId, applicationIds, ...payload } = body || {};
    if (!action || !userId) return json({ error: 'Missing action or userId' }, 400);

    if (action === 'bulk_shortlist' || action === 'bulk_decline') {
      const ids: string[] = Array.isArray(applicationIds) ? applicationIds : [];
      if (!ids.length) return json({ error: 'Missing applicationIds' }, 400);
      const singleAction = action === 'bulk_shortlist' ? 'shortlist' : 'decline';
      const results: { id: string; ok: boolean; error?: string }[] = [];
      for (const id of ids) {
        const app = await selectOne('opportunity_applications', `id=eq.${id}`);
        if (!app) { results.push({ id, ok: false, error: 'not_found' }); continue; }
        const r = await applyAction(app, singleAction, userId, payload);
        results.push({ id, ok: r.ok, error: r.ok ? undefined : r.error });
      }
      return json({ success: true, results });
    }

    if (!applicationId) return json({ error: 'Missing applicationId' }, 400);
    const app = await selectOne('opportunity_applications', `id=eq.${applicationId}`);
    if (!app) return json({ error: 'Application not found' }, 404);

    const result = await applyAction(app, action, userId, payload);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ success: true, application: result.application });
  } catch (e) {
    console.error('manage-application error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
