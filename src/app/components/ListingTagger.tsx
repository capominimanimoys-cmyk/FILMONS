/**
 * Filmons — ListingTagger (Light Mode)
 * Full-screen: tap on media to place listing tags.
 * src/app/components/ListingTagger.tsx
 */
import { useState, useRef, useEffect } from 'react';
import { X, Tag, Check, Search, ChevronRight, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Listing } from '../types';

export interface ListingPin {
  listingId: string;
  title:     string;
  price?:    number;
  mode?:     string;
  image?:    string;
  city?:     string;
  x:         number;
  y:         number;
}

interface Props {
  photoUrl:  string;
  pins:      ListingPin[];
  setPins:   (p: ListingPin[]) => void;
  onClose:   () => void;
}

function mapListing(l: any): Listing {
  return {
    ...l,
    listingMode:     l.listing_mode,
    listingType:     l.listing_type,
    serviceCategory: l.service_category,
    pricingPackages: l.pricing_packages,
    images: Array.isArray(l.images) ? l.images : l.image ? [l.image] : [],
  } as Listing;
}

export function ListingTagger({ photoUrl, pins, setPins, onClose }: Props) {
  const [pendingPos, setPendingPos] = useState<{x:number;y:number}|null>(null);
  const [search,     setSearch]     = useState('');
  const [results,    setResults]    = useState<Listing[]>([]);
  const [searching,  setSearching]  = useState(false);
  const imgRef    = useRef<HTMLDivElement>(null);
  const timer     = useRef<ReturnType<typeof setTimeout>|null>(null);
  const searchRef = useRef('');

  // Load from cache instantly, then refresh from DB
  useEffect(() => {
    // Instant: load from localStorage cache
    try {
      const raw = localStorage.getItem('filmons_listings');
      if (raw) {
        const cached = JSON.parse(raw).map(mapListing);
        setResults(cached);
      }
    } catch {}
    // Then refresh from DB
    doSearch('');
  }, []);

  const doSearch = async (q: string) => {
    searchRef.current = q;
    setSearching(true);
    try {
      const trimmed = q.trim();
      const { data, error } = trimmed
        ? await supabase
            .from('listings')
            .select('id, title, price, listing_mode, listing_type, service_category, images, image, city, pricing_packages, user_id')
            .ilike('title', `%${trimmed}%`)
            .order('created_at', { ascending: false })
            .limit(40)
        : await supabase
            .from('listings')
            .select('id, title, price, listing_mode, listing_type, service_category, images, image, city, pricing_packages, user_id')
            .order('created_at', { ascending: false })
            .limit(40);

      // Ignore if user has already typed something different
      if (searchRef.current !== q) return;

      if (!error) {
        const mapped = (data ?? []).map(mapListing);
        setResults(mapped);
        if (!trimmed && data?.length) {
          try { localStorage.setItem('filmons_listings', JSON.stringify(data)); } catch {}
        }
      }
    } catch (e) {
      console.error('[ListingTagger]', e);
    } finally {
      if (searchRef.current === q) setSearching(false);
    }
  };

  const handleSearch = (q: string) => {
    setSearch(q);
    // Filter cached results immediately for instant feedback
    try {
      const raw = localStorage.getItem('filmons_listings');
      if (raw && q.trim()) {
        const cached = JSON.parse(raw).map(mapListing);
        const filtered = cached.filter((l: Listing) =>
          l.title?.toLowerCase().includes(q.toLowerCase())
        );
        setResults(filtered);
      }
    } catch {}
    // Then fetch from DB
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => doSearch(q), 300);
  };

  const handleImgTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width)  * 100);
    const y = Math.round(((e.clientY - rect.top)  / rect.height) * 100);
    setPendingPos({x, y});
  };

  const pickListing = (listing: Listing) => {
    if (!pendingPos) return;
    if (pins.length >= 5) { alert('Maximum 5 listings per post'); return; }
    const price = listing.pricingPackages?.[0]?.price ?? listing.price;
    const img   = listing.images?.[0] ?? (listing as any).image;
    setPins([...pins, {
      listingId: String(listing.id),
      title:     listing.title,
      price:     price ? Number(price) : undefined,
      mode:      listing.listingMode,
      image:     img,
      city:      listing.city,
      x:         pendingPos.x,
      y:         pendingPos.y,
    }]);
    setPendingPos(null);
  };

  const removePin = (idx: number) => setPins(pins.filter((_,i) => i !== idx));

  return (
    <div className="fixed inset-0 z-[92] bg-white flex flex-col"
      style={{paddingBottom:'env(safe-area-inset-bottom)', animation:'listingTaggerIn 0.32s cubic-bezier(0.32,0.72,0,1)'}}>
      <style>{`@keyframes listingTaggerIn{from{transform:translateY(100%);opacity:0.8}to{transform:translateY(0);opacity:1}}`}</style>

      {/* ── Nav ── */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 shrink-0 border-b border-gray-100">
        <button onClick={onClose}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
          <X className="w-5 h-5 text-gray-600"/>
        </button>
        <p className="text-sm font-black text-gray-900">Tag Listings</p>
        <button onClick={onClose}
          className="px-4 py-1.5 rounded-full text-sm font-black text-white"
          style={{background:'#51A2FF'}}>
          Done{pins.length > 0 ? ` (${pins.length})` : ''}
        </button>
      </div>

      {/* ── Photo + pins ── */}
      <div className="px-4 pt-4 shrink-0">
        <div ref={imgRef}
          className="relative rounded-2xl overflow-hidden cursor-crosshair bg-gray-100"
          style={{height:'40vh'}}
          onClick={handleImgTap}>
          <img src={photoUrl} alt="" className="w-full h-full object-cover"/>

          {/* Placed pins */}
          {pins.map((pin,i) => (
            <div key={i} className="absolute" style={{left:`${pin.x}%`,top:`${pin.y}%`,transform:'translate(-50%,-100%)'}}>
              <div className="bg-white rounded-xl shadow-lg px-2.5 py-1.5 flex items-center gap-1.5 whitespace-nowrap border border-gray-100">
                <Tag className="w-3 h-3 text-blue-500 shrink-0"/>
                <p className="text-[11px] font-black text-gray-900 max-w-[90px] truncate">{pin.title}</p>
                {pin.price && <p className="text-[10px] font-bold text-blue-500">${pin.price}{pin.mode==='rent'?'/d':''}</p>}
                <button onClick={e=>{e.stopPropagation();removePin(i);}}
                  className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center ml-1 shrink-0">
                  <X className="w-2.5 h-2.5 text-gray-500"/>
                </button>
              </div>
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-0 h-0"
                style={{borderLeft:'6px solid transparent',borderRight:'6px solid transparent',borderTop:'6px solid white'}}/>
            </div>
          ))}

          {/* Pending dot */}
          {pendingPos && (
            <div className="absolute w-4 h-4 rounded-full border-2 border-white bg-blue-500 shadow-md"
              style={{left:`${pendingPos.x}%`,top:`${pendingPos.y}%`,transform:'translate(-50%,-50%)'}}/>
          )}

          {/* Hint */}
          {!pendingPos && pins.length === 0 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 rounded-full px-4 py-1.5 pointer-events-none">
              <p className="text-white text-[11px] font-semibold whitespace-nowrap">Tap photo to tag a listing</p>
            </div>
          )}

          {/* Pending hint */}
          {pendingPos && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-blue-500 rounded-full px-4 py-1.5 pointer-events-none">
              <p className="text-white text-[11px] font-semibold whitespace-nowrap">Now pick a listing below</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Listing picker ── */}
      <div className="flex-1 overflow-hidden flex flex-col mt-3 px-4">
        {/* Search */}
        <div className="relative mb-2 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <input
            value={search}
            onChange={e=>handleSearch(e.target.value)}
            placeholder="Search listings…"
            className="w-full bg-gray-100 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
          )}
        </div>

        {!pendingPos && (
          <p className="text-xs text-gray-400 text-center mb-2 shrink-0">Tap the photo first to choose where to place a tag</p>
        )}
        {pendingPos && (
          <p className="text-xs text-blue-500 font-semibold text-center mb-2 shrink-0">Pick a listing to tag at the selected spot</p>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto space-y-1 pb-4">
          {results.length === 0 && !searching && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Tag className="w-8 h-8 text-gray-200"/>
              <p className="text-sm text-gray-400">No listings found</p>
            </div>
          )}
          {results.map(listing => {
            const img      = listing.images?.[0] ?? (listing as any).image;
            const price    = listing.pricingPackages?.[0]?.price ?? listing.price;
            const isPinned = pins.some(p => p.listingId === String(listing.id));
            return (
              <button key={listing.id}
                onClick={()=>{ if(pendingPos) pickListing(listing); }}
                disabled={isPinned || pins.length >= 5}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl border border-gray-100 text-left transition-all active:scale-[0.98] disabled:opacity-40"
                style={pendingPos ? {background:'#fff',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'} : {background:'#f9f9f9'}}>
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-200 shrink-0">
                  {img
                    ? <img src={img} className="w-full h-full object-cover" loading="lazy"/>
                    : <div className="w-full h-full flex items-center justify-center text-xl">🎥</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{listing.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {price && <p className="text-xs font-bold text-blue-500">${price}{listing.listingMode==='rent'?'/day':''}</p>}
                    {listing.city && (
                      <p className="text-xs text-gray-400 flex items-center gap-0.5 truncate">
                        <MapPin className="w-2.5 h-2.5 shrink-0"/>{listing.city}
                      </p>
                    )}
                  </div>
                </div>
                {isPinned
                  ? <div className="w-6 h-6 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-green-500"/>
                    </div>
                  : pendingPos
                    ? <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <Tag className="w-3.5 h-3.5 text-blue-500"/>
                      </div>
                    : <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}