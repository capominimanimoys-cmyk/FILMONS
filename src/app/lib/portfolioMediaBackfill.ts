// One-time repair pass for portfolio_items affected by two historical bugs:
// (1) many rows predate the aspect_ratio/width/height columns and have them
//     null, so every card/grid/cover for that item fell back to a guessed
//     ratio instead of the real one; (2) videos uploaded before the
//     extractVideoFrame fix (see portfolioApi.ts) got a distorted, warped
//     square poster baked into their thumbnail_url pixels.
//
// Admin-triggered only (AdminSettings.tsx), never run automatically on a
// normal page load -- it re-downloads every affected item's original media
// to measure it, which is real bandwidth/time cost that shouldn't happen
// behind a regular user's back. Per this project's own priority order for
// recovering dimensions ("1. Original media metadata, 2. Original media
// file dimensions, 3. Existing valid stored dimensions, 4. Safe temporary
// fallback"), this always re-measures the ORIGINAL media file -- never the
// old (possibly distorted) thumbnail -- as the source of truth.
import { supabase } from '../../lib/supabase';
import { PORTFOLIO_BUCKET } from './portfolioApi';

export interface BackfillResult {
  scanned:               number;
  dimensionsFixed:       number;
  thumbnailsRegenerated: number;
  errors:                number;
}

interface BackfillRow {
  id: string;
  user_id: string;
  media_type: string;
  media_url: string | null;
  media_url_original: string | null;
  thumbnail_url: string | null;
  aspect_ratio: number | null;
  width: number | null;
  height: number | null;
}

function measureImage(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeoutId = setTimeout(() => resolve(null), 15000);
    img.onload = () => { clearTimeout(timeoutId); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { clearTimeout(timeoutId); resolve(null); };
    img.src = url;
  });
}

function measureVideo(url: string): Promise<{ width: number; height: number; durationOk: boolean } | null> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const timeoutId = setTimeout(() => resolve(null), 15000);
    video.onloadedmetadata = () => {
      clearTimeout(timeoutId);
      resolve({ width: video.videoWidth, height: video.videoHeight, durationOk: Number.isFinite(video.duration) });
    };
    video.onerror = () => { clearTimeout(timeoutId); resolve(null); };
    video.src = url;
  });
}

// Same capture logic as portfolioApi.ts's (fixed) extractVideoFrame, but
// reading from a remote URL instead of a local File, and uploading straight
// to storage instead of returning a data: URL -- there's no re-upload step
// needed here the way the original upload flow has one.
function regenerateVideoThumbnail(videoUrl: string, userId: string): Promise<string | null> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    };
    const timeoutId = setTimeout(() => finish(null), 15000);

    const capture = () => {
      try {
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh) { finish(null); return; }
        const scale = Math.min(1, 1280 / Math.max(vw, vh));
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(vw * scale);
        canvas.height = Math.round(vh * scale);
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async blob => {
          if (!blob) { finish(null); return; }
          const path = `portfolio/thumbs/${userId}-${Date.now()}-backfill.jpg`;
          const { data, error } = await supabase.storage.from(PORTFOLIO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
          if (error || !data) { finish(null); return; }
          finish(supabase.storage.from(PORTFOLIO_BUCKET).getPublicUrl(data.path).data.publicUrl);
        }, 'image/jpeg', 0.8);
      } catch { finish(null); }
    };

    video.onloadedmetadata = () => {
      const seekTo = Number.isFinite(video.duration) ? Math.min(1, video.duration / 2) : 0;
      try { video.currentTime = seekTo; } catch { capture(); }
    };
    video.onseeked = capture;
    video.onerror = () => finish(null);
    video.src = videoUrl;
  });
}

export async function backfillPortfolioMediaDimensions(
  onProgress?: (scanned: number, total: number) => void,
): Promise<BackfillResult> {
  const result: BackfillResult = { scanned: 0, dimensionsFixed: 0, thumbnailsRegenerated: 0, errors: 0 };

  const { data, error } = await supabase
    .from('portfolio_items')
    .select('id, user_id, media_type, media_url, media_url_original, thumbnail_url, aspect_ratio, width, height');
  if (error || !data) { result.errors++; return result; }
  const items = data as BackfillRow[];

  for (const item of items) {
    result.scanned++;
    try {
      let width = item.width, height = item.height, aspect_ratio = item.aspect_ratio;
      let dimensionsChanged = false;

      // Priority: original media file's own dimensions over anything
      // already stored, since a prior wrong value (e.g. derived from a
      // distorted thumbnail) must never be trusted as the fallback.
      if ((!aspect_ratio || !width || !height) && (item.media_type === 'image' || item.media_type === 'video')) {
        const src = item.media_url_original || item.media_url;
        if (src) {
          const dims = item.media_type === 'video' ? await measureVideo(src) : await measureImage(src);
          if (dims && dims.width && dims.height) {
            width = dims.width;
            height = dims.height;
            aspect_ratio = dims.width / dims.height;
            dimensionsChanged = true;
          }
        }
      }

      // Detect a video poster baked at the wrong shape by comparing the
      // STORED thumbnail's own pixel ratio against the real video ratio --
      // a mismatch beyond a small tolerance means it was captured by the
      // old square-clamp bug and must be recaptured from the source video,
      // never stretched after the fact.
      let newThumbnailUrl: string | null = null;
      if (item.media_type === 'video' && item.thumbnail_url && aspect_ratio) {
        const thumbDims = await measureImage(item.thumbnail_url);
        if (thumbDims && thumbDims.width && thumbDims.height) {
          const thumbRatio = thumbDims.width / thumbDims.height;
          if (Math.abs(thumbRatio - aspect_ratio) > 0.05) {
            const src = item.media_url_original || item.media_url;
            if (src) {
              newThumbnailUrl = await regenerateVideoThumbnail(src, item.user_id);
              if (newThumbnailUrl) result.thumbnailsRegenerated++;
            }
          }
        }
      }

      if (dimensionsChanged || newThumbnailUrl) {
        const patch: Record<string, unknown> = {};
        if (dimensionsChanged) { patch.width = width; patch.height = height; patch.aspect_ratio = aspect_ratio; }
        if (newThumbnailUrl) patch.thumbnail_url = newThumbnailUrl;
        const { error: updateError } = await supabase.from('portfolio_items').update(patch).eq('id', item.id);
        if (updateError) result.errors++;
        else if (dimensionsChanged) result.dimensionsFixed++;
      }
    } catch {
      result.errors++;
    }
    onProgress?.(result.scanned, items.length);
  }

  return result;
}
