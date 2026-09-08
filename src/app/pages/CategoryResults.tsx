/**
 * CategoryResults — the full, uncapped Browse Search category page
 * (/search/category/:tab).
 *
 * Reached via "View More" on a Browse Search category preview (see
 * SearchOverlay.tsx's handleViewMoreCategory) once a logged-in user (any
 * tier — Creator, Creator+, Professional, Business all get the same
 * experience here, Emergency excepted below) passes the 5-per-category
 * preview cap. Shows every matching listing/creator, paginated (not one
 * giant DOM dump), with its own in-category search, category-aware
 * filters, sort, and a 4-mode layout switcher (Grid / Large Card /
 * Editorial / Minimal) whose choice is one global session preference
 * shared across every category (sessionStorage, not a DB write — this is
 * a display preference, not account data).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, LayoutGrid, RectangleHorizontal, PanelsTopLeft, List,
  MapPin, ChevronRight, Loader2, Search, X, SlidersHorizontal, ArrowUpDown, Lock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { withModerationFilter, LISTING_COLUMNS, mapListingRow, savedListingsApi } from '../lib/api';
import { ListingCard } from '../components/ListingCard';
import { Listing } from '../types';
import { useAuth } from '../context/AuthContext';
import { isProfessional } from '../lib/reliabilityApi';

// ── Category + URL plural mapping ────────────────────────────────────────────
// Internal ids stay singular (matching SearchOverlay's TabId elsewhere in the
// app); the spec's URLs are plural for rental/sale specifically
// (/search/category/rentals, /search/category/sales) -- everything else is
// already the same singular/plural.
type CategoryTab = 'rental' | 'sale' | 'services' | 'creators' | 'studios' | 'opportunities' | 'emergency';
const URL_TO_CATEGORY: Record<string, CategoryTab> = {
  rentals: 'rental', rental: 'rental',
  sales: 'sale', sale: 'sale',
  services: 'services', creators: 'creators', studios: 'studios',
  opportunities: 'opportunities', emergency: 'emergency',
};
const CATEGORY_TO_URL: Record<CategoryTab, string> = {
  rental: 'rentals', sale: 'sales', services: 'services', creators: 'creators',
  studios: 'studios', opportunities: 'opportunities', emergency: 'emergency',
};
const CATEGORY_LABEL: Record<CategoryTab, string> = {
  rental: 'Rentals', sale: 'Sales', services: 'Services', creators: 'Creators',
  studios: 'Studios', opportunities: 'Opportunities', emergency: 'Emergency',
};

type BrowseLayout = 'grid' | 'large_cards' | 'editorial' | 'minimal';
const LAYOUTS: { id: BrowseLayout; label: string; Icon: any }[] = [
  { id: 'grid',        label: 'Grid',        Icon: LayoutGrid },
  { id: 'large_cards', label: 'Large Card',  Icon: RectangleHorizontal },
  { id: 'editorial',   label: 'Editorial',   Icon: PanelsTopLeft },
  { id: 'minimal',     label: 'Minimal',     Icon: List },
];
// One global preference shared across every category for the session --
// switching Rentals to Editorial then opening Services should also open in
// Editorial. Resets to Grid (the default) on a fresh browser session since
// sessionStorage itself doesn't survive one.
const LAYOUT_KEY = 'filmons-category-layout';

function loadLayout(): BrowseLayout {
  try {
    const v = sessionStorage.getItem(LAYOUT_KEY);
    return (v === 'grid' || v === 'large_cards' || v === 'editorial' || v === 'minimal') ? v : 'grid';
  } catch { return 'grid'; }
}

type SortOption = 'recommended' | 'price_asc' | 'price_desc';
const CATEGORY_SORTS: Record<CategoryTab, { value: SortOption; label: string }[]> = {
  rental:        [{ value: 'recommended', label: 'Recommended' }, { value: 'price_asc', label: 'Price: Low to High' }, { value: 'price_desc', label: 'Price: High to Low' }],
  sale:          [{ value: 'recommended', label: 'Recommended' }, { value: 'price_asc', label: 'Price: Low to High' }, { value: 'price_desc', label: 'Price: High to Low' }],
  services:      [{ value: 'recommended', label: 'Recommended' }, { value: 'price_asc', label: 'Price: Low to High' }, { value: 'price_desc', label: 'Price: High to Low' }],
  studios:       [{ value: 'recommended', label: 'Recommended' }, { value: 'price_asc', label: 'Price: Low to High' }, { value: 'price_desc', label: 'Price: High to Low' }],
  emergency:     [{ value: 'recommended', label: 'Recommended' }, { value: 'price_asc', label: 'Price: Low to High' }, { value: 'price_desc', label: 'Price: High to Low' }],
  opportunities: [{ value: 'recommended', label: 'Recommended' }],
  creators:      [{ value: 'recommended', label: 'Recommended' }],
};

// Category-aware filters -- a practical subset per category (not every
// conceivable field), rendered generically from this config rather than a
// bespoke UI per category. Filtered client-side on the fetched page (the
// columns backing condition/delivery/paid/verified aren't ones this file
// otherwise queries against, so this avoids a hard query error if a given
// live schema doesn't have them under this exact name).
interface FilterField { key: string; type: 'toggle' | 'select'; label: string; options?: { value: string; label: string }[] }
const CATEGORY_FILTERS: Record<CategoryTab, FilterField[]> = {
  rental:        [{ key: 'delivery', type: 'toggle', label: 'Delivery available' }],
  sale:          [{ key: 'condition', type: 'select', label: 'Condition', options: [
    { value: 'new', label: 'New' }, { value: 'like-new', label: 'Like New' }, { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' },
  ] }],
  services:      [],
  studios:       [],
  emergency:     [],
  opportunities: [{ key: 'paidOnly', type: 'toggle', label: 'Paid only' }],
  creators:      [{ key: 'verifiedOnly', type: 'toggle', label: 'Verified only' }],
};

const PAGE_SIZE = 30;

interface CreatorRow {
  id: string; name: string; username: string | null; avatar_url: string | null;
  city: string | null; location: string | null; primary_role: string | null; is_verified: boolean | null;
}

interface CategoryState {
  search: string;
  filters: Record<string, any>;
  sort: SortOption;
  scrollY: number;
}
const stateKey = (cat: CategoryTab) => `filmons_category_state_${cat}`;

function loadState(cat: CategoryTab): CategoryState {
  try {
    const raw = sessionStorage.getItem(stateKey(cat));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { search: '', filters: {}, sort: 'recommended', scrollY: 0 };
}

// Entry point: parses :tab, applies the shared guest guard (the whole full
// category experience -- All included -- is locked behind account
// creation), then routes to either the mixed-everything feed or a single
// category's page.
export function CategoryResults() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, showGuestPrompt } = useAuth();
  const isAll = tab === 'all';
  const category = tab ? URL_TO_CATEGORY[tab] ?? null : null;

  useEffect(() => {
    if (isAuthenticated) return;
    showGuestPrompt(
      'Create your Filmons account to browse all listings, save listings, contact creators, and apply to opportunities.',
      'Sign up to see more listings',
    );
    navigate('/search', { replace: true });
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  if (isAll) return <AllMixedFeed/>;

  if (!category) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-base font-black text-gray-900">Category not found</p>
        <button onClick={() => navigate('/search')}
          className="px-5 py-2.5 rounded-2xl bg-gray-900 text-white text-sm font-bold">
          Back to Browse
        </button>
      </div>
    );
  }

  return <SingleCategoryResults category={category}/>;
}

function SingleCategoryResults({ category }: { category: CategoryTab }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const initialState = useMemo(() => loadState(category), [category]);

  const [layout, setLayout] = useState<BrowseLayout>(loadLayout);
  const [search, setSearch]   = useState(initialState?.search ?? '');
  const [filters, setFilters] = useState<Record<string, any>>(initialState?.filters ?? {});
  const [sort, setSort]       = useState<SortOption>(initialState?.sort ?? 'recommended');
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);

  const [items, setItems]       = useState<Listing[]>([]);
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [page, setPage]         = useState(0);
  const [hasMore, setHasMore]   = useState(true);
  const [loading, setLoading]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const restoredScroll = useRef(false);

  const changeLayout = (l: BrowseLayout) => {
    setLayout(l);
    try { sessionStorage.setItem(LAYOUT_KEY, l); } catch {}
  };

  // Emergency stays behind the Professional/Business gate on the FULL page
  // specifically (the Browse Search preview itself follows the same
  // uniform 2/5 rule as every other category -- only the uncapped page is
  // restricted here).
  const isEmergency = category === 'emergency';
  const emergencyLocked = isEmergency && !isProfessional(user?.accountType);

  // Persist search/filters/sort/scroll per category (not the layout, which
  // is a single global preference handled separately) so returning from a
  // listing's detail page (or just re-opening this same category later in
  // the session) restores exactly where the user left off.
  useEffect(() => {
    if (!category) return;
    const scrollY = scrollRef.current?.scrollTop ?? 0;
    try { sessionStorage.setItem(stateKey(category), JSON.stringify({ search, filters, sort, scrollY })); } catch {}
  }, [category, search, filters, sort]);

  const saveScroll = useCallback(() => {
    if (!category || !scrollRef.current) return;
    try {
      const raw = sessionStorage.getItem(stateKey(category));
      const cur = raw ? JSON.parse(raw) : {};
      sessionStorage.setItem(stateKey(category), JSON.stringify({ ...cur, scrollY: scrollRef.current.scrollTop }));
    } catch {}
  }, [category]);

  const isCreators = category === 'creators';

  // ── Fetch a page ────────────────────────────────────────────────────────────
  const fetchPage = useCallback(async (pageNum: number, replace: boolean) => {
    if (!category) return;
    // Guest/Creator/Creator+ get a permanent 2-listing cap on Emergency,
    // never more, regardless of how many really exist -- fetch just enough
    // to know whether there's at least one, no pagination beyond that.
    if (emergencyLocked && pageNum > 0) return;
    if (pageNum === 0) setLoading(true); else setLoadingMore(true);
    const from = emergencyLocked ? 0 : pageNum * PAGE_SIZE;
    const to = emergencyLocked ? 1 : from + PAGE_SIZE - 1;

    if (category === 'creators') {
      let q = supabase.from('profiles')
        .select('id, name, username, avatar_url, city, location, primary_role, is_verified', { count: 'exact' })
        .not('name', 'is', null).neq('name', '').not('primary_role', 'is', null);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`name.ilike.${term},username.ilike.${term},primary_role.ilike.${term},city.ilike.${term}`);
      }
      const res = await q.order('created_at', { ascending: false }).range(from, to);
      let rows = (res.data ?? []) as CreatorRow[];
      if (filters.verifiedOnly) rows = rows.filter(r => r.is_verified);
      setCreators(prev => replace ? rows : [...prev, ...rows]);
      setTotalCount(res.count ?? null);
      setHasMore(rows.length === PAGE_SIZE);
      setLoading(false); setLoadingMore(false);
      return;
    }

    const res = await withModerationFilter((filterActive) => {
      let q = supabase.from('listings').select(LISTING_COLUMNS, { count: 'exact' }).eq('is_active', true);
      if (filterActive) q = q.eq('moderation_status', 'active');
      switch (category) {
        case 'rental':        q = q.eq('listing_mode', 'rent').neq('listing_type', 'service'); break;
        case 'sale':           q = q.eq('listing_mode', 'sale'); break;
        case 'services':       q = q.eq('listing_type', 'service'); break;
        case 'opportunities':  q = q.eq('listing_type', 'opportunity'); break;
        case 'studios':        q = q.or('title.ilike.%studio%,service_category.ilike.%studio%'); break;
        case 'emergency':      q = q.eq('is_emergency', true).gt('emergency_expires_at', new Date().toISOString()); break;
      }
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`title.ilike.${term},description.ilike.${term},city.ilike.${term},service_category.ilike.${term}`);
      }
      if (sort === 'price_asc') q = q.order('price', { ascending: true });
      else if (sort === 'price_desc') q = q.order('price', { ascending: false });
      else q = q.order('created_at', { ascending: false });
      return q.range(from, to);
    });

    let mapped = (res.data ?? []).map(mapListingRow);
    if (category === 'rental') mapped = mapped.filter(l => l.listingType !== 'opportunity');
    if (filters.condition) mapped = mapped.filter(l => l.condition === filters.condition);
    if (filters.delivery) mapped = mapped.filter(l => (l.deliveryOptions ?? []).includes('delivery'));
    if (filters.paidOnly) mapped = mapped.filter(l => !!l.opportunity?.paid);

    setItems(prev => replace ? mapped : [...prev, ...mapped]);
    setTotalCount(res.count ?? null);
    setHasMore(mapped.length === PAGE_SIZE);
    setLoading(false); setLoadingMore(false);
  }, [category, search, sort, filters, emergencyLocked]);

  // Refetch page 0 whenever category/search/sort/filters change.
  useEffect(() => {
    setPage(0);
    setItems([]); setCreators([]);
    restoredScroll.current = false;
    fetchPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, search, sort, JSON.stringify(filters), emergencyLocked]);

  // Restore scroll position once, after the first page for this category lands.
  useEffect(() => {
    if (restoredScroll.current || loading || !scrollRef.current || !initialState?.scrollY) return;
    scrollRef.current.scrollTop = initialState.scrollY;
    restoredScroll.current = true;
  }, [loading, initialState]);

  // Infinite scroll -- fetch the next page when the sentinel at the bottom
  // of the list scrolls into view. Never loads hundreds of cards up front;
  // "uncapped" only means no artificial account-tier preview limit, not
  // "everything in the DOM at once".
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || loading || loadingMore || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setPage(p => { const next = p + 1; fetchPage(next, false); return next; });
      }
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loading, loadingMore, hasMore, fetchPage]);

  const clearFilters = () => setFilters({});
  const activeFilterCount = Object.keys(filters).filter(k => filters[k]).length;

  if (!category) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-base font-black text-gray-900">Category not found</p>
        <button onClick={() => navigate('/search')}
          className="px-5 py-2.5 rounded-2xl bg-gray-900 text-white text-sm font-bold">
          Back to Browse
        </button>
      </div>
    );
  }

  const count = totalCount ?? (isCreators ? creators.length : items.length);
  const categoryFilterFields = CATEGORY_FILTERS[category];
  const sortOptions = CATEGORY_SORTS[category];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Compact category header ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3 px-4" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '10px' }}>
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors shrink-0 active:scale-90">
            <ArrowLeft className="w-5 h-5 text-gray-700"/>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-gray-900 truncate">{CATEGORY_LABEL[category]}</p>
            {/* Never show a real count while Emergency is locked -- even
                the total would leak whether more listings exist. */}
            {!loading && !emergencyLocked && <p className="text-xs text-gray-400">{count} {count === 1 ? 'result' : 'results'}</p>}
          </div>
        </div>

        {/* Search/filters/sort are hidden while Emergency is locked -- any
            of them could otherwise be used to probe for hidden listings
            (e.g. searching a specific term and seeing whether a card
            appears), which is exactly what the "never reveal whether more
            are hidden" rule is meant to prevent. The layout switcher stays
            available since it reveals nothing. */}
        {!emergencyLocked && (
          <>
            {/* ── In-category search ── */}
            <div className="px-4 pb-2.5">
              <div className="flex items-center gap-2 bg-gray-100 rounded-2xl px-3.5 py-2.5">
                <Search className="w-4 h-4 text-gray-400 shrink-0"/>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={`Search ${CATEGORY_LABEL[category].toLowerCase()}…`}
                  className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"/>
                {search && (
                  <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4"/>
                  </button>
                )}
              </div>
            </div>

            {/* ── Active filter chips ── */}
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-1.5 px-4 pb-3 overflow-x-auto no-scrollbar">
                {categoryFilterFields.filter(f => filters[f.key]).map(f => (
                  <span key={f.key} className="shrink-0 flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">
                    {f.type === 'toggle' ? f.label : `${f.label}: ${f.options?.find(o => o.value === filters[f.key])?.label}`}
                    <button onClick={() => setFilters(prev => { const next = { ...prev }; delete next[f.key]; return next; })}
                      className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-indigo-100">
                      <X className="w-3 h-3"/>
                    </button>
                  </span>
                ))}
                <button onClick={clearFilters} className="shrink-0 text-xs font-bold text-gray-400 hover:text-gray-600 px-1.5">
                  Clear all
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Filters / Sort / Layout controls ── */}
        <div className="flex items-center justify-between gap-2 px-4 pb-3">
          <div className="flex items-center gap-1.5">
            {!emergencyLocked && categoryFilterFields.length > 0 && (
              <button onClick={() => setShowFilters(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                <SlidersHorizontal className="w-3.5 h-3.5"/> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
            )}
            {!emergencyLocked && sortOptions.length > 1 && (
              <button onClick={() => setShowSort(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                <ArrowUpDown className="w-3.5 h-3.5"/> Sort
              </button>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {LAYOUTS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => changeLayout(id)} title={label} aria-label={label}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-95 ${
                  layout === id ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-100'
                }`}>
                <Icon className="w-4 h-4"/>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div ref={scrollRef} onScroll={saveScroll} className="flex-1 overflow-y-auto px-4 py-4">
        {emergencyLocked ? (
          loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin"/>
            </div>
          ) : (
            <EmergencyLockedNotice
              previewItems={items.slice(0, 2)}
              onUpgrade={() => navigate('/account/upgrade?auto=professional')}
            />
          )
        ) : loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin"/>
            <span className="text-sm">Loading…</span>
          </div>
        ) : count === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div>
              <p className="text-sm font-bold text-gray-500">No {CATEGORY_LABEL[category].toLowerCase()} found</p>
              <p className="text-xs text-gray-400 mt-1">Try changing your search, location, or filters.</p>
            </div>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold">
                  Clear filters
                </button>
              )}
              <button onClick={() => navigate('/search')} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold">
                Back to Browse
              </button>
            </div>
          </div>
        ) : (
          <>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={layout}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ enter: { duration: 0.2 }, exit: { duration: 0.14 } } as any}>
                {isCreators
                  ? <CreatorsLayout creators={creators} layout={layout} onNavigate={id => navigate(`/host/${id}`)}/>
                  : <ListingsLayout listings={items} layout={layout}/>
                }
              </motion.div>
            </AnimatePresence>
            <div ref={sentinelRef} className="h-1"/>
            {loadingMore && (
              <div className="flex items-center justify-center py-6 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin"/>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Filter sheet ── */}
      <AnimatePresence>
        {showFilters && (
          <FilterSheet fields={categoryFilterFields} values={filters} onChange={setFilters} onClose={() => setShowFilters(false)}/>
        )}
      </AnimatePresence>

      {/* ── Sort sheet ── */}
      <AnimatePresence>
        {showSort && (
          <SortSheet options={sortOptions} value={sort} onSelect={v => { setSort(v); setShowSort(false); }} onClose={() => setShowSort(false)}/>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── /search/category/all — the mixed everything feed ────────────────────────
// Deliberately simpler than a single category's page: no in-feed search,
// filters, or sort (the spec only asks for the layout switcher here), and
// no Emergency mixed in (it has its own permanent, tier-gated access rules
// that a blended feed would make much harder to enforce/reason about
// consistently -- Emergency stays reachable only through its own dedicated
// section/page). Fetches one bounded batch per remaining category, then
// round-robins them into a single order with no two consecutive items from
// the same category, same as the Browse Search "All" preview's logic.
type MixedEntry = { kind: 'creator'; item: CreatorRow } | { kind: 'listing'; item: Listing };
const ALL_FEED_PER_CATEGORY = 24;

function AllMixedFeed() {
  const navigate = useNavigate();
  const [layout, setLayout] = useState<BrowseLayout>(loadLayout);
  const [pool, setPool] = useState<MixedEntry[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const changeLayout = (l: BrowseLayout) => {
    setLayout(l);
    try { sessionStorage.setItem(LAYOUT_KEY, l); } catch {}
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const listingCategories: CategoryTab[] = ['rental', 'sale', 'services', 'studios', 'opportunities'];
      const [listingResults, creatorRes] = await Promise.all([
        Promise.all(listingCategories.map(cat => withModerationFilter((filterActive) => {
          let q = supabase.from('listings').select(LISTING_COLUMNS).eq('is_active', true);
          if (filterActive) q = q.eq('moderation_status', 'active');
          switch (cat) {
            case 'rental':       q = q.eq('listing_mode', 'rent').neq('listing_type', 'service'); break;
            case 'sale':          q = q.eq('listing_mode', 'sale'); break;
            case 'services':      q = q.eq('listing_type', 'service'); break;
            case 'opportunities': q = q.eq('listing_type', 'opportunity'); break;
            case 'studios':       q = q.or('title.ilike.%studio%,service_category.ilike.%studio%'); break;
          }
          return q.order('created_at', { ascending: false }).limit(ALL_FEED_PER_CATEGORY);
        }))),
        supabase.from('profiles').select('id, name, username, avatar_url, city, location, primary_role, is_verified')
          .not('name', 'is', null).neq('name', '').not('primary_role', 'is', null)
          .order('created_at', { ascending: false }).limit(ALL_FEED_PER_CATEGORY),
      ]);
      if (cancelled) return;

      const buckets: MixedEntry[][] = listingResults.map((res, i) => {
        let mapped = (res.data ?? []).map(mapListingRow);
        if (listingCategories[i] === 'rental') mapped = mapped.filter(l => l.listingType !== 'opportunity');
        return mapped.map(item => ({ kind: 'listing' as const, item }));
      });
      buckets.push(((creatorRes.data ?? []) as CreatorRow[]).map(item => ({ kind: 'creator' as const, item })));

      // Round-robin: one item at a time from each non-exhausted bucket, so
      // the combined order never repeats a category back-to-back while any
      // other category still has items left to contribute.
      const mixed: MixedEntry[] = [];
      let i = 0;
      while (buckets.some(b => b.length > i)) {
        for (const b of buckets) if (b[i]) mixed.push(b[i]);
        i++;
      }
      setPool(mixed);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || loading || visibleCount >= pool.length) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount(c => Math.min(c + PAGE_SIZE, pool.length));
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loading, visibleCount, pool.length]);

  const visible = pool.slice(0, visibleCount);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3 px-4" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '10px' }}>
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors shrink-0 active:scale-90">
            <ArrowLeft className="w-5 h-5 text-gray-700"/>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-gray-900 truncate">All</p>
            {!loading && <p className="text-xs text-gray-400">{pool.length} {pool.length === 1 ? 'result' : 'results'}</p>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 px-4 pb-3">
          {LAYOUTS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => changeLayout(id)} title={label} aria-label={label}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-95 ${
                layout === id ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-100'
              }`}>
              <Icon className="w-4 h-4"/>
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin"/>
            <span className="text-sm">Loading…</span>
          </div>
        ) : pool.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-1">
            <p className="text-sm font-bold text-gray-500">Nothing to show right now</p>
            <p className="text-xs text-gray-400">Check back soon.</p>
          </div>
        ) : (
          <>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={layout}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ enter: { duration: 0.2 }, exit: { duration: 0.14 } } as any}>
                <MixedFeedLayout entries={visible} layout={layout} onNavigateCreator={id => navigate(`/host/${id}`)}/>
              </motion.div>
            </AnimatePresence>
            <div ref={sentinelRef} className="h-1"/>
          </>
        )}
      </div>
    </div>
  );
}

