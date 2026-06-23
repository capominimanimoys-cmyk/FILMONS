/**
 * Filmons AI API Client
 * Routes operations to appropriate AI services.
 * All operations upload original to Supabase, process, store result.
 */
import { supabase } from '../../lib/supabase';

// ── Config ────────────────────────────────────────────────────────────────────
const REMOVE_BG_KEY  = import.meta.env.VITE_REMOVE_BG_KEY  || '';
const REPLICATE_KEY  = import.meta.env.VITE_REPLICATE_KEY  || '';
const OPENAI_KEY     = import.meta.env.VITE_OPENAI_KEY     || '';
const STABILITY_KEY  = import.meta.env.VITE_STABILITY_KEY  || '';

// In development, route through Vite's proxy to avoid CORS blocks from
// Stability AI (rejects cross-origin browser requests). Replicate supports
// CORS natively so it's called directly to avoid proxy stripping auth headers.
const isDev = import.meta.env.DEV;
const STABILITY_BASE  = isDev ? '/api-proxy/stability'  : 'https://api.stability.ai';
const REPLICATE_BASE  = 'https://api.replicate.com';
const REMOVE_BG_BASE  = isDev ? '/api-proxy/removebg'   : 'https://api.remove.bg';

if (isDev) console.log('[aiapi] REPLICATE_KEY loaded:', REPLICATE_KEY ? `${REPLICATE_KEY.slice(0,6)}…` : 'MISSING');

const PLACEHOLDER_KEYS = new Set(['your_key', 'YOUR_KEY', 'REPLACE_ME']);
function hasApiKey(key: string): boolean {
  return !!key && !PLACEHOLDER_KEYS.has(key.trim());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch a URL and return as Blob */
async function urlToBlob(url: string): Promise<Blob> {
  const r = await fetch(url);
  return r.blob();
}

/**
 * Resize + JPEG-compress a blob so it fits within maxBytes.
 * Stability AI rejects payloads > 10 MiB.
 */
async function compressBlob(blob: Blob, maxBytes = 9 * 1024 * 1024): Promise<Blob> {
  if (blob.size <= maxBytes) return blob;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      // Scale down proportionally until encoded size is likely under limit
      const scale = Math.sqrt(maxBytes / blob.size) * 0.9;
      width  = Math.round(width  * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/jpeg', 0.85);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Upload a Blob to Supabase posts bucket, return public URL */
async function uploadResult(blob: Blob, prefix: string): Promise<string> {
  const ext  = blob.type.split('/')[1]?.replace('jpeg','jpg') || 'jpg';
  const path = `ai-results/${prefix}/${Date.now()}-${Math.random().toString(36).slice(2,7)}.${ext}`;
  const { error } = await supabase.storage
    .from('posts')
    .upload(path, blob, { upsert: false, contentType: blob.type });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path);
  return urlData.publicUrl;
}

/** Convert image URL to base64 data URI */
async function urlToBase64(url: string): Promise<string> {
  const blob = await urlToBlob(url);
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = () => res(reader.result as string);
    reader.onerror = rej;
    reader.readAsDataURL(blob);
  });
}

// Replicate rembg model (used when remove.bg key is absent)
const REMBG_MODEL = 'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad7a50fa13b48e5fea4f5a60f5';

// ── Remove.bg (falls back to Replicate rembg if key not set) ──────────────────
async function removeBg(imageUrl: string): Promise<string> {
  if (hasApiKey(REMOVE_BG_KEY)) {
    const blob = await compressBlob(await urlToBlob(imageUrl), 9 * 1024 * 1024);
    const form = new FormData();
    form.append('image_file', blob);
    form.append('size', 'auto');
    const res = await fetch(`${REMOVE_BG_BASE}/v1.0/removebg`, {
      method: 'POST',
      headers: { 'X-Api-Key': REMOVE_BG_KEY },
      body: form,
    });
    if (!res.ok) throw new Error(`remove.bg: ${await res.text()}`);
    return uploadResult(await res.blob(), 'removebg');
  }
  // Fallback: Replicate rembg
  if (!hasApiKey(REPLICATE_KEY)) throw new Error('VITE_REMOVE_BG_KEY not set');
  return replicateRun(REMBG_MODEL, { image: imageUrl });
}

// ── Replicate (image-to-image via SDXL / real-esrgan) ────────────────────────
async function replicateRun(model: string, input: Record<string, any>): Promise<string> {
  if (!hasApiKey(REPLICATE_KEY)) throw new Error('VITE_REPLICATE_KEY not set');
  // Create prediction
  const create = await fetch(`${REPLICATE_BASE}/v1/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ version: model, input }),
  });
  const prediction = await create.json();
  if (create.status >= 400) throw new Error(prediction.detail || 'Replicate error');
  // Poll until done (max 60s)
  const pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await fetch(pollUrl.replace('https://api.replicate.com', REPLICATE_BASE), { headers: { 'Authorization': `Bearer ${REPLICATE_KEY}` } });
    const p = await poll.json();
    if (p.status === 'succeeded') {
      const outputUrl = Array.isArray(p.output) ? p.output[0] : p.output;
      const blob = await urlToBlob(outputUrl);
      return uploadResult(blob, 'replicate');
    }
    if (p.status === 'failed') throw new Error(`Replicate failed: ${p.error}`);
  }
  throw new Error('Replicate timeout');
}

// ── Stability AI v2beta (img2img) ─────────────────────────────────────────────
async function stabilityImg2Img(
  imageUrl: string,
  prompt: string,
  strength = 0.5,
  negativePrompt?: string,
): Promise<string> {
  if (!hasApiKey(STABILITY_KEY)) throw new Error('VITE_STABILITY_KEY not set');
  const blob = await compressBlob(await urlToBlob(imageUrl));
  const form = new FormData();
  form.append('image', blob, 'image.png');
  form.append('prompt', prompt);
  form.append('mode', 'image-to-image');
  form.append('strength', String(strength));
  form.append('output_format', 'png');
  if (negativePrompt) form.append('negative_prompt', negativePrompt);
  const res = await fetch(`${STABILITY_BASE}/v2beta/stable-image/generate/sd3`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${STABILITY_KEY}`, 'Accept': 'image/*' },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try { message = JSON.parse(text)?.errors?.join(', ') || JSON.parse(text)?.message || text; } catch { /* raw text */ }
    throw new Error(`Stability: ${message}`);
  }
  const imgBlob = await res.blob();
  return uploadResult(imgBlob, 'stability');
}

// ── OpenAI Vision (captions, hashtags, descriptions) ─────────────────────────
async function openaiVision(imageUrl: string, prompt: string): Promise<string> {
  if (!hasApiKey(OPENAI_KEY)) throw new Error('VITE_OPENAI_KEY not set');
  // blob: and local URLs can't be fetched by OpenAI servers — convert to base64.
  const isRemote = imageUrl.startsWith('http://') || imageUrl.startsWith('https://');
  const finalUrl = isRemote ? imageUrl : await urlToBase64(imageUrl);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: finalUrl, detail: 'low' } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// ── Canvas-based safe enhancement (no generative AI — zero content change) ───
