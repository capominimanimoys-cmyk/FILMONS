import { useParams, useNavigate, Link } from 'react-router';
import { useState, useEffect, useCallback } from 'react';
import { listingsApi, authApi, reviewsApi } from '../lib/api';
import { MapPin, ArrowLeft, Star, Play, Send, Heart, Link2, X, ChevronLeft, ChevronRight, User as UserIcon, Shield, Clock, Calendar, Award } from 'lucide-react';
import { toast } from 'sonner';
import { Listing, User, Review } from '../types';
import { useAuth } from '../context/AuthContext';
import { RentRequestModal } from '../components/RentRequestModal';

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
  const { user } = useAuth();
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

  const loadListing = async (listingId: string) => {
    try {
      setLoading(true);
      const data = await listingsApi.getOne(listingId);
      setListing(data);
      const [hostData, reviewData] = await Promise.all([
        authApi.getUserById(data.userId),
        reviewsApi.getListingReviews(listingId),
      ]);
      setHost(hostData);
      setReviews(reviewData);
    } catch (error: any) {
      toast.error(error?.message || 'Listing not found');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSubmit = async () => {
    if (!user) { toast.error('Please log in to leave a review'); return; }
    if (!comment) { toast.error('Please enter a comment'); return; }
    setSubmitting(true);
    try {
      await reviewsApi.create({ listingId: listing?.id, userId: user.id, rating, comment });
      toast.success('Review submitted!');
      setComment(''); setRating(5);
      loadListing(id!);
    } catch { toast.error('Failed to submit review'); }
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

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
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
  const allMedia = [
    ...(listing.images || []).map(url => ({ url, type: 'image' as const })),
    ...(listing.videos || []).map(url => ({ url, type: 'video' as const })),
  ];

  const actionLabel = listing.listingType === 'service' ? 'Request Service'
    : listing.listingMode === 'sale' ? 'Request to Buy'
    : 'Request to Rent';

  const handleRequest = () => {
    if (!user) { navigate('/login'); return; }
    if (isOwnListing) { toast.error("You can't request your own listing"); return; }
    setShowRequestModal(true);
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
                {/* Main image */}
                <div
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
                </div>
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
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  listing.listingType === 'service' ? 'bg-purple-100 text-purple-700'
                  : listing.listingMode === 'sale'  ? 'bg-orange-100 text-orange-700'
                  : 'bg-blue-100 text-blue-700'
                }`}>
                  {listing.listingType === 'service' ? '🎥 Service'
                   : listing.listingMode === 'sale' ? '💰 For Sale'
                   : '🎬 Rental'}
                </span>
                {reviews.length > 0 && (
                  <span className="flex items-center gap-1 text-sm text-gray-600">
                    <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                    <span className="font-semibold">{avgRating.toFixed(1)}</span>
                    <span className="text-gray-400">({reviews.length})</span>
                  </span>
                )}
              </div>
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
                    <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{tag}</span>
                  ))}
                </div>
              )}
            </div>

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
              <h2 className="text-lg font-bold text-gray-900 mb-2">About this listing</h2>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{listing.description}</p>
            </div>

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
                          <p className="text-xs text-gray-400">per hour</p>
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
                    <div key={review.id} className="border-b border-gray-100 pb-4 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                            <UserIcon className="w-4 h-4 text-gray-400" />
                          </div>
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
              {/* Pricing card */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                {listing.price > 0 && (
                  <div className="mb-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-gray-900">${listing.price}</span>
                      <span className="text-gray-500 text-sm">
                        {listing.listingMode === 'sale' ? 'CAD' : listing.listingType === 'service' ? '/ hr CAD' : '/ day CAD'}
                      </span>
                    </div>
                    <p className="text-xs text-purple-500 font-medium mt-0.5">⚡ {Math.floor(listing.price / 0.04).toLocaleString()} FP</p>
                    {reviews.length > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                        <span className="font-bold text-sm">{avgRating.toFixed(1)}</span>
                        <span className="text-gray-400 text-sm">· {reviews.length} review{reviews.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>
                )}

                <button onClick={handleRequest}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-colors text-sm">
                  <Send className="w-4 h-4" /> {actionLabel}
                </button>

                <div className="mt-4 space-y-2 text-xs text-gray-500">
                  <div className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-green-500" /> Secure booking</div>
                  <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-blue-500" /> Response within 24 hours</div>
                  {host?.isVerified && <div className="flex items-center gap-2"><Star className="w-3.5 h-3.5 text-yellow-500" /> Verified seller</div>}
                </div>

                <div className="border-t border-gray-100 mt-4 pt-4">
                  <button onClick={handleCopyLink}
                    className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50 transition-colors font-medium">
                    <Link2 className="w-4 h-4" /> Copy link
                  </button>
                </div>
              </div>

              {/* Payment methods */}
              {listing.paymentMethods && listing.paymentMethods.length > 0 && (
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Accepted payments</p>
                  <div className="flex flex-wrap gap-1.5">
                    {listing.paymentMethods.map(m => (
                      <span key={m} className="text-xs bg-white border border-gray-200 text-gray-700 px-2.5 py-1 rounded-full font-medium">{m}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && <Lightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} />}

      {/* Request modal */}
      {showRequestModal && listing && host && (
        <RentRequestModal listing={listing} host={host} onClose={() => setShowRequestModal(false)} />
      )}
    </div>
  );
}