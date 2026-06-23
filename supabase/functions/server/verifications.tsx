/**
 * verifications.tsx — Supabase table-backed verification requests.
 * Tries verification_requests first, falls back to verifications table.
 */
import { createClient } from "npm:@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function rowToRequest(row: any) {
  if (!row) return null;
  // All rich fields live in the metadata JSONB column
  const m = (typeof row.metadata === "string"
    ? (() => { try { return JSON.parse(row.metadata); } catch { return {}; } })()
    : row.metadata) || {};
  return {
    id:               row.id,
    userId:           row.user_id,
    userName:         m.userName    || row.full_name || "",
    userEmail:        row.email     || m.email       || "",
    userPhone:        m.phone       || "",
    phoneVerified:    m.phoneVerified ?? false,
    emailVerified:    m.emailVerified ?? false,
    fullName:         row.full_name  || m.fullName   || "",
    dob:              m.dob          || undefined,
    streetAddr:       m.streetAddr   || m.address?.streetAddr || undefined,
    city:             m.city         || m.address?.city       || undefined,
    province:         m.province     || m.address?.province   || undefined,
    postalCode:       m.postalCode   || m.address?.postalCode || undefined,
    issuingCountry:   m.issuingCountry || undefined,
    idType:           m.idType        || undefined,
    govIdPhoto:       m.govIdUrl      || m.govIdPhoto    || undefined,
    utilityBillPhoto: m.utilityBillUrl || m.utilityBillPhoto || undefined,
    selfiePhoto:      m.selfieUrl     || m.selfiePhoto   || undefined,
    status:           row.status      || "pending",
    rejectionReason:  m.rejectionReason || undefined,
    adminNotes:       m.adminNotes     || undefined,
    submittedAt:      row.submitted_at || new Date().toISOString(),
    reviewedAt:       row.reviewed_at  || null,
    reviewedBy:       row.reviewed_by  || null,
  };
}

async function queryTable(table: string) {
  const { data, error } = await supabase
    .from(table).select("*").order("submitted_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToRequest);
}

export async function getAll() {
  try { return await queryTable("verification_requests"); }
  catch { return await queryTable("verifications"); }
}

export async function create(body: any) {
  const meta = body.metadata || {};
  const addr = meta.address  || {};
  // Pack all rich fields into metadata JSONB
  const metadata = {
    userName:       body.userName || body.fullName || "",
    phone:          body.phone    || "",
    dob:            meta.dob      || body.dob || null,
    address:        addr,
    streetAddr:     addr.streetAddr || null,
    city:           addr.city       || null,
    province:       addr.province   || null,
    postalCode:     addr.postalCode || null,
    issuingCountry: meta.issuingCountry || body.issuingCountry || null,
    idType:         meta.idType    || body.idType    || null,
    govIdUrl:       meta.govIdUrl  || body.govIdPhoto || null,
    utilityBillUrl: meta.utilityBillUrl || body.utilityBillPhoto || null,
    selfieUrl:      meta.selfieUrl || body.selfiePhoto || null,
  };

  const record = {
    id:           body.id || crypto.randomUUID(),
    user_id:      body.userId,
    full_name:    body.fullName || body.userName || "",
    email:        body.email   || "",
    status:       "pending",
    submitted_at: body.submittedAt || new Date().toISOString(),
    metadata,
  };

  const { data, error } = await supabase
    .from("verification_requests")
    .upsert(record, { onConflict: "user_id" })
    .select().single();

  if (!error) return rowToRequest(data);
  throw new Error(error.message);
}

export async function update(id: string, body: any) {
  const patch: any = {
    status:      body.status,
    reviewed_at: body.reviewedAt || new Date().toISOString(),
    reviewed_by: body.reviewedBy || "Admin",
  };

  // Merge rejection reason into metadata
  if (body.rejectionReason) {
    // Read current row to merge metadata
    const { data: existing } = await supabase
      .from("verification_requests").select("metadata").eq("id", id).single();
    const currentMeta = existing?.metadata || {};
    patch.metadata = { ...currentMeta, rejectionReason: body.rejectionReason, adminNotes: body.rejectionReason };
  }

  const { data, error } = await supabase
    .from("verification_requests").update(patch).eq("id", id).select().single();

  if (error) throw new Error(error.message);

  const userId = body.userId || data?.user_id;
  if (userId) await updateProfile(userId, body.status);

  supabase.from("admin_actions").insert({
    verification_id: id, user_id: userId, action: body.status,
    admin_email: "filmons481@gmail.com", reason: body.rejectionReason || null,
  }).then(() => {}).catch(() => {});

  return rowToRequest(data);
}

async function updateProfile(userId: string, status: string) {
  const patch: any = { verification_status: status };
  if (status === "approved") {
    patch.is_verified  = true;
    patch.account_type = "business";
    patch.account_mode = "business";
  } else if (status === "rejected" || status === "denied") {
    patch.is_verified = false;
  }
  await supabase.from("profiles").update(patch).eq("id", userId);
}

export async function getByUser(userId: string) {
  const { data } = await supabase
    .from("verification_requests").select("*").eq("user_id", userId).single();
  return rowToRequest(data);
}

export default { getAll, create, update, getByUser };