// Applies brightness / contrast / saturation + unsharp-mask sharpening.
// Pixel math only: cannot change faces, hair, clothing, background, or any content.
async function canvasEnhance(blob: Blob, mode: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;

      // Step 1 — apply CSS brightness / contrast / saturation via canvas filter
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      const presets: Record<string, string> = {
        photo:     'contrast(1.12) brightness(1.05) saturate(1.15)',
        portrait:  'contrast(1.08) brightness(1.04) saturate(1.08)',
        landscape: 'contrast(1.18) brightness(1.06) saturate(1.25)',
        food:      'contrast(1.12) brightness(1.06) saturate(1.30)',
        product:   'contrast(1.15) brightness(1.08) saturate(1.10)',
        night:     'contrast(1.25) brightness(1.20) saturate(1.10)',
      };
      ctx.filter = presets[mode] ?? presets.photo;
      ctx.drawImage(img, 0, 0);

      // Step 2 — unsharp mask sharpening (3×3 kernel, no content change)
      const id = ctx.getImageData(0, 0, w, h);
      const src = id.data;
      const out = new Uint8ClampedArray(src.length);
      const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let r = 0, g = 0, b = 0;
          for (let ky = 0; ky < 3; ky++) {
            for (let kx = 0; kx < 3; kx++) {
              const ny = Math.min(h - 1, Math.max(0, y + ky - 1));
              const nx = Math.min(w - 1, Math.max(0, x + kx - 1));
              const i  = (ny * w + nx) * 4;
              const k  = kernel[ky * 3 + kx];
              r += src[i]     * k;
              g += src[i + 1] * k;
              b += src[i + 2] * k;
            }
          }
          const o = (y * w + x) * 4;
          out[o]     = Math.min(255, Math.max(0, r));
          out[o + 1] = Math.min(255, Math.max(0, g));
          out[o + 2] = Math.min(255, Math.max(0, b));
          out[o + 3] = src[o + 3]; // keep alpha unchanged
        }
      }
      ctx.putImageData(new ImageData(out, w, h), 0, 0);

      canvas.toBlob(
        b2 => b2 ? resolve(b2) : reject(new Error('Canvas enhance failed')),
        'image/jpeg', 0.93,
      );
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
  });
}

// ── AutoFix helpers ───────────────────────────────────────────────────────────

/** Measure perceptual similarity between two image URLs (0 = different, 1 = identical).
 *  Compares luminance at a downscaled 200px size for speed. */
async function measureSimilarity(url1: string, url2: string): Promise<number> {
  const loadPixels = (blob: Blob): Promise<Uint8ClampedArray> =>
    new Promise((res, rej) => {
      const img = new Image();
      const u   = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(u);
        const MAX = 200;
        const sc  = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const w   = Math.round(img.naturalWidth  * sc);
        const h   = Math.round(img.naturalHeight * sc);
        const c   = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        res(ctx.getImageData(0, 0, w, h).data);
      };
      img.onerror = rej;
      img.src = u;
    });

  const [b1, b2] = await Promise.all([urlToBlob(url1), urlToBlob(url2)]);
  const [d1, d2] = await Promise.all([loadPixels(b1), loadPixels(b2)]);
  if (d1.length !== d2.length) return 0;

  let sumDiff = 0;
  const n = d1.length / 4;
  for (let i = 0; i < n; i++) {
    const p  = i * 4;
    const Y1 = 0.299*d1[p] + 0.587*d1[p+1] + 0.114*d1[p+2];
    const Y2 = 0.299*d2[p] + 0.587*d2[p+1] + 0.114*d2[p+2];
    sumDiff += Math.abs(Y1 - Y2) / 255;
  }
  return Math.max(0, 1 - sumDiff / n);
}

/**
 * AutoFix canvas pipeline — subject-aware portrait enhancement.
 *
 * NEVER applies: glow, soft focus, dream effect, beauty filter, global blur,
 *               lens haze, or any filter that adds softness.
 *
 * Pipeline:
 *   Global  : mild auto white balance (grey-world ±10%) — no perceptual softness
 *   Subject : shadow recovery, exposure lift, vibrance, warmth — via elliptical mask
 *   Face    : extra shadow recovery (+50%) via tighter face-region ellipse
 *   Subject : sharpening (unsharp mask, full strength on subject, zero on background)
 *   Global  : highlight protection only (smooth rolloff, no blur)
 *
 * The critical rule: shadow recovery and vibrance are NEVER applied globally.
 * Applying them globally lifts the blacks of the whole image, which looks exactly
 * like a haze/soft-focus filter. Masking them to the subject keeps the background
 * crisp and makes the subject "pop" rather than "glow".
 *
 * Returns Blob — caller decides whether to upload or create a local preview URL.
 */
/**
 * AutoFix canvas pipeline — S-curve contrast first, zero haze.
 *
 * WHY S-CURVE REPLACES SHADOW LIFTING:
 *   Shadow lifting (adding light to dark pixels) COMPRESSES tonal range:
 *   blacks → grey = haze/fog.  S-curve does the OPPOSITE:
 *   • shadows  → slightly darker  (richer blacks)
 *   • midtones → unchanged
 *   • highlights → slightly brighter (more vivid)
 *   Net effect: INCREASED contrast, ZERO haze.
 *
 * Pipeline:
 *   1  S-curve contrast  — global, increases contrast without haze
 *   2  Face lift         — tiny additive lift ONLY for dark face pixels (Y < 80)
 *   3  Vibrance          — mild, subject area only, under-saturated pixels only
 *   4  Sharpening        — unsharp mask, subject only, blend ≤ 0.06
 *
 * Removed vs previous version:
 *   • Shadow lifting → was the source of the white-haze overlay
 *   • Warmth (+r/−b) → caused colour cast on red-shirt images
 *   • Golden-hour overlay → caused splotchy warm patches
 *   • Background box-blur → still risky to composite correctly
 *   • Grey-world WB → fails on dominant-colour clothing (red shirt)
 *
 * Limits enforced to prevent remaining artifacts:
 *   sharpness ≤ 0.06  →  no dark halos on afro hair edges
 *   shadowLift ≤ 46   →  no lifted-blacks haze
 *   No grey-world WB  →  fails on dominant-color clothing (red shirt issue)
 */
