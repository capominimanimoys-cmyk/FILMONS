/**
 * CategoryResults — the full, uncapped Browse Search category page.
 *
 * Reached via "View More" on a Browse Search category preview (see
 * SearchOverlay.tsx's handleViewMoreCategory) once a logged-in user (any
 * tier — Creator, Creator+, Professional, Business all get the same
 * experience here) passes the 5-per-category preview cap. Shows every
 * active listing (or creator profile, for the Creators category) in the
 * category, with no further cap, plus a 4-mode layout switcher
 * (Grid / Large Card / Editorial / Minimal) whose choice is remembered for
 * the rest of this browser session (sessionStorage, not a DB write — this
 * is a display preference, not account data).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Grid3X3, Monitor, LayoutList, AlignJustify,
  MapPin, ChevronRight, Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { withModerationFilter, LISTING_COLUMNS, mapListingRow } from '../lib/api';
import { ListingCard } from '../components/ListingCard';
import { Listing } from '../types';
import { useAuth } from '../context/AuthContext';

type CategoryTab = 'rental' | 'sale' | 'services' | 'creators' | 'studios' | 'opportunities' | 'emergency';
type BrowseLayout = 'grid' | 'large_cards' | 'editorial' | 'minimal';

const CATEGORY_LABEL: Record<CategoryTab, string> = {
  rental: 'Rental', sale: 'Sales', services: 'Services', creators: 'Creators',
  studios: 'Studios', opportunities: 'Opportunities', emergency: 'Emergency',
};

const LAYOUTS: { id: BrowseLayout; label: string; Icon: any }[] = [
  { id: 'grid',        label: 'Grid',        Icon: Grid3X3 },
  { id: 'large_cards', label: 'Large Card',  Icon: Monitor },
  { id: 'editorial',   label: 'Editorial',   Icon: LayoutList },
  { id: 'minimal',     label: 'Minimal',     Icon: AlignJustify },
];

const LAYOUT_KEY = 'filmons_browse_category_layout';

function loadLayout(): BrowseLayout {
  try {
    const v = sessionStorage.getItem(LAYOUT_KEY);
    return (v === 'grid' || v === 'large_cards' || v === 'editorial' || v === 'minimal') ? v : 'grid';
  } catch { return 'grid'; }
}

interface CreatorRow {
  id: string; name: string; username: string | null; avatar_url: string | null;
  city: string | null; location: string | null; primary_role: string | null; is_verified: boolean | null;
}

export function CategoryResults() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, showGuestPrompt } = useAuth();
  const category = (tab && tab in CATEGORY_LABEL ? tab : null) as CategoryTab | null;

  const [layout, setLayout] = useState<BrowseLayout>(loadLayout);
  const [listings, setListings] = useState<Listing[]>([]);
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [loading, setLoading] = useState(true);

  const changeLayout = (l: BrowseLayout) => {
    setLayout(l);
    try { sessionStorage.setItem(LAYOUT_KEY, l); } catch {}
  };

  // The full category page is locked behind account creation for guests
  // (see the Browse Search display-rules spec) -- reachable only via View
  // More from SearchOverlay for a logged-in user, but a guest could still
  // type the URL directly, so guard it here too.
  useEffect(() => {
    if (isAuthenticated) return;
    showGuestPrompt(
      'Create your Filmons account to browse all listings, save listings, contact creators, and apply to opportunities.',
      'Create an account to see more',
    );
    navigate('/search', { replace: true });
  }, [isAuthenticated]);

  useEffect(() => {
    if (!category || !isAuthenticated) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      if (category === 'creators') {
        const res = await supabase.from('profiles')
          .select('id, name, username, avatar_url, city, location, primary_role, is_verified')
          .not('name', 'is', null).neq('name', '').not('primary_role', 'is', null)
          .order('created_at', { ascending: false }).limit(200);
        if (!cancelled) { setCreators((res.data ?? []) as CreatorRow[]); setLoading(false); }
        return;
      }

      const res = await withModerationFilter((filterActive) => {
        let query = supabase.from('listings').select(LISTING_COLUMNS).eq('is_active', true);
        if (filterActive) query = query.eq('moderation_status', 'active');
        switch (category) {
          case 'rental':        query = query.eq('listing_mode', 'rent').neq('listing_type', 'service'); break;
          case 'sale':           query = query.eq('listing_mode', 'sale'); break;
          case 'services':       query = query.eq('listing_type', 'service'); break;
          case 'opportunities':  query = query.eq('listing_type', 'opportunity'); break;
          case 'studios':        query = query.or('title.ilike.%studio%,service_category.ilike.%studio%'); break;
          case 'emergency':      query = query.eq('is_emergency', true).gt('emergency_expires_at', new Date().toISOString()); break;
        }
        return query.order('created_at', { ascending: false }).limit(200);
      });
      if (cancelled) return;
      let mapped = (res.data ?? []).map(mapListingRow);
      // Same defensive exclusion SearchOverlay's fetchCategoryBrowse applies
      // -- the DB filter above can't express "rent and not an opportunity"
      // in one pass.
      if (category === 'rental') mapped = mapped.filter(l => l.listingType !== 'opportunity');
      setListings(mapped);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [category]);

  const gridClass = useMemo(() => {
    switch (layout) {
      case 'grid':        return 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3';
      case 'large_cards':  return 'grid grid-cols-1 sm:grid-cols-2 gap-5';
      case 'editorial':    return 'grid grid-cols-2 gap-4';
      case 'minimal':      return 'flex flex-col';
    }
  }, [layout]);

  if (!category) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Unknown category.
      </div>
    );
  }

  const isCreators = category === 'creators';
  const count = isCreators ? creators.length : listings.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3 px-4" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors shrink-0 active:scale-90">
            <ArrowLeft className="w-5 h-5 text-gray-700"/>
          </button>
          <div className="min-w-0">
            <p className="text-base font-black text-gray-900 truncate">{CATEGORY_LABEL[category]}</p>
            {!loading && <p className="text-xs text-gray-400">{count} {count === 1 ? 'result' : 'results'}</p>}
          </div>
        </div>

        {/* ── Layout selector ── */}
        <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto no-scrollbar">
          {LAYOUTS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => changeLayout(id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 border ${
                layout === id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}>
              <Icon className="w-3.5 h-3.5"/> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin"/>
            <span className="text-sm">Loading…</span>
          </div>
        ) : count === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-1">
            <p className="text-sm font-bold text-gray-500">No {CATEGORY_LABEL[category].toLowerCase()} listings right now</p>
            <p className="text-xs text-gray-400">Check back soon, or try a different category.</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={layout}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}>
              {isCreators
                ? <CreatorsLayout creators={creators} layout={layout} onNavigate={id => navigate(`/host/${id}`)}/>
                : <ListingsLayout listings={listings} layout={layout} gridClass={gridClass!}/>
              }
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

