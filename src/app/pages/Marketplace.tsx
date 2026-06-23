import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Navigation } from 'lucide-react';
import { SwipeStack, EnrichedListing } from '../components/SwipeStack';
import { FilterPanel, FilterOptions } from '../components/FilterPanel';
import { LocationPermissionDialog } from '../components/LocationPermissionDialog';
import { listingsApi } from '../lib/api';
import { Listing } from '../types';
import { useAuth } from '../context/AuthContext';
import { normalizeTier } from '../lib/reliabilityApi';
import { captureSnapshot } from '../lib/smartAnimate';

// ── Location helpers ──────────────────────────────────────────────────────────
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

// ── Categories ────────────────────────────────────────────────────────────────
interface Category { emoji: string; label: string; match: (l: Listing) => boolean; }

function kw(l: Listing, words: string[]): boolean {
  const text = `${l.title} ${l.description ?? ''} ${(l.tags ?? []).join(' ')}`.toLowerCase();
  return words.some(w => text.includes(w));
}

const CATEGORIES: Category[] = [
  { emoji:'✨', label:'All',          match: ()  => true },
  { emoji:'📷', label:'Cameras',      match: (l) => kw(l,['camera','canon','sony','nikon','blackmagic','fuji','lumix']) },
  { emoji:'🎤', label:'Audio',        match: (l) => kw(l,['audio','microphone','mic','sound','speaker','rode','sennheiser']) },
  { emoji:'📸', label:'Photography',  match: (l) => kw(l,['photo','photography','photographer','shoot','portrait']) },
  { emoji:'🎥', label:'Video',        match: (l) => kw(l,['video','videographer','filming','cinema','reel']) },
  { emoji:'💡', label:'Lighting',     match: (l) => kw(l,['light','aputure','godox','led','strobe','tungsten']) },
  { emoji:'✂️', label:'Editing Gear', match: (l) => kw(l,['editor','editing','post','color','grade','cut','monitor','drive']) },
  { emoji:'🏢', label:'Studios',      match: (l) => kw(l,['studio','space','location','soundstage']) },
  { emoji:'👗', label:'Props',        match: (l) => kw(l,['prop','costume','wardrobe','fashion','set dressing']) },
  { emoji:'🚁', label:'Drones',       match: (l) => kw(l,['drone','dji','aerial','fpv','mavic']) },
  { emoji:'🎮', label:'Gaming',       match: (l) => kw(l,['gaming','game','stream','esport','twitch','capture card']) },
  { emoji:'🎵', label:'Music',        match: (l) => kw(l,['music','producer','beat','mixing','mastering']) },
  { emoji:'🖥️', label:'Streaming',    match: (l) => kw(l,['stream','broadcast','podcast','live','elgato']) },
  { emoji:'🛠️', label:'Services',     match: (l) => l.listingType === 'service' },
];

const DEFAULT_FILTERS: FilterOptions = {
  listingType: [], listingMode: [], condition: [], maxDistance: null,
  priceRange: [0, 10000], cities: [], sortBy: 'relevance',
};