function MixedFeedCreatorTile({ u, compact }: { u: CreatorRow; compact?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 flex flex-col items-center text-center gap-1.5 ${compact ? 'p-3' : 'p-4'}`}>
      <div className={`${compact ? 'w-12 h-12' : 'w-16 h-16'} rounded-full overflow-hidden bg-gray-100 border border-gray-200`}>
        {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-base font-black text-gray-400">{u.name?.[0]?.toUpperCase() ?? '?'}</div>}
      </div>
      <p className="text-xs font-bold text-gray-900 truncate w-full">{u.name}</p>
      {u.primary_role && <p className="text-[10px] text-blue-600 truncate w-full">{u.primary_role}</p>}
    </div>
  );
}

function MixedFeedLayout({ entries, layout, onNavigateCreator }: { entries: MixedEntry[]; layout: BrowseLayout; onNavigateCreator: (id: string) => void }) {
  if (layout === 'minimal') {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
        {entries.map((e, i) => e.kind === 'creator' ? (
          <button key={i} onClick={() => onNavigateCreator(e.item.id)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 shrink-0">
              {e.item.avatar_url ? <img src={e.item.avatar_url} className="w-full h-full object-cover" alt=""/>
                : <div className="w-full h-full flex items-center justify-center text-xs font-black text-gray-400">{e.item.name?.[0]?.toUpperCase() ?? '?'}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 truncate">{e.item.name}</p>
              <p className="text-xs text-gray-400 truncate">{e.item.primary_role ?? 'Creator'}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
          </button>
        ) : (
          <MinimalListingRow key={i} listing={e.item}/>
        ))}
      </div>
    );
  }
  if (layout === 'large_cards') {
    return (
      <div className="pop-stagger grid grid-cols-1 sm:grid-cols-2 gap-5">
        {entries.map((e, i) => e.kind === 'creator'
          ? <button key={i} onClick={() => onNavigateCreator(e.item.id)} className="text-left"><MixedFeedCreatorTile u={e.item}/></button>
          : <ListingCard key={i} listing={e.item} className="[&_img]:aspect-[16/10]"/>
        )}
      </div>
    );
  }
  if (layout === 'editorial') {
    return (
      <div className="grid grid-cols-2 gap-4">
        {entries.map((e, i) => e.kind === 'creator'
          ? <button key={i} onClick={() => onNavigateCreator(e.item.id)} className="text-left"><MixedFeedCreatorTile u={e.item}/></button>
          : <ListingCard key={i} listing={e.item}/>
        )}
      </div>
    );
  }
  return (
    <div className="pop-stagger grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {entries.map((e, i) => e.kind === 'creator'
        ? <button key={i} onClick={() => onNavigateCreator(e.item.id)} className="text-left"><MixedFeedCreatorTile u={e.item} compact/></button>
        : <ListingCard key={i} listing={e.item}/>
      )}
    </div>
  );
}

// ── Emergency lock (Guest/Creator/Creator+) ──────────────────────────────────
// Two copy variants depending only on whether there's at least one real
// listing to show above it (hasAny) -- never a literal count, so the UI
// can't be used to infer whether the true number is 0, 1, or many.
function EmergencyLockedNotice({ previewItems, onUpgrade }: { previewItems: Listing[]; onUpgrade: () => void }) {
  const hasAny = previewItems.length > 0;
  return (
    <div className="space-y-5">
      {hasAny && (
        <div className="grid grid-cols-2 gap-3">
          {previewItems.map(l => <ListingCard key={l.id} listing={l}/>)}
        </div>
      )}
      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5 text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6 text-amber-600"/>
        </div>
        {hasAny ? (
          <>
            <p className="text-base font-black text-gray-900">Unlock all Emergency Listings</p>
            <p className="text-sm text-gray-600">Upgrade to Professional or Business to see all available Emergency Listings.</p>
          </>
        ) : (
          <>
            <p className="text-base font-black text-gray-900">Emergency Listings</p>
            <p className="text-sm font-bold text-gray-800">Unlock Emergency Listings</p>
            <p className="text-sm text-gray-600">Upgrade to Professional or Business to access Emergency Listings and respond when urgent opportunities become available.</p>
          </>
        )}
        <button onClick={onUpgrade} className="w-full py-3 rounded-2xl bg-amber-600 text-white font-bold text-sm mt-1">
          Upgrade Account
        </button>
      </div>
    </div>
  );
}

// ── Filter / Sort sheets ──────────────────────────────────────────────────────
function SheetShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }} className="fixed inset-0 z-[120] bg-black/50" onClick={onClose}/>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320, mass: 0.8 }}
        className="fixed inset-x-0 bottom-0 z-[125] bg-white rounded-t-3xl shadow-2xl px-5 pt-6"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
        {children}
      </motion.div>
    </>
  );
}

function FilterSheet({ fields, values, onChange, onClose }: {
  fields: FilterField[]; values: Record<string, any>; onChange: (v: Record<string, any>) => void; onClose: () => void;
}) {
  return (
    <SheetShell onClose={onClose}>
      <p className="text-base font-black text-gray-900 mb-4">Filters</p>
      <div className="space-y-4 mb-5">
        {fields.map(f => (
          <div key={f.key}>
            {f.type === 'toggle' ? (
              <button onClick={() => onChange({ ...values, [f.key]: !values[f.key] })}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-sm font-semibold transition-colors ${
                  values[f.key] ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-600'
                }`}>
                {f.label}
                <div className={`w-9 h-5 rounded-full transition-colors relative ${values[f.key] ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${values[f.key] ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                </div>
              </button>
            ) : (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{f.label}</p>
                <div className="flex flex-wrap gap-2">
                  {f.options?.map(o => (
                    <button key={o.value}
                      onClick={() => onChange({ ...values, [f.key]: values[f.key] === o.value ? undefined : o.value })}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        values[f.key] === o.value ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-600'
                      }`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => { onChange({}); }} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">
          Clear all
        </button>
        <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-gray-900 text-white font-bold text-sm">
          Show Results
        </button>
      </div>
    </SheetShell>
  );
}

