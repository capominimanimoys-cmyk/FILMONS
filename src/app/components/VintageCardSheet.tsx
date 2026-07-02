/**
 * VintageCardSheet — "Vintage Editorial" share card template.
 * Warm paper aesthetic: grain, vintage photo frames, serif typography,
 * optional floral/tape decorations. Three variants × three formats.
 */
import { useState, useEffect, useCallback } from 'react';
import { X, Download, Share2, Copy, Check, RefreshCw, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import type { CreatorCardProps } from './CreatorCardSheet';

// ── Types ─────────────────────────────────────────────────────────────────────

type Format   = 'story' | 'square' | 'landscape';
type Variant  = 'classic' | 'scrapbook' | 'minimal';
type PaperTone = 'warm' | 'cream' | 'pale';

const FORMATS: { id: Format; label: string; badge: string; w: number; h: number; aspect: string }[] = [
  { id: 'story',     label: 'Story',  badge: '9:16',  w: 1080, h: 1920, aspect: '9/16'  },
  { id: 'square',    label: 'Square', badge: '1:1',   w: 1080, h: 1080, aspect: '1/1'   },
  { id: 'landscape', label: 'Banner', badge: '16:9',  w: 1600, h: 900,  aspect: '16/9'  },
];

const VARIANTS: { id: Variant; label: string; sub: string }[] = [
  { id: 'classic',   label: 'Classic',   sub: 'Frames · flowers' },
  { id: 'scrapbook', label: 'Scrapbook', sub: 'Polaroids · tape' },
  { id: 'minimal',   label: 'Minimal',   sub: 'Clean editorial'  },
];

const PAPER_TONES: Record<PaperTone, string> = {
  warm:  '#EEDFC8',
  cream: '#F3EAD4',
  pale:  '#F8F4ED',
};

interface Props extends CreatorCardProps {
  onBack:  () => void;
  onClose: () => void;
}

// ── Canvas utilities ──────────────────────────────────────────────────────────

function loadImgSafe(src: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload  = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

function vCoverFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
) {
  const iAR = img.naturalWidth / img.naturalHeight;
  const bAR = w / h;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (iAR > bAR) { sw = sh * bAR; sx = (img.naturalWidth  - sw) / 2; }
  else            { sh = sw / bAR; sy = (img.naturalHeight - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function vWrap(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  maxW: number, lineH: number, maxLines = 4,
): number {
  const words = text.split(' ');
  let line = '', count = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + count * lineH);
      count++; line = word;
      if (count >= maxLines) return count;
    } else { line = test; }
  }
  if (line && count < maxLines) { ctx.fillText(line, x, y + count * lineH); count++; }
  return count;
}

function fmtN(n?: number): string {
  if (n === undefined || n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Seeded LCG — deterministic per username so decorations are stable across renders. */
function makeRand(seed: string): () => number {
  let s = Math.abs([...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// ── Drawing primitives ────────────────────────────────────────────────────────

function drawPaperBg(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  paperColor: string, rand: () => number,
) {
  ctx.fillStyle = paperColor; ctx.fillRect(0, 0, W, H);

  // Grain: tile a 300×300 noise canvas
  const gc = document.createElement('canvas'); gc.width = gc.height = 300;
  const gx = gc.getContext('2d')!;
  gx.fillStyle = paperColor; gx.fillRect(0, 0, 300, 300);
  const id = gx.getImageData(0, 0, 300, 300); const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 24;
    d[i]   = Math.min(255, Math.max(0, d[i]   + n));
    d[i+1] = Math.min(255, Math.max(0, d[i+1] + n * 0.88));
    d[i+2] = Math.min(255, Math.max(0, d[i+2] + n * 0.72));
  }
  gx.putImageData(id, 0, 0);
  const pat = ctx.createPattern(gc, 'repeat');
  if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); }

  // Edge vignette
  const edges = [
    () => { const g = ctx.createLinearGradient(0,0,0,H*0.07);      g.addColorStop(0,'rgba(70,40,8,0.16)'); g.addColorStop(1,'rgba(70,40,8,0)');    return {g,r:[0,0,W,H*0.07]       as [number,number,number,number]}; },
    () => { const g = ctx.createLinearGradient(0,H*0.93,0,H);      g.addColorStop(0,'rgba(70,40,8,0)');    g.addColorStop(1,'rgba(70,40,8,0.16)'); return {g,r:[0,H*0.93,W,H*0.07]   as [number,number,number,number]}; },
    () => { const g = ctx.createLinearGradient(0,0,W*0.045,0);     g.addColorStop(0,'rgba(70,40,8,0.11)'); g.addColorStop(1,'rgba(70,40,8,0)');    return {g,r:[0,0,W*0.045,H]       as [number,number,number,number]}; },
    () => { const g = ctx.createLinearGradient(W*0.955,0,W,0);     g.addColorStop(0,'rgba(70,40,8,0)');    g.addColorStop(1,'rgba(70,40,8,0.11)'); return {g,r:[W*0.955,0,W*0.045,H]  as [number,number,number,number]}; },
  ];
  for (const fn of edges) { const {g,r} = fn(); ctx.fillStyle = g; ctx.fillRect(...r); }
}

function drawRule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, alpha = 0.22) {
  ctx.save();
  ctx.strokeStyle = `rgba(80,50,20,${alpha})`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, Math.round(y)); ctx.lineTo(x + w, Math.round(y)); ctx.stroke();
  ctx.restore();
}

function drawDoubleRule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  drawRule(ctx, x, y, w, 0.25);
  drawRule(ctx, x, y + 5, w, 0.12);
}