// ── Main component ────────────────────────────────────────────────────────────
export function Marketplace() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isCreator = normalizeTier(user?.accountType) === 'creator';

  const [listings,     setListings]     = useState<Listing[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [category,     setCategory]     = useState<string>('All');
  const [filters,      setFilters]      = useState<FilterOptions>(DEFAULT_FILTERS);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number; city?: string } | null>(null);
  const [swipeKey,     setSwipeKey]     = useState(0);

  useEffect(() => {
    const cached = localStorage.getItem('filmons_listings');
    if (cached) { try { const p = JSON.parse(cached); if (p.length) { setListings(p); setLoading(false); } } catch {} }
    listingsApi.getAll().then(d => { setListings(d); setLoading(false); }).catch(() => setLoading(false));
    try { const s = localStorage.getItem('filmons_user_location'); if (s) setUserLocation(JSON.parse(s)); } catch {}
  }, []);

  // Enrich with distance
  const enriched: EnrichedListing[] = listings.map(l => {
    if (!userLocation) return { ...l, distance: undefined };
    const c = CITY_COORDS[l.city?.toLowerCase().trim() ?? ''];
    return { ...l, distance: c ? haversine(userLocation.latitude, userLocation.longitude, c.lat, c.lng) : undefined };
  });

  const catFilter = CATEGORIES.find(c => c.label === category)?.match ?? (() => true);

  const filtered = enriched
    .filter(catFilter)
    .filter(l => {
      if (filters.listingType.length && !filters.listingType.includes(l.listingType)) return false;
      if (filters.listingMode.length && l.listingMode && !filters.listingMode.includes(l.listingMode)) return false;
      if (filters.condition.length && l.condition && !filters.condition.includes(l.condition)) return false;
      if (filters.maxDistance !== null && l.distance !== undefined && l.distance > filters.maxDistance) return false;
      if (l.price < filters.priceRange[0] || l.price > filters.priceRange[1]) return false;
      if (filters.cities.length && !filters.cities.some(c => l.city?.toLowerCase().includes(c.toLowerCase()))) return false;
      return true;
    })
    .sort((a, b) => {
      if (filters.sortBy === 'price-low')  return a.price - b.price;
      if (filters.sortBy === 'price-high') return b.price - a.price;
      if (filters.sortBy === 'newest')     return new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime();
      if (filters.sortBy === 'distance' && a.distance !== undefined && b.distance !== undefined) return a.distance - b.distance;
      return 0;
    });

  const hasFilters = filters.listingType.length > 0 || filters.listingMode.length > 0 ||
    filters.condition.length > 0 || filters.maxDistance !== null ||
    filters.cities.length > 0 || filters.priceRange[0] > 0 || filters.priceRange[1] < 10000;

  const availableCities = Array.from(new Set(listings.map(l => l.city).filter(Boolean))).sort() as string[];

  const handleCategoryChange = (label: string) => {
    setCategory(label);
    setSwipeKey(k => k + 1);
  };

  const handleFiltersChange = (f: FilterOptions) => {
    setFilters(f);
    setSwipeKey(k => k + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <LocationPermissionDialog onLocationGranted={setUserLocation} onLocationDenied={() => {}} />

      {/* ── Sticky header ── */}
      <div className="sticky top-14 z-40 bg-white border-b border-gray-100 shadow-sm">

        {/* Row 1: Filters + Add listing */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
          <FilterPanel
            filters={filters}
            onFiltersChange={handleFiltersChange}
            availableCities={availableCities}
            hasLocation={!!userLocation}
          />

          {isCreator ? (
            <div className="relative group shrink-0">
              <button disabled className="bg-gray-200 text-gray-400 text-xs font-bold px-3 py-2 rounded-xl cursor-not-allowed">
                + List
              </button>
              <div className="absolute right-0 top-full mt-2 z-50 w-56 bg-gray-900 text-white rounded-2xl shadow-2xl p-3 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                <p className="text-xs font-black mb-1">Creator+ Required</p>
                <p className="text-[11px] text-gray-300 mb-2.5 leading-snug">Hosting listings requires a Creator+ account.</p>
                <button onClick={() => { captureSnapshot(); navigate('/creator-plus-steps'); }}
                  className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-bold rounded-xl pointer-events-auto transition-colors">
                  Upgrade Now ⚡
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => { captureSnapshot(); navigate('/create-listing'); }}
              className="bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-xl shrink-0 hover:bg-blue-700 active:scale-95 transition-all">
              + List
            </button>
          )}
        </div>

        {/* Row 2: Category chips */}
        <div className="flex gap-2 px-3 pb-2.5 overflow-x-auto no-scrollbar">
          {CATEGORIES.map(cat => {
            const active = category === cat.label;
            return (
              <button key={cat.label} onClick={() => handleCategoryChange(cat.label)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 whitespace-nowrap ${
                  active ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                <span>{cat.emoji}</span> {cat.label}
              </button>
            );
          })}

          {userLocation && (
            <span className="shrink-0 flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full font-medium">
              <Navigation className="w-2.5 h-2.5"/> {userLocation.city || 'Near you'}
            </span>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="pt-4 pb-28">
        {loading ? (
          <div className="px-3 grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white overflow-hidden animate-pulse shadow-sm">
                <div className="aspect-[4/3] bg-gray-100"/>
                <div className="p-2.5 space-y-1.5">
                  <div className="h-2.5 bg-gray-100 rounded w-3/4"/>
                  <div className="h-2 bg-gray-100 rounded w-1/2"/>
                </div>
              </div>
            ))}
          </div>

        ) : filtered.length === 0 ? (
          <div className="text-center py-24 px-6">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-base font-black text-gray-900 mb-1">No listings found</h3>
            <p className="text-sm text-gray-400 mb-5">
              {hasFilters ? 'No listings match your filters.' : `Nothing in "${category}" yet.`}
            </p>
            <button onClick={() => { setFilters(DEFAULT_FILTERS); handleCategoryChange('All'); }}
              className="bg-blue-600 text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-blue-700 active:scale-95 transition-all">
              Clear filters
            </button>
          </div>

        ) : (
          <div>
            {/* Category header */}
            <div className="flex items-center justify-between px-4 mb-4">
              <div>
                <p className="text-lg font-black text-gray-900">
                  {CATEGORIES.find(c => c.label === category)?.emoji} {category}
                </p>
                <p className="text-xs text-gray-400">{filtered.length} listings · swipe to browse</p>
              </div>
              {hasFilters && (
                <button onClick={() => { setFilters(DEFAULT_FILTERS); setSwipeKey(k => k + 1); }}
                  className="text-xs text-blue-600 font-semibold bg-blue-50 px-3 py-1.5 rounded-full">
                  Clear filters
                </button>
              )}
            </div>

            <SwipeStack key={swipeKey} listings={filtered} onDone={() => {}}/>
          </div>
        )}
      </div>
    </div>
  );
}
