/**
 * FILMONS Listing ShareCard — same design system and export/share machinery
 * as the Profile ShareCard (ShareCard.tsx), adapted for sharing a single
 * marketplace listing. See shareCardKit.tsx for what's actually shared.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Copy, Check, Share2, Download, MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Listing, User } from '../types';
import { listingsApi, authApi } from '../lib/api';
import { normalizeTier } from '../lib/reliabilityApi';
import {
  EW, SF, NEUE, Photo, tierBadgeFor, shareCardNavBtn,
  shareCardTransitionCss, shareCardTransitionStyle,
  useExportImageDataUrl, waitForImgReady, captureAndShareCard,
} from '../lib/shareCardKit';

interface LP { listing: Listing; host: User | null; isExport?: boolean; hostAvatarOverride?: string }

// Same category label + color scheme as ListingCard.tsx, so this card never
// disagrees with the rest of the app about what a listing "is".
function categoryFor(listing: Listing): { label: string; bg: string } {
  const isOpportunity = listing.listingType === 'opportunity' || listing.listingKind === 'talent';
  if (isOpportunity) return { label: 'OPPORTUNITY', bg: '#4f46e5' };
  if (listing.listingType === 'service') return { label: 'SERVICE', bg: '#7c3aed' };
  if (listing.listingMode === 'sale') return { label: 'FOR SALE', bg: '#ea580c' };
  return { label: 'GEAR', bg: '#2563eb' };
}

// Same compensation logic as ListingCard.tsx / SwipeStack.tsx / ListingDetail.tsx
// (Home card, price section, sticky bar) -- deliberately not a separate
// formatter, so ShareCard can never drift from what those already show.
function priceFor(listing: Listing): { text: string; negotiate: boolean } {
  const isOpportunity = listing.listingType === 'opportunity' || listing.listingKind === 'talent';
  if (isOpportunity && listing.opportunity) {
    if (!listing.opportunity.paid) return { text: 'Unpaid / Collaboration', negotiate: false };
    if (listing.opportunity.compensationType === 'negotiable') return { text: 'Negotiate your rate', negotiate: true };
    const unit = listing.opportunity.compensationType === 'hourly' ? '/hr' : listing.opportunity.compensationType === 'daily' ? '/day' : '';
    return { text: `$${listing.price} ${listing.opportunity.currency || 'CAD'}${unit}`, negotiate: false };
  }
  if (listing.listingMode === 'sale') return { text: `$${Number(listing.price).toLocaleString()} CAD`, negotiate: false };
  if (listing.listingType === 'service') return { text: `$${listing.price} CAD/hr`, negotiate: false };
  return { text: `$${listing.price} CAD/day`, negotiate: false };
}

function ListingCardArt({ listing, host, isExport: X, hostAvatarOverride }: LP) {
  const isOpportunity = listing.listingType === 'opportunity' || listing.listingKind === 'talent';
  const category = categoryFor(listing);
  const price = priceFor(listing);
  const cover = listing.image || listing.images?.find(i => typeof i === 'string' && i.length > 10) || '';
  const location = [listing.city, listing.province].filter(Boolean).join(', ');
  const hostTierBadge = tierBadgeFor(normalizeTier(host?.accountType));
  const ctaLabel = isOpportunity ? 'View opportunity on FILMONS' : 'View on FILMONS';

  return (
    <div style={{
      width: X ? EW : '100%', aspectRatio: '9 / 16', background: '#F5F5F3',
      padding: X ? '32px 100px' : '3% 9.3%', fontFamily: SF,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{
        background: '#ffffff', borderRadius: X ? '80px' : '7.4%',
        overflow: 'hidden', boxShadow: '0px 5px 15px rgba(0, 0, 0, 0.35)',
      }}>
        {/* FILMONS wordmark — same treatment as ProfileCard */}
        <div style={{ padding: X ? '46px 56px 0' : '4.3% 5.2% 0', textAlign: 'left' }}>
          <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.06em',
            color: '#0f1115', fontSize: X ? 24 : 'clamp(9px, 2.2%, 24px)',
            textTransform: 'uppercase' as const }}>FILMONS</span>
        </div>

        {/* Hero — the listing's own cover photo, large and dominant (unlike
            ProfileCard, this is the primary visual, not a supporting one) --
            a taller slice than the profile hero (4:3 vs 16:10) plus the
            category pill and a bottom gradient so it reads at a glance. */}
        <div style={{
          position: 'relative', margin: X ? '22px 56px 0' : '2% 5.2% 0',
          aspectRatio: '4 / 3', borderRadius: X ? '44px' : '4.1%', overflow: 'hidden',
        }} className="sc-cover-photo">
          <Photo src={cover} alt={listing.title} style={{ width: '100%', height: '100%' }} exportMode={X} />
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent)',
          }} />
          <span style={{
            position: 'absolute', top: X ? 20 : '3.2%', left: X ? 20 : '3.2%',
            display: 'inline-flex', alignItems: 'center', color: '#ffffff', fontWeight: 800,
            letterSpacing: '0.05em', padding: X ? '7px 16px' : '0.7% 1.5%', borderRadius: 999,
            fontSize: X ? 17 : 'clamp(6px, 1.6%, 17px)', background: category.bg,
          }}>{category.label}</span>
        </div>

        {/* Info — title / location / price / host row / CTA, same rhythm
            (padding, gaps) as ProfileCard's info block. */}
        <div style={{ padding: X ? '22px 56px 46px' : '2% 5.2% 4.3%', textAlign: 'left' }}>
          <p style={{ margin: 0, color: '#0f1115', fontWeight: 700, letterSpacing: '-0.02em',
            fontSize: X ? 44 : 'clamp(16px, 4.1%, 44px)', lineHeight: 1.15,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
            {listing.title}
          </p>

          {location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%', marginTop: X ? '10px' : '0.9%' }}>
              <MapPin size={X ? 17 : 14} color="#9ca3af" strokeWidth={2} />
              <span style={{ color: '#6b7280', fontWeight: 500, fontSize: X ? 20 : 'clamp(7px, 1.9%, 20px)' }}>{location}</span>
            </div>
          )}

          <p style={{
            margin: 0, marginTop: X ? '14px' : '1.3%', fontWeight: 800,
            fontSize: X ? 34 : 'clamp(12px, 3.1%, 34px)',
            color: price.negotiate ? '#4338ca' : '#0f1115',
          }}>{price.text}</p>

          {/* Host row — compact avatar + name + the same Business > Professional
              > Creator+ > Creator badge priority as AccountTypeBadge.tsx. */}
          {host && (
            <div style={{ display: 'flex', alignItems: 'center', gap: X ? '12px' : '1.1%', marginTop: X ? '22px' : '2%' }}>
              <div style={{ width: X ? 56 : '5.2%', aspectRatio: '1 / 1', borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }} className="sc-host-avatar">
                <Photo src={hostAvatarOverride ?? (host.avatar || '')} alt={host.name} style={{ width: '100%', height: '100%' }} exportMode={X} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: X ? '8px' : '0.7%', flexWrap: 'wrap' as const }}>
                <span style={{ color: '#0f1115', fontWeight: 700, fontSize: X ? 22 : 'clamp(8px, 2%, 22px)' }}>{host.name}</span>
                {hostTierBadge && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', flexShrink: 0,
                    padding: X ? '4px 12px' : '0.4% 1.1%', borderRadius: 999, color: '#ffffff', fontWeight: 700,
                    fontSize: X ? 15 : 'clamp(6px, 1.4%, 15px)', background: hostTierBadge.bg,
                  }}>{hostTierBadge.label}</span>
                )}
              </div>
            </div>
          )}

          {/* CTA — a filled pill, same color language as the app's own
              opportunity (indigo) vs. marketplace (blue) CTA buttons. */}
          <div style={{
            marginTop: X ? '26px' : '2.4%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: X ? '8px' : '0.7%', width: '100%', borderRadius: X ? '28px' : '5.2%',
            padding: X ? '18px 0' : '1.7% 0', background: isOpportunity ? '#4f46e5' : '#2563eb',
          }}>
            <span style={{ color: '#ffffff', fontWeight: 700, fontSize: X ? 22 : 'clamp(8px, 2%, 22px)' }}>{ctaLabel} →</span>
          </div>
          <p style={{ margin: 0, marginTop: X ? '14px' : '1.3%', textAlign: 'center', color: '#9ca3af', fontWeight: 600,
            fontSize: X ? 18 : 'clamp(7px, 1.7%, 18px)' }}>filmons.app</p>
        </div>
      </div>
    </div>
  );
}

