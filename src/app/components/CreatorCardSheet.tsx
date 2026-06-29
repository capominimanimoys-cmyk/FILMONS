/**
 * CreatorCardSheet — branded share card generator.
 * Preview: styled HTML div. Export: Canvas-drawn PNG at 2× density.
 * Architecture is modular: `avatarUrl` can be swapped for AI-generated
 * content in future without touching the rest.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Download, Share2, Copy, Check, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import QRCode from 'qrcode';

type Format = 'story' | 'square' | 'landscape';

const FORMATS: { id: Format; label: string; w: number; h: number; aspect: string }[] = [
  { id: 'story',     label: 'Story 9:16',  w: 1080, h: 1920, aspect: '9/16'  },
  { id: 'square',    label: 'Post 1:1',    w: 1080, h: 1080, aspect: '1/1'   },
  { id: 'landscape', label: 'Banner 16:9', w: 1920, h: 1080, aspect: '16/9'  },
];

export interface CreatorCardProps {
  name:       string;
  username?:  string;
  primaryRole?: string;
  location?:  string;
  avatarUrl?: string;
  coverUrl?:  string;
  shareUrl:   string;
  displayUrl: string;
}

interface Props extends CreatorCardProps {
  onClose: () => void;
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function circle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3,
): number {
  const words = text.split(' ');
  let line = '';
  let lineCount = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      line = words[i];
      lineCount++;
      if (lineCount >= maxLines) { ctx.fillText(`${line}…`, x, y + lineCount * lineHeight); return lineCount + 1; }
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, y + lineCount * lineHeight); lineCount++; }
  return lineCount;
}

// ── Canvas renderer ───────────────────────────────────────────────────────────

async function renderCard(
  props: CreatorCardProps,
  format: Format,
): Promise<string> {
  const fmt = FORMATS.find(f => f.id === format)!;
  const W   = fmt.w;
  const H   = fmt.h;
  const DPR = 1; // already at target resolution

  const canvas  = document.createElement('canvas');
  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  const ctx     = canvas.getContext('2d')!;
  ctx.scale(DPR, DPR);

  const pad    = W * 0.07;
  const isStory = format === 'story';
  const isLand  = format === 'landscape';

  // ── 1. Cover / background ──────────────────────────────────────────────────
  let coverLoaded = false;
  if (props.coverUrl) {
    try {
      const coverImg = await loadImage(props.coverUrl);
      ctx.drawImage(coverImg, 0, 0, W, H);
      coverLoaded = true;
    } catch { /* fall through to gradient */ }
  }
  if (!coverLoaded) {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0,   '#0f0c29');
    grad.addColorStop(0.5, '#302b63');
    grad.addColorStop(1,   '#24243e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // ── 2. Dark gradient overlay ───────────────────────────────────────────────
  const overlayGrad = ctx.createLinearGradient(0, 0, 0, H);
  overlayGrad.addColorStop(0,    'rgba(0,0,0,0.35)');
  overlayGrad.addColorStop(0.45, 'rgba(0,0,0,0.50)');
  overlayGrad.addColorStop(1,    'rgba(0,0,0,0.88)');
  ctx.fillStyle = overlayGrad;
  ctx.fillRect(0, 0, W, H);

  // ── 3. Layout zones based on format ───────────────────────────────────────
  const avatarR   = isLand ? W * 0.07  : W * 0.12;
  const avatarCX  = isLand ? pad + avatarR : W / 2;
  const avatarCY  = isLand ? H / 2    : H * 0.26;

  const textX     = isLand ? avatarCX + avatarR + pad * 0.8 : pad;
  const textAlign = isLand ? 'left' : 'center';
  const textCenterX = isLand ? textX : W / 2;

  // ── 4. Avatar ─────────────────────────────────────────────────────────────
  // Border ring
  ctx.save();
  circle(ctx, avatarCX, avatarCY, avatarR + 6);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();
  circle(ctx, avatarCX, avatarCY, avatarR + 3);
  ctx.fillStyle = 'rgba(255,255,255,0.60)';
  ctx.fill();
  ctx.restore();

  // Avatar image or initials
  ctx.save();
  circle(ctx, avatarCX, avatarCY, avatarR);
  ctx.clip();

  if (props.avatarUrl) {
    try {
      const avatarImg = await loadImage(props.avatarUrl);
      const size = avatarR * 2;
      ctx.drawImage(avatarImg, avatarCX - avatarR, avatarCY - avatarR, size, size);
    } catch {
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(avatarCX - avatarR, avatarCY - avatarR, avatarR * 2, avatarR * 2);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${avatarR * 0.9}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((props.name?.[0] ?? '?').toUpperCase(), avatarCX, avatarCY);
    }
  } else {
    const initGrad = ctx.createLinearGradient(avatarCX - avatarR, avatarCY - avatarR, avatarCX + avatarR, avatarCY + avatarR);
    initGrad.addColorStop(0, '#3b82f6');
    initGrad.addColorStop(1, '#6366f1');
    ctx.fillStyle = initGrad;
    ctx.fillRect(avatarCX - avatarR, avatarCY - avatarR, avatarR * 2, avatarR * 2);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${avatarR * 0.85}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((props.name?.[0] ?? '?').toUpperCase(), avatarCX, avatarCY);
  }
  ctx.restore();

  // ── 5. Identity text ──────────────────────────────────────────────────────
  const fs = {
    name:  isLand ? W * 0.035 : W * 0.055,
    role:  isLand ? W * 0.022 : W * 0.033,
    loc:   isLand ? W * 0.018 : W * 0.027,
    head:  isLand ? W * 0.032 : W * 0.05,
    sub:   isLand ? W * 0.02  : W * 0.03,
    cta:   isLand ? W * 0.02  : W * 0.028,
    url:   isLand ? W * 0.018 : W * 0.026,
  };

  const nameY = isLand
    ? avatarCY - avatarR * 0.3
    : avatarCY + avatarR + pad * 1.1;

  ctx.textAlign    = textAlign;
  ctx.textBaseline = 'alphabetic';

  // Name
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${fs.name}px system-ui, sans-serif`;
  ctx.fillText(props.name, textCenterX, nameY);

  let curY = nameY + fs.name * 1.3;

  // @username
  if (props.username) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `500 ${fs.role}px system-ui, sans-serif`;
    ctx.fillText(`@${props.username}`, textCenterX, curY);
    curY += fs.role * 1.5;
  }

  // Primary role
  if (props.primaryRole) {
    ctx.fillStyle = '#93c5fd';
    ctx.font = `700 ${fs.role}px system-ui, sans-serif`;
    ctx.fillText(props.primaryRole, textCenterX, curY);
    curY += fs.role * 1.5;
  }

  // Location
  if (props.location) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `400 ${fs.loc}px system-ui, sans-serif`;
    ctx.fillText(`📍 ${props.location}`, textCenterX, curY);
    curY += fs.loc * 2.5;
  }

  // ── 6. Headline ───────────────────────────────────────────────────────────
  const headlineX   = isLand ? (W * 0.5 + pad * 0.5) : pad;
  const headlineW   = isLand ? (W * 0.48 - pad)       : W - pad * 2;
  const headlineY   = isLand ? H * 0.28               : Math.max(curY + H * 0.04, H * 0.54);
  const headlineAlign: CanvasTextAlign = isLand ? 'left' : 'left';

  ctx.textAlign    = headlineAlign;
  ctx.fillStyle    = '#ffffff';
  ctx.font         = `800 ${fs.head}px system-ui, sans-serif`;
  const linesDrawn = wrapText(ctx, 'Hey, see my creations in my Filmons portfolio.', headlineX, headlineY, headlineW, fs.head * 1.35, 3);

  const subY = headlineY + linesDrawn * fs.head * 1.35 + fs.head * 0.6;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font      = `400 ${fs.sub}px system-ui, sans-serif`;
  wrapText(ctx, 'Scan the QR code or tap the link to explore my work.', headlineX, subY, headlineW, fs.sub * 1.4, 2);

  // ── 7. QR Code ────────────────────────────────────────────────────────────
  const qrSize  = isLand ? W * 0.12  : W * 0.22;
  const qrX     = isLand ? W - pad - qrSize * 1.5 - qrSize : pad;
  const qrY     = isLand ? H * 0.55  : H - pad - qrSize - fs.cta * 5;

  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, props.shareUrl, {
    width:  qrSize,
    margin: 1,
    color:  { dark: '#ffffff', light: 'rgba(0,0,0,0)' },
  });

  // QR background
  const qrBgPad = qrSize * 0.08;
  ctx.save();
  roundRect(ctx, qrX - qrBgPad, qrY - qrBgPad, qrSize + qrBgPad * 2, qrSize + qrBgPad * 2, qrSize * 0.1);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  ctx.restore();

  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  // ── 8. CTA / URL bar ─────────────────────────────────────────────────────
  const ctaX   = isLand ? qrX                    : pad;
  const ctaW   = isLand ? qrSize + qrBgPad * 2   : W - pad * 2;
  const ctaY   = isLand ? qrY + qrSize + qrBgPad * 2 + fs.cta * 0.6 : qrY + qrSize + fs.cta * 0.8;

  ctx.textAlign    = 'left';
  ctx.fillStyle    = 'rgba(255,255,255,0.9)';
  ctx.font         = `700 ${fs.cta}px system-ui, sans-serif`;
  ctx.fillText('Explore Portfolio', ctaX, ctaY);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font      = `400 ${fs.url}px monospace, system-ui`;
  const urlDisplay = props.displayUrl.replace(/^https?:\/\//, '');
  ctx.fillText(urlDisplay, ctaX, ctaY + fs.cta * 1.4);

  // ── 9. Filmons wordmark (bottom) ─────────────────────────────────────────
  const wmarkSize = isLand ? W * 0.025 : W * 0.04;
  const wmarkX    = isLand ? W - pad - W * 0.12 : pad;
  const wmarkY    = H - pad * 0.7;

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font      = `800 ${wmarkSize}px system-ui, sans-serif`;
  ctx.textAlign = isLand ? 'right' : 'left';
  ctx.fillText('FILMONS', isLand ? W - pad : pad, wmarkY);

  return canvas.toDataURL('image/png', 1.0);
}

// ── Sheet component ───────────────────────────────────────────────────────────

export function CreatorCardSheet({
  name, username, primaryRole, location,
  avatarUrl, coverUrl, shareUrl, displayUrl,
  onClose,
}: Props) {
  const [format,    setFormat]    = useState<Format>('story');
  const [exporting, setExporting] = useState(false);
  const [dataUrl,   setDataUrl]   = useState<string | null>(null);
  const [copied,    setCopied]    = useState(false);
  const previewRef                = useRef<HTMLDivElement>(null);

  const cardProps: CreatorCardProps = {
    name, username, primaryRole, location,
    avatarUrl, coverUrl, shareUrl, displayUrl,
  };

  // Generate the card whenever format changes
  const generate = useCallback(async () => {
    setDataUrl(null);
    try {
      const url = await renderCard(cardProps, format);
      setDataUrl(url);
    } catch (e) {
      console.error('[CreatorCard] render failed:', e);
      toast.error('Could not generate card');
    }
  }, [format, avatarUrl, coverUrl, name, username, primaryRole, location, shareUrl, displayUrl]); // eslint-disable-line

  useEffect(() => { generate(); }, [generate]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a       = document.createElement('a');
    a.href        = dataUrl;
    a.download    = `filmons-card-${format}-${username || name}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Card saved!');
  };

  const handleShare = async () => {
    if (!dataUrl) return;
    setExporting(true);
    try {
      const res  = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `filmons-card.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${name} on Filmons`, url: shareUrl });
      } else {
        handleDownload();
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('Share failed');
    } finally {
      setExporting(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy');
    }
  };

  const fmt = FORMATS.find(f => f.id === format)!;

  return (
    <>
      <style>{`
        @keyframes ccUp{from{transform:translateY(100%);opacity:.8}to{transform:translateY(0);opacity:1}}
        .cc-shimmer{background:linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%);background-size:200% 100%;animation:shimmer 1.2s infinite linear;}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>
      <div className="fixed inset-0 z-[80] bg-black/60" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[81] bg-white rounded-t-3xl flex flex-col"
        style={{ maxHeight: '96vh', animation: 'ccUp 0.3s cubic-bezier(0.32,0.72,0,1)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-black text-gray-900">Creator Card</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Format tabs */}
        <div className="flex gap-2 px-4 pt-3 pb-2 shrink-0">
          {FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                format === f.id
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Card preview */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div ref={previewRef} className="flex justify-center mb-4">
            <div
              className="relative rounded-2xl overflow-hidden shadow-2xl w-full max-w-xs"
              style={{ aspectRatio: fmt.aspect, background: '#111' }}
            >
              {dataUrl ? (
                <img src={dataUrl} alt="Creator card preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full cc-shimmer" />
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleShare}
              disabled={!dataUrl || exporting}
              className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white disabled:opacity-40 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}
            >
              {exporting
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Share2 className="w-4 h-4" />
              }
              Share
            </button>
            <button
              onClick={handleDownload}
              disabled={!dataUrl}
              className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-gray-700 border border-gray-200 bg-gray-50 disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              <Download className="w-4 h-4" /> Save PNG
            </button>
            <button
              onClick={handleCopyLink}
              className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm text-gray-700 border border-gray-200 bg-gray-50 active:scale-[0.98] transition-all"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              Copy Link
            </button>
            <button
              onClick={generate}
              disabled={!dataUrl}
              className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm text-gray-700 border border-gray-200 bg-gray-50 disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              <ImageIcon className="w-4 h-4" /> Regenerate
            </button>
          </div>

          {/* URL display */}
          <div className="mt-3 px-4 py-3 bg-gray-50 rounded-2xl border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Portfolio link</p>
            <p className="text-xs text-gray-700 font-mono truncate">{displayUrl.replace(/^https?:\/\//, '')}</p>
          </div>
        </div>
      </div>
    </>
  );
}
