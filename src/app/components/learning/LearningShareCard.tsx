/**
 * Share card for FILMONS Learning (courses and live sessions). Same design
 * system, export and share machinery as ListingShareCard.tsx / ShareCard.tsx
 * (see lib/shareCardKit.tsx): white rounded card on #F5F5F3, FILMONS
 * wordmark, big cover, category pill, title, meta, price, instructor row,
 * filled CTA pill. Saved as a 9:16 image or shared/copied as a link.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check, Copy, Download, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeTier } from '../../lib/reliabilityApi';
import {
  EW, SF, NEUE, Photo, tierBadgeFor, shareCardNavBtn,
  shareCardTransitionCss, shareCardTransitionStyle,
  useExportImageDataUrl, waitForImgReady, captureAndShareCard,
} from '../../lib/shareCardKit';

export interface LearningShareData {
  id: string;
  /** Stable file name stem, e.g. 'course-<id>'. */
  fileKey: string;
  title: string;
  cover: string;
  pill: { label: string; bg: string };
  /** One short line under the title (level · duration, or format · duration · platform). */
  meta: string;
  priceText: string;
  instructor: { name: string; avatar: string; accountType?: string | null };
  ctaLabel: string;
  ctaBg: string;
  url: string;
  /** Header title of the page, e.g. "Share Course". */
  pageTitle: string;
}

function Art({ d, isExport: X, avatarOverride }: { d: LearningShareData; isExport?: boolean; avatarOverride?: string }) {
  const badge = tierBadgeFor(normalizeTier(d.instructor.accountType ?? undefined));
  return (
    <div style={{
      width: X ? EW : '100%', aspectRatio: '9 / 16', background: '#F5F5F3',
      padding: X ? '32px 100px' : '3% 9.3%', fontFamily: SF,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{ background: '#ffffff', borderRadius: X ? '80px' : '7.4%', overflow: 'hidden', boxShadow: '0px 5px 15px rgba(0, 0, 0, 0.35)' }}>
        <div style={{ padding: X ? '46px 56px 0' : '4.3% 5.2% 0', textAlign: 'left' }}>
          <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.06em', color: '#0f1115',
            fontSize: X ? 24 : 'clamp(9px, 2.2%, 24px)', textTransform: 'uppercase' as const }}>FILMONS Learning</span>
        </div>

        <div className="sc-cover-photo" style={{ position: 'relative', margin: X ? '22px 56px 0' : '2% 5.2% 0', aspectRatio: '4 / 3', borderRadius: X ? '44px' : '4.1%', overflow: 'hidden', background: '#111827' }}>
          <Photo src={d.cover} alt={d.title} style={{ width: '100%', height: '100%' }} exportMode={X} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%', background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent)' }} />
          <span style={{
            position: 'absolute', top: X ? 20 : '3.2%', left: X ? 20 : '3.2%', display: 'inline-flex', alignItems: 'center',
            color: '#ffffff', fontWeight: 800, letterSpacing: '0.05em', padding: X ? '7px 16px' : '0.7% 1.5%', borderRadius: 999,
            fontSize: X ? 17 : 'clamp(6px, 1.6%, 17px)', background: d.pill.bg,
          }}>{d.pill.label}</span>
        </div>

        <div style={{ padding: X ? '22px 56px 46px' : '2% 5.2% 4.3%', textAlign: 'left' }}>
          <p style={{ margin: 0, color: '#0f1115', fontWeight: 700, letterSpacing: '-0.02em', fontSize: X ? 44 : 'clamp(16px, 4.1%, 44px)', lineHeight: 1.15,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{d.title}</p>
          {d.meta && <p style={{ margin: 0, marginTop: X ? '10px' : '0.9%', color: '#6b7280', fontWeight: 500, fontSize: X ? 20 : 'clamp(7px, 1.9%, 20px)' }}>{d.meta}</p>}
          <p style={{ margin: 0, marginTop: X ? '14px' : '1.3%', fontWeight: 800, fontSize: X ? 34 : 'clamp(12px, 3.1%, 34px)', color: '#0f1115' }}>{d.priceText}</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: X ? '12px' : '1.1%', marginTop: X ? '22px' : '2%' }}>
            <div className="sc-host-avatar" style={{ width: X ? 56 : '5.2%', aspectRatio: '1 / 1', borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
              <Photo src={avatarOverride ?? d.instructor.avatar} alt={d.instructor.name} style={{ width: '100%', height: '100%' }} exportMode={X} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: X ? '8px' : '0.7%', flexWrap: 'wrap' as const }}>
              <span style={{ color: '#0f1115', fontWeight: 700, fontSize: X ? 22 : 'clamp(8px, 2%, 22px)' }}>{d.instructor.name}</span>
              {badge && <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, padding: X ? '4px 12px' : '0.4% 1.1%', borderRadius: 999, color: '#ffffff', fontWeight: 700,
                fontSize: X ? 15 : 'clamp(6px, 1.4%, 15px)', background: badge.bg }}>{badge.label}</span>}
            </div>
          </div>

          <div style={{ marginTop: X ? '26px' : '2.4%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: X ? '8px' : '0.7%', width: '100%',
            borderRadius: X ? '28px' : '5.2%', padding: X ? '18px 0' : '1.7% 0', background: d.ctaBg }}>
            <span style={{ color: '#ffffff', fontWeight: 700, fontSize: X ? 22 : 'clamp(8px, 2%, 22px)' }}>{d.ctaLabel} →</span>
          </div>
          <p style={{ margin: 0, marginTop: X ? '14px' : '1.3%', textAlign: 'center', color: '#9ca3af', fontWeight: 600, fontSize: X ? 18 : 'clamp(7px, 1.7%, 18px)' }}>filmons.app/learning</p>
        </div>
      </div>
    </div>
  );
}