export function ListingShareCard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // ListingDetail already has both the listing and its host loaded when the
  // user taps Share there -- reuse that instead of re-fetching (see
  // ListingDetail.tsx's Share button, which passes { listing, host } as
  // navigation state).
  const passed = location.state as { listing?: Listing; host?: User | null } | null;
  const [listing, setListing] = useState<Listing | null>(passed?.listing ?? null);
  const [host, setHost] = useState<User | null>(passed?.host ?? null);
  const [loading, setLoading] = useState(!passed?.listing);

  useEffect(() => {
    if (passed?.listing || !id) return;
    let cancelled = false;
    setLoading(true);
    listingsApi.getOne(id).then(async l => {
      if (cancelled) return;
      setListing(l);
      const h = await authApi.getUserById(l.userId).catch(() => null);
      if (!cancelled) setHost(h);
    }).catch(() => { if (!cancelled) toast.error('Could not load listing'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, passed?.listing]);

  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#F5F5F3';
    return () => { document.body.style.backgroundColor = prev; };
  }, []);

  const goBack = () => { setLeaving(true); setTimeout(() => navigate(-1), 320); };

  const listingUrl = listing?.id ? `${window.location.origin}/listing/${listing.id}` : window.location.origin;

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(listingUrl);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  }, [listingUrl]);

  const shareLink = useCallback(async () => {
    if (navigator.share) {
      try { await navigator.share({ title: `${listing?.title || 'Filmons'} on Filmons`, url: listingUrl }); return; } catch { /* cancelled */ }
    }
    await copyLink();
  }, [listingUrl, listing?.title, copyLink]);

  const cover = listing ? (listing.image || listing.images?.find(i => typeof i === 'string' && i.length > 10) || '') : '';
  const { dataUrl: coverDataUrl, readyRef: coverReadyRef } = useExportImageDataUrl(cover);
  const { dataUrl: hostAvatarDataUrl, readyRef: hostAvatarReadyRef } = useExportImageDataUrl(host?.avatar || '');

  const exportListing: Listing | null = listing ? { ...listing, image: coverDataUrl || cover, images: coverDataUrl ? [coverDataUrl] : listing.images } : null;

  const exportCard = useCallback(async () => {
    if (!exportRef.current || !listing || exporting) return;
    setExporting(true);
    try {
      await Promise.all([coverReadyRef.current, hostAvatarReadyRef.current]);
      // Queried by a stable class, not DOM position/index -- either Photo
      // can render a <div> fallback instead of an <img> when its src is
      // empty (no cover, or a host with no avatar), which would otherwise
      // shift a plain querySelectorAll('img')[0]/[1] index and pair the
      // wrong expected src with the wrong element.
      await Promise.all([
        waitForImgReady(exportRef.current.querySelector<HTMLImageElement>('.sc-cover-photo img'), coverDataUrl),
        waitForImgReady(exportRef.current.querySelector<HTMLImageElement>('.sc-host-avatar img'), hostAvatarDataUrl),
      ]);
      await captureAndShareCard({
        exportRef, filename: `filmons-${listing.id}.png`, shareUrl: listingUrl,
      });
    } catch (e) {
      console.error('Listing export failed:', e);
      toast.error('Could not save image');
    }
    setExporting(false);
  }, [exporting, listing, listingUrl, coverDataUrl, hostAvatarDataUrl]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F3]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!listing) return null;

  return (
    <div
      className="min-h-screen flex flex-col bg-[#F5F5F3] pb-24"
      style={shareCardTransitionStyle(leaving)}
    >
      <style>{shareCardTransitionCss}</style>

      <div className="sticky top-0 z-30 bg-transparent px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={goBack} className="w-8 h-8 flex items-center justify-center text-gray-900/50 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4"/>
        </button>
        <h1 className="text-sm font-bold text-gray-900 flex-1 tracking-wide truncate">Share Listing</h1>
        <div className="flex items-center gap-1">
          <button onClick={copyLink} title="Copy Link" className={shareCardNavBtn}>
            {copied ? <Check className="w-4 h-4"/> : <Copy className="w-4 h-4"/>}
          </button>
          <button onClick={shareLink} title="Share Link" className={shareCardNavBtn}>
            <Share2 className="w-4 h-4"/>
          </button>
          <button onClick={exportCard} disabled={exporting} title="Save Image" className={shareCardNavBtn}>
            {exporting
              ? <div className="w-3.5 h-3.5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"/>
              : <Download className="w-4 h-4"/>}
          </button>
        </div>
      </div>

      {/* Hidden export target — see ShareCard.tsx's identical comment: the
          ref'd node must carry no hiding styles of its own. */}
      <div style={{ position: 'fixed', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div ref={exportRef} style={{ width: `${EW}px` }}>
          {exportListing && <ListingCardArt listing={exportListing} host={host} isExport hostAvatarOverride={hostAvatarDataUrl || host?.avatar} />}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-3 md:p-6">
        <div style={{ width: '100%', maxWidth: '760px' }}>
          <ListingCardArt listing={listing} host={host} />
        </div>
      </div>
    </div>
  );
}
