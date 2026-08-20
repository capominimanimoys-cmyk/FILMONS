// Mints a short-lived signed URL for one KYC document, server-side, gated
// to super_admin (raw ID/proof-of-address documents are restricted from
// Support Agent per the review-flow permission matrix) and audit-logged.
// Replaces the previous client-side signVerificationDoc() call for admin
// review, which minted signed URLs with the anon key and no role check.
import { verifyAdminToken } from '../_shared/adminAuth.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const BUCKET = 'verification-documents';

const DOC_TYPES: Record<string, { column: string; auditAction: string }> = {
  id_front:          { column: 'id_front_path',          auditAction: 'government_id_viewed' },
  id_back:           { column: 'id_back_path',            auditAction: 'government_id_viewed' },
  selfie:            { column: 'selfie_path',              auditAction: 'government_id_viewed' },
  proof_of_address:  { column: 'proof_of_address_path',    auditAction: 'proof_of_address_viewed' },
};

function rest(path: string) {
  return `${SUPABASE_URL}/rest/v1${path}`;
}
const H = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const admin = await verifyAdminToken(req);
    if (!admin) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (admin.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Only Super Admin can view verification documents' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { verificationId, docType } = await req.json();
    const spec = DOC_TYPES[docType];
    if (!verificationId || !spec) return new Response(JSON.stringify({ error: 'Missing/invalid verificationId or docType' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const res = await fetch(rest(`/identity_verifications?id=eq.${verificationId}&select=id,user_id,${spec.column}`), { headers: H });
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    const path = row?.[spec.column];
    if (!row || !path) return new Response(JSON.stringify({ error: 'Document not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (path.startsWith('data:')) {
      // Legacy base64 fallback — nothing to sign, hand it back directly.
      await fetch(rest('/verification_audit_log'), {
        method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ verification_id: verificationId, user_id: row.user_id, admin_identifier: admin.name, action: spec.auditAction, detail: docType }),
      });
      return new Response(JSON.stringify({ url: path }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 600 }),
    });
    const signData = await signRes.json();
    if (!signRes.ok || !signData.signedURL) {
      return new Response(JSON.stringify({ error: 'Could not sign document URL' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    await fetch(rest('/verification_audit_log'), {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ verification_id: verificationId, user_id: row.user_id, admin_identifier: admin.name, action: spec.auditAction, detail: docType }),
    });

    return new Response(JSON.stringify({ url: `${SUPABASE_URL}/storage/v1${signData.signedURL}` }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('verification-view-document error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