async function autoFixProcess(
  imageUrl: string,
  preset: 'natural' | 'professional' | 'strong' = 'natural',
): Promise<Blob> {
  /**
   * 5-stage portrait enhancement targeting "professional photo editor" quality.
   *
   * Stage 1 — Warm color grade (GLOBAL, multiplicative)
   *   Shifts colour temperature toward golden/warm: r×grR, g×grG, b×grB.
   *   Multiplicative = proportional, so skin, clothes, background all warm
   *   naturally without haze. Makes reds richer, greens deeper, blues cleaner.
   *
   * Stage 2 — S-curve contrast (GLOBAL)
   *   smoothstep s(x)=x²(3−2x): shadows slightly darker, highlights slightly
   *   brighter. Expands tonal range → more contrast, ZERO haze.
   *
   * Stage 3 — Face shadow recovery (face ellipse, Y < 100 only)
   *   Tiny additive lift for genuinely dark face pixels. Threshold at 100
   *   (not 128/160) so midtones are never touched → cannot create haze.
   *
   * Stage 4 — Golden light overlay (GLOBAL, multiplicative from top-left)
   *   Physically accurate: bright areas receive more light, dark areas almost
   *   none. Multiplicative means no splotchy additive patches. Creates the
   *   warm directional light visible in the target photo (Photo 2).
   *
   * Stage 5 — Global vibrance + subject sharpening
   *   Vibrance boosts under-saturated pixels globally (richer reds/greens/blues).
   *   Sharpening only on subject ellipse, blend ≤ 0.06 (no hair halos).
   *
   * Identity lock: every operation is multiplicative or proportional to existing
   * pixel values. Nothing is generated, replaced, or reconstructed.
   */
  const PRESETS = {
    // grR/grB: warm grade multipliers. sCurve: contrast blend.
    // faceLift: max additive lift for Y<100 face pixels.
    // golden: intensity of directional warm light from top-left.
    // vibrance: global saturation boost for under-saturated pixels.
    // sharpness: unsharp-mask blend (keep ≤ 0.06, safe on afro hair).
    natural:      { grR: 1.06, grG: 1.01, grB: 0.95, sCurve: 0.20, faceLift: 20, golden: 0.32, vibrance: 0.11, sharpness: 0.05 },
    professional: { grR: 1.08, grG: 1.02, grB: 0.92, sCurve: 0.24, faceLift: 26, golden: 0.44, vibrance: 0.15, sharpness: 0.06 },
    strong:       { grR: 1.10, grG: 1.03, grB: 0.89, sCurve: 0.28, faceLift: 32, golden: 0.56, vibrance: 0.19, sharpness: 0.07 },
  };
  const p      = PRESETS[preset];
  const blob   = await urlToBlob(imageUrl);
  const localUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(localUrl);
      const MAX  = 1400;
      const sc   = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w    = Math.round(img.naturalWidth  * sc);
      const h    = Math.round(img.naturalHeight * sc);
      const n    = w * h;

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      const src = new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data);
      const mid = new Uint8ClampedArray(src.length);

      const SCX = 0.50, SCY = 0.45, SRX = 0.62, SRY = 0.68;
      const FCX = 0.50, FCY = 0.26, FRX = 0.30, FRY = 0.22;

      // ── Stages 1-4: per-pixel colour grade + contrast + face + light ──────
      for (let i = 0; i < n; i++) {
        const px = i * 4;
        const ix = (i % w) / w;
        const iy = Math.floor(i / w) / h;

        const dF = ((ix - FCX) / FRX) ** 2 + ((iy - FCY) / FRY) ** 2;
        const fW = Math.max(0, 1 - dF);

        let r = src[px], g = src[px + 1], b = src[px + 2];

        // Stage 1 — Warm colour grade (multiplicative, global)
        r = Math.min(255, Math.round(r * p.grR));
        g = Math.min(255, Math.round(g * p.grG));
        b = Math.min(255, Math.max(0, Math.round(b * p.grB)));

        // Stage 2 — S-curve contrast (luminance-only, preserves hue/saturation)
        const Y = 0.299 * r + 0.587 * g + 0.114 * b;
        if (Y > 0) {
          const x     = Y / 255;
          const s     = x * x * (3 - 2 * x);              // smoothstep
          const Ynew  = 255 * ((1 - p.sCurve) * x + p.sCurve * s);
          const scale = Ynew / Y;
          r = Math.min(255, Math.max(0, Math.round(r * scale)));
          g = Math.min(255, Math.max(0, Math.round(g * scale)));
          b = Math.min(255, Math.max(0, Math.round(b * scale)));
        }

        // Stage 3 — Face shadow recovery (dark face pixels only, Y < 100)
        if (fW > 0.1) {
          const curY = 0.299 * r + 0.587 * g + 0.114 * b;
          if (curY < 100) {
            const t    = (100 - curY) / 100;
            const lift = t * t * p.faceLift * fW;
            r = Math.min(255, Math.round(r + lift));
            g = Math.min(255, Math.round(g + lift));
            b = Math.min(255, Math.round(b + lift));
          }
        }

        // Stage 4 — Golden directional light (multiplicative, top-left source)
        // Physically: luminance ∝ reflected light, so bright areas receive more.
        // No additive patches — multiplication scales with existing brightness.
        const dist  = Math.sqrt(ix * ix * 0.4 + iy * iy * 0.75);
        const glow  = Math.max(0, (0.70 - dist) / 0.70) * p.golden;
        if (glow > 0) {
          r = Math.min(255, Math.round(r * (1 + glow * 0.30)));
          g = Math.min(255, Math.round(g * (1 + glow * 0.12)));
          b = Math.max(0,   Math.round(b * (1 - glow * 0.06)));
        }

        mid[px]     = r;
        mid[px + 1] = g;
        mid[px + 2] = b;
        mid[px + 3] = src[px + 3];
      }

      // ── Stage 5a: Global vibrance (richer reds, greens, blues everywhere) ─
      for (let i = 0; i < n; i++) {
        const px   = i * 4;
        let r = mid[px], g = mid[px + 1], b = mid[px + 2];
        const curY = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b);
        const sat  = maxC > 0 ? (maxC - Math.min(r, g, b)) / maxC : 0;
        const vb   = p.vibrance * (1 - sat) * 0.75;   // targets under-saturated
        mid[px]     = Math.min(255, Math.max(0, Math.round(curY + (r - curY) * (1 + vb))));
        mid[px + 1] = Math.min(255, Math.max(0, Math.round(curY + (g - curY) * (1 + vb))));
        mid[px + 2] = Math.min(255, Math.max(0, Math.round(curY + (b - curY) * (1 + vb))));
      }

      // ── Stage 5b: Subject sharpening (unsharp mask 3×3, subject only) ────
      const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
      const out    = new Uint8ClampedArray(mid.length);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const ix  = x / w, iy = y / h;
          const dS  = ((ix - SCX) / SRX) ** 2 + ((iy - SCY) / SRY) ** 2;
          const f   = p.sharpness * Math.max(0, 1 - dS);
          let r = 0, g = 0, b = 0;
          for (let ky = 0; ky < 3; ky++) {
            for (let kx = 0; kx < 3; kx++) {
              const ny2 = Math.min(h - 1, Math.max(0, y + ky - 1));
              const nx2 = Math.min(w - 1, Math.max(0, x + kx - 1));
              const ii  = (ny2 * w + nx2) * 4, k = kernel[ky * 3 + kx];
              r += mid[ii] * k; g += mid[ii + 1] * k; b += mid[ii + 2] * k;
            }
          }
          const o    = (y * w + x) * 4;
          out[o]     = Math.round(Math.min(255, Math.max(0, mid[o]     * (1 - f) + r * f)));
          out[o + 1] = Math.round(Math.min(255, Math.max(0, mid[o + 1] * (1 - f) + g * f)));
          out[o + 2] = Math.round(Math.min(255, Math.max(0, mid[o + 2] * (1 - f) + b * f)));
          out[o + 3] = mid[o + 3];
        }
      }

      ctx.putImageData(new ImageData(out, w, h), 0, 0);
      canvas.toBlob(
        bl => bl ? resolve(bl) : reject(new Error('AutoFix canvas failed')),
        'image/jpeg', 0.93,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(localUrl); reject(new Error('Image load failed')); };
    img.src = localUrl;
  });
}

