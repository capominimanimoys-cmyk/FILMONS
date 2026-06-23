/**
 * watermark.ts
 * Adds a Filmons branding bar to an image using the Canvas API.
 * Returns a data URL of the watermarked image.
 */

export interface WatermarkOptions {
  userName: string;
  userId: string;
}

/**
 * Draw a Filmons watermark onto an image URL (data: or https:).
 * Falls back to the original URL if canvas fails.
 */
export async function addImageWatermark(
  src: string,
  opts: WatermarkOptions,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const W = img.naturalWidth;
        const H = img.naturalHeight;

        const canvas = document.createElement("canvas");
        canvas.width  = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(src); return; }

        // Draw original image
        ctx.drawImage(img, 0, 0, W, H);

        // ── Bar dimensions ────────────────────────────────────────────────
        const fontSize    = Math.max(12, Math.min(W / 45, 28));
        const padding     = fontSize * 0.7;
        const barHeight   = fontSize + padding * 2;

        // ── Bottom bar background ─────────────────────────────────────────
        ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
        ctx.fillRect(0, H - barHeight, W, barHeight);

        // ── Left: "Filmons" brand ─────────────────────────────────────────
        ctx.font          = `bold ${fontSize}px "Neue Montreal", system-ui, sans-serif`;
        ctx.fillStyle     = "#ffffff";
        ctx.textBaseline  = "middle";
        ctx.textAlign     = "left";
        ctx.fillText("Filmons", padding, H - barHeight / 2);

        // Separator dot
        const brandWidth = ctx.measureText("Filmons").width;
        ctx.font          = `${fontSize}px system-ui`;
        ctx.fillStyle     = "rgba(255,255,255,0.5)";
        ctx.fillText("  ·  ", padding + brandWidth, H - barHeight / 2);
        const dotWidth = ctx.measureText("  ·  ").width;

        // ── Middle: user name ─────────────────────────────────────────────
        ctx.font          = `${fontSize}px system-ui, sans-serif`;
        ctx.fillStyle     = "rgba(255,255,255,0.85)";
        ctx.fillText(opts.userName, padding + brandWidth + dotWidth, H - barHeight / 2);

        // ── Right: profile URL ────────────────────────────────────────────
        const profileUrl = `filmons.com/host/${opts.userId}`;
        ctx.font          = `${Math.max(10, fontSize - 3)}px system-ui, sans-serif`;
        ctx.fillStyle     = "rgba(255,255,255,0.55)";
        ctx.textAlign     = "right";
        ctx.fillText(profileUrl, W - padding, H - barHeight / 2);

        // ── Subtle diagonal repeating watermark ───────────────────────────
        ctx.save();
        ctx.globalAlpha   = 0.07;
        ctx.fillStyle     = "#ffffff";
        const diagFont    = Math.max(14, Math.min(W / 25, 48));
        ctx.font          = `bold ${diagFont}px system-ui`;
        ctx.textAlign     = "left";
        ctx.rotate(-Math.PI / 6);
        const stepX = diagFont * 8;
        const stepY = diagFont * 4;
        for (let x = -H; x < W + H; x += stepX) {
          for (let y = 0; y < H * 2; y += stepY) {
            ctx.fillText("FILMONS", x, y);
          }
        }
        ctx.restore();

        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch {
        resolve(src);
      }
    };

    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/**
 * Trigger a browser download for a given URL with a given filename.
 */
export function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
}
