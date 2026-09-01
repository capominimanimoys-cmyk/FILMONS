// FILMONS Admin — single listing detail + moderation. No Reports
// section -- confirmed before building this that no reporting system
// exists anywhere in FILMONS (see AdminListings.tsx's own note).
// Pause/Remove require a reason, written to listing_moderation_log via
// admin-moderate-listing (a separate, admin-authenticated action from
// the owner's own delete-listing).
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, ExternalLink, Star, PauseCircle, PlayCircle, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminFn } from '../lib/adminAuth';
import { reviewsApi } from '../lib/api';
import { toast } from 'sonner';

interface Listing {
  id: string; title: string; description: string | null; listing_type: string | null; listing_mode: string | null;
  price: number | null; city: string | null; street_address: string | null; province: string | null; postal_code: string | null; country: string | null;
  delivery_options: string[] | null; delivery_price: number | null;
  images: any; videos: any; created_at: string; updated_at: string | null;
  is_active: boolean; moderation_status: string; user_id: string;
}
interface Host { id: string; name: string; username: string; avatar_url: string | null; account_type: string; is_verified: boolean; }
interface LogRow { id: string; action: string; reason: string | null; admin_identifier: string; created_at: string; }

const STATUS_LABEL: Record<string, string> = { active: 'Active', paused: 'Paused', removed: 'Removed' };
const TIER_LABEL: Record<string, string> = { creator: 'Creator', creator_plus: 'Creator+', service: 'Creator+', professional: 'Professional', business: 'Business' };

function extractUrls(field: any): string[] {
  if (!field) return [];
  if (Array.isArray(field)) return field.filter((s: any) => typeof s === 'string');
  if (typeof field === 'string') {
    try { const parsed = JSON.parse(field); return Array.isArray(parsed) ? parsed.filter(s => typeof s === 'string') : []; } catch { return []; }
  }
  return [];
}