async function autoFixCanvas(
  imageUrl: string,
  preset: 'natural' | 'professional' | 'strong' = 'natural',
): Promise<string> {
  const blob = await autoFixProcess(imageUrl, preset);
  return uploadResult(blob, 'enhance');
}

// ── AI Image Edit Engine ──────────────────────────────────────────────────────
//
// This is the MAIN engine for every feature in the AI Editor.
// Every operation sends the original image + a controlled prompt to the AI.
// Canvas processing is used ONLY for the instant preview (AutoFix), never as
// the final result.
//
// Priority: OpenAI gpt-image-1  →  Stability AI img2img  →  throw

// Universal identity protection appended to every prompt.
const IDENTITY_LOCK =
  "Preserve the person's identity exactly. " +
  "Do not change the face shape, eyes, nose, mouth, or smile. " +
  "Do not change the hairstyle unless requested. " +
  "Do not change the body shape or clothing unless requested. " +
  "Do not change the background unless requested. " +
  "Only modify what was specifically requested. " +
  "Keep the result realistic and natural.";

// Global negative prompt used by Stability AI fallback.
const NEGATIVE_GUARD =
  'change face, different person, modify facial features, change hairstyle, ' +
  'change clothing, change background, add objects, remove objects, ' +
  'glow filter, soft focus, dream effect, beauty filter, global blur, lens haze, ' +
  'over-processed, unrealistic, cartoon, painting, illustration, AI generated look, ' +
  'zoom in, zoom out, crop, reframe, recompose, change perspective, change focal length';

// Composition lock — appended to EVERY AI edit automatically by aiImageEdit().
// Prevents the AI from zooming in, cropping, or changing the camera perspective.
// The two most common composition-breaking bugs in AI image editors are:
//   (a) sending a square-cropped version of the image to the model, and
//   (b) letting the model "reframe" for a better composition.
// Both are prevented here at the prompt level and at the image-prep level.
const COMPOSITION_LOCK =
  'Preserve the original composition exactly. ' +
  'Do not zoom in. Do not zoom out. Do not crop. Do not reframe. Do not recompose. ' +
  'Keep the original camera angle, focal length, and perspective unchanged. ' +
  'Keep the original subject placement and background layout exactly as in the input. ' +
  'The output must show exactly the same scene framing, field of view, and proportions as the input. ' +
  'Only improve lighting, color, and quality — never the composition.';

// Per-feature edit prompts sent to the AI image editing engine.
// AUTOFIX_ENHANCE_ONLY — the canonical AutoFix prompt.
// Every line is a hard constraint. The AI must ENHANCE, not RECREATE.
const AUTOFIX_ENHANCE_ONLY =
  'Professionally enhance this photograph.\n\n' +
  'Improve: lighting, shadow recovery, portrait quality, color balance, white balance, ' +
  'local contrast, sharpness, depth, subject visibility.\n\n' +
  'Preserve EXACTLY: face identity, facial structure, smile, eyes, nose, hairstyle, ' +
  'body shape, clothing, accessories, pose, framing, composition, background.\n\n' +
  'Do NOT: zoom in, zoom out, crop, reposition subject, change hairstyle, change facial features, ' +
  'change clothing, change body shape, replace background, add objects, remove objects, ' +
  'change skin tone, over-saturate, add glow, add soft focus, add haze.\n\n' +
  'The result must look like a professional photographer edited the original photo — ' +
  'not like AI generated or recreated it. Natural, realistic result. Not AI generated.';

const EDIT_PROMPTS: Record<string, string> = {
  photo:   AUTOFIX_ENHANCE_ONLY,
  portrait: AUTOFIX_ENHANCE_ONLY,
  landscape:
    'Enhance landscape quality. Better colors, contrast, detail, sky clarity, and natural depth. ' +
    'Keep the scene exactly as it is. Natural realistic result.',
  food:
    'Enhance food photography. Better colors, contrast, texture detail, and appetite appeal. ' +
    'Keep the food exactly as photographed. Natural realistic result.',
  product:
    'Enhance product photography. Better lighting, sharper detail, improved contrast. ' +
    'Keep the product exactly as photographed. Clean professional result.',
  night:
    'Improve this low-light photo. Better exposure, shadow recovery, color balance, reduced noise. ' +
    IDENTITY_LOCK,
};

// Per-retouch-mode prompts.
const RETOUCH_PROMPTS: Record<string, string> = {
  skin_cleanup:
    'Make only the skin texture smoother and more even with a natural effect. ' +
    'Do not change the face shape, eyes, nose, lips, smile, hairstyle, body, clothes, or background. ' +
    IDENTITY_LOCK,
  teeth_cleanup:
    'Whiten and brighten the teeth slightly. Keep the natural look, do not over-whiten. ' +
    'Do not change the face shape, eyes, nose, lips, expression, hairstyle, body, clothes, or background. ' +
    IDENTITY_LOCK,
  eye_brighten:
    'Brighten and enhance the eyes slightly. Keep them natural and realistic. ' +
    'Do not change the face shape, nose, lips, smile, hairstyle, body, clothes, or background. ' +
    IDENTITY_LOCK,
  hair_enhance:
    'Enhance the hair quality — better shine, volume, and texture. ' +
    'Do not change the hairstyle shape or color. ' +
    IDENTITY_LOCK,
  reduce_shadows:
    'Reduce dark shadows under the eyes, along the jaw, and on the face. ' +
    'Improve visibility in shadowed areas. Keep all features exactly as they are. ' +
    IDENTITY_LOCK,
};

/**
 * Convert blob to PNG preserving original aspect ratio.
 *
 * CRITICAL: never center-crop to square — that destroys the composition before
 * the image even reaches the AI, causing it to return a zoomed-in result.
 * Scale to fit within maxSide × maxSide instead.
 */
async function blobToPng(blob: Blob, maxSide = 1024): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Scale-to-fit: longest edge becomes maxSide, aspect ratio preserved exactly.
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w     = Math.round(img.naturalWidth  * scale);
      const h     = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        b => b ? resolve(b) : reject(new Error('PNG conversion failed')),
        'image/png',
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('PNG conversion failed')); };
    img.src = url;
  });
}

/**
 * Validate that the AI enhanced — not recreated — the image.
 *
 * Three-gate check (all must pass):
 *   1. Aspect ratio deviation < 2 %   — catches zoom / crop
 *   2. Structural similarity  ≥ 0.82  — catches face/background replacement
 *      (a professional colour+lighting edit scores 0.85-0.98;
 *       an AI-recreated image drops to 0.65-0.78)
 *
 * Never blocks on a technical error — returns true so the result is still shown.
 */
async function validateComposition(originalUrl: string, resultUrl: string): Promise<boolean> {
  try {
    const getAR = (blob: Blob): Promise<number> =>
      new Promise((res, rej) => {
        const img = new Image();
        const u   = URL.createObjectURL(blob);
        img.onload  = () => { URL.revokeObjectURL(u); res(img.naturalWidth / img.naturalHeight); };
        img.onerror = rej;
        img.src = u;
      });

    const [b1, b2]   = await Promise.all([urlToBlob(originalUrl), urlToBlob(resultUrl)]);
    const [ar1, ar2] = await Promise.all([getAR(b1), getAR(b2)]);

    // Gate 1: reject if aspect ratio shifted by > 2 % (was 4 %)
    if (Math.abs(ar1 - ar2) / ar1 > 0.02) return false;

    // Gate 2: reject if overall structural similarity is too low.
    // 0.82 threshold catches AI-generated-looking outputs while accepting genuine
    // colour/lighting enhancements (which typically score 0.85-0.98).
    const sim = await measureSimilarity(originalUrl, resultUrl);
    return sim >= 0.82;
  } catch {
    return true; // never block on a validation error
  }
}

