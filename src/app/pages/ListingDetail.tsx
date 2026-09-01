import { useParams, useNavigate, useSearchParams, useLocation, Link } from 'react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { listingsApi, authApi, reviewsApi, chatApi } from '../lib/api';
import { MapPin, ArrowLeft, Star, Play, Send, Heart, Link2, X, ChevronLeft, ChevronRight, User as UserIcon, Shield, Clock, Calendar, Award, Wrench, Tag, Film, MessageCircle, DollarSign, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Listing, User, Review } from '../types';
import { useAuth } from '../context/AuthContext';
import { RentRequestModal } from '../components/RentRequestModal';
import { ApplyModal } from '../components/ApplyModal';
import { boostApi } from '../lib/boostApi';
import { UserAvatar } from '../components/AccountTypeBadge';

// ── Lightbox ──────────────────────────────────────────────────────────────
function Lightbox({ items, startIndex, onClose }: {
  items: { url: string; type: 'image' | 'video' }[];
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const prev = () => setIdx(i => (i - 1 + items.length) % items.length);
  const next = () => setIdx(i => (i + 1) % items.length);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const item = items[idx];
  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10">
        <X className="w-5 h-5" />
      </button>
      {items.length > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); prev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={e => { e.stopPropagation(); next(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10">
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
      <div className="max-w-5xl max-h-screen w-full px-16" onClick={e => e.stopPropagation()}>
        {item.type === 'video'
          ? <video src={item.url} controls autoPlay className="w-full max-h-[80vh] object-contain rounded-xl" />
          : <img src={item.url} alt="" className="w-full max-h-[80vh] object-contain rounded-xl" />
        }
        {items.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-4">
            {items.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === idx ? 'bg-white' : 'bg-white/30'}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const highlightReviewId = searchParams.get('review');
  const { user, showGuestPrompt } = useAuth() as any;
  // Passed by ListingCard's handleClick (see navigate(..., { state })) so
  // the hero image/title/price can render the instant this page mounts,
  // before the real fetch below resolves -- no global full-screen loader,
  // no blank flash of nothing. Only ever a hint for the loading state;
  // `listing` (once fetched) is always the real, authoritative data.
  const preview = (location.state as { preview?: { title: string; price: number; cover: string | null; city?: string } } | null)?.preview;
  const [listing, setListing]             = useState<Listing | null>(null);
  const [host, setHost]                   = useState<User | null>(null);
  const [reviews, setReviews]             = useState<Review[]>([]);
  const [loading, setLoading]             = useState(true);
  const [rating, setRating]               = useState(5);
  const [comment, setComment]             = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [lightbox, setLightbox]           = useState<{ items: { url: string; type: 'image'|'video' }[]; index: number } | null>(null);
  const [activeImg, setActiveImg]         = useState(0);

  useEffect(() => { if (id) loadListing(id); }, [id]);

  // Notification click-through (?review=<id>) — scroll to the specific
  // review once it's loaded. Guarded so it only fires the first time
  // reviews arrive, not on every re-render.
  const scrolledToReviewRef = useRef(false);
  useEffect(() => {
    if (!highlightReviewId || scrolledToReviewRef.current || !reviews.length) return;
    const el = document.getElementById(`review-${highlightReviewId}`);
    if (el) {
      scrolledToReviewRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightReviewId, reviews]);

  const loadListing = async (listingId: string) => {
    try {
      setLoading(true);
      // Reviews only need the id from the route, not the listing itself —
      // fetch them alongside the listing instead of waiting on it first.
      const [data, reviewData] = await Promise.all([
        listingsApi.getOne(listingId),
        reviewsApi.getListingReviews(listingId),
      ]);
      setListing(data);
      setReviews(reviewData);
      boostApi.logEvent(listingId, 'view', data.boosted ? 'boosted' : 'organic', undefined, user?.id);
      const hostData = await authApi.getUserById(data.userId);
      setHost(hostData);
    } catch (error: any) {
      toast.error(error?.message || 'Listing not found');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSubmit = async () => {
    if (!user) { toast.error('Please log in to leave a review'); return; }
    if (isOwnListing) { toast.error("You can't review your own listing"); return; }
    if (!comment) { toast.error('Please enter a comment'); return; }
    setSubmitting(true);
    try {
      // create-review handles the owner notification + email itself
      // server-side once the review is actually saved — never from here.
      await reviewsApi.create({ listingId: listing?.id, userId: user.id, reviewedUserId: listing?.userId, rating, comment });
      toast.success('Review submitted!');
      setComment(''); setRating(5);
      loadListing(id!);
    } catch (e: any) { toast.error(e?.message || 'Failed to submit review'); }
    finally { setSubmitting(false); }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/listing/${listing?.id}`)
      .then(() => toast.success('Link copied!'))
      .catch(() => toast.error('Failed to copy link'));
  };

  const openLightbox = (allItems: { url: string; type: 'image'|'video' }[], index: number) => {
    setLightbox({ items: allItems, index });
  };

  // Mobile sticky Price+Apply preview -- shows the same price/action as the
  // real card below, only while that real card is out of view. Desktop is
  // untouched (the bar itself is lg:hidden, and desktop's version of this
  // section is already a `sticky top-20` sidebar that's always reachable).
  // Declared before the early returns below (loading/!listing) -- every
  // hook in a component must run on every render regardless of which
  // branch it ends up taking, or React throws "rendered more hooks than
  // during the previous render" (minified error #310) the moment a render
  // takes a different branch than the last one did.
  // A state-backed callback ref, not useRef -- the effect below was keyed
  // on [listing?.id], but loading and listing update in two separate
  // commits (loading flips to false on its own render after listing is
  // already set), so the effect could run once during the render where
  // `if (loading) return` was still hiding this element entirely (found
  // listing.id set, found priceApplyRef.current still null), and then
  // never run again since listing?.id didn't change a second time. A
  // callback ref re-fires the moment this exact DOM node actually mounts,
  // with no dependency-array timing to get wrong.
  const [priceApplyEl, setPriceApplyEl] = useState<HTMLDivElement | null>(null);
  const stickyBarRef = useRef<HTMLDivElement>(null);
  // Starts true (not false) -- the real card is always below the fold on
  // first paint (images/description/host card all come first), so the
  // preview must show immediately when the page opens, not wait for the
  // first scroll/resize check to confirm what's already obviously true.
  const [showStickyApply, setShowStickyApply] = useState(true);
  useEffect(() => {
    const el = priceApplyEl;
    if (!el) return;

    // The real section's own getBoundingClientRect(), read fresh on every
    // scroll/resize frame. "Visible" means any part of the element is
    // within the viewport slice the sticky bar doesn't cover -- both
    // edges checked, not just the top one, so a section scrolled fully
    // past (top very negative) doesn't read as visible.
    const evaluate = () => {
      const barHeight = stickyBarRef.current?.offsetHeight ?? 0;
      const rect = el.getBoundingClientRect();
      const visible = rect.top < window.innerHeight - barHeight && rect.bottom > 0;
      setShowStickyApply(!visible);
    };

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        evaluate();
      });
    };
    evaluate();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [priceApplyEl]);

  // No full-screen brand loader here on purpose -- the whole point of
  // passing `preview` through navigation state is that the image the
  // user just tapped (and its title/price, if we have them) can render
  // immediately, in the real page layout, with skeletons standing in for
  // whatever the fetch below hasn't returned yet. A direct link/refresh
  // (no `preview`) still gets this same structure, just starting from
  // an empty gray hero instead of the real photo.
  if (loading) return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              layoutId={id ? `listing-image-${id}` : undefined}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100"
            >
              {preview?.cover
                ? <img src={preview.cover} alt={preview.title} className="w-full h-full object-cover" />
                : <div className="w-full h-full animate-pulse bg-gray-100" />}
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: 0.08 }}>
              {preview ? (
                <>
                  <h1 className="text-xl font-black text-gray-900">{preview.title}</h1>
                  {preview.city && <p className="text-sm text-gray-400 mt-1">{preview.city}</p>}
                </>
              ) : (
                <div className="space-y-2">
                  <div className="h-6 w-2/3 rounded-lg bg-gray-100 animate-pulse" />
                  <div className="h-4 w-1/3 rounded-lg bg-gray-100 animate-pulse" />
                </div>
              )}
            </motion.div>
            <div className="space-y-2">
              <div className="h-4 w-full rounded-lg bg-gray-100 animate-pulse" />
              <div className="h-4 w-full rounded-lg bg-gray-100 animate-pulse" />
              <div className="h-4 w-2/3 rounded-lg bg-gray-100 animate-pulse" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
              {preview && <p className="text-lg font-black text-gray-900">${preview.price} <span className="text-xs font-normal text-gray-400">CAD</span></p>}
              <div className="h-11 rounded-xl bg-gray-100 animate-pulse" />
            </div>
            <div className="rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gray-100 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-1/2 rounded bg-gray-100 animate-pulse" />
                <div className="h-3 w-1/3 rounded bg-gray-100 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!listing) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Listing not found</h2>
        <button onClick={() => navigate('/')} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold">Back to Home</button>
      </div>
    </div>
  );

  const isOwnListing = user?.id === listing.userId;
  const avgRating = reviews.length > 0 ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;

  // Emergency indicator/countdown -- only computed off the real
  // emergencyExpiresAt timestamp (never a made-up duration), and only
  // while it's still actually in the future, matching ListingCard's own
  // isEmergency derivation so both never disagree about whether it's live.
  const isEmergencyActive = !!listing.isEmergency && !!listing.emergencyExpiresAt && new Date(listing.emergencyExpiresAt) > new Date();
  const emergencyRemainingLabel = (() => {
    if (!isEmergencyActive || !listing.emergencyExpiresAt) return null;
    const msLeft = new Date(listing.emergencyExpiresAt).getTime() - Date.now();
    const hoursLeft = Math.max(1, Math.round(msLeft / (60 * 60 * 1000)));
    if (hoursLeft <= 48) return `${hoursLeft} hour${hoursLeft === 1 ? '' : 's'} remaining`;
    return `until ${new Date(listing.emergencyExpiresAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`;
  })();
  const allMedia = [
    ...(listing.images || []).map(url => ({ url, type: 'image' as const })),
    ...(listing.videos || []).map(url => ({ url, type: 'video' as const })),
  ];

  const isOpportunity = listing.listingType === 'opportunity' || listing.listingKind === 'talent';
  const applicationsClosed = isOpportunity && (listing.opportunity?.opportunityStatus === 'applications_closed' || listing.opportunity?.opportunityStatus === 'completed');
  const actionLabel = isOpportunity ? (applicationsClosed ? 'Applications Closed' : 'Apply')
    : listing.listingType === 'service' ? 'Request Service'
    : listing.listingMode === 'sale' ? 'Request to Buy'
    : 'Request to Rent';

  const handleRequest = () => {
    if (!user) {
      // Opportunities get the friendlier in-context prompt (same
      // showGuestPrompt bottom sheet every other guest-gated action in this
      // app already uses) rather than silently bouncing to /login and
      // losing whatever they were looking at -- rental/purchase requests
      // keep the existing behavior, unchanged.
      if (isOpportunity) { showGuestPrompt('Sign in or create a FILMONS account to apply for Opportunities.'); return; }
      navigate('/login'); return;
    }
    if (isOwnListing) { toast.error("You can't request your own listing"); return; }
    setShowRequestModal(true);
  };

  const handleMessage = async () => {
    if (!user) { navigate('/login'); return; }
    if (isOwnListing || !host) return;
    const conv = await chatApi.getOrCreateDB(user.id, host.id);
    navigate(`/inbox?conv=${conv.id}`);
  };

  const workArrangementLabel = (w?: string) => w === 'onsite' ? 'On-site' : w === 'remote' ? 'Remote' : w === 'hybrid' ? 'Hybrid' : undefined;
  const dateRangeLabel = (o: NonNullable<typeof listing.opportunity>) => {
    if (!o.startDate) return o.timingType === 'flexible' ? 'Flexible' : o.timingType === 'ongoing' ? 'Ongoing' : undefined;
    const start = new Date(o.startDate + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
    if (!o.endDate || o.endDate === o.startDate) return start;
    const end = new Date(o.endDate + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
    return `${start} – ${end}`;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* ── Back bar ── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => { setSaved(s => !s); toast.success(saved ? 'Removed from saved' : 'Saved!'); }}
            className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors ${saved ? 'bg-red-50 border-red-200 text-red-500' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            <Heart className={`w-4 h-4 ${saved ? 'fill-red-500' : ''}`} />
          </button>
          <button onClick={handleCopyLink}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-gray-300 transition-colors">
            <Link2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── LEFT COLUMN ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* ── Media Gallery ── */}
            {allMedia.length > 0 && (
              <div className="space-y-2">
                {/* Main image — same layoutId as the loading-state hero
                    above and ListingCard's image, so a card tap, the
                    skeleton, and the real gallery are all one continuous
                    shared-element transition rather than three separate
                    swaps. */}
                <motion.div
                  layoutId={id ? `listing-image-${id}` : undefined}
                  transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                  className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 cursor-pointer group"
                  onClick={() => openLightbox(allMedia, activeImg)}
                >
                  {allMedia[activeImg]?.type === 'video'
                    ? <video src={allMedia[activeImg].url} className="w-full h-full object-cover" />
                    : <img src={allMedia[activeImg]?.url} alt={listing.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                  }
                  {allMedia[activeImg]?.type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center">
                        <Play className="w-6 h-6 text-gray-800 ml-1" />
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                    {activeImg + 1} / {allMedia.length}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-between px-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="w-8 h-8 bg-white/80 rounded-full flex items-center justify-center">
                      <ChevronLeft className="w-4 h-4" />
                    </div>
                    <div className="w-8 h-8 bg-white/80 rounded-full flex items-center justify-center">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </motion.div>
                {/* Thumbnails */}
                {allMedia.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {allMedia.map((m, i) => (
                      <button key={i} onClick={() => setActiveImg(i)}
                        className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-colors ${activeImg === i ? 'border-blue-500' : 'border-transparent'}`}>
                        {m.type === 'video'
                          ? <video src={m.url} className="w-full h-full object-cover" />
                          : <img src={m.url} alt="" className="w-full h-full object-cover" />
                        }
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Title + meta ── */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: 0.08 }}>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                  isOpportunity ? 'bg-indigo-600 text-white'
                  : listing.listingType === 'service' ? 'bg-purple-100 text-purple-700'
                  : listing.listingMode === 'sale'  ? 'bg-orange-100 text-orange-700'
                  : 'bg-blue-100 text-blue-700'
                }`}>
                  {isOpportunity ? 'OPPORTUNITY'
                   : listing.listingType === 'service' ? <><Wrench className="w-3 h-3"/> Service</>
                   : listing.listingMode === 'sale' ? <><Tag className="w-3 h-3"/> For Sale</>
                   : <><Film className="w-3 h-3"/> Rental</>}
                </span>
                {reviews.length > 0 && (
                  <span className="flex items-center gap-1 text-sm text-gray-600">
                    <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                    <span className="font-semibold">{avgRating.toFixed(1)}</span>
                    <span className="text-gray-400">({reviews.length})</span>
                  </span>
                )}
              </div>
              {isEmergencyActive && (
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-red-500 text-white">
                    <AlertTriangle className="w-3 h-3 fill-white" /> Emergency Listing
                  </span>
                  {emergencyRemainingLabel && (
                    <span className="text-xs font-semibold text-red-600">Emergency • {emergencyRemainingLabel}</span>
                  )}
                </div>
              )}
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{listing.title}</h1>
              {listing.city && (
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <MapPin className="w-4 h-4" />
                  {[listing.streetAddress, listing.city, listing.province].filter(Boolean).join(', ')}
                </div>
              )}
              {listing.tags && listing.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {listing.tags.map(tag => (
                    <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{tag.replace(/_/g, ' ')}</span>
                  ))}
                </div>
              )}
            </motion.div>

            {/* ── Host ── */}
            {host && (
              <Link to={`/host/${host.id}`}
                className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 shrink-0">
                  {host.avatar
                    ? <img src={host.avatar} alt={host.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><UserIcon className="w-6 h-6 text-gray-400" /></div>
                  }
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-0.5">Listed by</p>
                  <p className="font-bold text-gray-900">{host.name}</p>
                  {host.isVerified && <p className="text-xs text-green-600 font-medium flex items-center gap-1"><Shield className="w-3 h-3" /> Verified</p>}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            )}

            {/* ── Description ── */}
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">{isOpportunity ? 'About the Opportunity' : 'About this listing'}</h2>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{listing.description}</p>
            </div>

            {/* ── Opportunity: Role / Requirements / Application ── */}
            {isOpportunity && listing.opportunity && (
              <>
                {(listing.opportunity.roleNeeded || listing.opportunity.numPeopleNeeded) && (
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-3">Role</h2>
                    <div className="grid gap-3">
                      {listing.opportunity.roleNeeded && (
                        <div className="flex gap-3 p-4 bg-gray-50 rounded-2xl">
                          <UserIcon className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                          <div><p className="font-semibold text-gray-800 text-sm mb-0.5">Role needed</p><p className="text-sm text-gray-600">{listing.opportunity.roleNeeded}</p></div>
                        </div>
                      )}
                      {listing.opportunity.numPeopleNeeded && (
                        <div className="flex gap-3 p-4 bg-gray-50 rounded-2xl">
                          <UserIcon className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                          <div><p className="font-semibold text-gray-800 text-sm mb-0.5">People needed</p><p className="text-sm text-gray-600">{listing.opportunity.numPeopleNeeded}</p></div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-3">Requirements</h2>
                  <div className="grid gap-3">
                    <div className="flex gap-3 p-4 bg-gray-50 rounded-2xl">
                      <Award className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                      <div><p className="font-semibold text-gray-800 text-sm mb-0.5">Experience</p><p className="text-sm text-gray-600 capitalize">{listing.opportunity.experienceLevel || 'Any level'}</p></div>
                    </div>
                    {listing.opportunity.skills && listing.opportunity.skills.length > 0 && (
                      <div className="flex gap-3 p-4 bg-gray-50 rounded-2xl">
                        <Award className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                        <div><p className="font-semibold text-gray-800 text-sm mb-1">Skills</p>
                          <div className="flex flex-wrap gap-1.5">{listing.opportunity.skills.map(s => <span key={s} className="text-xs bg-white text-gray-600 px-2 py-1 rounded-full border border-gray-200">{s}</span>)}</div>
                        </div>
                      </div>
                    )}
                    {listing.opportunity.equipmentRequirement && (
                      <div className="flex gap-3 p-4 bg-gray-50 rounded-2xl">
                        <Award className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                        <div><p className="font-semibold text-gray-800 text-sm mb-0.5">Equipment</p>
                          <p className="text-sm text-gray-600">
                            {listing.opportunity.equipmentRequirement === 'provided' ? 'Equipment provided' : listing.opportunity.equipmentRequirement === 'own' ? (listing.opportunity.equipmentDetails || 'Applicant should have their own equipment') : 'Either'}
                          </p>
                        </div>
                      </div>
                    )}
                    {listing.opportunity.portfolioRequired && (
                      <div className="flex gap-3 p-4 bg-gray-50 rounded-2xl">
                        <Award className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                        <div><p className="font-semibold text-gray-800 text-sm">Portfolio required</p></div>
                      </div>
                    )}
                  </div>
                </div>

                {listing.opportunity.applicationConfig && (
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-3">Application</h2>
                    <div className="flex flex-wrap gap-2">
                      {[
                        listing.opportunity.applicationConfig.requireProfile && 'Filmons Profile',
                        listing.opportunity.applicationConfig.requirePortfolio && 'Portfolio',
                        listing.opportunity.applicationConfig.requireMessage && 'Short Message',
                        listing.opportunity.applicationConfig.requireResume && 'Resume',
                        listing.opportunity.applicationConfig.requireDemoReel && 'Demo Reel / Work Sample',
                        listing.opportunity.applicationConfig.requireAvailability && 'Availability',
                        listing.opportunity.applicationConfig.requireExpectedRate && 'Expected Rate',
                      ].filter(Boolean).map(f => <span key={f as string} className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-1.5 rounded-full">{f}</span>)}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Pricing packages (service) ── */}
            {listing.pricingPackages && listing.pricingPackages.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-3">Packages</h2>
                <div className="grid gap-3">
                  {listing.pricingPackages.map((pkg, i) => (
                    <div key={i} className={`p-4 rounded-2xl border-2 ${pkg.tier === 'deluxe' ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pkg.tier === 'deluxe' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                            {pkg.tier.charAt(0).toUpperCase() + pkg.tier.slice(1)}
                          </span>
                          {pkg.name && <p className="font-bold text-gray-900 mt-1.5">{pkg.name}</p>}
                          {pkg.description && <p className="text-sm text-gray-600 mt-1">{pkg.description}</p>}
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-xl font-black text-blue-600">${pkg.price}</p>
                          <p className="text-xs text-gray-400">CAD</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Things to know ── */}
            {(listing.workingHours || listing.requirements || listing.cancellation) && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-3">Things to know</h2>
                <div className="grid gap-3">
                  {listing.workingHours && (
                    <div className="flex gap-3 p-4 bg-gray-50 rounded-2xl">
                      <Clock className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                      <div><p className="font-semibold text-gray-800 text-sm mb-0.5">Availability</p><p className="text-sm text-gray-600">{listing.workingHours}</p></div>
                    </div>
                  )}
                  {listing.requirements && (
                    <div className="flex gap-3 p-4 bg-gray-50 rounded-2xl">
                      <Award className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                      <div><p className="font-semibold text-gray-800 text-sm mb-0.5">Requirements</p><p className="text-sm text-gray-600 whitespace-pre-wrap">{listing.requirements}</p></div>
                    </div>
                  )}
                  {listing.cancellation && (
                    <div className="flex gap-3 p-4 bg-gray-50 rounded-2xl">
                      <Calendar className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                      <div><p className="font-semibold text-gray-800 text-sm mb-0.5">Cancellation</p><p className="text-sm text-gray-600 whitespace-pre-wrap">{listing.cancellation}</p></div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Reviews ── */}
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-3">
                Reviews {reviews.length > 0 && <span className="text-gray-400 font-normal">({reviews.length})</span>}
              </h2>
              {reviews.length > 0 ? (
                <div className="space-y-4">
                  {reviews.map(review => (
                    <div key={review.id} id={`review-${review.id}`}
                      className={`border-b border-gray-100 pb-4 last:border-0 transition-colors ${
                        highlightReviewId === review.id ? 'bg-amber-50 -mx-3 px-3 py-2 rounded-xl' : ''
                      }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <UserAvatar user={{ name: review.userName, avatar: review.userAvatar, id: review.userId }} size={36} />
                          <div>
                            <p className="font-semibold text-sm text-gray-900">{review.userName}</p>
                            <p className="text-xs text-gray-400">{new Date(review.createdAt).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}</p>
                          </div>
                        </div>
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, i) => <Star key={i} className={`w-3.5 h-3.5 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />)}
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{review.comment}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-2xl">
                  <Star className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No reviews yet — be the first!</p>
                </div>
              )}

              {/* Write review */}
              {user && !isOwnListing && (
                <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="font-semibold text-sm text-gray-900 mb-3">Write a review</p>
                  <div className="flex items-center gap-1 mb-3">
                    {[...Array(5)].map((_, i) => (
                      <button key={i} type="button" onClick={() => setRating(i + 1)}>
                        <Star className={`w-6 h-6 transition-colors ${i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea value={comment} onChange={e => setComment(e.target.value)}
                    placeholder="Share your experience…" rows={3} maxLength={500}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3" />
                  <button onClick={handleReviewSubmit} disabled={submitting || !comment.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                    {submitting ? 'Submitting…' : 'Submit Review'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">
              {/* Pricing / Opportunity summary card */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                {/* setPriceApplyEl wraps only the price display + CTA button --
                    not the whole card (which also has trust badges and
                    share/message buttons below). Observing the whole card
                    let the sticky preview hide as soon as its top edge (the
                    price line) merely peeked into view, well before the
                    actual button further down was reachable -- "leaving at
                    the wrong time." This narrows it to exactly the section
                    the preview is meant to stand in for. */}
                <div ref={setPriceApplyEl}>
                {isOpportunity && listing.opportunity ? (
                  <div className="mb-4 space-y-2.5 text-sm">
                    {(listing.city || listing.opportunity.workArrangement) && (
                      <div className="flex items-center gap-2 text-gray-700"><MapPin className="w-3.5 h-3.5 text-gray-400" />
                        {[listing.city && [listing.city, listing.province].filter(Boolean).join(', '), workArrangementLabel(listing.opportunity.workArrangement)].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-gray-700">
                      <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                      {listing.opportunity.paid ? <span className="font-bold text-gray-900">${listing.price} {listing.opportunity.currency || 'CAD'}</span> : <span className="font-semibold">Unpaid / Collaboration</span>}
                    </div>
                    {dateRangeLabel(listing.opportunity) && (
                      <div className="flex items-center gap-2 text-gray-700"><Clock className="w-3.5 h-3.5 text-gray-400" /> {dateRangeLabel(listing.opportunity)}</div>
                    )}
                    {!listing.opportunity.noDeadline && listing.opportunity.applicationDeadline && (
                      <div className="flex items-center gap-2 text-gray-700"><Clock className="w-3.5 h-3.5 text-gray-400" /> Apply by {new Date(listing.opportunity.applicationDeadline + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</div>
                    )}
                  </div>
                ) : listing.price > 0 && (
                  <div className="mb-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-gray-900">${listing.price}</span>
                      <span className="text-gray-500 text-sm">
                        {listing.listingMode === 'sale' ? 'CAD' : listing.listingType === 'service' ? '/ hr CAD' : '/ day CAD'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">+ Filmons Fee and applicable taxes</p>
                    {reviews.length > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                        <span className="font-bold text-sm">{avgRating.toFixed(1)}</span>
                        <span className="text-gray-400 text-sm">· {reviews.length} review{reviews.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>
                )}

                <button onClick={handleRequest} disabled={applicationsClosed}
                  className={`w-full flex items-center justify-center gap-2 text-white font-bold py-3.5 rounded-xl transition-colors text-sm ${
                    applicationsClosed ? 'bg-gray-300 cursor-not-allowed' : isOpportunity ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}>
                  {!applicationsClosed && <Send className="w-4 h-4" />} {actionLabel}
                </button>
                </div>

                <div className="mt-4 space-y-2 text-xs text-gray-500">
                  {isOpportunity ? (
                    <div className="flex items-center gap-2"><MessageCircle className="w-3.5 h-3.5 text-blue-500" /> Messages through Filmons</div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-green-500" /> Secure booking</div>
                      <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-blue-500" /> Response within 24 hours</div>
                    </>
                  )}
                  {host?.isVerified && <div className="flex items-center gap-2"><Star className="w-3.5 h-3.5 text-yellow-500" /> Verified seller</div>}
                </div>

                <div className="border-t border-gray-100 mt-4 pt-4 space-y-2">
                  {isOpportunity && (
                    <button onClick={handleMessage}
                      className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50 transition-colors font-medium">
                      <MessageCircle className="w-4 h-4" /> Message
                    </button>
                  )}
                  <button onClick={handleCopyLink}
                    className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50 transition-colors font-medium">
                    <Link2 className="w-4 h-4" /> {isOpportunity ? 'Share' : 'Copy link'}
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile sticky Price+Apply preview — same price/action as the real
           card above, scroll-driven so it's never shown at the same time as
           the real one. lg:hidden: desktop's version of this section is
           already a sticky sidebar, always in view there. ── */}
      <div
        ref={stickyBarRef}
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] px-4 py-3 flex items-center justify-between gap-3"
        style={{
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
          // Inline, not Tailwind's transition-all/translate-y-*/opacity-*
          // classes -- this app has a global `*` rule (src/styles/theme.css)
          // that force-overrides transition-property on every element to a
          // fixed list that does NOT include `transform` (unlayered CSS
          // always beats Tailwind's layered utilities, a documented,
          // established gotcha ShareCard.tsx already had to work around the
          // same way). That silently drops the slide animation and, more
          // importantly, is exactly the kind of external-rule interference
          // that inline styles are immune to -- inline style always wins
          // over any stylesheet rule, layered or not, no exceptions.
          transition: 'transform 220ms ease-out, opacity 220ms ease-out',
          transform: showStickyApply ? 'translateY(0)' : 'translateY(100%)',
          opacity: showStickyApply ? 1 : 0,
          pointerEvents: showStickyApply ? 'auto' : 'none',
        }}
        aria-hidden={!showStickyApply}
      >
        <div className="min-w-0">
          {isOpportunity && listing.opportunity ? (
            listing.opportunity.paid ? (
              <p className="text-lg font-black text-gray-900 truncate">${listing.price} <span className="text-xs font-semibold text-gray-400">{listing.opportunity.currency || 'CAD'}</span></p>
            ) : (
              <p className="text-sm font-bold text-gray-700">Unpaid / Collaboration</p>
            )
          ) : listing.price > 0 ? (
            <p className="text-lg font-black text-gray-900 truncate">
              ${listing.price} <span className="text-xs font-semibold text-gray-400">
                {listing.listingMode === 'sale' ? 'CAD' : listing.listingType === 'service' ? '/ hr CAD' : '/ day CAD'}
              </span>
            </p>
          ) : null}
        </div>
        <button onClick={handleRequest} disabled={applicationsClosed}
          className={`shrink-0 flex items-center justify-center gap-1.5 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm ${
            applicationsClosed ? 'bg-gray-300 cursor-not-allowed' : isOpportunity ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}>
          {actionLabel}
        </button>
      </div>

      {/* Lightbox */}
      {lightbox && <Lightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} />}

      {/* Request / Apply modal — Opportunity listings never enter the rental-
          request → Checkout → RentalAgreement path; applying is a separate,
          payment-free action. */}
      {showRequestModal && listing && host && (
        isOpportunity
          ? <ApplyModal listing={listing} host={host} onClose={() => setShowRequestModal(false)} />
          : <RentRequestModal listing={listing} host={host} onClose={() => setShowRequestModal(false)} />
      )}
    </div>
  );
}