/** Stylised dried flower with petals and stem. */
function drawFlower(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number,
  rand: () => number, opacity: number,
) {
  const petals = 6;
  const hue = rand() * 28 + 10;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + rand() * 0.18;
    const px = cx + Math.cos(a) * size * 0.52; const py = cy + Math.sin(a) * size * 0.52;
    ctx.save();
    ctx.translate(px, py); ctx.rotate(a + Math.PI / 2); ctx.scale(0.62, 1.45);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.23, size * 0.31, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${Math.round(148+hue)},${Math.round(78+hue*0.4)},28,${opacity})`;
    ctx.fill(); ctx.restore();
  }
  // Two leaves
  for (let i = 0; i < 2; i++) {
    const a = (i / 2) * Math.PI * 2 + rand() * Math.PI;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * size * 0.88, cy + Math.sin(a) * size * 0.88);
    ctx.rotate(a); ctx.scale(0.48, 1.85);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.13, size * 0.33, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(72,${Math.round(96+rand()*28)},36,${opacity * 0.7})`;
    ctx.fill(); ctx.restore();
  }
  // Center
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(95,55,18,${opacity * 0.9})`; ctx.fill();
  // Short stem
  ctx.save();
  ctx.strokeStyle = `rgba(68,${Math.round(90+rand()*20)},30,${opacity * 0.65})`;
  ctx.lineWidth = Math.round(size * 0.055);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.12);
  ctx.quadraticCurveTo(cx + (rand()-0.5)*size*0.4, cy + size * 0.75, cx + (rand()-0.5)*size*0.3, cy + size * 1.25);
  ctx.stroke(); ctx.restore();
}

/** Masking-tape strip. */
function drawTape(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, angle: number) {
  const h = 22;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle * Math.PI / 180);
  ctx.fillStyle = 'rgba(238,214,142,0.58)';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = 'rgba(196,166,92,0.28)'; ctx.lineWidth = 0.9;
  for (let i = -w / 2; i <= w / 2; i += 7) {
    ctx.beginPath(); ctx.moveTo(i, -h / 2); ctx.lineTo(i, h / 2); ctx.stroke();
  }
  ctx.restore();
}

/** Single vintage-framed photo. cx,cy = center; rotation in degrees. */
function drawPhotoFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number, cy: number, fw: number, fh: number,
  rotation: number, variant: Variant,
) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotation * Math.PI / 180);

  const isScrapbook = variant === 'scrapbook';
  const bp = fw * (isScrapbook ? 0.058 : 0.046);
  const imgH = isScrapbook ? fh * 0.76 : fh - bp * 2;

  // Shadow
  ctx.save();
  ctx.shadowColor = 'rgba(55,28,6,0.26)'; ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 7;
  ctx.fillStyle = isScrapbook ? '#FFFDF9' : '#FBF8F2';
  ctx.fillRect(-fw / 2, -fh / 2, fw, fh); ctx.restore();

  // Frame border
  ctx.strokeStyle = 'rgba(175,140,88,0.16)'; ctx.lineWidth = 1;
  ctx.strokeRect(-fw / 2 + 0.5, -fh / 2 + 0.5, fw - 1, fh - 1);

  // Image area
  const ix = -fw / 2 + bp; const iy = -fh / 2 + bp;
  const iw = fw - bp * 2;
  ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, imgH); ctx.clip();
  if (img) {
    vCoverFit(ctx, img, ix, iy, iw, imgH);
  } else {
    ctx.fillStyle = '#E2D3BA'; ctx.fillRect(ix, iy, iw, imgH);
    ctx.strokeStyle = 'rgba(140,108,68,0.15)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ix,iy); ctx.lineTo(ix+iw,iy+imgH);
    ctx.moveTo(ix+iw,iy); ctx.lineTo(ix,iy+imgH); ctx.stroke();
  }
  ctx.restore(); ctx.restore();
}

/** Bordered paper label for stats. */
function drawStatLabel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  value: string, label: string,
) {
  ctx.save();
  ctx.fillStyle = 'rgba(210,190,148,0.52)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(135,100,55,0.36)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();

  const midX = x + w / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

  const vFS = Math.round(h * 0.38);
  ctx.fillStyle = '#281508'; ctx.font = `600 ${vFS}px Georgia, "Times New Roman", serif`;
  ctx.fillText(value, midX, y + h * 0.55);

  const lFS = Math.round(h * 0.24);
  ctx.fillStyle = 'rgba(65,40,12,0.58)'; ctx.font = `400 ${lFS}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(label.toUpperCase(), midX, y + h * 0.85);
}