export function LearningShareCardView({ data: d, fallback }: { data: LearningShareData | null; fallback?: ReactNode }) {
  const navigate = useNavigate();
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#F5F5F3';
    return () => { document.body.style.backgroundColor = prev; };
  }, []);

  const { dataUrl: coverDataUrl, readyRef: coverReadyRef } = useExportImageDataUrl(d?.cover || '');
  const { dataUrl: avatarDataUrl, readyRef: avatarReadyRef } = useExportImageDataUrl(d?.instructor.avatar || '');

  const goBack = () => { setLeaving(true); setTimeout(() => navigate(-1), 320); };
  const url = d?.url ?? window.location.origin;

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true); toast.success('Link copied!'); setTimeout(() => setCopied(false), 2000);
  }, [url]);

  const shareLink = useCallback(async () => {
    if (navigator.share) { try { await navigator.share({ title: `${d?.title || 'FILMONS Learning'} on FILMONS`, url }); return; } catch { /* cancelled */ } }
    await copyLink();
  }, [url, d?.title, copyLink]);

  const exportCard = useCallback(async () => {
    if (!exportRef.current || !d || exporting) return;
    setExporting(true);
    try {
      await Promise.all([coverReadyRef.current, avatarReadyRef.current]);
      await Promise.all([
        waitForImgReady(exportRef.current.querySelector<HTMLImageElement>('.sc-cover-photo img'), coverDataUrl),
        waitForImgReady(exportRef.current.querySelector<HTMLImageElement>('.sc-host-avatar img'), avatarDataUrl),
      ]);
      await captureAndShareCard({ exportRef, filename: `filmons-${d.fileKey}.png`, shareUrl: url });
    } catch (e) {
      console.error('Learning share export failed:', e);
      toast.error('Could not save image');
    }
    setExporting(false);
  }, [exporting, d, url, coverDataUrl, avatarDataUrl]);

  if (!d) return <>{fallback}</>;
  const exportData: LearningShareData = { ...d, cover: coverDataUrl || d.cover };

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F3] pb-24" style={shareCardTransitionStyle(leaving)}>
      <style>{shareCardTransitionCss}</style>
      <div className="sticky top-0 z-30 bg-transparent px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={goBack} aria-label="Back" className="w-8 h-8 flex items-center justify-center text-gray-900/50 hover:text-gray-900 transition-colors"><ArrowLeft className="w-4 h-4" /></button>
        <h1 className="text-sm font-bold text-gray-900 flex-1 tracking-wide truncate">{d.pageTitle}</h1>
        <div className="flex items-center gap-1">
          <button onClick={copyLink} title="Copy Link" className={shareCardNavBtn}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
          <button onClick={shareLink} title="Share Link" className={shareCardNavBtn}><Share2 className="w-4 h-4" /></button>
          <button onClick={exportCard} disabled={exporting} title="Save Image" className={shareCardNavBtn}>
            {exporting ? <div className="w-3.5 h-3.5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div style={{ position: 'fixed', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div ref={exportRef} style={{ width: `${EW}px` }}><Art d={exportData} isExport avatarOverride={avatarDataUrl || d.instructor.avatar} /></div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-3 md:p-6">
        <div style={{ width: '100%', maxWidth: '760px' }}><Art d={d} /></div>
      </div>
    </div>
  );
}
