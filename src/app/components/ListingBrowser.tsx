/**
 * Filmons — ListingBrowser
 * Bottom sheet: browse & attach your marketplace listings to a post
 * src/app/components/ListingBrowser.tsx
 */
import { useState, useEffect, useMemo } from 'react';
import { X, Search, MapPin, Tag, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Listing } from '../types';

interface ListingBrowserProps {
  selectedIds: Set<string>;
  onToggle:    (listing: Listing) => void;
  onClose:     () => void;
}

const CATEGORIES = [
  { id:'all',     label:'All'       },
  { id:'gear',    label:'Equipment' },
  { id:'service', label:'Services'  },
];

// Map a raw DB/cache row to a Listing
function mapListing(l: any): Listing {
  return {
    ...l,
    userId:          l.user_id      ?? l.userId,
    createdAt:       l.created_at   ?? l.createdAt,
    listingType:     l.listing_type ?? l.listingType ?? 'gear',
    listingMode:     l.listing_mode ?? l.listingMode,
    serviceCategory: l.service_category ?? l.serviceCategory,
    pricingPackages: l.pricing_packages  ?? l.pricingPackages,
    images: Array.isArray(l.images) ? l.images : l.image ? [l.image] : [],
  } as Listing;
}

// Load from localStorage cache instantly
function loadCached(): Listing[] {
  try {
    const raw = localStorage.getItem('filmons_listings');
    if (!raw) return [];
    const all: Listing[] = JSON.parse(raw);
    return all.map(mapListing);
  } catch { return []; }
}

function ListingCard({ listing, selected, onSelect }: {
  listing: Listing; selected: boolean; onSelect: () => void;
}) {
  const img   = listing.images?.[0] ?? listing.image;
  const price = listing.pricingPackages?.[0]?.price ?? listing.price;
  const unit  = listing.listingMode === 'rent' ? '/day' : '';

  return (
    <button onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
      style={{borderTop:'1px solid #f3f4f6'}}>
      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gray-100 shrink-0 relative">
        {img
          ? <img src={img} className="w-full h-full object-cover" loading="lazy"/>
          : <div className="w-full h-full flex items-center justify-center"><Tag className="w-6 h-6 text-gray-300"/></div>}
        {selected && (
          <div className="absolute inset-0 bg-blue-600/80 flex items-center justify-center rounded-2xl">
            <Check className="w-6 h-6 text-white"/>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-gray-900 truncate">{listing.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs font-bold" style={{color:'#51A2FF'}}>${price}{unit}</p>
          {listing.city && (
            <p className="text-xs text-gray-400 flex items-center gap-0.5 truncate">
              <MapPin className="w-3 h-3 shrink-0"/> {listing.city}
            </p>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5 capitalize">
          {listing.listingType === 'service'
            ? (listing.serviceCategory?.replace(/-/g,' ') || 'Service')
            : listing.listingMode === 'sale' ? 'Equipment · Sale' : 'Equipment · Rental'}
        </p>
      </div>
    </button>
  );
}

export function ListingBrowser({ selectedIds, onToggle, onClose }: ListingBrowserProps) {
  const { user } = useAuth();

  // Load cache instantly — no loading state if cache exists
  const [listings, setListings] = useState<Listing[]>(() => loadCached());
  const [refreshing, setRefreshing] = useState(listings.length === 0);
  const [query,    setQuery]    = useState('');
  const [category, setCategory] = useState('all');

  // Background refresh from Supabase
  useEffect(() => {
    if (!user) return;
    setRefreshing(true);
    if (!user) { setRefreshing(false); return; }
    supabase
      .from('listings')
      .select('id, title, price, city, listing_type, listing_mode, service_category, pricing_packages, images, image, user_id, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data?.length) {
          const mapped = data.map(mapListing);
          setListings(mapped);
          // Update cache
          try {
            localStorage.setItem('filmons_listings', JSON.stringify(data));
          } catch {}
        }
      })
      .finally(() => setRefreshing(false));
  }, [user?.id]);

  // Filter
  const filtered = useMemo(() => {
    let result = listings;
    if (category !== 'all') {
      result = result.filter(l =>
        category === 'gear' ? l.listingType === 'gear' : l.listingType === 'service'
      );
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(l =>
        l.title?.toLowerCase().includes(q) ||
        l.city?.toLowerCase().includes(q) ||
        (l.serviceCategory ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [listings, query, category]);

  return (
    <div className="fixed inset-0 z-[92] flex flex-col justify-end">
      <style>{`@keyframes listingSheetIn{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-t-3xl flex flex-col"
        style={{height:'80vh', animation:'listingSheetIn 0.3s cubic-bezier(0.32,0.72,0,1)', paddingBottom:'env(safe-area-inset-bottom)'}}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-9 h-1 rounded-full bg-gray-200"/>
        </div>

        {/* Header */}
        <div className="px-4 pb-3 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <p className="text-base font-black text-gray-900">Add Listings</p>
              {refreshing && (
                <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button onClick={onClose}
                  className="px-3 py-1.5 rounded-xl text-xs font-black text-white bg-blue-500">
                  Done ({selectedIds.size})
                </button>
              )}
              <button onClick={onClose}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-gray-500"/>
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search your listings…"
              className="w-full bg-gray-100 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors"
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="shrink-0 px-4 py-2 border-b border-gray-50 flex gap-2">
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setCategory(cat.id)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
              style={category === cat.id
                ? {background:'#51A2FF', color:'#fff'}
                : {background:'#f3f4f6', color:'#6b7280'}}>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Selected badge */}
        {selectedIds.size > 0 && (
          <div className="mx-4 my-2 px-3 py-1.5 rounded-xl flex items-center gap-2 shrink-0"
            style={{background:'rgba(81,162,255,0.08)', border:'1px solid rgba(81,162,255,0.2)'}}>
            <Check className="w-3.5 h-3.5 text-blue-500"/>
            <p className="text-xs font-bold text-blue-600">
              {selectedIds.size} listing{selectedIds.size > 1 ? 's' : ''} selected
            </p>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && !refreshing ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Tag className="w-10 h-10 text-gray-200"/>
              <p className="text-sm font-semibold text-gray-400">
                {listings.length === 0 ? 'No listings yet' : 'No listings match'}
              </p>
              {listings.length === 0 && (
                <p className="text-xs text-gray-300 text-center px-8">
                  Create a listing in the marketplace first
                </p>
              )}
            </div>
          ) : (
            <div>
              {filtered.map(listing => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  selected={selectedIds.has(listing.id)}
                  onSelect={() => onToggle(listing)}
                />
              ))}
              <div className="h-6"/>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}