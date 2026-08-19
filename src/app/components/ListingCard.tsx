import { useNavigate } from 'react-router';
import { Heart, Star, MapPin, MoreHorizontal, Bookmark, Share2, EyeOff, Flag, X, Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { Listing } from '../types';
import { savedListingsApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { useState, useEffect, useRef, useCallback } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface ListingCardProps {
  listing: Listing & { distance?: number };
  onClick?: () => void;
  className?: string;
  /** Called after the owner successfully deletes this listing, so the
   * parent list can remove it without waiting for a full reload. */
  onDeleted?: () => void;
}

function distanceLabel(km: number) {
  return km < 1 ? `${(km*1000).toFixed(0)} m` : `${km.toFixed(1)} km`;
}

// ── Bottom sheet menu — three-dot click and mobile long-press both open this ──
function BottomMenuSheet({ listing, saved, onSave, onClose, isOwn, onEdit, onDeleteRequest }: {
  listing: Listing; saved: boolean; onSave: () => void; onClose: () => void;
  isOwn: boolean; onEdit: () => void; onDeleteRequest: () => void;
}) {
  const sheetRef   = useRef<HTMLDivElement>(null);
  const backdropRef= useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
  }, []);

  const close = useCallback(() => {
    setShow(false);
    setTimeout(onClose, 260);
  }, [onClose]);

  const share = async () => {
    const url = `${window.location.origin}/listing/${listing.id}`;
    if (navigator.share) { try { await navigator.share({ title: listing.title, url }); } catch {} }
    else { await navigator.clipboard.writeText(url); toast.success('Link copied!'); }
    close();
  };

  const cover = listing.image ||
    (Array.isArray(listing.images) ? listing.images.find((i: any) => typeof i === 'string') : null);

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
        style={{ opacity: show ? 1 : 0, transition: 'opacity 240ms ease' }}
        onClick={close}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-[60] bg-white rounded-t-3xl shadow-2xl"
        style={{
          transform: show ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 280ms cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'calc(env(safe-area-inset-bottom)+8px)',
        }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-3" />

        {/* Listing preview */}
        <div className="flex items-center gap-3 px-4 pb-3 border-b border-gray-100">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
            {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-gray-900 truncate">{listing.title}</p>
            <p className="text-xs text-gray-400">${listing.price} CAD</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-2 space-y-1">
          {[
            ...(isOwn ? [
              { icon: <Pencil className="w-5 h-5"/>, label: 'Edit Listing', sub: 'Update photos, pricing, details, and more', color: 'text-gray-900', action: () => { close(); onEdit(); } },
              { icon: <Trash2 className="w-5 h-5"/>, label: 'Delete Listing', sub: 'Remove this listing permanently', color: 'text-red-500', action: () => { close(); onDeleteRequest(); } },
            ] : []),
            { icon: <Bookmark className="w-5 h-5"/>, label: saved ? 'Remove from saved' : 'Save listing', sub: saved ? 'Remove from your saved listings' : 'Add to your saved listings', color: 'text-gray-900', action: () => { onSave(); close(); } },
            { icon: <Share2 className="w-5 h-5"/>,   label: 'Share listing',   sub: 'Send the link to someone', color: 'text-gray-900', action: share },
            ...(isOwn ? [] : [
              { icon: <EyeOff className="w-5 h-5"/>,   label: 'Hide listing',    sub: "Don't show this listing again", color: 'text-gray-600', action: () => { toast('Listing hidden'); close(); } },
              { icon: <Flag className="w-5 h-5"/>,     label: 'Report listing',  sub: 'Scam, inappropriate, or misleading', color: 'text-red-500', action: () => { toast.info('Report submitted — thank you'); close(); } },
            ]),
          ].map((a, i) => (
            <button key={i} onClick={a.action}
              className={`w-full flex items-center gap-3 px-2 py-3 rounded-2xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left ${a.color}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                a.color === 'text-red-500' ? 'bg-red-50' : 'bg-gray-100'
              }`}>{a.icon}</div>
              <div>
                <p className={`text-sm font-semibold ${a.color}`}>{a.label}</p>
                <p className="text-xs text-gray-400">{a.sub}</p>
              </div>
            </button>
          ))}
        </div>

        <button onClick={close}
          className="mx-4 mt-1 mb-1 w-[calc(100%-32px)] py-3.5 rounded-2xl bg-gray-100 text-gray-700 text-sm font-bold">
          Cancel
        </button>
      </div>
    </>
  );
}

// ── Delete confirmation — checks active rentals server-side before the
// soft-delete actually happens (see supabase/functions/delete-listing). ──
function DeleteConfirmModal({ listing, userId, onCancel, onDeleted }: {
  listing: Listing; userId: string; onCancel: () => void; onDeleted: () => void;
}) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const cover = listing.image || (Array.isArray(listing.images) ? listing.images.find((i: any) => typeof i === 'string') : null);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/delete-listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ listingId: listing.id, userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'active_rental') { setBlocked(data.message); return; }
        throw new Error(data.error || 'Could not delete listing');
      }
      toast.success('Listing deleted');
      onDeleted();
    } catch (e: any) {
      toast.error(e?.message || 'Could not delete listing');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        {blocked ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-base font-black text-gray-900 mb-1.5">Can't delete this listing yet</h3>
            <p className="text-sm text-gray-500 mb-5">{blocked}</p>
            <div className="flex gap-2">
              <button onClick={onCancel} className="flex-1 py-3 border border-gray-200 text-gray-600 font-bold rounded-2xl text-sm">Close</button>
              <button onClick={() => navigate('/my-orders')} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-2xl text-sm">View Orders</button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-base font-black text-gray-900 mb-1.5">Delete listing?</h3>
            <p className="text-sm text-gray-500 mb-4">Are you sure you want to delete this listing? This action cannot be undone.</p>
            <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3 mb-5">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">🎬</div>}
              </div>
              <p className="text-sm font-bold text-gray-900 truncate">{listing.title}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={onCancel} disabled={deleting} className="flex-1 py-3 border border-gray-200 text-gray-600 font-bold rounded-2xl text-sm disabled:opacity-50">Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Listing'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main ListingCard ──────────────────────────────────────────────────────────
export function ListingCard({ listing, onClick, className = '', onDeleted }: ListingCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [saved,   setSaved]   = useState<boolean>(() => {
    if (!user?.id || !listing.id) return false;
    return savedListingsApi.isSavedSync(user.id, listing.id);
  });
  const [saving,  setSaving]  = useState(false);
  const [sheet,   setSheet]   = useState(false);   // three-dot click + long-press both open this
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isOwn = !!user?.id && user.id === listing.userId;

  // Long-press detection
  const pressTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress= useRef(false);

  const startPress = useCallback((e: React.TouchEvent) => {
    didLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setSheet(true);
    }, 500);
  }, []);

  const endPress = useCallback(() => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }, []);

  // Sync saved state from DB
  useEffect(() => {
    if (!user?.id || !listing.id) return;
    supabase.from('favorites').select('id').eq('user_id', user.id).eq('item_id', listing.id).maybeSingle()
      .then(({ data }) => setSaved(!!data)).catch(() => {});
  }, [user?.id, listing.id]);

  const handleClick = () => {
    if (didLongPress.current) return; // don't navigate after long press
    if (onClick) onClick();
    else navigate(`/listing/${listing.id}`);
  };

  const handleSave = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) { navigate('/login'); return; }
    if (saving) return;
    setSaving(true);
    const newSaved = !saved;
    setSaved(newSaved);
    try {
      if (newSaved) {
        const cover = listing.image || (Array.isArray(listing.images) ? listing.images.find((i: any) => typeof i === 'string') : null);
        await supabase.from('favorites').upsert({
          user_id: user.id, item_id: listing.id, item_type: 'listing',
          item_data: { title: listing.title, image: cover, price: listing.price, city: listing.city },
        }, { onConflict: 'user_id,item_id' });
        const key = `saved_listings_cache_${user.id}`;
        const ids: string[] = JSON.parse(localStorage.getItem(key) || '[]');
        if (!ids.includes(listing.id)) localStorage.setItem(key, JSON.stringify([...ids, listing.id]));
        toast('❤️ Saved!', { duration: 1500 });
      } else {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('item_id', listing.id);
        const key = `saved_listings_cache_${user.id}`;
        const ids: string[] = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify(ids.filter(id => id !== listing.id)));
        toast('Removed from saved', { duration: 1500 });
      }
    } catch { setSaved(!newSaved); toast.error('Could not update'); }
    setSaving(false);
  }, [user, saved, saving, listing, navigate]);

  const cover = listing.image ||
    (Array.isArray(listing.images) ? listing.images.find((i: any) => typeof i === 'string' && i.length > 10) : null);

  const typeLabel = listing.listingType === 'service' ? 'Service'
    : listing.listingMode === 'sale' ? 'For Sale' : 'Rental';
  const typeColor = listing.listingType === 'service' ? 'bg-purple-100 text-purple-700'
    : listing.listingMode === 'sale' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';
  const priceUnit = listing.listingType === 'service' ? '/hr'
    : listing.listingMode === 'sale' ? '' : '/day';

  return (
    <>
      {/* Menu */}
      {sheet && (
        <BottomMenuSheet
          listing={listing} saved={saved} onSave={() => handleSave()} onClose={() => setSheet(false)}
          isOwn={isOwn}
          onEdit={() => navigate(`/edit-listing/${listing.id}`)}
          onDeleteRequest={() => setShowDeleteConfirm(true)}
        />
      )}
      {showDeleteConfirm && user?.id && (
        <DeleteConfirmModal
          listing={listing} userId={user.id}
          onCancel={() => setShowDeleteConfirm(false)}
          onDeleted={() => { setShowDeleteConfirm(false); onDeleted?.(); }}
        />
      )}

      <div
        onClick={handleClick}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        onTouchMove={endPress}
        className={`cursor-pointer group select-none film-card ${className}`}
      >
        {/* Image container */}
        <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 mb-3">
          {cover ? (
            <img src={cover} alt={listing.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl select-none">🎬</div>
          )}

          {/* Type badge */}
          <span className={`absolute top-2.5 left-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${typeColor}`}>
            {typeLabel}
          </span>

          {/* ── Heart button — always visible on mobile, hover on desktop ── */}
          <button
            onClick={e => handleSave(e)}
            aria-label={saved ? 'Remove from saved' : 'Save listing'}
            className={`absolute top-2 right-10 w-8 h-8 flex items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 active:scale-90 ${
              saved
                ? 'bg-white/90 shadow-sm'
                : 'bg-black/25 md:opacity-0 md:group-hover:opacity-100 md:bg-white/70'
            }`}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Heart
              className={`w-4 h-4 transition-all duration-200 ${saved ? 'fill-red-500 text-red-500' : 'text-white md:text-gray-600'}`}
              style={saving ? { transform: 'scale(0.8)' } : {}}
            />
          </button>

          {/* ── Three-dot menu — desktop hover / always on mobile — opens the same bottom-to-top sheet as long-press ── */}
          <div className="absolute top-2 right-2">
            <button
              onClick={e => { e.stopPropagation(); setSheet(true); }}
              aria-label="More options"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-black/25 backdrop-blur-sm transition-all duration-200 active:scale-90 md:opacity-0 md:group-hover:opacity-100"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <MoreHorizontal className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Distance */}
          {listing.distance !== undefined && (
            <span className="absolute bottom-2 left-2.5 text-[10px] font-semibold bg-black/50 text-white px-2 py-0.5 rounded-full backdrop-blur-sm flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5"/> {distanceLabel(listing.distance)}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="px-0.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-900 truncate leading-snug">{listing.title}</p>
              {listing.city && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {listing.city}{listing.province ? `, ${listing.province}` : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <Star className="w-3 h-3 text-gray-800 fill-gray-800"/>
              <span className="text-xs font-semibold text-gray-800">New</span>
            </div>
          </div>
          <p className="text-sm font-bold text-gray-900 mt-1.5">
            ${listing.price}
            <span className="font-normal text-gray-500 text-xs"> CAD{priceUnit}</span>
          </p>
        </div>
      </div>
    </>
  );
}