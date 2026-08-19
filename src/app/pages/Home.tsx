/**
 * Filmons Home — premium Tinder-style discovery deck for listings.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Search, Sparkles, Package, Tag, Wrench, User, Building2, Star, MessageCircle, X, RotateCcw, Heart, MapPin } from 'lucide-react';
import { listingsApi, chatApi } from '../lib/api';
import { Listing } from '../types';
import { SwipeStack, type DeckItem, type SwipeStackHandle, type EnrichedListing } from '../components/SwipeStack';
import { FilterPanel, FilterOptions } from '../components/FilterPanel';
import { LocationPermissionDialog } from '../components/LocationPermissionDialog';
import { useAuth } from '../context/AuthContext';

// ── Filter system ─────────────────────────────────────────────────────────────
type FilterId = 'all' | 'rentals' | 'sales' | 'services' | 'creators' | 'studios' | 'talent';

type LucideIcon = React.ComponentType<{ className?: string }>;
const FILTERS: { id: FilterId; label: string; icon: LucideIcon; routesToSearch?: boolean }[] = [
  { id: 'all',      label: 'For You',  icon: Sparkles  },
  { id: 'rentals',  label: 'Rentals',  icon: Package   },
  { id: 'sales',    label: 'Sales',    icon: Tag       },
  { id: 'services', label: 'Services', icon: Wrench    },
  { id: 'creators', label: 'Creators', icon: User,      routesToSearch: true },
  { id: 'studios',  label: 'Studios',  icon: Building2, routesToSearch: true },
  { id: 'talent',   label: 'Talent',   icon: Star,      routesToSearch: true },
];

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  toronto:   { lat: 43.6532, lng: -79.3832  },
  ottawa:    { lat: 45.4215, lng: -75.6972  },
  montreal:  { lat: 45.5017, lng: -73.5673  },
  vancouver: { lat: 49.2827, lng: -123.1207 },
  calgary:   { lat: 51.0447, lng: -114.0719 },
  edmonton:  { lat: 53.5461, lng: -113.4938 },
  winnipeg:  { lat: 49.8951, lng: -97.1384  },
  halifax:   { lat: 44.6488, lng: -63.5752  },
  surrey:    { lat: 49.1913, lng: -122.8490 },
};
function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const DEFAULT_FILTERS: FilterOptions = {
  listingType: [], listingMode: [], condition: [], maxDistance: null,
  priceRange: [0, 10000], cities: [], sortBy: 'relevance',
};

// Boosted listings get a better chance of appearing earlier without being
// pinned first — a light interim weighting, not the full relevance/ranking
// rework (deferred, same stance as the Boost feature's Phase 1).
function weightedShuffle(listings: Listing[]): Listing[] {
  return [...listings]
    .map(l => ({ l, key: Math.random() * (l.boosted ? 0.5 : 1) }))
    .sort((a, b) => a.key - b.key)
    .map(x => x.l);
}

function buildDeck(listings: Listing[], filter: FilterId): DeckItem[] {
  let filtered = [...listings];
  if (filter === 'rentals') {
    filtered = filtered.filter(l => l.listingMode === 'rent' && l.listingType !== 'service');
  } else if (filter === 'sales') {
    filtered = filtered.filter(l => l.listingMode === 'sale');
  } else if (filter === 'services') {
    filtered = filtered.filter(l => l.listingType === 'service');
  }
  return weightedShuffle(filtered).map(l => ({ kind: 'listing' as const, data: l }));
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonDeck() {
  return (
    <div className="px-4">
      <div className="w-full rounded-[28px] overflow-hidden shadow-2xl bg-white animate-pulse" style={{ height: 420 }}>
        <div className="h-72 bg-gray-200"/>
        <div className="p-4 space-y-2.5">
          <div className="h-4 bg-gray-200 rounded w-3/4"/>
          <div className="h-3 bg-gray-200 rounded w-1/2"/>
          <div className="h-5 bg-gray-200 rounded w-1/3 mt-3"/>
        </div>
      </div>
      <div className="flex items-center justify-center gap-6 mt-8">
        <div className="w-14 h-14 rounded-full bg-gray-200 animate-pulse"/>
        <div className="w-12 h-12 rounded-full bg-gray-200 animate-pulse"/>
        <div className="w-14 h-14 rounded-full bg-gray-200 animate-pulse"/>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const stackRef = useRef<SwipeStackHandle>(null);

  const [listings,  setListings]  = useState<Listing[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<FilterId>('all');
  const [deckDone,  setDeckDone]  = useState(false);
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number; city?: string } | null>(null);
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);
  const [filterKey, setFilterKey] = useState(0);

  useEffect(() => {
    let done = false;
    listingsApi.getAll().then(l => {
      if (done) return;
      setListings(l);
      setLoading(false);
    }).catch(() => { if (!done) setLoading(false); });
    try { const s = localStorage.getItem('filmons_user_location'); if (s) setUserLocation(JSON.parse(s)); } catch {}
    return () => { done = true; };
  }, []);

  useEffect(() => {
    if (!user) { setUnreadMsgs(0); return; }
    const update = () => setUnreadMsgs(chatApi.getUnreadCount(user.id));
    update();
    const t = setInterval(update, 15_000);
    window.addEventListener('filmons:unread-changed', update);
    return () => { clearInterval(t); window.removeEventListener('filmons:unread-changed', update); };
  }, [user?.id]);

  // Enrich with distance, then apply the same filter-panel dimensions Marketplace uses.
  const enriched: EnrichedListing[] = useMemo(() => listings.map(l => {
    if (!userLocation) return { ...l, distance: undefined };
    const c = CITY_COORDS[l.city?.toLowerCase().trim() ?? ''];
    return { ...l, distance: c ? haversine(userLocation.latitude, userLocation.longitude, c.lat, c.lng) : undefined };
  }), [listings, userLocation]);

  const filteredByPanel = useMemo(() => enriched.filter(l => {
    if (filters.listingType.length && !filters.listingType.includes(l.listingType)) return false;
    if (filters.listingMode.length && l.listingMode && !filters.listingMode.includes(l.listingMode)) return false;
    if (filters.condition.length && l.condition && !filters.condition.includes(l.condition)) return false;
    if (filters.maxDistance !== null && l.distance !== undefined && l.distance > filters.maxDistance) return false;
    if (l.price < filters.priceRange[0] || l.price > filters.priceRange[1]) return false;
    if (filters.cities.length && !filters.cities.some(c => l.city?.toLowerCase().includes(c.toLowerCase()))) return false;
    return true;
  }), [enriched, filters]);

  const deck = useMemo(() => buildDeck(filteredByPanel, filter), [filteredByPanel, filter]);
  const availableCities = useMemo(() => Array.from(new Set(listings.map(l => l.city).filter(Boolean))).sort() as string[], [listings]);

  const handleFilter = (f: typeof FILTERS[number]) => {
    if (f.routesToSearch) { navigate('/search?type=creator'); return; }
    setFilter(f.id);
    setDeckDone(false);
    setFilterKey(k => k + 1);
  };

  const handleFiltersChange = (f: FilterOptions) => {
    setFilters(f);
    setDeckDone(false);
    setFilterKey(k => k + 1);
  };

  // Desktop keyboard shortcuts — ← pass, → like, never while an input/textarea is focused.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) return;
      if (e.key === 'ArrowLeft') stackRef.current?.pass();
      else if (e.key === 'ArrowRight') stackRef.current?.like();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const startOver = useCallback(() => { setDeckDone(false); setFilterKey(k => k + 1); }, []);

  return (
    <div className="min-h-screen bg-gray-100 pb-24">
      <LocationPermissionDialog onLocationGranted={setUserLocation} onLocationDenied={() => {}} />

      {/* ── Top nav: logo + search + inbox ── */}
      <div
        className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: '10px' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-black text-gray-900 tracking-tight shrink-0">FILMONS</span>
          <button
            onClick={() => navigate('/search')}
            className="flex-1 flex items-center gap-2.5 bg-gray-100 rounded-2xl px-3.5 py-2.5 text-left hover:bg-gray-200 transition-colors active:scale-[0.99] min-w-0">
            <Search className="w-4 h-4 text-blue-500 shrink-0"/>
            <span className="text-sm text-gray-400 truncate">Search gear, services, creators…</span>
          </button>
          <button
            onClick={() => navigate(user ? '/inbox' : '/login')}
            className="relative w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors shrink-0">
            <MessageCircle className="w-4 h-4 text-gray-700"/>
            {unreadMsgs > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                {unreadMsgs > 99 ? '99+' : unreadMsgs}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Category chips ── */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => handleFilter(f)}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 whitespace-nowrap ${
              filter === f.id && !f.routesToSearch
                ? 'bg-gray-900 text-white shadow-sm scale-105'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
            }`}>
            <f.icon className="w-3.5 h-3.5"/>
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Location + filters bar ── */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <span className="flex items-center gap-1 text-xs font-semibold text-gray-500 bg-white border border-gray-200 rounded-full px-3 py-1.5">
          <MapPin className="w-3.5 h-3.5 text-blue-500"/> {userLocation?.city || 'Nearby'}
        </span>
        <div className="flex-1"/>
        <FilterPanel
          filters={filters}
          onFiltersChange={handleFiltersChange}
          availableCities={availableCities}
          hasLocation={!!userLocation}
        />
      </div>

      {/* ── Deck ── */}
      <div className="mt-2">
        {loading ? (
          <SkeletonDeck/>
        ) : deck.length === 0 ? (
          <div className="flex flex-col items-center py-24 px-6 text-center">
            <span className="text-5xl mb-4">🎬</span>
            <p className="font-black text-gray-900 text-lg mb-1">You're all caught up</p>
            <p className="text-sm text-gray-400 max-w-xs">We couldn't find more listings matching your current preferences.</p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
              <button onClick={() => navigate('/search')} className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-xl active:opacity-80">Expand Search</button>
              <button onClick={() => setFilters(DEFAULT_FILTERS)} className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-xl active:opacity-80">Change Filters</button>
              <button onClick={startOver} className="bg-blue-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl active:opacity-80">Start Again</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center px-4">
            <SwipeStack key={filterKey} ref={stackRef} items={deck} onDone={() => setDeckDone(true)}/>

            {/* Counter */}
            <p className="text-[11px] text-gray-400 mt-3 mb-5 font-medium">{deck.length} listing{deck.length === 1 ? '' : 's'} · swipe to browse</p>

            {/* ── Action buttons — same logic as the drag gestures ── */}
            <div className="flex items-center gap-6" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
              <button
                onClick={() => stackRef.current?.pass()}
                aria-label="Pass"
                className="w-14 h-14 rounded-full bg-white border-2 border-red-200 shadow-md flex items-center justify-center hover:border-red-400 hover:bg-red-50 transition-all active:scale-90">
                <X className="w-6 h-6 text-red-400"/>
              </button>
              <button
                onClick={() => stackRef.current?.undo()}
                aria-label="Undo"
                className="w-12 h-12 rounded-full bg-white border-2 border-gray-200 shadow-md flex items-center justify-center hover:border-gray-400 hover:bg-gray-50 transition-all active:scale-90">
                <RotateCcw className="w-5 h-5 text-gray-500"/>
              </button>
              <button
                onClick={() => stackRef.current?.like()}
                aria-label="Like"
                className="w-14 h-14 rounded-full bg-white border-2 border-green-200 shadow-md flex items-center justify-center hover:border-green-400 hover:bg-green-50 transition-all active:scale-90">
                <Heart className="w-6 h-6 text-green-500"/>
              </button>
            </div>
            <p className="text-[11px] text-gray-300 mt-4">← Pass · Undo · Save →</p>
          </div>
        )}
      </div>

      {/* ── After deck exhausted — restart nudge ── */}
      {deckDone && !loading && deck.length > 0 && (
        <div className="px-4 mt-4 text-center">
          <button onClick={startOver} className="text-sm text-blue-600 font-semibold underline">See them again</button>
          <span className="text-gray-300 mx-2">·</span>
          <button onClick={() => navigate('/marketplace')} className="text-sm text-blue-600 font-semibold underline">Browse marketplace</button>
        </div>
      )}
    </div>
  );
}
