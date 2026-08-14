import { supabase } from './supabase';

const VERIFICATION_BUCKET = 'verification-documents';

/**
 * Upload a base64 data URL to the private verification-documents bucket.
 * Returns the stable storage PATH — never a signed URL. Signed URLs expire;
 * baking one into a DB column just means the reference silently breaks
 * later. Mint a fresh signed URL at view time instead (see signVerificationDoc).
 *
 * Falls back to returning the original base64 string if the upload fails
 * for any reason (matches the graceful-degradation pattern used elsewhere
 * in this app) — callers should treat a `data:` return as "not in storage".
 */
export const uploadVerificationDoc = async (base64: string, path: string): Promise<string> => {
  if (!base64 || !base64.startsWith('data:')) return base64; // not a base64 string — already a path/URL

  const blob = await fetch(base64).then(r => r.blob());
  const contentType = blob.type || 'image/jpeg';

  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .upload(path, blob, { contentType, upsert: true });

  if (error) {
    console.warn(`Verification document upload failed:`, error.message);
    return base64; // caller keeps the base64 rather than losing the file entirely
  }

  return data.path;
};

/** Mint a short-lived signed URL for a stored verification document path.
 *  Returns null if the path isn't actually in storage (e.g. it's still a
 *  base64 fallback string from a failed upload). */
export const signVerificationDoc = async (path: string | null | undefined, expiresInSeconds = 300): Promise<string | null> => {
  if (!path || path.startsWith('data:')) return null;
  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) { console.warn('Failed to sign verification doc:', error.message); return null; }
  return data?.signedUrl || null;
};

// ── Rental agreement documents (ID/proof-of-address/signature/generated docs) ──
// Same private-bucket + path-only pattern as verification docs above, just a
// separate bucket so rental documents and Creator+ KYC documents stay apart.
const RENTAL_BUCKET = 'rental-verification';

export const uploadRentalDoc = async (base64OrBlob: string | Blob, path: string, contentType?: string): Promise<string> => {
  const blob = typeof base64OrBlob === 'string'
    ? (base64OrBlob.startsWith('data:') ? await fetch(base64OrBlob).then(r => r.blob()) : null)
    : base64OrBlob;
  if (!blob) return typeof base64OrBlob === 'string' ? base64OrBlob : ''; // not a base64 string — already a path

  const { data, error } = await supabase.storage
    .from(RENTAL_BUCKET)
    .upload(path, blob, { contentType: contentType || blob.type || 'application/octet-stream', upsert: true });

  if (error) {
    console.warn('Rental document upload failed:', error.message);
    return typeof base64OrBlob === 'string' ? base64OrBlob : '';
  }
  return data.path;
};

export const signRentalDoc = async (path: string | null | undefined, expiresInSeconds = 300): Promise<string | null> => {
  if (!path || path.startsWith('data:')) return null;
  const { data, error } = await supabase.storage
    .from(RENTAL_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) { console.warn('Failed to sign rental doc:', error.message); return null; }
  return data?.signedUrl || null;
};

// ── Support case attachments (screenshots, damage photos, documents) ──────
// Same private-bucket + path-only pattern, keyed by user id folder so paths
// can't collide across users.
const SUPPORT_BUCKET = 'support-attachments';

export const uploadSupportAttachment = async (userId: string, file: File): Promise<string> => {
  const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { data, error } = await supabase.storage
    .from(SUPPORT_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error(error.message);
  return data.path;
};

export const signSupportAttachment = async (path: string | null | undefined, expiresInSeconds = 300): Promise<string | null> => {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(SUPPORT_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) { console.warn('Failed to sign support attachment:', error.message); return null; }
  return data?.signedUrl || null;
};