// ── Listings ──────────────────────────────────────────────────────────────────
function ListingsLayout({ listings, layout, gridClass }: { listings: Listing[]; layout: BrowseLayout; gridClass: string }) {
  if (layout === 'minimal') {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
        {listings.map(l => <MinimalListingRow key={l.id} listing={l}/>)}
      </div>
    );
  }
  if (layout === 'editorial') {
    const [first, ...rest] = listings;
    return (
      <div className="space-y-4">
        {first && (
          <div className="pop-stagger">
            <ListingCard listing={first} className="[&_img]:aspect-[16/9]"/>
          </div>
        )}
        <div className="pop-stagger grid grid-cols-2 gap-4">
          {rest.map(l => <ListingCard key={l.id} listing={l}/>)}
        </div>
      </div>
    );
  }
  return (
    <div className={`pop-stagger ${gridClass}`}>
      {listings.map(l => <ListingCard key={l.id} listing={l}/>)}
    </div>
  );
}

function MinimalListingRow({ listing }: { listing: Listing }) {
  const navigate = useNavigate();
  const price = `$${Number(listing.price ?? 0).toLocaleString()}${listing.listingMode === 'rent' ? '/day' : ''}`;
  const category = listing.listingKind === 'talent' ? 'Opportunity' : listing.serviceCategory || listing.listingType;
  return (
    <button onClick={() => navigate(`/listing/${listing.id}`)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
      <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0">
        {listing.images?.[0] && <img src={listing.images[0]} className="w-full h-full object-cover" alt=""/>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-900 truncate">{listing.title}</p>
        <p className="text-xs text-gray-400 truncate">
          {price} · {listing.city}{category ? ` · ${category}` : ''}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
    </button>
  );
}

// ── Creators ──────────────────────────────────────────────────────────────────
function CreatorsLayout({ creators, layout, onNavigate }: { creators: CreatorRow[]; layout: BrowseLayout; onNavigate: (id: string) => void }) {
  if (layout === 'grid') {
    return (
      <div className="pop-stagger grid grid-cols-3 sm:grid-cols-4 gap-4">
        {creators.map(u => (
          <button key={u.id} onClick={() => onNavigate(u.id)} className="flex flex-col items-center gap-1.5 text-center active:opacity-70">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
              {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt=""/>
                : <div className="w-full h-full flex items-center justify-center text-lg font-black text-gray-400">{u.name?.[0]?.toUpperCase() ?? '?'}</div>}
            </div>
            <p className="text-xs font-bold text-gray-900 truncate w-full">{u.name}</p>
            {u.primary_role && <p className="text-[10px] text-blue-600 truncate w-full">{u.primary_role}</p>}
          </button>
        ))}
      </div>
    );
  }
  if (layout === 'large_cards') {
    return (
      <div className="pop-stagger grid grid-cols-1 sm:grid-cols-2 gap-4">
        {creators.map(u => (
          <button key={u.id} onClick={() => onNavigate(u.id)}
            className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 hover:shadow-sm transition-shadow text-left">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
              {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt=""/>
                : <div className="w-full h-full flex items-center justify-center text-lg font-black text-gray-400">{u.name?.[0]?.toUpperCase() ?? '?'}</div>}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{u.name}</p>
              {u.primary_role && <p className="text-xs text-blue-600 font-medium truncate">{u.primary_role}</p>}
              {(u.city ?? u.location) && (
                <p className="text-[11px] text-gray-400 flex items-center gap-0.5 mt-0.5"><MapPin className="w-2.5 h-2.5"/>{u.city ?? u.location}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  }
  if (layout === 'editorial') {
    return (
      <div className="space-y-3">
        {creators.map(u => (
          <button key={u.id} onClick={() => onNavigate(u.id)}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 hover:shadow-sm transition-shadow text-left">
            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
              {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt=""/>
                : <div className="w-full h-full flex items-center justify-center text-base font-black text-gray-400">{u.name?.[0]?.toUpperCase() ?? '?'}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 truncate">{u.name}{u.username ? <span className="text-gray-400 font-normal"> @{u.username}</span> : null}</p>
              {u.primary_role && <p className="text-xs text-blue-600 font-medium truncate">{u.primary_role}</p>}
              {(u.city ?? u.location) && (
                <p className="text-[11px] text-gray-400 flex items-center gap-0.5 mt-0.5"><MapPin className="w-2.5 h-2.5"/>{u.city ?? u.location}</p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
          </button>
        ))}
      </div>
    );
  }
  // Minimal
  return (
    <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
      {creators.map(u => (
        <button key={u.id} onClick={() => onNavigate(u.id)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 shrink-0">
            {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt=""/>
              : <div className="w-full h-full flex items-center justify-center text-xs font-black text-gray-400">{u.name?.[0]?.toUpperCase() ?? '?'}</div>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 truncate">{u.name}</p>
            <p className="text-xs text-gray-400 truncate">{u.primary_role ?? (u.city ?? u.location ?? '')}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
        </button>
      ))}
    </div>
  );
}
