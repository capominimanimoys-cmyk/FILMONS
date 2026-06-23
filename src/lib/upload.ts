import { supabase } from './supabase';

/**
 * Upload a base64 data URL to Supabase Storage.
 * Returns the public URL on success, or the original base64 as fallback.
 * Bucket: "verification-documents" (private) or "verifications" (legacy).
 */
export const uploadImage = async (base64: string, path: string): Promise<string> => {
  if (!base64 || !base64.startsWith('data:')) return base64; // not a base64 string

  const blob = await fetch(base64).then(r => r.blob());
  const contentType = blob.type || 'image/jpeg';

  // Try primary bucket first, then legacy
  for (const bucket of ['verification-documents', 'verifications']) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, { contentType, upsert: true });

    if (error) {
      console.warn(`Storage upload to "${bucket}" failed:`, error.message);
      continue;
    }

    // For private bucket, return a signed URL (60 days)
    const { data: signed } = await supabase.storage
      .from(bucket)
      .createSignedUrl(data.path, 60 * 60 * 24 * 60);

    if (signed?.signedUrl) return signed.signedUrl;

    // Fallback: public URL (works if bucket is public)
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(data.path);
    if (pub?.publicUrl) return pub.publicUrl;
  }

  // If all uploads failed, return base64 so the data isn't lost
  return base64;
};