/**
 * Check that the AI did not change the face or key details in the portrait.
 * Compares a 300×300 crop of the upper-centre region (where the face lives)
 * between original and result. Rejects if similarity < 85%.
 *
 * This catches the core AutoFix failure: model changes smile, hair, or
 * accessories even when overall composition similarity passes the 0.82 gate.
 */
async function validateFaceRegion(originalUrl: string, resultUrl: string): Promise<boolean> {
  const cropRegion = (blob: Blob, rx: number, ry: number, rw: number, rh: number): Promise<Uint8ClampedArray> =>
    new Promise((res, rej) => {
      const img = new Image();
      const u   = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(u);
        const S   = 300; // comparison resolution
        const c   = document.createElement('canvas');
        c.width = S; c.height = S;
        c.getContext('2d')!.drawImage(
          img,
          img.naturalWidth * rx, img.naturalHeight * ry,
          img.naturalWidth * rw, img.naturalHeight * rh,
          0, 0, S, S,
        );
        res(new Uint8ClampedArray(c.getContext('2d')!.getImageData(0, 0, S, S).data));
      };
      img.onerror = rej;
      img.src = u;
    });

  try {
    const [b1, b2] = await Promise.all([urlToBlob(originalUrl), urlToBlob(resultUrl)]);
    // Face region: centre-left 30%–70% width, top 5%–42% height (head + shoulders)
    const [d1, d2] = await Promise.all([
      cropRegion(b1, 0.30, 0.05, 0.40, 0.37),
      cropRegion(b2, 0.30, 0.05, 0.40, 0.37),
    ]);
    let diff = 0;
    const n  = d1.length / 4;
    for (let i = 0; i < n; i++) {
      const p  = i * 4;
      const Y1 = 0.299 * d1[p] + 0.587 * d1[p + 1] + 0.114 * d1[p + 2];
      const Y2 = 0.299 * d2[p] + 0.587 * d2[p + 1] + 0.114 * d2[p + 2];
      diff += Math.abs(Y1 - Y2) / 255;
    }
    const sim = Math.max(0, 1 - diff / n);
    // < 0.85: face/smile/hair changed noticeably → reject OpenAI result
    return sim >= 0.85;
  } catch {
    return true; // never block on a validation error
  }
}

// OpenAI gpt-image-1 — send image + controlled prompt, receive edited image.
async function openaiImagesEdit(imageUrl: string, prompt: string): Promise<string> {
  if (!hasApiKey(OPENAI_KEY)) throw new Error('VITE_OPENAI_KEY not set');
  const blob = await urlToBlob(imageUrl);
  // blobToPng scales to fit without cropping — composition preserved in transit.
  const png  = await blobToPng(blob, 1024);

  // Detect the PNG's aspect ratio to pick the right gpt-image-1 output size.
  // 'auto' causes silent failures on some API accounts, falling through to Stability AI.
  // Choosing the wrong size (e.g. '1024x1024' for a portrait) stretches the result.
  const pngAR = await new Promise<number>(res => {
    const img = new Image(), u = URL.createObjectURL(png);
    img.onload  = () => { URL.revokeObjectURL(u); res(img.naturalWidth / img.naturalHeight); };
    img.onerror = () => { URL.revokeObjectURL(u); res(1); };
    img.src = u;
  });
  const outputSize = pngAR >= 1.3 ? '1536x1024' : pngAR <= 0.77 ? '1024x1536' : '1024x1024';

  const form = new FormData();
  form.append('image',  png, 'image.png');
  form.append('prompt', prompt);
  form.append('model',  'gpt-image-1');
  form.append('n',      '1');
  form.append('size',   outputSize);

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method:  'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body:    form,
  });
  if (!res.ok) throw new Error(`OpenAI images/edits: ${await res.text()}`);
  const data = await res.json();
  const item = data.data[0];

  let resultBlob: Blob;
  if (item.b64_json) {
    const binary = atob(item.b64_json);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    resultBlob = new Blob([bytes], { type: 'image/png' });
  } else {
    resultBlob = await urlToBlob(item.url);
  }

  const resultUrl = await uploadResult(resultBlob, 'ai-edit');

  // Gate 1: reject if composition changed (zoom / crop / reframe).
  const compositionOk = await validateComposition(imageUrl, resultUrl);
  if (!compositionOk) throw new Error('Composition changed — rejecting result');

  // Gate 2: reject if face/smile/hair changed noticeably.
  const faceOk = await validateFaceRegion(imageUrl, resultUrl);
  if (!faceOk) throw new Error('Face identity changed — rejecting result');

  return resultUrl;
}



/**
 * Main AI image editing function used by every feature.
 *
 * Priority: OpenAI gpt-image-1 → Stability AI img2img
 *
 * COMPOSITION_LOCK is automatically appended here so every single call
 * preserves the original framing — callers never need to add it manually.
 * If the composition validation inside openaiImagesEdit() fails, the error
 * is caught and the call falls through to Stability AI.
 */
async function aiImageEdit(imageUrl: string, prompt: string, strength = 0.32): Promise<string> {
  // Append composition lock to every prompt, regardless of feature.
  const fullPrompt = `${prompt}\n\n${COMPOSITION_LOCK}`;

  if (hasApiKey(OPENAI_KEY)) {
    try { return await openaiImagesEdit(imageUrl, fullPrompt); } catch { /* fall through */ }
  }
  if (hasApiKey(STABILITY_KEY)) {
    return stabilityImg2Img(imageUrl, fullPrompt, strength, NEGATIVE_GUARD);
  }
  throw new Error('AI Image Edit requires VITE_OPENAI_KEY or VITE_STABILITY_KEY in .env');
}

// ── Local Retouch Engine ──────────────────────────────────────────────────────
// Hard rules:
//   allow_generative_ai = false
//   forbidden_changes: face_shape, eyes, nose, mouth, teeth, jawline, hair,
//                      body_shape, clothing, background
// Technique: skin segmentation → bilateral-approximation via box-blur passes
//            + edge-preserved blending + frequency separation

function isSkinPixel(r: number, g: number, b: number): boolean {
  // YCbCr skin model — accurate across diverse skin tones
  const Cb = -0.168736 * r - 0.331264 * g + 0.5     * b + 128;
  const Cr =  0.5     * r - 0.418688 * g - 0.081312 * b + 128;
  const Y  =  0.299   * r + 0.587    * g + 0.114    * b;
  return Y > 40 && Cb >= 77 && Cb <= 127 && Cr >= 133 && Cr <= 173;
}

function boxBlurH(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let R = 0, G = 0, B = 0, n = 0;
      for (let kx = -r; kx <= r; kx++) {
        const nx = Math.min(w - 1, Math.max(0, x + kx));
        const i = (y * w + nx) * 4;
        R += src[i]; G += src[i + 1]; B += src[i + 2]; n++;
      }
      const i = (y * w + x) * 4;
      out[i] = R / n; out[i + 1] = G / n; out[i + 2] = B / n; out[i + 3] = src[i + 3];
    }
  }
  return out;
}