/** QR block with scan label on the right. */
function drawQRBlock(
  ctx: CanvasRenderingContext2D,
  qrc: HTMLCanvasElement, qrDS: number,
  bx: number, by: number, bw: number, bh: number,
  urlText: string,
) {
  // White block
  ctx.save();
  ctx.shadowColor = 'rgba(55,28,6,0.12)'; ctx.shadowBlur = 10;
  ctx.fillStyle = '#FEFCF8'; ctx.fillRect(bx, by, bw, bh); ctx.restore();
  ctx.strokeStyle = 'rgba(175,140,88,0.2)'; ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

  // QR
  const qrX = bx + bw * 0.06; const qrY = by + (bh - qrDS) / 2;
  if (qrc.width > 0) ctx.drawImage(qrc, qrX, qrY, qrDS, qrDS);

  // Right text
  const tx = qrX + qrDS + bw * 0.055; const tW = bw - (tx - bx) - bw * 0.04;
  const midY = by + bh / 2;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const sFS = Math.round(bh * 0.13);
  ctx.fillStyle = '#281508'; ctx.font = `600 ${sFS}px Georgia, serif`;
  vWrap(ctx, 'Scan to explore my portfolio', tx, midY - sFS * 1.7, tW, sFS * 1.35, 2);
  ctx.fillStyle = 'rgba(75,50,18,0.42)';
  ctx.font = `400 ${Math.round(bh * 0.088)}px monospace`;
  ctx.fillText(urlText.replace(/^https?:\/\//, ''), tx, midY + sFS * 0.55);
}

// ── Story renderer (1080 × 1920) ──────────────────────────────────────────────

function renderVintageStory(
  ctx: CanvasRenderingContext2D, W: number, H: number, PAD: number,
  p: CreatorCardProps, variant: Variant, paperColor: string,
  imgs: (HTMLImageElement | null)[], av: HTMLImageElement | null,
  qrc: HTMLCanvasElement, qrDS: number, rand: () => number,
) {
  const s = W / 1080;

  // Consume rand values in fixed order for deterministic layout
  const photoRots  = [0,1,2,3].map(() => (rand()-0.5) * (variant === 'minimal' ? 0 : variant === 'scrapbook' ? 11 : 7));
  const tapeAngles = [0,1,2,3].map(() => (rand()-0.5) * 8);
  const fl1s = rand() * 0.35 + 0.88; // flower scale factors
  const fl2s = rand() * 0.28 + 0.72;

  drawPaperBg(ctx, W, H, paperColor, rand);

  // Floral corner accents
  if (variant !== 'minimal') {
    drawFlower(ctx, W - PAD * 0.55, PAD * 0.65, 58 * s * fl1s, rand, 0.3);
    drawFlower(ctx, PAD * 0.42, H - PAD * 0.55, 40 * s * fl2s, rand, 0.22);
    if (variant === 'scrapbook') {
      drawFlower(ctx, W * 0.07, H * 0.33, 26 * s, rand, 0.16);
    }
  }

  // ── HEADER ──
  const hdrY = 72 * s;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1C0E04';
  ctx.font = `400 ${Math.round(58 * s)}px Georgia, "Times New Roman", serif`;
  ctx.fillText('FILMONS', W / 2, hdrY);

  drawDoubleRule(ctx, PAD * 2, hdrY + 17 * s, W - PAD * 4);

  ctx.fillStyle = 'rgba(68,42,12,0.5)';
  ctx.font = `italic ${Math.round(21 * s)}px Georgia, serif`;
  ctx.fillText('Built for creators.', W / 2, hdrY + 40 * s);

  // ── PORTFOLIO LABEL ──
  const lblY = hdrY + 72 * s;
  ctx.fillStyle = 'rgba(78,48,14,0.38)';
  ctx.font = `400 ${Math.round(13 * s)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText('PORTFOLIO  ·  COLLECTION', W / 2, lblY);
  drawRule(ctx, PAD * 2.5, lblY + 13 * s, W - PAD * 5);

  // ── HEADLINE ──
  const headY = lblY + 36 * s;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1C0E04';
  const hFS = Math.round(52 * s);
  ctx.font = `400 ${hFS}px Georgia, "Times New Roman", serif`;
  const hLines = vWrap(ctx, 'Hey, see my creations in my Filmons portfolio.', PAD, headY, W - PAD * 2, hFS * 1.28, 3);

  const afterHead = headY + hLines * hFS * 1.28 + 6 * s;
  ctx.fillStyle = 'rgba(68,42,12,0.42)';
  ctx.font = `italic ${Math.round(19 * s)}px Georgia, serif`;
  ctx.fillText('Discover my latest work — scan the QR code or visit my profile.', PAD, afterHead);
  drawRule(ctx, PAD, afterHead + 22 * s, W - PAD * 2);

  // ── PHOTO GRID ──
  const gridY = afterHead + 38 * s;
  const gridH = 800 * s;
  const gap   = 18 * s;
  const fw    = (W - PAD * 2 - gap) / 2;
  const fh    = (gridH - gap) / 2;

  const centers = [
    [PAD + fw / 2,          gridY + fh / 2         ],
    [PAD + fw + gap + fw/2, gridY + fh / 2         ],
    [PAD + fw / 2,          gridY + fh + gap + fh/2],
    [PAD + fw + gap + fw/2, gridY + fh + gap + fh/2],
  ];

  centers.forEach(([cx, cy], i) => {
    drawPhotoFrame(ctx, imgs[i] ?? null, cx, cy, fw, fh, photoRots[i], variant);
    if (variant === 'scrapbook') {
      drawTape(ctx, cx, cy - fh / 2 - 1 * s, fw * 0.38, tapeAngles[i]);
    }
  });

  // ── CREATOR SECTION ──
  const crSY = gridY + gridH + 26 * s;
  drawRule(ctx, PAD * 2, crSY, W - PAD * 4, 0.18);

  const avR  = Math.round(66 * s);
  const avCX = PAD + avR;
  const avCY = crSY + 30 * s + avR;

  // Avatar rings
  [avR + 7, avR + 3].forEach((r, i) => {
    ctx.beginPath(); ctx.arc(avCX, avCY, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(110,72,24,${i === 0 ? 0.22 : 0.12})`; ctx.lineWidth = i === 0 ? 1.5 : 4; ctx.stroke();
  });
  ctx.save(); ctx.beginPath(); ctx.arc(avCX, avCY, avR, 0, Math.PI * 2); ctx.clip();
  if (av) { vCoverFit(ctx, av, avCX - avR, avCY - avR, avR * 2, avR * 2); }
  else {
    ctx.fillStyle = '#CBAF8C'; ctx.fillRect(avCX-avR, avCY-avR, avR*2, avR*2);
    ctx.fillStyle = '#5A3210'; ctx.font = `900 ${Math.round(avR*0.7)}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((p.name?.[0] ?? '?').toUpperCase(), avCX, avCY);
  }
  ctx.restore();

  // Creator text (right of avatar)
  const tX = avCX + avR + 22 * s;
  let tY = avCY - avR * 0.5;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#1C0E04'; ctx.font = `400 ${Math.round(40 * s)}px Georgia, serif`;
  ctx.fillText(p.name, tX, tY + 40*s); tY += 48*s;
  if (p.username) {
    ctx.fillStyle = 'rgba(68,42,12,0.52)'; ctx.font = `italic ${Math.round(21*s)}px Georgia, serif`;
    ctx.fillText(`@${p.username}`, tX, tY); tY += 30*s;
  }
  if (p.primaryRole) {
    ctx.fillStyle = '#281508'; ctx.font = `400 ${Math.round(17*s)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(p.primaryRole.toUpperCase(), tX, tY); tY += 27*s;
  }
  if (p.location) {
    ctx.fillStyle = 'rgba(68,42,12,0.46)'; ctx.font = `400 ${Math.round(16*s)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(`• ${p.location}`, tX, tY);
  }

  // Stats row
  const statsY = crSY + 30*s + avR*2 + 24*s;
  const statsGap = 14 * s;
  const sW = (W - PAD * 2 - statsGap * 2) / 3;
  const sH = 76 * s;
  [
    { v: fmtN(p.viewCount),      l: 'Views'     },
    { v: fmtN(p.followerCount),  l: 'Followers' },
    { v: fmtN(p.worksCount),     l: 'Projects'  },
  ].forEach(({ v, l }, i) => {
    drawStatLabel(ctx, PAD + i * (sW + statsGap), statsY, sW, sH, v, l);
  });

  // ── QR SECTION ──
  const qrBY = statsY + sH + 24 * s;
  const qrBH = 195 * s;
  drawQRBlock(ctx, qrc, Math.round(qrDS * 0.92), PAD, qrBY, W - PAD * 2, qrBH, p.displayUrl);

  // ── FOOTER ──
  const footY = qrBY + qrBH + 20 * s;
  drawRule(ctx, PAD, footY, W - PAD * 2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(58,32,8,0.4)'; ctx.font = `400 ${Math.round(17*s)}px Georgia, serif`;
  ctx.fillText('FILMONS  ·  Built for creators.', W / 2, footY + 28 * s);
  ctx.fillStyle = 'rgba(58,32,8,0.3)'; ctx.font = `400 ${Math.round(14*s)}px monospace`;
  ctx.fillText(p.displayUrl.replace(/^https?:\/\//, ''), W / 2, footY + 50 * s);
}

// ── Square renderer (1080 × 1080) ────────────────────────────────────────────

function renderVintageSquare(
  ctx: CanvasRenderingContext2D, W: number, H: number, PAD: number,
  p: CreatorCardProps, variant: Variant, paperColor: string,
  imgs: (HTMLImageElement | null)[], av: HTMLImageElement | null,
  qrc: HTMLCanvasElement, qrDS: number, rand: () => number,
) {
  const s = W / 1080;

  const photoRots  = [0,1,2,3].map(() => (rand()-0.5) * (variant === 'minimal' ? 0 : variant === 'scrapbook' ? 9 : 5.5));
  const tapeAngles = [0,1,2,3].map(() => (rand()-0.5) * 8);
  const fl1s = rand() * 0.35 + 0.88; rand(); // consume fl2s (unused in square)

  drawPaperBg(ctx, W, H, paperColor, rand);

  if (variant !== 'minimal') {
    drawFlower(ctx, W - PAD * 0.5, PAD * 0.5, 52 * s * fl1s, rand, 0.28);
  }

  // ── TOP BAND (header + creator) ──
  const topH = H * 0.42;

  // FILMONS wordmark
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1C0E04'; ctx.font = `400 ${Math.round(52*s)}px Georgia, serif`;
  ctx.fillText('FILMONS', W / 2, 62 * s);
  drawDoubleRule(ctx, PAD*2, 76*s, W - PAD*4);

  // Avatar + name (centered)
  const avR  = Math.round(54 * s);
  const avCX = W / 2; const avCY = 142 * s;
  [avR+6, avR+2].forEach((r,i) => {
    ctx.beginPath(); ctx.arc(avCX, avCY, r, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(110,72,24,${i===0?0.2:0.1})`; ctx.lineWidth = i===0?1.5:4; ctx.stroke();
  });
  ctx.save(); ctx.beginPath(); ctx.arc(avCX, avCY, avR, 0, Math.PI*2); ctx.clip();
  if (av) { vCoverFit(ctx, av, avCX-avR, avCY-avR, avR*2, avR*2); }
  else {
    ctx.fillStyle = '#CBAF8C'; ctx.fillRect(avCX-avR, avCY-avR, avR*2, avR*2);
    ctx.fillStyle = '#5A3210'; ctx.font = `900 ${Math.round(avR*0.7)}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((p.name?.[0] ?? '?').toUpperCase(), avCX, avCY);
  }
  ctx.restore();

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1C0E04'; ctx.font = `400 ${Math.round(38*s)}px Georgia, serif`;
  ctx.fillText(p.name, W/2, avCY + avR + 36*s);
  if (p.primaryRole) {
    ctx.fillStyle = 'rgba(68,42,12,0.5)'; ctx.font = `400 ${Math.round(16*s)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(p.primaryRole.toUpperCase(), W/2, avCY + avR + 56*s);
  }

  // Stats inline
  const statsY = avCY + avR + 76*s;
  const sW = (W - PAD*2 - 28*s) / 3; const sH = 68*s;
  [
    { v: fmtN(p.viewCount), l: 'Views' },
    { v: fmtN(p.followerCount), l: 'Followers' },
    { v: fmtN(p.worksCount), l: 'Projects' },
  ].forEach(({v,l},i) => drawStatLabel(ctx, PAD + i*(sW+14*s), statsY, sW, sH, v, l));

  drawRule(ctx, PAD, topH - 2, W - PAD*2);

  // ── PHOTO GRID (bottom portion) ──
  const gridY = topH + 16*s;
  const gridH = H - topH - 24*s;
  const gap   = 14*s;
  const fw    = (W - PAD*2 - gap) / 2;
  const fh    = (gridH - gap) / 2;

  [
    [PAD + fw/2,          gridY + fh/2         ],
    [PAD + fw + gap + fw/2, gridY + fh/2       ],
    [PAD + fw/2,          gridY + fh + gap + fh/2],
    [PAD + fw + gap + fw/2, gridY + fh+gap+fh/2  ],
  ].forEach(([cx,cy],i) => {
    drawPhotoFrame(ctx, imgs[i]??null, cx, cy, fw, fh, photoRots[i], variant);
    if (variant === 'scrapbook') drawTape(ctx, cx, cy - fh/2, fw*0.36, tapeAngles[i]);
  });

  // QR small badge in bottom-right corner
  const qrSmall = Math.round(90*s);
  const qrBX = W - PAD - qrSmall - 4; const qrBY = H - PAD - qrSmall - 4;
  ctx.save();
  ctx.shadowColor = 'rgba(55,28,6,0.15)'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#FEFCF8'; ctx.fillRect(qrBX, qrBY, qrSmall, qrSmall); ctx.restore();
  if (qrc.width > 0) ctx.drawImage(qrc, qrBX, qrBY, qrSmall, qrSmall);
}

// ── Landscape renderer (1600 × 900) ──────────────────────────────────────────

function renderVintageLandscape(
  ctx: CanvasRenderingContext2D, W: number, H: number, PAD: number,
  p: CreatorCardProps, variant: Variant, paperColor: string,
  imgs: (HTMLImageElement | null)[], av: HTMLImageElement | null,
  qrc: HTMLCanvasElement, qrDS: number, rand: () => number,
) {
  const s = W / 1600;

  const photoRots  = [0,1,2,3].map(() => (rand()-0.5) * (variant === 'minimal' ? 0 : variant === 'scrapbook' ? 8 : 5));
  const tapeAngles = [0,1,2,3].map(() => (rand()-0.5) * 8);
  rand(); rand(); // consume fl1s / fl2s

  drawPaperBg(ctx, W, H, paperColor, rand);

  // Thin vertical divider between left and right panels
  const divX = W * 0.38;
  ctx.save();
  ctx.strokeStyle = 'rgba(80,50,20,0.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(divX, PAD * 0.5); ctx.lineTo(divX, H - PAD * 0.5); ctx.stroke();
  ctx.restore();

  if (variant !== 'minimal') {
    drawFlower(ctx, W - PAD*0.45, PAD*0.5, 48*s, rand, 0.28);
  }

  // ── LEFT PANEL — creator info ──
  const lW = divX - PAD;
  const lCX = divX / 2;

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1C0E04'; ctx.font = `400 ${Math.round(42*s)}px Georgia, serif`;
  ctx.fillText('FILMONS', lCX, 60*s);
  drawDoubleRule(ctx, PAD, 73*s, lW - PAD);

  const avR  = Math.round(52*s);
  const avCX = lCX; const avCY = 150*s;
  [avR+6,avR+2].forEach((r,i) => {
    ctx.beginPath(); ctx.arc(avCX, avCY, r, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(110,72,24,${i===0?0.2:0.1})`; ctx.lineWidth = i===0?1.5:4; ctx.stroke();
  });
  ctx.save(); ctx.beginPath(); ctx.arc(avCX, avCY, avR, 0, Math.PI*2); ctx.clip();
  if (av) { vCoverFit(ctx, av, avCX-avR, avCY-avR, avR*2, avR*2); }
  else {
    ctx.fillStyle = '#CBAF8C'; ctx.fillRect(avCX-avR, avCY-avR, avR*2, avR*2);
    ctx.fillStyle = '#5A3210'; ctx.font = `900 ${Math.round(avR*0.7)}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((p.name?.[0]??'?').toUpperCase(), avCX, avCY);
  }
  ctx.restore();

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1C0E04'; ctx.font = `400 ${Math.round(30*s)}px Georgia, serif`;
  ctx.fillText(p.name, lCX, avCY + avR + 30*s);
  if (p.username) {
    ctx.fillStyle = 'rgba(68,42,12,0.5)'; ctx.font = `italic ${Math.round(17*s)}px Georgia, serif`;
    ctx.fillText(`@${p.username}`, lCX, avCY + avR + 52*s);
  }
  if (p.primaryRole) {
    ctx.fillStyle = '#281508'; ctx.font = `400 ${Math.round(13*s)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(p.primaryRole.toUpperCase(), lCX, avCY + avR + 70*s);
  }

  // Stats — vertical stack in left panel
  const stY0 = avCY + avR + 98*s;
  const stW = lW * 0.7; const stH = 54*s; const stGap = 10*s;
  [
    { v: fmtN(p.viewCount), l: 'Views' },
    { v: fmtN(p.followerCount), l: 'Followers' },
    { v: fmtN(p.worksCount), l: 'Projects' },
  ].forEach(({v,l},i) => {
    drawStatLabel(ctx, lCX - stW/2, stY0 + i*(stH+stGap), stW, stH, v, l);
  });

  // QR bottom of left panel
  const qrSmall = Math.round(105*s);
  const qrBY = H - PAD - qrSmall - 4; const qrBX = lCX - qrSmall/2;
  ctx.save();
  ctx.shadowColor = 'rgba(55,28,6,0.12)'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#FEFCF8'; ctx.fillRect(qrBX, qrBY, qrSmall, qrSmall); ctx.restore();
  if (qrc.width > 0) ctx.drawImage(qrc, qrBX, qrBY, qrSmall, qrSmall);
  ctx.fillStyle = 'rgba(58,32,8,0.35)'; ctx.font = `400 ${Math.round(11*s)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(p.displayUrl.replace(/^https?:\/\//, ''), lCX, qrBY + qrSmall + 16*s);

  // ── RIGHT PANEL — headline + photo grid ──
  const rX  = divX + PAD * 0.8;
  const rW  = W - rX - PAD * 0.5;

  // Headline
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1C0E04'; ctx.font = `400 ${Math.round(44*s)}px Georgia, serif`;
  const hLines = vWrap(ctx, 'Hey, see my creations in my Filmons portfolio.', rX, 60*s, rW, 56*s, 2);

  ctx.fillStyle = 'rgba(68,42,12,0.42)'; ctx.font = `italic ${Math.round(16*s)}px Georgia, serif`;
  ctx.fillText('Discover my latest creative work.', rX, 60*s + hLines*56*s + 8*s);
  drawRule(ctx, rX, 60*s + hLines*56*s + 28*s, rW * 0.85);

  // Photo grid in right panel
  const gridY = 60*s + hLines*56*s + 44*s;
  const gridH = H - gridY - PAD * 0.5;
  const gap   = 12*s;
  const fw    = (rW - gap) / 2;
  const fh    = (gridH - gap) / 2;

  [
    [rX + fw/2,         gridY + fh/2         ],
    [rX + fw + gap + fw/2, gridY + fh/2      ],
    [rX + fw/2,         gridY + fh + gap + fh/2],
    [rX + fw + gap + fw/2, gridY+fh+gap+fh/2 ],
  ].forEach(([cx,cy],i) => {
    drawPhotoFrame(ctx, imgs[i]??null, cx, cy, fw, fh, photoRots[i], variant);
    if (variant === 'scrapbook') drawTape(ctx, cx, cy - fh/2, fw*0.36, tapeAngles[i]);
  });
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

async function renderVintageCard(
  props: CreatorCardProps,
  format: Format,
  variant: Variant,
  paperTone: PaperTone,
): Promise<string> {
  const fmt = FORMATS.find(f => f.id === format)!;
  const { w: W, h: H } = fmt;
  const PAD = Math.round(W * 0.067);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  // Load images in parallel
  const imgUrls = (props.portfolioItems ?? []).slice(0, 4);
  while (imgUrls.length < 4) imgUrls.push('');
  const [av, i0, i1, i2, i3] = await Promise.all([
    props.avatarUrl ? loadImgSafe(props.avatarUrl) : Promise.resolve(null),
    imgUrls[0] ? loadImgSafe(imgUrls[0]) : Promise.resolve(null),
    imgUrls[1] ? loadImgSafe(imgUrls[1]) : Promise.resolve(null),
    imgUrls[2] ? loadImgSafe(imgUrls[2]) : Promise.resolve(null),
    imgUrls[3] ? loadImgSafe(imgUrls[3]) : Promise.resolve(null),
  ]);
  const colImgs = [i0, i1, i2, i3];

  // QR code (dark on transparent — drawn over white paper block)
  const qrc = document.createElement('canvas');
  const qrSize = Math.round(W * 0.14);
  try {
    const qrUrl = props.shareUrl?.trim() || 'https://filmons.app';
    await QRCode.toCanvas(qrc, qrUrl, {
      width: qrSize, margin: 1,
      color: { dark: '#2D1A06', light: '#00000000' },
    });
  } catch { /* QR silently omitted */ }

  const paperColor = PAPER_TONES[paperTone];
  const rand = makeRand(props.username ?? props.name ?? 'filmons');

  if (format === 'story')          renderVintageStory(ctx, W, H, PAD, props, variant, paperColor, colImgs, av, qrc, qrSize, rand);
  else if (format === 'square')    renderVintageSquare(ctx, W, H, PAD, props, variant, paperColor, colImgs, av, qrc, qrSize, rand);
  else                             renderVintageLandscape(ctx, W, H, PAD, props, variant, paperColor, colImgs, av, qrc, qrSize, rand);

  return canvas.toDataURL('image/png', 1.0);
}

// ── Sheet component ───────────────────────────────────────────────────────────

export function VintageCardSheet({ onBack, onClose, ...cardProps }: Props) {
  const [variant,   setVariant]   = useState<Variant>('classic');
  const [format,    setFormat]    = useState<Format>('story');
  const [paperTone, setPaperTone] = useState<PaperTone>('warm');
  const [dataUrl,   setDataUrl]   = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [copied,    setCopied]    = useState(false);

  const propsKey = JSON.stringify(cardProps);

  const generate = useCallback(async () => {
    setDataUrl(null);
    try {
      const url = await renderVintageCard(cardProps, format, variant, paperTone);
      setDataUrl(url);
    } catch (e: any) {
      console.error('[VintageCard] render failed:', e?.message ?? e);
      toast.error('Could not generate card');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, variant, paperTone, propsKey]);

  useEffect(() => { generate(); }, [generate]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `filmons-vintage-${cardProps.username ?? cardProps.name}-${format}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast.success('Card saved!');
  };

  const share = async () => {
    if (!dataUrl) return;
    setExporting(true);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'filmons-vintage-card.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${cardProps.name} on Filmons`, url: cardProps.shareUrl });
      } else { download(); }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('Share failed');
    } finally { setExporting(false); }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(cardProps.shareUrl);
      setCopied(true); toast.success('Link copied.');
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Could not copy'); }
  };

  const fmt = FORMATS.find(f => f.id === format)!;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[82] bg-[#1a1208] rounded-t-3xl flex flex-col"
      style={{ maxHeight: '95vh', animation: 'vcSlide 0.32s cubic-bezier(0.32,0.72,0,1)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <style>{`
        @keyframes vcSlide{from{transform:translateY(100%);opacity:.85}to{transform:translateY(0);opacity:1}}
        .vc-shimmer{background:linear-gradient(90deg,#2a1e08 25%,#3a2c10 50%,#2a1e08 75%);background-size:200% 100%;animation:vcShimmer 1.4s infinite linear;}
        @keyframes vcShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>

      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-white/15" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center"
            aria-label="Back to templates"
          >
            <ChevronLeft className="w-4 h-4 text-white/70" />
          </button>
          <div>
            <h3 className="text-sm font-black text-white">Vintage Editorial</h3>
            <p className="text-[10px] text-white/35 mt-0.5">Warm paper · serif · vintage frames</p>
          </div>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
          <X className="w-4 h-4 text-white/70" />
        </button>
      </div>

      {/* Variant tabs */}
      <div className="flex gap-2 px-4 pt-3 pb-1.5 shrink-0">
        {VARIANTS.map(v => (
          <button
            key={v.id}
            onClick={() => setVariant(v.id)}
            className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-all ${
              variant === v.id
                ? 'bg-[#c8a46e] text-[#1a0e02]'
                : 'bg-white/6 text-white/45 hover:bg-white/10'
            }`}
          >
            <span className="block">{v.label}</span>
            <span className={`block text-[9px] mt-0.5 font-medium ${variant === v.id ? 'text-[#3a2200]/70' : 'text-white/22'}`}>{v.sub}</span>
          </button>
        ))}
      </div>

      {/* Format tabs */}
      <div className="flex gap-2 px-4 pb-2 shrink-0">
        {FORMATS.map(f => (
          <button
            key={f.id}
            onClick={() => setFormat(f.id)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              format === f.id
                ? 'bg-white/18 text-white'
                : 'bg-white/6 text-white/40 hover:bg-white/10'
            }`}
          >
            <span className="block">{f.label}</span>
            <span className={`block text-[9px] mt-0.5 ${format === f.id ? 'text-white/45' : 'text-white/20'}`}>{f.badge}</span>
          </button>
        ))}
      </div>

      {/* Paper tone selector */}
      <div className="flex items-center gap-3 px-4 pb-2 shrink-0">
        <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">Paper</span>
        {(['warm', 'cream', 'pale'] as PaperTone[]).map(tone => (
          <button
            key={tone}
            onClick={() => setPaperTone(tone)}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full transition-all ${
              paperTone === tone ? 'bg-white/15 text-white' : 'text-white/35 hover:text-white/55'
            }`}
          >
            <span
              className="w-3 h-3 rounded-full border border-white/20"
              style={{ background: PAPER_TONES[tone] }}
            />
            <span className="capitalize">{tone}</span>
          </button>
        ))}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Preview */}
        <div className="flex justify-center mb-4">
          <div
            className="relative rounded-2xl overflow-hidden shadow-2xl w-full max-w-[280px]"
            style={{ aspectRatio: fmt.aspect, background: PAPER_TONES[paperTone] }}
          >
            {dataUrl ? (
              <img src={dataUrl} alt="Vintage card preview" className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 vc-shimmer" />
            )}
          </div>
        </div>

        {/* URL chip */}
        <div className="flex justify-center mb-4">
          <div className="px-3 py-1.5 rounded-full bg-white/6 text-white/35 text-[11px] font-mono max-w-[260px] truncate">
            {cardProps.displayUrl.replace(/^https?:\/\//, '')}
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={share}
            disabled={!dataUrl || exporting}
            className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-[#c8a46e] text-[#1a0e02] font-bold text-sm disabled:opacity-40 transition-opacity active:scale-95"
          >
            <Share2 className="w-4 h-4" />
            {exporting ? 'Sharing…' : 'Share'}
          </button>
          <button
            onClick={download}
            disabled={!dataUrl}
            className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-white/10 text-white font-semibold text-sm disabled:opacity-40 transition-opacity active:scale-95"
          >
            <Download className="w-4 h-4" />
            Save PNG
          </button>
          <button
            onClick={copyLink}
            className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-white/8 text-white/70 font-semibold text-sm active:scale-95"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button
            onClick={generate}
            disabled={!dataUrl}
            className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-white/8 text-white/70 font-semibold text-sm disabled:opacity-40 active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}
