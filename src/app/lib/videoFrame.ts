/**
 * Filmons — Video frame capture
 * Extracts whatever frame a <video> element is currently displaying (after a
 * user-driven scrub, not a fixed timestamp) as an uploadable image Blob.
 * Extends the fixed-timestamp auto-thumbnail approach in portfolioApi.ts's
 * extractVideoFrame to be user-driven and blob-based rather than a base64
 * string, so callers can upload it through the normal image pipeline instead
 * of storing a data: URL in the database.
 */

/** Seeks `video` to `timestamp` (seconds) and resolves once the frame is ready to read. */
export function seekVideoTo(video: HTMLVideoElement, timestamp: number): Promise<void> {
  return new Promise(resolve => {
    if (Math.abs(video.currentTime - timestamp) < 0.01) { resolve(); return; }
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = timestamp;
  });
}

/**
 * Draws the video's currently-displayed frame to an offscreen canvas at the
 * video's native resolution (preserves aspect ratio) and returns it as a JPEG
 * Blob, ready to upload like any other image file.
 */
export function captureVideoFrameBlob(video: HTMLVideoElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) {
      reject(new Error('Could not read this video frame'));
      return;
    }
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Could not read this video frame'));
      return;
    }
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Could not read this video frame')),
      'image/jpeg',
      quality,
    );
  });
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
