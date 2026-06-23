/**
 * MyListings — manage the current user's own listings.
 * Uses: ListingCard, EmptyState, PageWrapper, SectionHeader
 */
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { listingsApi } from '../lib/api';
import { PageWrapper } from '../components/PageWrapper';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState } from '../components/EmptyState';
import { Plus, Film, Trash2, Edit, Link2, MapPin, Lock, Zap, Search, X } from 'lucide-react';
import { normalizeTier } from '../lib/reliabilityApi';
import { captureSnapshot } from '../lib/smartAnimate';
import { Listing } from '../types';
import { toast } from 'sonner';
import { matchesListing } from '../lib/searchUtils';

// ── Compact listing row card for the "My Listings" management view ──────────
function MyListingRow({
  listing,
  onEdit,
  onDelete,
  onCopyLink,
}: {
  listing: Listing;
  onEdit: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
}) {
  const coverImage = listing.image || listing.images?.[0];
  const priceLabel = listing.listingType === 'service'
    ? '/hr'
    : listing.listingMode !== 'sale'
      ? '/day'
      : '';

  const badge = listing.listingType === 'service'
    ? { label: 'Service', cls: 'bg-purple-50 text-purple-600' }
    : listing.listingMode === 'sale'
      ? { label: 'For Sale', cls: 'bg-green-50 text-green-600' }
      : { label: 'Rental', cls: 'bg-blue-50 text-blue-600' };

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="flex">
        {/* Thumbnail */}
        <div className="w-28 sm:w-36 shrink-0 aspect-square bg-gray-50 overflow-hidden rounded-l-2xl">
          {coverImage ? (
            <img src={coverImage} alt={listing.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <Film className="w-8 h-8" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col gap-2.5 min-w-0">
          {/* Title + type badge */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-700 line-clamp-1 flex-1 text-sm">{listing.title}</h3>
            <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
              {badge.label}
            </span>
          </div>

          {/* Location + price */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {listing.city && (
              <span className="flex items-center gap-1 truncate max-w-[110px]">
                <MapPin className="w-3 h-3 shrink-0" />
                {listing.city}
              </span>
            )}
            <span className="font-semibold text-gray-700">
              ${(listing.price ?? 0).toLocaleString()}
              <span className="font-normal text-gray-400">{priceLabel} CAD</span>
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 mt-auto flex-wrap">
            <button onClick={onEdit}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
              <Edit className="w-3 h-3" /> Edit
            </button>
            <button onClick={onCopyLink}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 transition-colors">
              <Link2 className="w-3 h-3" /> Copy link
            </button>
            <button onClick={onDelete}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition-colors ml-auto">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export function MyListings() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search,  setSearch]    = useState('');

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (user?.id) loadListings();
  }, [isAuthenticated, user?.id]);

  async function loadListings() {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await listingsApi.getUserListings(user.id);
      setListings(data);
    } catch {
      toast.error('Failed to load your listings');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this listing? This cannot be undone.')) return;
    try {
      await listingsApi.delete(id);
      setListings(prev => prev.filter(l => l.id !== id));
      toast.success('Listing deleted');
    } catch {
      toast.error('Failed to delete listing');
    }
  }

  function handleCopyLink(id: string) {
    const url = `${window.location.origin}/listing/${id}`;
    try {
      const el = document.createElement('textarea');
      el.value = url;
      el.style.position = 'fixed'; el.style.left = '-9999px';
      document.body.appendChild(el);
      el.focus(); el.select();
      document.execCommand('copy');
      el.remove();
      toast.success('Link copied!');
    } catch {
      toast.error('Could not copy — try manually from the address bar');
    }
  }

  if (!isAuthenticated) return null;

  const isCreator = normalizeTier(user?.accountType) === 'creator';

  return (
    <PageWrapper
      title="My Listings"
      breadcrumb={[{ label: 'Home', to: '/' }, { label: 'My Listings' }]}
      actions={
        isCreator ? (
          <button disabled
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 text-gray-400 text-sm font-semibold cursor-not-allowed border border-gray-200">
            <Lock className="w-3.5 h-3.5"/> New Listing
          </button>
        ) : (
          <Link to="/create-listing"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> New Listing
          </Link>
        )
      }
    >
      {/* Creator+ required banner */}
      {isCreator && (
        <div className="mb-5 rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-5 py-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-white"/>
              </div>
              <div>
                <p className="text-base font-black text-white">Creator+ Account Required</p>
                <p className="text-sm text-blue-100 mt-0.5 leading-snug">
                  Hosting gear rentals, studios, and services requires a verified Creator+ account.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {['Host gear rentals', 'List creative services', 'Receive direct payouts', 'Marketplace booking system'].map(f => (
                <div key={f} className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-blue-300 shrink-0"/>
                  <span className="text-[11px] text-blue-100">{f}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => { captureSnapshot(); navigate('/creator-plus-steps'); }}
              className="w-full py-3 bg-white text-blue-700 font-black text-sm rounded-xl hover:bg-blue-50 active:scale-[0.98] transition-all shadow-sm">
              Upgrade Now — It's Free ⚡
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl bg-white shadow-sm h-28 animate-pulse" />
          ))}
        </div>
      ) : listings.length === 0 && !isCreator ? (
        <EmptyState
          icon={<Film className="w-12 h-12 text-gray-300" />}
          title="No listings yet"
          description="List your film gear or creative services to start earning. It only takes a few minutes."
          actionLabel="Create your first listing"
          onAction={() => navigate('/create-listing')}
          secondaryLabel="Browse marketplace"
          onSecondaryAction={() => navigate('/marketplace')}
        />
      ) : listings.length > 0 ? (
        (() => {
          const filtered = listings.filter(l => matchesListing(l, search));
          return (
            <>
              {/* Search bar */}
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5 mb-4">
                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0"/>
                <input
                  type="text"
                  placeholder="Search your listings…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="shrink-0">
                    <X className="w-3.5 h-3.5 text-gray-400"/>
                  </button>
                )}
              </div>

              <SectionHeader
                title={search ? `${filtered.length} of ${listings.length} listing${listings.length !== 1 ? 's' : ''}` : `${listings.length} listing${listings.length !== 1 ? 's' : ''}`}
                subtitle="Click Edit to update details, pricing, or images"
              />

              {filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm font-medium">No listings match "{search}"</p>
                  <button onClick={() => setSearch('')} className="text-xs text-blue-600 mt-2 font-semibold">Clear search</button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filtered.map(listing => (
                    <MyListingRow
                      key={listing.id}
                      listing={listing}
                      onEdit={() => navigate(`/edit-listing/${listing.id}`)}
                      onDelete={() => handleDelete(listing.id)}
                      onCopyLink={() => handleCopyLink(listing.id)}
                    />
                  ))}
                </div>
              )}
            </>
          );
        })()
      ) : null}
    </PageWrapper>
  );
}