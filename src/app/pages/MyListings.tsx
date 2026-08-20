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
import { ListingCard } from '../components/ListingCard';
import { Plus, Film, Lock, CheckCircle, Search, X } from 'lucide-react';
import { normalizeTier } from '../lib/reliabilityApi';
import { captureSnapshot } from '../lib/smartAnimate';
import { Listing } from '../types';
import { toast } from 'sonner';
import { matchesListing } from '../lib/searchUtils';

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
      {/* Creator+ required — same card language as the Wallet/CreatorPlusRequired gate */}
      {isCreator && (
        <div className="mb-5 bg-white rounded-3xl shadow-sm border border-gray-100 p-6 text-center space-y-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-white"/>
          </div>
          <div>
            <p className="text-lg font-black text-gray-900">Creator+ Account Required</p>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              Hosting gear rentals, studios, and services requires a verified Creator+ account.
            </p>
          </div>
          <div className="bg-blue-50 rounded-2xl p-4 space-y-2 text-sm text-left">
            {['Host gear rentals', 'List creative services', 'Receive direct payouts', 'Marketplace booking system'].map(f => (
              <div key={f} className="flex items-center gap-2 text-blue-800">
                <CheckCircle className="w-4 h-4 text-blue-500 shrink-0"/>{f}
              </div>
            ))}
          </div>
          <button
            onClick={() => { captureSnapshot(); navigate('/verification'); }}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-black rounded-2xl py-4 hover:opacity-90 transition-opacity">
            Upgrade Now — It's Free ⚡
          </button>
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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {filtered.map(listing => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      onDeleted={() => setListings(prev => prev.filter(l => l.id !== listing.id))}
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