function boxBlurV(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let R = 0, G = 0, B = 0, n = 0;
      for (let ky = -r; ky <= r; ky++) {
        const ny = Math.min(h - 1, Math.max(0, y + ky));
        const i = (ny * w + x) * 4;
        R += src[i]; G += src[i + 1]; B += src[i + 2]; n++;
      }
      const i = (y * w + x) * 4;
      out[i] = R / n; out[i + 1] = G / n; out[i + 2] = B / n; out[i + 3] = src[i + 3];
    }
  }
  return out;
}

function separableBlur(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  return boxBlurV(boxBlurH(src, w, h, r), w, h, r);
}

/**
 * Proper skin-retouch pipeline — no generative AI, no image reconstruction.
 *
 * Pipeline:
 *   1. YCbCr skin detection  →  raw skin mask
 *   2. Identity Lock          →  punch holes at eyes/eyebrows (dark), lips (high Cr),
 *                                structural edges (high local contrast) — face shape preserved
 *   3. Feather mask           →  smooth mask edges so transitions are invisible
 *   4. Frequency Separation   →  low = 3-pass blur (tone layer)
 *                                high = original − low (texture / edges)
 *                                smooth ONLY the low layer → texture preserved
 *   5. Skin Tone Equalization →  3% pull toward average skin tone
 *   6. Final blend            →  original × 90% + retouch × 10%  (natural mode)
 *
 * strength:  Natural = 0.10–0.15  |  Professional = 0.20–0.25  |  max 0.40
 */
async function localRetouchSkin(imageUrl: string, strength = 0.10): Promise<string> {
  const blend = Math.min(0.40, Math.max(0, strength));

  const originalBlob = await urlToBlob(imageUrl);
  const localUrl = URL.createObjectURL(originalBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(localUrl);

      // Scale to max 1000px — keeps main-thread processing fast
      const PROC_MAX = 1000;
      const scale = Math.min(1, PROC_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth  * scale);
      const h = Math.round(img.naturalHeight * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      const src = new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data);

      // ── Step 1: YCbCr skin detection ──────────────────────────────────────
      const skinMask = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const p = i * 4;
        skinMask[i] = isSkinPixel(src[p], src[p + 1], src[p + 2]) ? 1 : 0;
      }

      // ── Step 2: Identity Lock — exclude non-skin feature areas ────────────
      for (let i = 0; i < w * h; i++) {
        if (!skinMask[i]) continue;
        const p = i * 4;
        const r = src[p], g = src[p + 1], b = src[p + 2];
        const Y  =  0.299 * r + 0.587 * g + 0.114 * b;
        const Cr =  0.5   * r - 0.418688 * g - 0.081312 * b + 128;
        const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
        const sat  = maxC > 0 ? (maxC - minC) / maxC : 0;

        // Eyes, eyebrows, eyelashes — very dark pixels inside face area
        if (Y < 50) { skinMask[i] = 0; continue; }

        // Lips — high Cr (reddish-pink) + moderate saturation
        if (Cr > 165 && sat > 0.22) { skinMask[i] = 0; continue; }

        // Structural identity edges: high local luminance contrast
        // (eye borders, nose edges, mouth outline — must not be smoothed)
        const x = i % w, y = Math.floor(i / w);
        let maxDelta = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            if (!kx && !ky) continue;
            const ni = (Math.min(h-1,Math.max(0,y+ky)) * w + Math.min(w-1,Math.max(0,x+kx))) * 4;
            const nY = 0.299*src[ni] + 0.587*src[ni+1] + 0.114*src[ni+2];
            maxDelta = Math.max(maxDelta, Math.abs(Y - nY));
          }
        }
        if (maxDelta > 38) { skinMask[i] = 0; } // structural boundary — lock it
      }

      // ── Step 3: Feather mask (1D separable blur) ──────────────────────────
      const mr = 3;
      const mfH = new Float32Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let s = 0, n = 0;
          for (let kx = -mr; kx <= mr; kx++) {
            s += skinMask[y*w + Math.min(w-1, Math.max(0, x+kx))]; n++;
          }
          mfH[y*w + x] = s / n;
        }
      const mf = new Float32Array(w * h);
      for (let x = 0; x < w; x++)
        for (let y = 0; y < h; y++) {
          let s = 0, n = 0;
          for (let ky = -mr; ky <= mr; ky++) {
            s += mfH[Math.min(h-1, Math.max(0, y+ky))*w + x]; n++;
          }
          mf[y*w + x] = s / n;
        }

      // ── Step 4: Frequency Separation ──────────────────────────────────────
      const blurR = Math.min(5, Math.max(2, Math.round(Math.min(w, h) * 0.004)));
      // Low frequency = overall tone (3 passes = bilateral-like approximation)
      const low1 = separableBlur(src, w, h, blurR);
      const low2 = separableBlur(low1, w, h, blurR);
      const low  = separableBlur(low2, w, h, blurR);
      // Smooth the low-frequency layer one more pass (this is what gets blended)
      const smoothedLow = separableBlur(low, w, h, blurR);
      // High frequency = texture detail (preserved from original)
      // highFreq[i] = src[i] - low[i]  (added as offset 128 to stay positive)

      // ── Step 5: Skin Tone Equalization (3%) ───────────────────────────────
      let sumR = 0, sumG = 0, sumB = 0, skinPx = 0;
      for (let i = 0; i < w * h; i++) {
        if (skinMask[i] > 0.5) {
          sumR += src[i*4]; sumG += src[i*4+1]; sumB += src[i*4+2]; skinPx++;
        }
      }
      const avgR = skinPx > 0 ? sumR / skinPx : 128;
      const avgG = skinPx > 0 ? sumG / skinPx : 128;
      const avgB = skinPx > 0 ? sumB / skinPx : 128;
      const TONE_EQ = 0.03;

      // ── Step 6: Compose — identity preserved, only skin texture softened ──
      const out = new Uint8ClampedArray(src.length);
      for (let i = 0; i < w * h; i++) {
        const p   = i * 4;
        const f   = mf[i] * blend; // final blend weight in skin area (0..blend)

        if (f < 0.001) {
          // Outside skin mask — copy original pixel exactly (identity preserved)
          out[p] = src[p]; out[p+1] = src[p+1]; out[p+2] = src[p+2]; out[p+3] = src[p+3];
          continue;
        }

        // Frequency-separation retouch layer:
        //   retouch = smoothedLow + highFreq (texture from original)
        //           = smoothedLow + (src - low)
        const retR = Math.min(255, Math.max(0, smoothedLow[p]   + src[p]   - low[p]));
        const retG = Math.min(255, Math.max(0, smoothedLow[p+1] + src[p+1] - low[p+1]));
        const retB = Math.min(255, Math.max(0, smoothedLow[p+2] + src[p+2] - low[p+2]));

        // Tone equalization toward average skin (very subtle, 3%)
        const eqR = retR * (1 - TONE_EQ) + avgR * TONE_EQ;
        const eqG = retG * (1 - TONE_EQ) + avgG * TONE_EQ;
        const eqB = retB * (1 - TONE_EQ) + avgB * TONE_EQ;

        // Final: original × (1-f) + retouch × f
        // Natural mode: f = 0.10  →  90% original, 10% retouch
        out[p]   = Math.round(src[p]   * (1 - f) + eqR * f);
        out[p+1] = Math.round(src[p+1] * (1 - f) + eqG * f);
        out[p+2] = Math.round(src[p+2] * (1 - f) + eqB * f);
        out[p+3] = src[p+3];
      }

      ctx.putImageData(new ImageData(out, w, h), 0, 0);
      canvas.toBlob(
        b => b ? uploadResult(b, 'retouch').then(resolve).catch(reject)
               : reject(new Error('Retouch canvas failed')),
        'image/jpeg', 0.93,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(localUrl); reject(new Error('Image load failed')); };
    img.src = localUrl;
  });
}

