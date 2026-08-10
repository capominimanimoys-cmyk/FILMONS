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