function SortSheet({ options, value, onSelect, onClose }: {
  options: { value: SortOption; label: string }[]; value: SortOption; onSelect: (v: SortOption) => void; onClose: () => void;
}) {
  return (
    <SheetShell onClose={onClose}>
      <p className="text-base font-black text-gray-900 mb-4">Sort</p>
      <div className="space-y-1 mb-2">
        {options.map(o => (
          <button key={o.value} onClick={() => onSelect(o.value)}
            className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold transition-colors ${
              value === o.value ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-700'
            }`}>
            {o.label}
          </button>
        ))}
      </div>
    </SheetShell>
  );
}

// ── Listings ──────────────────────────────────────────────────────────────────
function ListingsLayout({ listings, layout }: { listings: Listing[]; layout: BrowseLayout }) {
  if (layout === 'minimal') {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
        {listings.map(l => <MinimalListingRow key={l.id} listing={l}/>)}
      </div>
    );
  }
  if (layout === 'editorial') {
    // Alternates a large feature card, a wide landscape card, then smaller
    // supporting cards in pairs -- presentation only, never reorders the
    // underlying results.
    const groups: Listing[][] = [];
    for (let i = 0; i < listings.length; ) {
      if (i === 0) { groups.push(listings.slice(0, 1)); i += 1; }
      else if ((i - 1) % 5 === 0) { groups.push(listings.slice(i, i + 1)); i += 1; }
      else { groups.push(listings.slice(i, i + 2)); i += 2; }
    }
    return (
      <div className="space-y-4">
        {groups.map((g, gi) => g.length === 1 ? (
          <div key={gi} className="pop-stagger">
            <ListingCard listing={g[0]} className="[&_img]:aspect-[16/9]"/>
          </div>
        ) : (
          <div key={gi} className="pop-stagger grid grid-cols-2 gap-4">
            {g.map(l => <ListingCard key={l.id} listing={l}/>)}
          </div>
        ))}
      </div>
    );
  }
  if (layout === 'large_cards') {
    return (
      <div className="pop-stagger grid grid-cols-1 sm:grid-cols-2 gap-5">
        {listings.map(l => <ListingCard key={l.id} listing={l} className="[&_img]:aspect-[16/10]"/>)}
      </div>
    );
  }
  return (
    <div className="pop-stagger grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {listings.map(l => <ListingCard key={l.id} listing={l}/>)}
    </div>
  );
}

function MinimalListingRow({ listing }: { listing: Listing }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [saved, setSaved] = useState(() => !!user?.id && listing.id ? savedListingsApi.isSavedSync(user.id, listing.id) : false);
  const price = `$${Number(listing.price ?? 0).toLocaleString()}${listing.listingMode === 'rent' ? '/day' : ''}`;
  const type = listing.listingKind === 'talent' ? 'Opportunity' : listing.serviceCategory || listing.listingType;

  const toggleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user?.id) return;
    const prev = saved;
    setSaved(!prev);
    try { const result = await savedListingsApi.toggle(user.id, listing.id, listing); setSaved(result); }
    catch { setSaved(prev); }
  };

  return (
    <button onClick={() => navigate(`/listing/${listing.id}`)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
      <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0">
        {listing.images?.[0] && <img src={listing.images[0]} className="w-full h-full object-cover" alt=""/>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-900 truncate">{listing.title}</p>
        <p className="text-xs text-gray-400 truncate">
          {price} · {listing.city}{type ? ` · ${type}` : ''}
        </p>
      </div>
      {user && (
        <button onClick={toggleSave} className={`shrink-0 text-xs font-bold ${saved ? 'text-red-500' : 'text-gray-300'}`}>
          ♥
        </button>
      )}
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