export function AdminListingDetail() {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [host, setHost] = useState<Host | null>(null);
  const [hostListingCount, setHostListingCount] = useState(0);
  const [hostRating, setHostRating] = useState<{ avg: number; count: number } | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState<'pause' | 'remove' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!listingId) return;
    supabase.from('listings').select('*').eq('id', listingId).maybeSingle()
      .then(async ({ data }) => {
        setListing(data);
        if (data) {
          const [{ data: hostRow }, { data: hostListings }, reviews, { data: logRows }] = await Promise.all([
            supabase.from('profiles').select('id, name, username, avatar_url, account_type, is_verified').eq('id', data.user_id).maybeSingle(),
            supabase.from('listings').select('id').eq('user_id', data.user_id),
            reviewsApi.getReceivedReviews(data.user_id).catch(() => []),
            supabase.from('listing_moderation_log').select('id, action, reason, admin_identifier, created_at').eq('listing_id', listingId).order('created_at', { ascending: false }),
          ]);
          setHost(hostRow);
          setHostListingCount((hostListings || []).length);
          setHostRating(reviews.length ? { avg: reviews.reduce((s, r) => s + r.rating, 0) / reviews.length, count: reviews.length } : { avg: 0, count: 0 });
          setLog(logRows || []);
        }
        setLoading(false);
      }).catch(() => setLoading(false));
  };
  useEffect(load, [listingId]);

  const runAction = async (action: 'pause' | 'restore' | 'remove', actionReason?: string) => {
    if (!listingId) return;
    setBusy(true);
    try {
      const res = await fetch(adminFn('admin-moderate-listing'), {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, action, reason: actionReason }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Couldn't save changes. Try again.");
      toast.success(action === 'pause' ? 'Listing paused' : action === 'restore' ? 'Listing restored' : 'Listing removed');
      setActionModal(null); setReason('');
      load();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save changes. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>;
  if (!listing) return <div className="h-full flex items-center justify-center text-sm text-gray-400">Listing not found.</div>;

  const media = [...extractUrls(listing.images), ...extractUrls(listing.videos)];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <button onClick={() => navigate('/listings')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Listings
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-lg font-black text-gray-900">{listing.title}</h1>
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${listing.moderation_status === 'active' ? 'bg-green-50 text-green-700' : listing.moderation_status === 'paused' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>
            {STATUS_LABEL[listing.moderation_status]}
          </span>
        </div>
        {listing.description && <p className="text-sm text-gray-600 mb-3">{listing.description}</p>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><span className="text-gray-400">Type</span> <span className="font-semibold text-gray-800">{listing.listing_mode || listing.listing_type || '—'}</span></div>
          <div><span className="text-gray-400">Price</span> <span className="font-semibold text-gray-800">{listing.price != null ? `$${listing.price}` : '—'}</span></div>
          <div><span className="text-gray-400">Location</span> <span className="font-semibold text-gray-800">{[listing.street_address, listing.city, listing.province].filter(Boolean).join(', ') || '—'}</span></div>
          <div><span className="text-gray-400">Delivery</span> <span className="font-semibold text-gray-800">{(listing.delivery_options || []).join(', ') || '—'}</span></div>
          <div><span className="text-gray-400">Created</span> <span className="font-semibold text-gray-800">{new Date(listing.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
          <div><span className="text-gray-400">Last updated</span> <span className="font-semibold text-gray-800">{listing.updated_at ? new Date(listing.updated_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
        </div>
      </div>

      {media.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Media</p>
          <div className="grid grid-cols-3 gap-2">
            {media.map((url, i) => <img key={i} src={url} className="w-full aspect-square object-cover rounded-xl" alt="" />)}
          </div>
        </div>
      )}

      {host && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Host</p>
          <div className="flex items-center gap-3 mb-3">
            {host.avatar_url ? <img src={host.avatar_url} className="w-12 h-12 rounded-full object-cover" alt="" /> : <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500">{host.name?.charAt(0).toUpperCase()}</div>}
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{host.name}</p>
              <p className="text-xs text-gray-400 truncate">@{host.username || 'no-username'} · {TIER_LABEL[host.account_type] || host.account_type}{host.is_verified ? ' · Verified ✓' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
            <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> {hostRating && hostRating.count > 0 ? `${hostRating.avg.toFixed(1)} (${hostRating.count})` : 'No reviews'}</span>
            <span>{hostListingCount} listing{hostListingCount === 1 ? '' : 's'}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate(`/users/${host.id}`)} className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5">View User <ExternalLink className="w-3.5 h-3.5" /></button>
            <a href={`/listing/${listing.id}`} target="_blank" rel="noreferrer" className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5">View Public Listing <ExternalLink className="w-3.5 h-3.5" /></a>
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Moderation History</p>
          <div className="space-y-2">
            {log.map(l => (
              <div key={l.id} className="text-sm">
                <span className="font-semibold text-gray-800 capitalize">{l.action}</span>
                <span className="text-gray-400"> — {l.admin_identifier} · {new Date(l.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>
                {l.reason && <p className="text-xs text-gray-500 mt-0.5">{l.reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {listing.moderation_status !== 'active' && (
          <button onClick={() => runAction('restore')} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
            <PlayCircle className="w-4 h-4" /> Restore Listing
          </button>
        )}
        {listing.moderation_status === 'active' && (
          <button onClick={() => setActionModal('pause')} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold flex items-center justify-center gap-1.5">
            <PauseCircle className="w-4 h-4" /> Pause Listing
          </button>
        )}
        {listing.moderation_status !== 'removed' && (
          <button onClick={() => setActionModal('remove')} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold flex items-center justify-center gap-1.5">
            <XCircle className="w-4 h-4" /> Remove Listing
          </button>
        )}
      </div>

      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setActionModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-gray-900 mb-1">{actionModal === 'pause' ? 'Pause this listing?' : 'Remove this listing?'}</h3>
            <p className="text-xs text-gray-400 mb-3">{actionModal === 'pause' ? "It will be hidden from the marketplace until restored." : "It will be hidden from the marketplace. Related orders, reviews, and messages are kept."}</p>
            <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required)" rows={3}
              className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 mb-3" />
            <div className="flex gap-2">
              <button onClick={() => { setActionModal(null); setReason(''); }} disabled={busy} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold disabled:opacity-50">Cancel</button>
              <button onClick={() => runAction(actionModal, reason)} disabled={busy || !reason.trim()}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50">
                {busy ? 'Saving…' : actionModal === 'pause' ? 'Pause' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
