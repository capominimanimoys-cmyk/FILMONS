// Server-side Creator+ verification decisions (approve / changes_requested
// / deny). This is deliberately NOT done as a direct client → Postgres
// write: the "critical document deletion rule" requires the actual files
// gone from storage the moment a final decision lands, and that has to
// happen in one place that always runs — a client-side delete call is
// skippable (closed tab, crashed browser, blocked request) and would leave
// files behind. Runs with the service-role key, which the Supabase
// platform injects into every Edge Function automatically.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const BUCKET = 'verification-documents';

function rest(path: string) {
  return `${SUPABASE_URL}/rest/v1${path}`;
}
const restHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'apikey': SERVICE_KEY,
};

async function dbSelectOne(id: string) {
  const res = await fetch(rest(`/identity_verifications?id=eq.${id}&select=*`), { headers: restHeaders });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function dbUpdate(id: string, patch: Record<string, unknown>) {
  await fetch(rest(`/identity_verifications?id=eq.${id}`), {
    method: 'PATCH',
    headers: { ...restHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify(patch),
  });
}

async function dbInsertAudit(row: Record<string, unknown>) {
  await fetch(rest('/verification_audit_log'), {
    method: 'POST',
    headers: { ...restHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify(row),
  });
}

async function updateProfile(userId: string, patch: Record<string, unknown>) {
  await fetch(rest(`/profiles?id=eq.${userId}`), {
    method: 'PATCH',
    headers: { ...restHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify(patch),
  });
}

// Deletes the actual objects from the private bucket — not just clearing
// DB columns. Best-effort per file so one missing/already-gone object
// doesn't block clearing the rest.
async function deleteStorageObjects(paths: (string | null | undefined)[]) {
  const real = paths.filter((p): p is string => !!p && !p.startsWith('data:'));
  if (!real.length) return;
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: { ...restHeaders },
    body: JSON.stringify({ prefixes: real }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json();
    const { verificationId, action, reason, adminIdentifier } = body || {};
    if (!verificationId || !action) {
      return new Response(JSON.stringify({ error: 'Missing verificationId or action' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (!['approve', 'changes_requested', 'deny'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (action !== 'approve' && !String(reason || '').trim()) {
      return new Response(JSON.stringify({ error: 'Reason is required for this action' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const row = await dbSelectOne(verificationId);
    if (!row) {
      return new Response(JSON.stringify({ error: 'Verification not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const now = new Date().toISOString();
    const admin = String(adminIdentifier || 'Admin').slice(0, 80);
    const docPaths = [row.id_front_path, row.id_back_path, row.selfie_path, row.proof_of_address_path];

    if (action === 'changes_requested') {
      // Application stays active — documents are kept, nothing to delete.
      await dbUpdate(verificationId, {
        status: 'changes_requested',
        decision_reason: reason,
        reviewed_at: now,
        reviewed_by: admin,
      });
      await updateProfile(row.user_id, { verification_status: 'changes_requested' });
      await dbInsertAudit({ verification_id: verificationId, user_id: row.user_id, admin_identifier: admin, action: 'changes_requested', detail: reason });
      return new Response(JSON.stringify({ success: true, status: 'changes_requested' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const approved = action === 'approve';

    await dbUpdate(verificationId, {
      status: approved ? 'approved' : 'denied',
      decision_reason: approved ? null : reason,
      reviewed_at: now,
      reviewed_by: admin,
      verified_at: approved ? now : null,
      // Final decision → documents are being deleted below; clear the
      // path columns in the same update so the row never claims to have
      // files it no longer has.
      id_front_path: null,
      id_back_path: null,
      selfie_path: null,
      proof_of_address_path: null,
      documents_deleted_at: now,
    });

    await updateProfile(row.user_id, approved
      ? { verification_status: 'approved', is_verified: true, creator_plus_verified: true, account_type: 'creator_plus', account_mode: 'creator_plus' }
      : { verification_status: 'denied', is_verified: false });

    await deleteStorageObjects(docPaths);

    await dbInsertAudit({ verification_id: verificationId, user_id: row.user_id, admin_identifier: admin, action: approved ? 'approved' : 'denied', detail: reason || null });
    await dbInsertAudit({ verification_id: verificationId, user_id: row.user_id, admin_identifier: admin, action: 'documents_deleted', detail: `${docPaths.filter(Boolean).length} file(s) removed after final decision` });

    return new Response(JSON.stringify({ success: true, status: approved ? 'approved' : 'denied' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('verification-decision error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