async function localRetouchTeeth(imageUrl: string): Promise<string> {
  const blob = await urlToBlob(imageUrl);
  const localUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(localUrl);
      const w = img.naturalWidth, h = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data: src } = ctx.getImageData(0, 0, w, h);
      const out = new Uint8ClampedArray(src.length);

      for (let i = 0; i < w * h; i++) {
        const p = i * 4;
        const r = src[p], g = src[p + 1], b = src[p + 2];
        const brightness = (r + g + b) / 3;
        const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
        const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;

        // Teeth pixels: bright + low saturation + slightly warm (r>=g>=b)
        const isTeeth = brightness > 140 && saturation < 0.25 && r >= g && g >= b * 0.85;
        if (isTeeth) {
          // Brighten by 8%, reduce yellow (lower r slightly, boost b slightly)
          out[p]     = Math.min(255, Math.round(r * 1.04));
          out[p + 1] = Math.min(255, Math.round(g * 1.06));
          out[p + 2] = Math.min(255, Math.round(b * 1.10));
        } else {
          out[p] = r; out[p + 1] = g; out[p + 2] = b;
        }
        out[p + 3] = src[p + 3];
      }

      ctx.putImageData(new ImageData(out, w, h), 0, 0);
      canvas.toBlob(
        bl => bl ? uploadResult(bl, 'retouch').then(resolve).catch(reject)
                 : reject(new Error('Teeth retouch failed')),
        'image/jpeg', 0.93,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(localUrl); reject(new Error('Image load failed')); };
    img.src = localUrl;
  });
}

async function localReduceShadows(imageUrl: string): Promise<string> {
  const blob = await urlToBlob(imageUrl);
  const localUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(localUrl);
      const w = img.naturalWidth, h = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data: src } = ctx.getImageData(0, 0, w, h);
      const out = new Uint8ClampedArray(src.length);

      for (let i = 0; i < w * h; i++) {
        const p = i * 4;
        const r = src[p], g = src[p + 1], b = src[p + 2];
        const Y = 0.299 * r + 0.587 * g + 0.114 * b;
        // Only lighten mid-dark skin-toned areas (under-eye shadows)
        const isShadow = isSkinPixel(r, g, b) && Y < 100 && Y > 20;
        if (isShadow) {
          const lift = (100 - Y) / 100 * 0.3; // max +30% lift in darkest areas
          out[p]     = Math.min(255, Math.round(r * (1 + lift)));
          out[p + 1] = Math.min(255, Math.round(g * (1 + lift)));
          out[p + 2] = Math.min(255, Math.round(b * (1 + lift)));
        } else {
          out[p] = r; out[p + 1] = g; out[p + 2] = b;
        }
        out[p + 3] = src[p + 3];
      }

      ctx.putImageData(new ImageData(out, w, h), 0, 0);
      canvas.toBlob(
        bl => bl ? uploadResult(bl, 'retouch').then(resolve).catch(reject)
                 : reject(new Error('Shadow reduction failed')),
        'image/jpeg', 0.93,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(localUrl); reject(new Error('Image load failed')); };
    img.src = localUrl;
  });
}

// ── Real-ESRGAN (upscale) ─────────────────────────────────────────────────────
// Model: nightmareai/real-esrgan
const REAL_ESRGAN = 'f121d640bd286e1fdc67f9799164c1d5be36ff74f8be26a5628163be8a941918';

// ── Outpainting (expand) ──────────────────────────────────────────────────────
// Model: stability-ai/stable-diffusion-img2img-xl
const SDXL_INPAINT = 'da77bc59ee60423279fd632efb4795ab731d9e3ca9705ef3341091fb989b7eaf';

