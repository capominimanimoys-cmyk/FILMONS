/**
 * CreatorCardSheet — premium branded share card generator.
 * Canvas-drawn at native resolution with portfolio collage, stat chips,
 * and cinematic layout. Three export formats: Story, Square, Banner.
 */
import { useState, useEffect, useCallback } from 'react';
import { X, Download, Share2, Copy, Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import QRCode from 'qrcode';

// ── Types ────────────────────────────────────────────────────────────────────

type Format = 'story' | 'square' | 'landscape';

const FORMATS: { id: Format; label: string; badge: string; w: number; h: number; aspect: string }[] = [
  { id: 'story',     label: 'Story',  badge: '9:16',  w: 1080, h: 1920, aspect: '9/16'  },
  { id: 'square',    label: 'Square', badge: '1:1',   w: 1080, h: 1080, aspect: '1/1'   },
  { id: 'landscape', label: 'Banner', badge: '16:9',  w: 1600, h: 900,  aspect: '16/9'  },
];

export interface CreatorCardProps {
  name:            string;
  username?:       string;
  primaryRole?:    string;
  location?:       string;
  avatarUrl?:      string;
  coverUrl?:       string;
  shareUrl:        string;
  displayUrl:      string;
  portfolioItems?: string[];   // up to 4 image URLs for the collage
  followerCount?:  number;
  viewCount?:      number;
  worksCount?:     number;
  isVerified?:     boolean;
  isCreatorPlus?:  boolean;
}

interface Props extends CreatorCardProps {
  onClose: () => void;
}

// ── Canvas utilities ─────────────────────────────────────────────────────────

function formatCount(n?: number): string {
  if (n === undefined || n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed: ${src}`));
    img.src = src;
  });
}

async function loadSafe(src: string): Promise<HTMLImageElement | null> {
  try { return await loadImage(src); } catch { return null; }
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const cr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + cr, y);
  ctx.lineTo(x + w - cr, y); ctx.arcTo(x + w, y, x + w, y + cr, cr);
  ctx.lineTo(x + w, y + h - cr); ctx.arcTo(x + w, y + h, x + w - cr, y + h, cr);
  ctx.lineTo(x + cr, y + h); ctx.arcTo(x, y + h, x, y + h - cr, cr);
  ctx.lineTo(x, y + cr); ctx.arcTo(x, y, x + cr, y, cr);
  ctx.closePath();
}

function circ(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D, text: string,
  x: number, y: number, maxW: number, lineH: number, maxLines = 3,
): number {
  const words = text.split(' ');
  let line = '', lineCount = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + lineCount * lineH);
      lineCount++;
      line = word;
      if (lineCount >= maxLines) return lineCount;
    } else { line = test; }
  }
  if (line && lineCount < maxLines) { ctx.fillText(line, x, y + lineCount * lineH); lineCount++; }
  return lineCount;
}

function coverFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const iAR = img.naturalWidth / img.naturalHeight;
  const bAR = w / h;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (iAR > bAR) { sw = sh * bAR; sx = (img.naturalWidth - sw) / 2; }
  else            { sh = sw / bAR; sy = (img.naturalHeight - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function tile(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  rr(ctx, x, y, w, h, r); ctx.clip();
  if (img) {
    coverFit(ctx, img, x, y, w, h);
    const vig = ctx.createLinearGradient(x, y, x, y + h);
    vig.addColorStop(0, 'rgba(0,0,0,0.1)');
    vig.addColorStop(0.4, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vig; ctx.fillRect(x, y, w, h);
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#1e1b4b'); g.addColorStop(1, '#312e81');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let gy = y; gy < y + h; gy += 28) ctx.fillRect(x, gy, w, 1);
  }
  ctx.restore();
}

function collage(
  ctx: CanvasRenderingContext2D, imgs: (HTMLImageElement | null)[],
  x: number, y: number, w: number, h: number, r: number, gap: number,
) {
  const n = imgs.filter(Boolean).length;
  if (n === 0) {
    ctx.save(); rr(ctx, x, y, w, h, r);
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#0f0c29'); g.addColorStop(1, '#1f1c50');
    ctx.fillStyle = g; ctx.fill(); ctx.restore(); return;
  }
  if (n === 1) { tile(ctx, imgs[0], x, y, w, h, r); return; }
  if (n === 2) {
    const hw = (w - gap) / 2;
    tile(ctx, imgs[0], x, y, hw, h, r);
    tile(ctx, imgs[1], x + hw + gap, y, hw, h, r); return;
  }
  if (n === 3) {
    const hw = (w - gap) / 2, hh = (h - gap) / 2;
    tile(ctx, imgs[0], x, y, hw, h, r);
    tile(ctx, imgs[1], x + hw + gap, y, hw, hh, r);
    tile(ctx, imgs[2], x + hw + gap, y + hh + gap, hw, hh, r); return;
  }
  const hw = (w - gap) / 2, hh = (h - gap) / 2;
  tile(ctx, imgs[0], x, y, hw, hh, r);
  tile(ctx, imgs[1], x + hw + gap, y, hw, hh, r);
  tile(ctx, imgs[2], x, y + hh + gap, hw, hh, r);
  tile(ctx, imgs[3], x + hw + gap, y + hh + gap, hw, hh, r);
}

function chip(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  value: string, label: string, r: number,
) {
  ctx.save();
  rr(ctx, x, y, w, h, r); ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();
  rr(ctx, x, y, w, h, r); ctx.fillStyle = 'rgba(255,255,255,0.09)'; ctx.fill();
  rr(ctx, x, y, w, h, r); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  const vFS = Math.round(h * 0.36), lFS = Math.round(h * 0.25);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff'; ctx.font = `800 ${vFS}px system-ui,sans-serif`;
  ctx.fillText(value, x + w / 2, y + h * 0.55);
  ctx.fillStyle = 'rgba(255,255,255,0.48)'; ctx.font = `500 ${lFS}px system-ui,sans-serif`;
  ctx.fillText(label, x + w / 2, y + h * 0.83);
}

function avatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number, cy: number, r: number, name: string,
) {
  ctx.save(); circ(ctx, cx, cy, r + 5); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill(); ctx.restore();
  ctx.save(); circ(ctx, cx, cy, r + 3); ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill(); ctx.restore();
  ctx.save(); circ(ctx, cx, cy, r); ctx.clip();
  if (img) {
    coverFit(ctx, img, cx - r, cy - r, r * 2, r * 2);
  } else {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, '#2563eb'); g.addColorStop(1, '#6366f1');
    ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(r * 0.75)}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((name?.[0] ?? '?').toUpperCase(), cx, cy);
  }
  ctx.restore();
}

// ── Render: Story (1080 × 1920) ──────────────────────────────────────────────

function renderStory(
  ctx: CanvasRenderingContext2D, W: number, H: number, PAD: number, GAP: number, COR: number,
  p: CreatorCardProps, imgs: (HTMLImageElement | null)[], av: HTMLImageElement | null,
  qrc: HTMLCanvasElement, qrSize: number,
) {
  const s = W / 1080;

  // TOP BAR
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = `900 ${Math.round(26*s)}px system-ui,sans-serif`;
  ctx.fillText('FILMONS', PAD, 52*s);

  const tagText = 'Built for creators.';
  ctx.font = `600 ${Math.round(17*s)}px system-ui,sans-serif`;
  const tagW = ctx.measureText(tagText).width + 22*s, tagH = 30*s;
  const tagX = W - PAD - tagW, tagY = 52*s - tagH / 2;
  ctx.save(); rr(ctx, tagX, tagY, tagW, tagH, tagH / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill(); ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.fillText(tagText, tagX + 11*s, 52*s);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 88*s); ctx.lineTo(W - PAD, 88*s); ctx.stroke();

  // HEADLINE
  const headY = 122*s;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const headFS = Math.round(57*s);
  ctx.fillStyle = '#fff'; ctx.font = `900 ${headFS}px system-ui,sans-serif`;
  const hl = wrapText(ctx, 'Hey, see my creations in my Filmons portfolio.', PAD, headY, W - PAD * 2, headFS * 1.22, 3);

  const subY = headY + hl * headFS * 1.22 + 15*s;
  const subFS = Math.round(26*s);
  ctx.fillStyle = 'rgba(255,255,255,0.48)'; ctx.font = `400 ${subFS}px system-ui,sans-serif`;
  wrapText(ctx, 'Scan the QR code or visit my portfolio to discover my latest work.', PAD, subY, W - PAD * 2, subFS * 1.4, 2);

  // COLLAGE
  const colY = 412*s, colW = W - PAD * 2, colH = 748*s;
  collage(ctx, imgs, PAD, colY, colW, colH, COR, GAP);

  // Bottom gradient on collage (for chip contrast)
  ctx.save();
  rr(ctx, PAD, colY + colH * 0.55, colW, colH * 0.45, COR); ctx.clip();
  const cg = ctx.createLinearGradient(0, colY + colH * 0.55, 0, colY + colH);
  cg.addColorStop(0, 'rgba(0,0,0,0)'); cg.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = cg; ctx.fillRect(PAD, colY, colW, colH);
  ctx.restore();

  // STAT CHIPS
  const cW = Math.round(272*s), cH = Math.round(88*s), cGap = Math.round(18*s);
  const cTW = cW * 3 + cGap * 2, cX0 = PAD + (colW - cTW) / 2, cY = colY + colH - cH - 26*s;
  const stats = [
    { l: 'Views', v: formatCount(p.viewCount) },
    { l: 'Followers', v: formatCount(p.followerCount) },
    { l: 'Projects', v: formatCount(p.worksCount) },
  ];
  stats.forEach((st, i) => chip(ctx, cX0 + i * (cW + cGap), cY, cW, cH, st.v, st.l, Math.round(14*s)));

  // CREATOR SECTION
  const crY = colY + colH + 28*s;
  const avR = Math.round(80*s), avCX = PAD + avR, avCY = crY + avR + 8*s;
  avatar(ctx, av, avCX, avCY, avR, p.name);

  const tX = avCX + avR + 28*s;
  let tY = crY + 18*s;
  const nameFS = Math.round(46*s);
  ctx.fillStyle = '#fff'; ctx.font = `900 ${nameFS}px system-ui,sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(p.name, tX, tY + nameFS); tY += nameFS * 1.25;

  if (p.username) {
    const uFS = Math.round(26*s);
    ctx.fillStyle = 'rgba(255,255,255,0.52)'; ctx.font = `500 ${uFS}px system-ui,sans-serif`;
    ctx.fillText(`@${p.username}`, tX, tY); tY += uFS * 1.5;
  }
  if (p.primaryRole) {
    const rFS = Math.round(23*s);
    ctx.font = `700 ${rFS}px system-ui,sans-serif`;
    const rW = ctx.measureText(p.primaryRole).width + 24*s, rH = Math.round(34*s);
    ctx.save(); rr(ctx, tX, tY - rFS * 0.85, rW, rH, rH / 2);
    ctx.fillStyle = 'rgba(37,99,235,0.38)'; ctx.fill(); ctx.restore();
    ctx.fillStyle = '#93c5fd'; ctx.fillText(p.primaryRole, tX + 12*s, tY); tY += rH + 12*s;
  }
  if (p.location) {
    const lFS = Math.round(21*s);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `400 ${lFS}px system-ui,sans-serif`;
    ctx.fillText(`📍 ${p.location}`, tX, tY);
  }

  // QR BOX
  const qrBY = 1572*s, qrBH = 215*s;
  ctx.save(); rr(ctx, PAD, qrBY, W - PAD * 2, qrBH, COR * 1.8);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();

  const qrDS = Math.round(165*s), qrDX = PAD + 24*s, qrDY = qrBY + (qrBH - qrDS) / 2;
  ctx.drawImage(qrc, qrDX, qrDY, qrDS, qrDS);

  const qrTX = qrDX + qrDS + 28*s, qrTW = W - PAD - qrTX - 16*s;
  const sFSq = Math.round(25*s);
  const midQ = qrBY + qrBH / 2;
  ctx.fillStyle = '#fff'; ctx.font = `700 ${sFSq}px system-ui,sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const sL = wrapText(ctx, 'Scan to explore my portfolio', qrTX, midQ - sFSq * 1.2, qrTW, sFSq * 1.3, 2);
  const uFS = Math.round(19*s);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = `400 ${uFS}px monospace,system-ui`;
  ctx.fillText(p.displayUrl.replace(/^https?:\/\//, ''), qrTX, midQ - sFSq * 1.2 + sL * sFSq * 1.3 + 14*s);

  // FOOTER
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.17)'; ctx.font = `900 ${Math.round(21*s)}px system-ui,sans-serif`;
  ctx.fillText('FILMONS · Built for creators.', W / 2, H - 52*s);
}

// ── Render: Square (1080 × 1080) — split left/right ──────────────────────────

function renderSquare(
  ctx: CanvasRenderingContext2D, W: number, H: number, PAD: number, GAP: number, COR: number,
  p: CreatorCardProps, imgs: (HTMLImageElement | null)[], av: HTMLImageElement | null,
  qrc: HTMLCanvasElement, qrSize: number,
) {
  const s = W / 1080;
  const splitX = Math.round(455*s);

  // COLLAGE — right panel (full height)
  const colX = splitX + Math.round(20*s);
  collage(ctx, imgs, colX, 0, W - colX, H, 0, GAP);

  // Right-panel headline overlay
  const rTopGrad = ctx.createLinearGradient(0, 0, 0, H * 0.38);
  rTopGrad.addColorStop(0, 'rgba(0,0,0,0.68)'); rTopGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rTopGrad; ctx.fillRect(colX, 0, W - colX, H * 0.38);
  const rhFS = Math.round(28*s);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `800 ${rhFS}px system-ui,sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  wrapText(ctx, 'My Filmons Portfolio', colX + PAD * 0.7, 65*s, W - colX - PAD, rhFS * 1.28, 2);

  // Right-panel chips + gradient
  const rcH = Math.round(76*s), rcW = Math.round(178*s), rcGap = Math.round(9*s);
  const rcTW = rcW * 3 + rcGap * 2, rcX0 = colX + ((W - colX) - rcTW) / 2, rcY = H - rcH - 24*s;
  const rBotGrad = ctx.createLinearGradient(0, H * 0.68, 0, H);
  rBotGrad.addColorStop(0, 'rgba(0,0,0,0)'); rBotGrad.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = rBotGrad; ctx.fillRect(colX, H * 0.68, W - colX, H * 0.32);
  const stats = [
    { l: 'Views', v: formatCount(p.viewCount) },
    { l: 'Followers', v: formatCount(p.followerCount) },
    { l: 'Projects', v: formatCount(p.worksCount) },
  ];
  stats.forEach((st, i) => chip(ctx, rcX0 + i * (rcW + rcGap), rcY, rcW, rcH, st.v, st.l, Math.round(10*s)));

  // LEFT PANEL — dark gradient
  const lGrad = ctx.createLinearGradient(0, 0, splitX + 80*s, 0);
  lGrad.addColorStop(0, 'rgba(0,0,0,0.97)'); lGrad.addColorStop(0.82, 'rgba(0,0,0,0.92)'); lGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lGrad; ctx.fillRect(0, 0, splitX + 80*s, H);

  // FILMONS
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = `900 ${Math.round(22*s)}px system-ui,sans-serif`;
  ctx.fillText('FILMONS', PAD, 50*s);

  // HEADLINE
  const hFS = Math.round(34*s);
  ctx.fillStyle = '#fff'; ctx.font = `900 ${hFS}px system-ui,sans-serif`;
  ctx.textBaseline = 'alphabetic';
  const hl = wrapText(ctx, 'Hey, see my creations in my Filmons portfolio.', PAD, 100*s, splitX - PAD * 2, hFS * 1.22, 4);

  // AVATAR + info
  const avR = Math.round(52*s), avCX = PAD + avR, avCY = 100*s + hl * hFS * 1.22 + 58*s;
  avatar(ctx, av, avCX, avCY, avR, p.name);

  let ctY = avCY - avR * 0.65;
  const ctX = avCX + avR + 15*s;
  const nFS = Math.round(27*s);
  ctx.fillStyle = '#fff'; ctx.font = `900 ${nFS}px system-ui,sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(p.name, ctX, ctY + nFS); ctY += nFS * 1.2;
  if (p.username) {
    const uFS = Math.round(17*s);
    ctx.fillStyle = 'rgba(255,255,255,0.52)'; ctx.font = `500 ${uFS}px system-ui,sans-serif`;
    ctx.fillText(`@${p.username}`, ctX, ctY); ctY += uFS * 1.5;
  }
  if (p.primaryRole) {
    const rFS = Math.round(15*s);
    ctx.fillStyle = '#93c5fd'; ctx.font = `700 ${rFS}px system-ui,sans-serif`;
    ctx.fillText(p.primaryRole, ctX, ctY); ctY += rFS * 1.8;
  }
  if (p.location) {
    const lFS = Math.round(14*s);
    ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.font = `400 ${lFS}px system-ui,sans-serif`;
    ctx.fillText(`📍 ${p.location}`, ctX, ctY);
  }

  // STAT CHIPS — vertical on left panel
  const vCH = Math.round(62*s), vCW = splitX - PAD * 2, vCGap = Math.round(9*s), vCR = Math.round(11*s);
  const vCY0 = avCY + avR + 36*s;
  stats.forEach((st, i) => {
    const cy = vCY0 + i * (vCH + vCGap);
    ctx.save(); rr(ctx, PAD, cy, vCW, vCH, vCR);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    const vFS = Math.round(vCH * 0.38), lFS2 = Math.round(vCH * 0.24);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = `800 ${vFS}px system-ui,sans-serif`;
    const vW = ctx.measureText(st.v).width;
    ctx.fillText(st.v, PAD + 16*s, cy + vCH / 2 - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.44)'; ctx.font = `500 ${lFS2}px system-ui,sans-serif`;
    ctx.fillText(st.l, PAD + 16*s + vW + 8*s, cy + vCH / 2);
  });

  // QR at bottom
  const qrDS = Math.round(qrSize * 0.82), qrY0 = H - PAD - qrDS - 44*s;
  const qrBP = 10*s;
  ctx.save(); rr(ctx, PAD - qrBP, qrY0 - qrBP, qrDS + qrBP * 2, qrDS + qrBP * 2, COR);
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.restore();
  ctx.drawImage(qrc, PAD, qrY0, qrDS, qrDS);

  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.font = `400 ${Math.round(14*s)}px monospace,system-ui`;
  ctx.fillText(p.displayUrl.replace(/^https?:\/\//, ''), PAD, qrY0 + qrDS + 22*s);

  ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.font = `900 ${Math.round(14*s)}px system-ui,sans-serif`;
  ctx.fillText('FILMONS', PAD, H - 22*s);
}

// ── Render: Landscape (1600 × 900) — left panel / right collage ───────────────

function renderLandscape(
  ctx: CanvasRenderingContext2D, W: number, H: number, PAD: number, GAP: number, COR: number,
  p: CreatorCardProps, imgs: (HTMLImageElement | null)[], av: HTMLImageElement | null,
  qrc: HTMLCanvasElement, qrSize: number,
) {
  const s = W / 1600;
  const splitX = Math.round(560*s);
  const colX = splitX + Math.round(18*s);

  // COLLAGE — right panel
  collage(ctx, imgs, colX, 0, W - colX, H, 0, GAP);

  // Headline overlay on collage
  const colTopGrad = ctx.createLinearGradient(0, 0, 0, H * 0.38);
  colTopGrad.addColorStop(0, 'rgba(0,0,0,0.68)'); colTopGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = colTopGrad; ctx.fillRect(colX, 0, W - colX, H * 0.38);
  const hFS2 = Math.round(32*s);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `800 ${hFS2}px system-ui,sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  wrapText(ctx, 'Hey, see my creations in my Filmons portfolio.', colX + PAD * 0.7, 65*s, W - colX - PAD, hFS2 * 1.25, 2);

  // Chips overlay on collage bottom
  const cBotGrad = ctx.createLinearGradient(0, H * 0.65, 0, H);
  cBotGrad.addColorStop(0, 'rgba(0,0,0,0)'); cBotGrad.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = cBotGrad; ctx.fillRect(colX, H * 0.65, W - colX, H * 0.35);
  const cCW = Math.round(196*s), cCH = Math.round(78*s), cCGap = Math.round(11*s);
  const cCTW = cCW * 3 + cCGap * 2, cCX0 = colX + ((W - colX) - cCTW) / 2, cCY = H - cCH - PAD * 0.7;
  const stats = [
    { l: 'Views', v: formatCount(p.viewCount) },
    { l: 'Followers', v: formatCount(p.followerCount) },
    { l: 'Projects', v: formatCount(p.worksCount) },
  ];
  stats.forEach((st, i) => chip(ctx, cCX0 + i * (cCW + cCGap), cCY, cCW, cCH, st.v, st.l, Math.round(12*s)));

  // LEFT PANEL dark overlay
  const lGrad = ctx.createLinearGradient(0, 0, splitX + 90*s, 0);
  lGrad.addColorStop(0, 'rgba(0,0,0,0.98)'); lGrad.addColorStop(0.8, 'rgba(0,0,0,0.94)'); lGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lGrad; ctx.fillRect(0, 0, splitX + 90*s, H);

  // FILMONS
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `900 ${Math.round(22*s)}px system-ui,sans-serif`;
  ctx.fillText('FILMONS', PAD, 46*s);

  // AVATAR (centered in left panel, upper 40%)
  const avR = Math.round(60*s), avCX = splitX / 2, avCY = H * 0.35;
  avatar(ctx, av, avCX, avCY, avR, p.name);

  let ctY = avCY + avR + 22*s;
  const nFS = Math.round(34*s);
  ctx.fillStyle = '#fff'; ctx.font = `900 ${nFS}px system-ui,sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(p.name, splitX / 2, ctY + nFS); ctY += nFS * 1.25;
  if (p.username) {
    const uFS = Math.round(18*s);
    ctx.fillStyle = 'rgba(255,255,255,0.52)'; ctx.font = `500 ${uFS}px system-ui,sans-serif`;
    ctx.fillText(`@${p.username}`, splitX / 2, ctY); ctY += uFS * 1.5;
  }
  if (p.primaryRole) {
    const rFS = Math.round(17*s);
    ctx.font = `700 ${rFS}px system-ui,sans-serif`;
    const rW = ctx.measureText(p.primaryRole).width + 22*s, rH = Math.round(30*s);
    ctx.save(); rr(ctx, splitX / 2 - rW / 2, ctY - rFS * 0.85, rW, rH, rH / 2);
    ctx.fillStyle = 'rgba(37,99,235,0.38)'; ctx.fill(); ctx.restore();
    ctx.fillStyle = '#93c5fd'; ctx.fillText(p.primaryRole, splitX / 2, ctY); ctY += rH + 10*s;
  }
  if (p.location) {
    const lFS = Math.round(15*s);
    ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.font = `400 ${lFS}px system-ui,sans-serif`;
    ctx.fillText(`📍 ${p.location}`, splitX / 2, ctY);
  }

  // QR (bottom of left panel)
  const qrDS = Math.round(qrSize * 0.88), qrY0 = H - PAD - qrDS - 40*s;
  const qrX0 = PAD;
  const qrBP = 10*s;
  ctx.save(); rr(ctx, qrX0 - qrBP, qrY0 - qrBP, qrDS + qrBP * 2, qrDS + qrBP * 2, COR);
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.restore();
  ctx.drawImage(qrc, qrX0, qrY0, qrDS, qrDS);

  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = `500 ${Math.round(16*s)}px system-ui,sans-serif`;
  ctx.fillText('Scan to explore portfolio', qrX0 + qrDS + 16*s, qrY0 + qrDS * 0.38);
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = `400 ${Math.round(13*s)}px monospace,system-ui`;
  ctx.fillText(p.displayUrl.replace(/^https?:\/\//, ''), qrX0 + qrDS + 16*s, qrY0 + qrDS * 0.38 + 20*s);

  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.font = `900 ${Math.round(14*s)}px system-ui,sans-serif`;
  ctx.fillText('FILMONS', PAD, H - 22*s);
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

async function renderCard(props: CreatorCardProps, format: Format): Promise<string> {
  const fmt = FORMATS.find(f => f.id === format)!;
  const W = fmt.w, H = fmt.h;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const PAD = Math.round(W * 0.065);
  const COR = Math.round(W * 0.02);
  const GAP = Math.round(W * 0.013);

  // Background
  const coverImg = props.coverUrl ? await loadSafe(props.coverUrl) : null;
  if (coverImg) {
    try {
      // ctx.filter is not supported in all browsers — graceful fallback
      ctx.filter = `blur(${Math.round(W * 0.035)}px)`;
      ctx.drawImage(coverImg, -50, -50, W + 100, H + 100);
      ctx.filter = 'none';
    } catch {
      ctx.drawImage(coverImg, 0, 0, W, H);
    }
  } else {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#030312'); bg.addColorStop(0.5, '#07091e'); bg.addColorStop(1, '#030312');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const g1 = ctx.createRadialGradient(W * 0.2, H * 0.22, 0, W * 0.2, H * 0.22, W * 0.52);
    g1.addColorStop(0, 'rgba(30,58,138,0.45)'); g1.addColorStop(1, 'rgba(30,58,138,0)');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createRadialGradient(W * 0.78, H * 0.78, 0, W * 0.78, H * 0.78, W * 0.48);
    g2.addColorStop(0, 'rgba(67,56,202,0.38)'); g2.addColorStop(1, 'rgba(67,56,202,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  }

  const ov = ctx.createLinearGradient(0, 0, 0, H);
  ov.addColorStop(0, 'rgba(0,0,0,0.78)'); ov.addColorStop(0.25, 'rgba(0,0,0,0.50)');
  ov.addColorStop(0.65, 'rgba(0,0,0,0.52)'); ov.addColorStop(1, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = ov; ctx.fillRect(0, 0, W, H);

  // Load assets
  const rawItems = (props.portfolioItems ?? []).slice(0, 4);
  const colImgs = await Promise.all(rawItems.map(u => loadSafe(u)));
  const avImg   = props.avatarUrl ? await loadSafe(props.avatarUrl) : null;

  const qrSize = Math.round(format === 'landscape' ? W * 0.115 : W * 0.175);
  const qrc = document.createElement('canvas');
  const qrUrl = props.shareUrl?.trim() || 'https://filmons.app';
  await QRCode.toCanvas(qrc, qrUrl, {
    width: qrSize, margin: 1,
    color: { dark: '#ffffff', light: '#00000000' },
  });

  if (format === 'story')     renderStory(ctx, W, H, PAD, GAP, COR, props, colImgs, avImg, qrc, qrSize);
  else if (format === 'square') renderSquare(ctx, W, H, PAD, GAP, COR, props, colImgs, avImg, qrc, qrSize);
  else                          renderLandscape(ctx, W, H, PAD, GAP, COR, props, colImgs, avImg, qrc, qrSize);

  return canvas.toDataURL('image/png', 1.0);
}

// ── Sheet component ───────────────────────────────────────────────────────────

export function CreatorCardSheet({
  onClose, ...cardProps
}: Props) {
  const [format,    setFormat]    = useState<Format>('story');
  const [dataUrl,   setDataUrl]   = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [copied,    setCopied]    = useState(false);

  const propsKey = JSON.stringify(cardProps);

  const generate = useCallback(async () => {
    setDataUrl(null);
    try {
      const url = await renderCard(cardProps, format);
      setDataUrl(url);
    } catch (e: any) {
      console.error('[CreatorCard] render failed:', e?.message ?? e);
      toast.error(`Could not generate card${e?.message ? `: ${e.message}` : ''}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, propsKey]);

  useEffect(() => { generate(); }, [generate]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `filmons-${cardProps.username ?? cardProps.name}-${format}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast.success('Card saved!');
  };

  const share = async () => {
    if (!dataUrl) return;
    setExporting(true);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'filmons-card.png', { type: 'image/png' });
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
    <>
      <style>{`
        @keyframes ccSlide{from{transform:translateY(100%);opacity:.85}to{transform:translateY(0);opacity:1}}
        .cc-shimmer{background:linear-gradient(90deg,#1a1a2e 25%,#1e1e38 50%,#1a1a2e 75%);background-size:200% 100%;animation:ccShimmer 1.4s infinite linear;}
        @keyframes ccShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>

      {/* Backdrop */}
      <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[81] bg-gray-950 rounded-t-3xl flex flex-col"
        style={{ maxHeight: '95vh', animation: 'ccSlide 0.32s cubic-bezier(0.32,0.72,0,1)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8 shrink-0">
          <div>
            <h3 className="text-sm font-black text-white">Creator Card</h3>
            <p className="text-[10px] text-white/35 mt-0.5">Download &amp; share your portfolio</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* Format tabs */}
        <div className="flex gap-2 px-4 pt-3 pb-2 shrink-0">
          {FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={`flex-1 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                format === f.id
                  ? 'bg-white text-gray-900'
                  : 'bg-white/8 text-white/50 hover:bg-white/12'
              }`}
            >
              <span className="block">{f.label}</span>
              <span className={`block text-[9px] mt-0.5 font-semibold ${format === f.id ? 'text-gray-500' : 'text-white/25'}`}>{f.badge}</span>
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Preview */}
          <div className="flex justify-center mb-4">
            <div
              className="relative rounded-2xl overflow-hidden shadow-2xl w-full max-w-[280px]"
              style={{ aspectRatio: fmt.aspect, background: '#07091e' }}
            >
              {dataUrl ? (
                <img src={dataUrl} alt="Creator card preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full cc-shimmer" />
              )}

              {/* Loading indicator */}
              {!dataUrl && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Format info */}
          <p className="text-center text-[10px] text-white/25 font-mono mb-4">
            {fmt.w} × {fmt.h} · PNG
          </p>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={share}
              disabled={!dataUrl || exporting}
              className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white disabled:opacity-40 active:scale-[0.97] transition-all"
              style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}
            >
              {exporting
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Share2 className="w-4 h-4" />}
              Share
            </button>
            <button
              onClick={download}
              disabled={!dataUrl}
              className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white/80 bg-white/8 border border-white/10 disabled:opacity-40 active:scale-[0.97] transition-all"
            >
              <Download className="w-4 h-4" /> Save PNG
            </button>
            <button
              onClick={copyLink}
              className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm text-white/70 bg-white/8 border border-white/10 active:scale-[0.97] transition-all"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              Copy Link
            </button>
            <button
              onClick={generate}
              disabled={!dataUrl}
              className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm text-white/70 bg-white/8 border border-white/10 disabled:opacity-40 active:scale-[0.97] transition-all"
            >
              <RefreshCw className="w-4 h-4" /> Regenerate
            </button>
          </div>

          {/* URL display */}
          <div className="px-4 py-3 bg-white/5 rounded-2xl border border-white/8">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-wide mb-1">Portfolio link</p>
            <p className="text-xs text-white/60 font-mono truncate">
              {cardProps.displayUrl.replace(/^https?:\/\//, '')}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