// ── Public AI operations ──────────────────────────────────────────────────────
export const aiApi = {

  /** Remove background — uses remove.bg */
  async removeBackground(imageUrl: string): Promise<string> {
    return removeBg(imageUrl);
  },

  /** 4K upscale — uses Real-ESRGAN via Replicate */
  async upscale4K(imageUrl: string): Promise<string> {
    const base64 = await urlToBase64(imageUrl);
    return replicateRun(REAL_ESRGAN, {
      image: base64,
      scale: 4,
      face_enhance: false,
    });
  },

  /** Cinematic look — teal-orange grade, anamorphic feel, deep shadows */
  async cinematicLook(imageUrl: string): Promise<string> {
    return stabilityImg2Img(
      imageUrl,
      'cinematic film photography, anamorphic lens, teal and orange color grading, deep shadows, ' +
      'rich highlights, shallow depth of field, 35mm film grain, dramatic atmosphere, golden hour rim light, ' +
      'Hollywood blockbuster color grade, epic movie still, high contrast, moody',
      0.42,
    );
  },

  /** AutoFix — canvas-only enhancement, no generative AI. */
  async autoFix(
    imageUrl: string,
    preset: 'natural' | 'professional' | 'strong' = 'natural',
  ): Promise<string> {
    return autoFixCanvas(imageUrl, preset);
  },

  /**
   * AutoFix — instant variant.
   *
   * Returns three things in parallel:
   *   localUrl      — blob URL from canvas processing, available immediately (~300ms)
   *   uploadPromise — canvas result uploaded to Supabase (fallback if AI unavailable)
   *   aiPromise     — AI-edited result via gpt-image-1 / Stability; null if no key set
   *
   * The caller should show localUrl immediately, then silently swap to the AI result
   * when aiPromise resolves. No spinners or wait indicators should be shown.
   */
  async autoFixNoWait(
    imageUrl: string,
    preset: 'natural' | 'professional' | 'strong' = 'natural',
  ): Promise<{ localUrl: string; uploadPromise: Promise<string>; aiPromise: Promise<string> | null }> {
    const blob = await autoFixProcess(imageUrl, preset);
    const localUrl      = URL.createObjectURL(blob);
    const uploadPromise = uploadResult(blob, 'enhance');
    // AI generation is disabled for AutoFix — even OpenAI gpt-image-1 changes
    // facial details, accessories, and clothing folds.  Canvas is the only engine
    // that preserves identity at the pixel level.
    const aiPromise = null;
    return { localUrl, uploadPromise, aiPromise };
  },

  /**
   * AutoFix background AI upgrade — call AFTER autoFix() has already been applied.
   * Runs Stability AI with portrait-enhancement prompt at low strength (0.25).
   * Validates similarity ≥ 96% before calling onReady.
   * Never blocks the UI — call without await.
   */
  autoFixBackground(
    originalUrl: string,
    preset: 'natural' | 'professional' | 'strong' = 'natural',
    onReady: (aiUrl: string) => void,
    onFail?: () => void,
  ): void {
    if (!hasApiKey(STABILITY_KEY)) { onFail?.(); return; }

    const STRENGTH = { natural: 0.25, professional: 0.30, strong: 0.35 };

    const ENHANCE_PROMPT =
      'professionally enhanced portrait photography, improved lighting, ' +
      'recovered shadows, better color balance, improved white balance, ' +
      'better subject visibility, natural local contrast, sharper details, ' +
      'professional photography editing. ' +
      'Preserve identity exactly. Same person same face same hairstyle same expression. ' +
      'Same body shape same clothing same background same composition. ' +
      'Do not add or remove objects. Do not alter pose. ' +
      'Natural realistic result. Not AI generated.';

    const PRESERVE_NEGATIVE =
      'change face, different person, modify facial features, change hairstyle, ' +
      'change clothing, change background, add objects, remove objects, ' +
      'smooth skin, beautify face, reshape face, modify body shape, ' +
      'unrealistic, cartoon, painting, illustration, AI generated look';

    (async () => {
      try {
        const resultUrl = await stabilityImg2Img(
          originalUrl, ENHANCE_PROMPT, STRENGTH[preset], PRESERVE_NEGATIVE,
        );
        const sim = await measureSimilarity(originalUrl, resultUrl);
        if (sim >= 0.96) { onReady(resultUrl); } else { onFail?.(); }
      } catch { onFail?.(); }
    })();
  },

  /**
   * Enhance quality.
   *
   * Photo / portrait → canvas ONLY.
   *
   * Generative AI models (gpt-image-1, Stability img2img) cannot be used for
   * portrait AutoFix because they always synthesise new pixels — which changes
   * smile, teeth, hair, watches, bracelets, and clothing folds even with the
   * most restrictive prompt.  Canvas operations are mathematically deterministic:
   * every original pixel is transformed, never replaced.  Identity is preserved
   * at the bit level.
   *
   * Other modes (landscape, food, product, night) have no face identity at stake,
   * so AI image editing is appropriate there.
   */
  async quickEnhance(imageUrl: string, mode = 'photo'): Promise<string> {
    if (mode === 'photo' || mode === 'portrait') {
      return autoFixCanvas(imageUrl, 'professional');
    }
    return aiImageEdit(imageUrl, EDIT_PROMPTS[mode] ?? AUTOFIX_ENHANCE_ONLY, 0.28);
  },

  /** Replace background */
  async replaceBackground(imageUrl: string, style: string): Promise<string> {
    const stylePrompts: Record<string, string> = {
      studio:    'professional photo studio background, clean white seamless backdrop, soft lighting',
      luxury:    'luxury interior background, marble, gold accents, elegant, premium',
      nature:    'beautiful nature background, lush green forest, natural light, bokeh',
      office:    'modern office background, clean professional workspace, blurred background',
      custom:    'cinematic background, atmospheric, professional',
    };
    // First remove bg, then use stability to add new one
    try {
      const noBg = await removeBg(imageUrl);
      return stabilityImg2Img(noBg, stylePrompts[style] || stylePrompts.studio, 0.7);
    } catch {
      // Fallback: direct img2img
      return stabilityImg2Img(imageUrl, `${stylePrompts[style]}, composite photography`, 0.55);
    }
  },

  /** Outpaint / expand */
  async expand(imageUrl: string, direction: 'left'|'right'|'top'|'bottom'): Promise<string> {
    const dirPrompts: Record<string, string> = {
      left:   'seamlessly extend image to the left, matching existing style and content',
      right:  'seamlessly extend image to the right, matching existing style and content',
      top:    'seamlessly extend image upward, matching existing style and content, add sky or ceiling',
      bottom: 'seamlessly extend image downward, add foreground elements matching existing style',
    };
    if (hasApiKey(REPLICATE_KEY)) {
      const base64 = await urlToBase64(imageUrl);
      return replicateRun(SDXL_INPAINT, { image: base64, prompt: dirPrompts[direction], direction });
    }
    return stabilityImg2Img(imageUrl, dirPrompts[direction], 0.65);
  },

  /**
   * Retouch portrait — canvas-only for identity-sensitive modes.
   *
   * The dedicated canvas engines (localRetouchSkin, localRetouchTeeth,
   * localReduceShadows) were purpose-built to touch ONLY their target area
   * and leave every other pixel at its original value.  AI models will change
   * surrounding features even for small operations like teeth whitening.
   */
  async retouch(imageUrl: string, mode: string): Promise<string> {
    if (mode === 'skin_cleanup')   return localRetouchSkin(imageUrl, 0.12);
    if (mode === 'teeth_cleanup')  return localRetouchTeeth(imageUrl);
    if (mode === 'reduce_shadows') return localReduceShadows(imageUrl);
    // eye_brighten, hair_enhance — use canvas AutoFix at natural preset
    // (subject-aware: affects the face/hair region, not background or accessories)
    return autoFixCanvas(imageUrl, 'natural');
  },

  /** Generate caption using GPT-4o Vision */
  async generateCaption(imageUrl: string, context?: { location?: string; listing?: boolean }): Promise<string> {
    const ctx = context?.location ? ` The photo was taken at ${context.location}.` : '';
    const purpose = context?.listing ? 'This is a marketplace listing photo. Write a compelling product caption.' : 'Write an engaging social media caption.';
    return openaiVision(imageUrl, `${purpose}${ctx} Keep it under 150 characters. Use natural language, no hashtags.`);
  },

  /** Generate hashtags using GPT-4o Vision */
  async generateHashtags(imageUrl: string): Promise<string[]> {
    const result = await openaiVision(imageUrl, 'Generate 10 relevant Instagram-style hashtags for this image. Return only the hashtags separated by spaces, starting with #. No other text.');
    return result.split(/\s+/).filter(h => h.startsWith('#')).map(h => h.slice(1).toLowerCase()).filter(Boolean).slice(0,10);
  },

  /** Generate product description */
  async generateProductDesc(imageUrl: string): Promise<string> {
    return openaiVision(imageUrl, 'Write a compelling product description for this item for an online marketplace. Include key features, condition, and appeal. Keep it under 200 characters.');
  },

  /** Creator score — analyze what's missing */
  async creatorScore(params: {
    hasLocation: boolean;
    hasAudio: boolean;
    hasListing: boolean;
    hasCaption: boolean;
    mediaType: 'photo'|'video';
  }): Promise<{ reach: number; suggestions: string[] }> {
    let reach = 55;
    const suggestions: string[] = [];
    if (params.hasCaption)  reach += 8;  else suggestions.push('✍️ Add a caption');
    if (params.hasLocation) reach += 8;  else suggestions.push('📍 Add location');
    if (params.hasAudio)    reach += 10; else suggestions.push('🎵 Add original audio');
    if (params.hasListing)  reach += 7;  else suggestions.push('🏷 Link a listing');
    if (params.mediaType === 'video') reach += 5;
    // Time suggestion
    const hour = new Date().getHours();
    if (hour < 7 || hour > 21) suggestions.push('📅 Post at 7:00 PM for best reach');
    return { reach: Math.min(98, reach), suggestions };
  },
};