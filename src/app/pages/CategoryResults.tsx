/**
 * CategoryResults — the full, uncapped Browse Search pages.
 *
 * /search/category/:tab   — one category's full, uncapped result set
 * /search/category/all    — every category, grouped, each with its own
 *                            "Load more" (paginated, not one giant dump)
 *
 * Reached via "View More" / "View all results" on a Browse Search preview
 * (see SearchOverlay.tsx). Carries the query/filters/sort the user had
 * active there (location.state), applied as this page's initial and only
 * search criteria — this page has no search box of its own.
 *
 * Guests never reach either page (guarded below, matching Browse Search's
 * own "must sign up to see more" rule) — reachable via View More only for
 * a logged-in user, any tier.
 *
 * Opportunities keeps its own permanent cap for Guest/Creator/Creator+
 * (OPPORTUNITY_LOCKED_LIMIT, see SearchOverlay.tsx) enforced here too, not
 * just at the Browse Search preview's "View More" gate — a restricted-tier
 * user typing this URL directly must still never see more than that many.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router';
import {
  ArrowLeft, ArrowRight, Loader2, Lock, MapPin, AlertTriangle, Search, SlidersHorizontal,
  Bookmark, Calendar, CalendarClock, X, ChevronDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { withModerationFilter, LISTING_COLUMNS, mapListingRow } from '../lib/api';
import { Listing } from '../types';
import { useAuth } from '../context/AuthContext';
import { isProfessional } from '../lib/reliabilityApi';
import { fetchEmergencyListings } from '../lib/emergencyListings';
import { savedListingsApi } from '../lib/api';
import { toast } from 'sonner';

type CategoryTab = 'rental' | 'sale' | 'services' | 'creators' | 'studios' | 'opportunities' | 'emergency';
const CATEGORY_IDS: CategoryTab[] = ['rental', 'sale', 'services', 'creators', 'studios', 'opportunities', 'emergency'];
const CATEGORY_LABEL: Record<CategoryTab, string> = {
  rental: 'Rentals', sale: 'Sales', services: 'Services',
  creators: 'Creators', studios: 'Studios', opportunities: 'Opportunities', emergency: 'Emergency',
};
const CATEGORY_SEARCH_PLACEHOLDER: Record<CategoryTab, string> = {
  rental: 'Search rentals...', sale: 'Search sales...', services: 'Search services...',
  creators: 'Search creators...', studios: 'Search studios...',
  opportunities: 'Search opportunities...', emergency: 'Search emergency listings...',
};
// Same permanent cap as SearchOverlay.tsx's OPPORTUNITY_LOCKED_LIMIT --
// duplicated rather than imported since that one lives in a component
// module; kept in sync deliberately (see that file's own comment on it).
const OPPORTUNITY_LOCKED_LIMIT = 5;
const PAGE_SIZE = 20;

type SortOption = 'recent' | 'price_low' | 'price_high';

interface NavState {
  query?: string;
  filters?: {
    priceRange?: { min?: number; max?: number } | null;
    // Opportunity-only quick filters -- metadata fields, not indexed
    // columns, so these narrow the fetched page client-side (see
    // fetchCategoryPage) rather than via a precise server-side count.
    paid?: boolean | null;
    remote?: boolean | null;
  } | null;
  sort?: SortOption;
}

interface CreatorRow {
  id: string; name: string; username: string | null; avatar_url: string | null;
  city: string | null; location: string | null; primary_role: string | null; is_verified: boolean | null;
}

function useGuestGuard() {
  const navigate = useNavigate();
  const { isAuthenticated, showGuestPrompt } = useAuth();
  useEffect(() => {
    if (isAuthenticated) return;
    showGuestPrompt(
      'Create your Filmons account to browse all listings, save listings, contact creators, and apply to opportunities.',
      'Sign up to see more listings',
    );
    navigate('/search', { replace: true });
  }, [isAuthenticated]);
  return isAuthenticated;
}

// ── Shared query builder — one category, uncapped, paginated ────────────────
// Returns a real `total` (Postgres exact count, or the gated Emergency
// endpoint's own count) wherever the query itself can produce one --
// Opportunity paid/remote is the one exception (see below).
async function fetchCategoryPage(
  category: CategoryTab, navState: NavState, from: number, to: number, userId?: string,
): Promise<{ listings: Listing[]; creators: CreatorRow[]; total: number }> {
  const term = navState.query?.trim();
  const price = navState.filters?.priceRange;

  // Emergency is server-gated (Professional/Business only) -- routed
  // through the dedicated edge function, never a direct client query. See
  // get-emergency-listings/index.ts for why a plain RLS policy can't do
  // this job in this app. Callers on a restricted tier should never even
  // reach this branch (blocked earlier), but if they do, the endpoint
  // itself refuses and this just returns nothing.
  if (category === 'emergency') {
    const { listings, total } = await fetchEmergencyListings({
      userId, query: term, priceMin: price?.min, priceMax: price?.max, from, to,
    });
    return { listings, creators: [], total };
  }

  if (category === 'creators') {
    let q = supabase.from('profiles')
      .select('id, name, username, avatar_url, city, location, primary_role, is_verified', { count: 'exact' })
      .not('name', 'is', null).neq('name', '').not('primary_role', 'is', null);
    if (term) q = q.or(`name.ilike.%${term}%,username.ilike.%${term}%,primary_role.ilike.%${term}%,city.ilike.%${term}%`);
    const { data, count } = await q.order('created_at', { ascending: false }).range(from, to);
    return { listings: [], creators: (data ?? []) as CreatorRow[], total: count ?? (data?.length ?? 0) };
  }

  const sortCol = navState.sort === 'price_low' || navState.sort === 'price_high' ? 'price' : 'created_at';
  const ascending = navState.sort === 'price_low';

  const res = await withModerationFilter((filterActive) => {
    let query = supabase.from('listings').select(LISTING_COLUMNS, { count: 'exact' }).eq('is_active', true);
    if (filterActive) query = query.eq('moderation_status', 'active');
    switch (category) {
      case 'rental':        query = query.eq('listing_mode', 'rent').neq('listing_type', 'service'); break;
      case 'sale':           query = query.eq('listing_mode', 'sale'); break;
      case 'services':       query = query.eq('listing_type', 'service'); break;
      case 'opportunities':  query = query.eq('listing_type', 'opportunity'); break;
      case 'studios':        query = query.or('title.ilike.%studio%,service_category.ilike.%studio%'); break;
    }
    if (term) query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%,city.ilike.%${term}%`);
    if (price?.min != null) query = query.gte('price', price.min);
    if (price?.max != null) query = query.lte('price', price.max);
    return query.order(sortCol, { ascending }).range(from, to);
  });
  let listings = (res.data ?? []).map(mapListingRow);
  if (category === 'rental') listings = listings.filter(l => l.listingType !== 'opportunity');
  let total = (res as any).count ?? listings.length;

  // Paid/Unpaid/Remote live inside opportunity metadata, not an indexed
  // column, so they narrow this already-fetched page client-side rather
  // than the database query -- `total` below stops being an exact count
  // once either is active (there is no cheap way to get one without a
  // second full-table scan), so it's approximated from what's left on
  // this page instead of claimed as precise.
  if (category === 'opportunities' && (navState.filters?.paid != null || navState.filters?.remote)) {
    const before = listings.length;
    if (navState.filters?.paid === true)  listings = listings.filter(l => l.opportunity?.paid === true);
    if (navState.filters?.paid === false) listings = listings.filter(l => l.opportunity?.paid === false);
    if (navState.filters?.remote)         listings = listings.filter(l => l.opportunity?.workArrangement === 'remote');
    if (before > 0) total = Math.round(total * (listings.length / before));
  }

  return { listings, creators: [], total };
}

// ── /search/category/:tab ────────────────────────────────────────────────────
// ── Reusable dedicated category page ─────────────────────────────────────────
// One component drives every category's /search/category/:tab page --
// mobile: full-width vertical list with search+chips+sort above it; desktop:
// filter sidebar + one-row-per-result list. Card content adapts per category
// (adaptFields below) rather than this being an Opportunities-only design.
const SORT_LABEL: Record<SortOption, string> = { recent: 'Most recent', price_low: 'Price: Low to High', price_high: 'Price: High to Low' };
const QUICK_CHIPS: { id: 'all' | 'paid' | 'unpaid' | 'remote'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'paid', label: 'Paid' }, { id: 'unpaid', label: 'Unpaid' }, { id: 'remote', label: 'Remote' },
];

function SingleCategoryResults({ category, navState: initialNavState }: { category: CategoryTab; navState: NavState }) {
  const navigate = useNavigate();
  const { user, showGuestPrompt } = useAuth();
  const isOpportunities = category === 'opportunities';
  const locked = isOpportunities && !isProfessional(user?.accountType);
  // Emergency isn't a partially-visible-then-locked category like
  // Opportunities -- for a restricted tier it's not browsable as its own
  // page at all (see SearchOverlay.tsx's Emergency tab / get-emergency-
  // listings/index.ts), so this blocks the whole page instead of
  // capping+showing a notice below real results, and never fetches.
  const isEmergency = category === 'emergency';
  const emergencyBlocked = isEmergency && !isProfessional(user?.accountType);
  const hasPrice = category !== 'creators';
  const showQuickChips = isOpportunities;

  const [searchText, setSearchText] = useState(initialNavState.query ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(searchText);
  useEffect(() => { const t = setTimeout(() => setDebouncedQuery(searchText), 350); return () => clearTimeout(t); }, [searchText]);

  const [sort, setSort] = useState<SortOption>(initialNavState.sort ?? 'recent');
  const [priceMin, setPriceMin] = useState<string>(initialNavState.filters?.priceRange?.min != null ? String(initialNavState.filters.priceRange.min) : '');
  const [priceMax, setPriceMax] = useState<string>(initialNavState.filters?.priceRange?.max != null ? String(initialNavState.filters.priceRange.max) : '');
  const [chip, setChip] = useState<'all' | 'paid' | 'unpaid' | 'remote'>(
    initialNavState.filters?.remote ? 'remote' : initialNavState.filters?.paid === true ? 'paid' : initialNavState.filters?.paid === false ? 'unpaid' : 'all'
  );
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // The single source of truth for what's actually fetched -- built fresh
  // each render from the controls above rather than mutating a NavState
  // object in place, so effect dependencies stay simple/correct.
  const navState: NavState = {
    query: debouncedQuery,
    sort,
    filters: {
      priceRange: (priceMin || priceMax) ? { min: priceMin ? Number(priceMin) : undefined, max: priceMax ? Number(priceMax) : undefined } : null,
      paid: chip === 'paid' ? true : chip === 'unpaid' ? false : null,
      remote: chip === 'remote',
    },
  };

  const [listings, setListings] = useState<Listing[]>([]);
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async (pageNum: number) => {
    if (emergencyBlocked) { setLoading(false); return; }
    if (pageNum === 0) setLoading(true); else setLoadingMore(true);
    // Locked tiers on Opportunities never fetch past their permanent cap --
    // not just a display truncation, the query itself never asks for more.
    const from = locked ? 0 : pageNum * PAGE_SIZE;
    const to   = locked ? OPPORTUNITY_LOCKED_LIMIT - 1 : from + PAGE_SIZE - 1;
    const { listings: l, creators: c, total: t } = await fetchCategoryPage(category, navState, from, to, user?.id);
    if (pageNum === 0) { setListings(l); setCreators(c); } else { setListings(prev => [...prev, ...l]); setCreators(prev => [...prev, ...c]); }
    setTotal(locked ? Math.min(t, OPPORTUNITY_LOCKED_LIMIT) : t);
    setHasMore(!locked && (l.length + c.length) === PAGE_SIZE);
    setLoading(false); setLoadingMore(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, locked, emergencyBlocked, user?.id, debouncedQuery, sort, priceMin, priceMax, chip]);

  useEffect(() => { setPage(0); loadPage(0); }, [category, locked, emergencyBlocked, user?.id, debouncedQuery, sort, priceMin, priceMax, chip]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || loading || loadingMore || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { const next = page + 1; setPage(next); loadPage(next); }
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loading, loadingMore, hasMore, page, loadPage]);

  const count = category === 'creators' ? creators.length : listings.length;
  const noun = count === 1 ? CATEGORY_LABEL[category].replace(/s$/, '') : CATEGORY_LABEL[category];

  // Back always returns to the Browse Search "All" hub with the current
  // search text carried along, per spec -- this page has no other sensible
  // "previous state" to restore to (it's reachable from several different
  // entry points, not just /all's own "View all").
  const goBackToAll = () => {
    const q = searchText.trim();
    navigate(`/search/category/all${q ? `?q=${encodeURIComponent(q)}` : ''}`, { state: { query: q } });
  };

  const clearFilters = () => { setPriceMin(''); setPriceMax(''); setChip('all'); setSort('recent'); };

  const toggleSave = async (listingId: string, listingData: any) => {
    if (!user) { showGuestPrompt('Create your Filmons account to save listings.', 'Sign up to save listings'); return; }
    const nowSaved = await savedListingsApi.toggle(user.id, listingId, listingData);
    toast.success(nowSaved ? 'Saved' : 'Removed from saved');
  };

  // ── Emergency: full-page lock, never a partial preview ──────────────────
  if (emergencyBlocked) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <CategoryHeader category={category} onBack={goBackToAll}/>
        <div className="flex-1 px-4 py-6">
          <EmergencyBlockedNotice onUpgrade={() => navigate('/account/upgrade?auto=professional')}/>
        </div>
      </div>
    );
  }

  const filterPanel = (
    <FilterPanel
      category={category} hasPrice={hasPrice}
      priceMin={priceMin} priceMax={priceMax} setPriceMin={setPriceMin} setPriceMax={setPriceMax}
      chip={chip} setChip={setChip} showQuickChips={showQuickChips}
      onClear={clearFilters}
    />
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CategoryHeader category={category} onBack={goBackToAll}/>

      {/* ── Search + quick filters (both breakpoints) ───────────────────── */}
      <div className="sticky top-[52px] md:static z-[9] bg-gray-50 border-b border-gray-100 md:border-b-0 px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-2 max-w-5xl mx-auto w-full">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"/>
            <input
              value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder={CATEGORY_SEARCH_PLACEHOLDER[category]}
              className="w-full bg-white border border-gray-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowMobileFilters(true)}
            aria-label="Filters"
            className="md:hidden w-10 h-10 shrink-0 rounded-2xl border border-gray-200 bg-white flex items-center justify-center active:scale-90 transition-transform"
          >
            <SlidersHorizontal className="w-4 h-4 text-gray-600"/>
          </button>
        </div>
        {showQuickChips && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar max-w-5xl mx-auto w-full">
            {QUICK_CHIPS.map(c => (
              <button
                key={c.id} onClick={() => setChip(c.id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  chip === c.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full md:flex md:gap-8 md:px-4 md:py-6">
        {/* ── Desktop sidebar ──────────────────────────────────────────── */}
        <aside className="hidden md:block shrink-0" style={{ width: 300 }}>
          <div className="sticky top-6">{filterPanel}</div>
        </aside>

        {/* ── Results ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 px-4 md:px-0 py-4 md:py-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-500">
              {loading ? 'Searching…' : `${total} ${total === 1 ? noun.toLowerCase() : CATEGORY_LABEL[category].toLowerCase()}`}
            </p>
            {hasPrice && (
              <div className="relative">
                <button onClick={() => setSortOpen(v => !v)} className="flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-gray-900">
                  Sort by: {SORT_LABEL[sort]} <ChevronDown className="w-3.5 h-3.5"/>
                </button>
                {sortOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10 w-44">
                    {(Object.keys(SORT_LABEL) as SortOption[]).map(s => (
                      <button
                        key={s} onClick={() => { setSort(s); setSortOpen(false); }}
                        className={`w-full text-left px-3.5 py-2.5 text-xs font-semibold hover:bg-gray-50 ${sort === s ? 'text-blue-600' : 'text-gray-700'}`}
                      >
                        {SORT_LABEL[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin"/><span className="text-sm">Loading…</span>
            </div>
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-1">
              <p className="text-sm font-bold text-gray-500">No {CATEGORY_LABEL[category].toLowerCase()} found</p>
              <p className="text-xs text-gray-400">Try a different search or check back soon.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 md:gap-3">
              {category === 'creators'
                ? creators.map(u => <CreatorResultRow key={u.id} u={u} onClick={() => navigate(`/host/${u.id}`)}/>)
                : listings.map(l => <ListingResultRow key={l.id} listing={l} onSave={() => toggleSave(l.id, l)}/>)
              }
            </div>
          )}

          {locked && (
            <OpportunityLockedNotice hasAny={count > 0} onUpgrade={() => navigate('/account/upgrade?auto=professional')}/>
          )}

          {!loading && hasMore && <div ref={sentinelRef} className="h-1"/>}
          {loadingMore && (
            <div className="flex items-center justify-center py-6 text-gray-400"><Loader2 className="w-4 h-4 animate-spin"/></div>
          )}
        </div>
      </div>

      {/* ── Mobile filter sheet ──────────────────────────────────────────── */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileFilters(false)}/>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-black text-gray-900">Filters</p>
              <button onClick={() => setShowMobileFilters(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-500"/>
              </button>
            </div>
            {filterPanel}
            <button onClick={() => setShowMobileFilters(false)} className="w-full mt-4 py-3.5 rounded-2xl bg-gray-900 text-white font-bold text-sm">
              Apply filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared header (mobile + desktop) ─────────────────────────────────────────
function CategoryHeader({ category, onBack }: { category: CategoryTab; onBack: () => void }) {
  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
      <div className="max-w-5xl mx-auto flex items-center gap-3 px-4" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
        <button onClick={onBack} aria-label="Back" className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors shrink-0 active:scale-90">
          <ArrowLeft className="w-5 h-5 text-gray-700"/>
        </button>
        <div className="min-w-0">
          <p className="text-base md:text-xl font-black text-gray-900 truncate">{CATEGORY_LABEL[category]}</p>
          <p className="hidden md:block text-sm text-gray-400 mt-0.5">
            {category === 'opportunities' ? 'Find projects and creative opportunities.' : `Browse ${CATEGORY_LABEL[category].toLowerCase()} on Filmons.`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Filter sidebar (desktop) / sheet body (mobile) -- same component ────────
function FilterPanel({ category, hasPrice, priceMin, priceMax, setPriceMin, setPriceMax, chip, setChip, showQuickChips, onClear }: {
  category: CategoryTab; hasPrice: boolean;
  priceMin: string; priceMax: string; setPriceMin: (v: string) => void; setPriceMax: (v: string) => void;
  chip: 'all' | 'paid' | 'unpaid' | 'remote'; setChip: (v: 'all' | 'paid' | 'unpaid' | 'remote') => void;
  showQuickChips: boolean; onClear: () => void;
}) {
  return (
    <div className="bg-white md:border md:border-gray-100 md:rounded-2xl md:p-5 space-y-5">
      <div className="hidden md:flex items-center justify-between">
        <p className="text-sm font-black text-gray-900">Filters</p>
        <button onClick={onClear} className="text-xs font-bold text-blue-600 hover:text-blue-700">Clear all</button>
      </div>

      {hasPrice && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Price</p>
          <div className="flex items-center gap-2">
            <input
              type="number" inputMode="numeric" placeholder="Min" value={priceMin}
              onChange={e => setPriceMin(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            <span className="text-gray-300">–</span>
            <input
              type="number" inputMode="numeric" placeholder="Max" value={priceMax}
              onChange={e => setPriceMax(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
        </div>
      )}

      {showQuickChips && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Compensation</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_CHIPS.map(c => (
              <button
                key={c.id} onClick={() => setChip(c.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  chip === c.id ? 'bg-gray-900 text-white' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button onClick={onClear} className="md:hidden w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-xs">
        Clear all
      </button>
    </div>
  );
}

function OpportunityLockedNotice({ hasAny, onUpgrade }: { hasAny: boolean; onUpgrade: () => void }) {
  return (
    <div className="mt-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-5 text-center space-y-2">
      <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto">
        <Lock className="w-6 h-6 text-indigo-600"/>
      </div>
      <p className="text-base font-black text-gray-900">Unlock all opportunities</p>
      <p className="text-sm text-gray-600">
        {hasAny
          ? `You're seeing ${OPPORTUNITY_LOCKED_LIMIT} available opportunities. Upgrade to a Professional or Business account to browse all Opportunity listings.`
          : 'Upgrade to a Professional or Business account to browse all Opportunity listings.'}
      </p>
      <button onClick={onUpgrade} className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm mt-1">
        Upgrade account
      </button>
    </div>
  );
}

// Emergency has no partial/capped preview like Opportunities -- a
// restricted tier can't browse it as its own page at all, so this replaces
// the whole results area instead of appearing below real results.
function EmergencyBlockedNotice({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border-2 border-red-200 bg-red-50 p-5 text-center space-y-2">
      <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
        <AlertTriangle className="w-6 h-6 text-red-600"/>
      </div>
      <p className="text-base font-black text-gray-900">Emergency opportunities are locked</p>
      <p className="text-sm text-gray-600">
        Emergency listings are available exclusively to Professional and Business accounts.
      </p>
      <button onClick={onUpgrade} className="w-full py-3 rounded-2xl bg-red-600 text-white font-bold text-sm mt-1">
        Upgrade account
      </button>
    </div>
  );
}

// ── Fixed-dimension preview cards ────────────────────────────────────────────
// Used ONLY in the /search/category/all horizontal per-category rows. Exact
// spec: 240x320 card / 240x180 image area / 16px radius / 16px gap at the sm+
// breakpoint (Tailwind's w-60/h-80/h-[180px]/rounded-2xl/gap-4 all land on
// those exact pixel values), scaled down proportionally below it. Every
// result type -- including Creators -- shares this same outer box, and
// `overflow-hidden` + a fixed height (not just min-height) means the card
// never grows or shrinks based on its own content, per spec. This is
// deliberately a separate, minimal component from the full ListingCard (used
// on the dedicated one-per-line category page) rather than that component
// squeezed into a fixed box -- ListingCard carries save/boost/menu actions
// that don't fit a strictly fixed-height card.
// Every dimension here is an inline style, not a Tailwind utility class --
// deliberately, so this can never be affected by a breakpoint, a purge/
// content-scanning miss, or some other utility's specificity. One fixed
// 240x320 footprint (image 240x180) for every result type at every screen
// size, per spec -- no responsive variant, no grid, no flex:1 stretch,
// no width:100%. `flex: 0 0 240px` (not just flex-shrink) is what actually
// stops these from ever being asked to grow OR shrink to fill the row.
const PREVIEW_CARD_STYLE: React.CSSProperties = {
  width: 240, height: 320, minWidth: 240, maxWidth: 240, flex: '0 0 240px', borderRadius: 16,
};
const PREVIEW_IMAGE_STYLE: React.CSSProperties = {
  width: 240, height: 180, minHeight: 180, maxHeight: 180, aspectRatio: '4 / 3',
};
// `snap-start` lives here (not on a wrapper div) so the element carrying
// the fixed-size inline style IS the actual flex item in the scroll row --
// a wrapper with no explicit size would just shrink-to-fit around it,
// which happens to look right but leaves nothing to stop a future change
// to this card from silently losing its fixed footprint again.
const PREVIEW_CARD_CLASS = 'snap-start overflow-hidden border border-gray-100 bg-white shadow-sm text-left flex flex-col active:scale-[0.97] transition-transform';
const PREVIEW_IMAGE_CLASS = 'relative shrink-0 bg-gray-100 overflow-hidden';

function PreviewListingCard({ listing }: { listing: Listing }) {
  const navigate = useNavigate();
  const price = `$${Number(listing.price ?? 0).toLocaleString()}${listing.listingMode === 'rent' ? '/day' : ''}`;
  const isEmergency = !!listing.isEmergency && !!listing.emergencyExpiresAt && new Date(listing.emergencyExpiresAt) > new Date();
  return (
    <button onClick={() => navigate(`/listing/${listing.id}`)} style={PREVIEW_CARD_STYLE} className={PREVIEW_CARD_CLASS}>
      <div style={PREVIEW_IMAGE_STYLE} className={PREVIEW_IMAGE_CLASS}>
        {listing.images?.[0]
          ? <img src={listing.images[0]} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-2xl opacity-25">🎬</div>}
        {isEmergency && (
          <span className="absolute top-1.5 left-1.5 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-500 text-white flex items-center gap-0.5 shadow-sm">
            <AlertTriangle className="w-2.5 h-2.5 fill-white"/> Emergency
          </span>
        )}
      </div>
      <div className="p-3 flex-1 min-h-0 flex flex-col justify-center gap-0.5">
        <p className="text-xs font-bold text-gray-900 truncate leading-snug">{listing.title}</p>
        {listing.city && (
          <p className="text-[10px] text-gray-400 flex items-center gap-0.5 truncate"><MapPin className="w-2.5 h-2.5 shrink-0"/>{listing.city}</p>
        )}
        <p className="text-xs font-black text-blue-600">{price}</p>
      </div>
    </button>
  );
}

// Creators get the exact same PREVIEW_CARD_STYLE/PREVIEW_IMAGE_STYLE as
// every other result type -- no separate, larger design. A creator's photo
// fills the same fixed 240x180 image area (object-cover, never influencing
// the card's own size) as a listing's cover photo would.
function PreviewCreatorCard({ u }: { u: CreatorRow }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/host/${u.id}`)} style={PREVIEW_CARD_STYLE} className={PREVIEW_CARD_CLASS}>
      <div style={PREVIEW_IMAGE_STYLE} className={PREVIEW_IMAGE_CLASS}>
        {u.avatar_url
          ? <img src={u.avatar_url} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-3xl font-black text-gray-300">{u.name?.[0]?.toUpperCase() ?? '?'}</div>}
      </div>
      <div className="p-3 flex-1 min-h-0 flex flex-col justify-center items-center text-center gap-0.5 w-full">
        <p className="text-xs font-bold text-gray-900 truncate w-full leading-snug">{u.name}</p>
        {u.primary_role && <p className="text-[10px] text-blue-600 truncate w-full">{u.primary_role}</p>}
        {(u.city ?? u.location) && (
          <p className="text-[10px] text-gray-400 flex items-center gap-0.5 truncate w-full justify-center"><MapPin className="w-2.5 h-2.5 shrink-0"/>{u.city ?? u.location}</p>
        )}
      </div>
    </button>
  );
}

// ── Dedicated-page result rows ───────────────────────────────────────────────
// One component per result type, each responsive within itself (a full-width
// vertical mobile card vs. an image-left horizontal desktop row) rather than
// two separate components -- avoids duplicating save/click logic, and the
// mobile/desktop visual split spec asked for is purely a Tailwind breakpoint
// concern, not a structural one.
function CreatorResultRow({ u, onClick }: { u: CreatorRow; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full bg-white rounded-2xl border border-gray-100 flex items-center gap-3 p-4 text-left hover:border-gray-200 transition-colors">
      <div className="w-14 h-14 md:w-16 md:h-16 rounded-full overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
        {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-base font-black text-gray-400">{u.name?.[0]?.toUpperCase() ?? '?'}</div>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-900 truncate">{u.name}</p>
        {u.primary_role && <p className="text-xs text-blue-600 truncate">{u.primary_role}</p>}
        {(u.city ?? u.location) && (
          <p className="text-xs text-gray-400 flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0"/>{u.city ?? u.location}</p>
        )}
      </div>
    </button>
  );
}

function formatShortDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  try { return new Date(iso + (iso.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }); }
  catch { return undefined; }
}

// Short "category/project type" line -- opportunity type for Opportunities,
// service category for Services/Studios, first tag as a generic fallback.
function categoryTypeLabel(listing: Listing): string | undefined {
  if (listing.opportunity?.categoryIndustry) return listing.opportunity.categoryIndustry;
  if (listing.opportunity?.opportunityType) return listing.opportunity.opportunityType.replace(/_/g, ' ');
  if (listing.serviceCategory) return listing.serviceCategory.replace(/-/g, ' ');
  return listing.tags?.[0];
}

function ListingResultRow({ listing, onSave }: { listing: Listing; onSave: () => void }) {
  const navigate = useNavigate();
  const isOpp = listing.listingType === 'opportunity';
  const price = `$${Number(listing.price ?? 0).toLocaleString()}${listing.listingMode === 'rent' ? '/day' : ''}`;
  const isEmergencyActive = !!listing.isEmergency && !!listing.emergencyExpiresAt && new Date(listing.emergencyExpiresAt) > new Date();
  const typeLabel = categoryTypeLabel(listing);
  const eventDate = isOpp ? formatShortDate(listing.opportunity?.startDate) : undefined;
  const deadline = isOpp && !listing.opportunity?.noDeadline ? formatShortDate(listing.opportunity?.applicationDeadline) : undefined;
  const roleChips = [listing.opportunity?.roleNeeded, listing.opportunity?.workArrangement === 'remote' ? 'Remote' : undefined].filter(Boolean) as string[];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col md:flex-row hover:border-gray-200 transition-colors">
      {/* Image -- full-width top on mobile, fixed-width left column on desktop */}
      <div className="relative w-full h-48 md:w-56 md:h-40 shrink-0 bg-gray-100">
        {listing.images?.[0]
          ? <img src={listing.images[0]} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-3xl opacity-25">🎬</div>}
        {isOpp && (
          <span className={`absolute top-2 left-2 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full shadow-sm ${listing.opportunity?.paid ? 'bg-green-600 text-white' : 'bg-gray-700 text-white'}`}>
            {listing.opportunity?.paid ? 'Paid' : 'Unpaid'}
          </span>
        )}
        {isEmergencyActive && (
          <span className="absolute top-2 right-10 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-500 text-white flex items-center gap-0.5 shadow-sm">
            <AlertTriangle className="w-2.5 h-2.5 fill-white"/> Emergency
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onSave(); }}
          aria-label="Save"
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm active:scale-90 transition-transform"
        >
          <Bookmark className="w-3.5 h-3.5 text-gray-700"/>
        </button>
      </div>

      <div className="flex-1 min-w-0 p-4 flex flex-col gap-1.5">
        <p className="text-sm font-bold text-gray-900 leading-snug">{listing.title}</p>
        {typeLabel && <p className="text-xs text-blue-600 font-semibold capitalize">{typeLabel}</p>}
        {!isOpp && listing.description && <p className="hidden md:block text-xs text-gray-500 line-clamp-2">{listing.description}</p>}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 mt-0.5">
          {listing.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0"/>{listing.city}</span>}
          {eventDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3 shrink-0"/>{eventDate}</span>}
          {deadline && <span className="flex items-center gap-1 text-amber-600"><CalendarClock className="w-3 h-3 shrink-0"/>Apply by {deadline}</span>}
        </div>

        {roleChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {roleChips.map(c => (
              <span key={c} className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full capitalize">{c}</span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-auto pt-2">
          {!isOpp && <p className="text-sm font-black text-blue-600">{price}</p>}
          <button
            onClick={() => navigate(`/listing/${listing.id}`)}
            className={`ml-auto px-4 py-2 rounded-xl text-white text-xs font-bold transition-colors ${isOpp ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            View details
          </button>
        </div>
      </div>
    </div>
  );
}

// ── /search/category/all ─────────────────────────────────────────────────────
// Each section previews at most ALL_PAGE_PREVIEW_LIMIT (5) in a single
// horizontal-scroll row -- never paginated in place, "View all" is the only
// way to see more, which opens that category's own dedicated (uncapped,
// vertical) page instead.
const ALL_PAGE_PREVIEW_LIMIT = 5;

// Builds `/search/category/:tab`, carrying the search text as a real URL
// query param (not just router state) so the page is a shareable/bookmark-
// able, standalone URL per spec (e.g. `/search/category/all?q=dji` ->
// `/search/category/rentals?q=dji`) -- state is still passed alongside for
// filters/sort, which don't have a URL representation yet.
function categoryUrl(category: CategoryTab, navState: NavState): string {
  const params = new URLSearchParams();
  const q = navState.query?.trim();
  if (q) params.set('q', q);
  if (navState.sort && navState.sort !== 'recent') params.set('sort', navState.sort);
  if (navState.filters?.priceRange?.min != null) params.set('priceMin', String(navState.filters.priceRange.min));
  if (navState.filters?.priceRange?.max != null) params.set('priceMax', String(navState.filters.priceRange.max));
  if (navState.filters?.paid != null) params.set('paid', String(navState.filters.paid));
  if (navState.filters?.remote) params.set('remote', '1');
  const qs = params.toString();
  return `/search/category/${category}${qs ? `?${qs}` : ''}`;
}

function CategorySection({ category, navState }: { category: CategoryTab; navState: NavState }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOpportunities = category === 'opportunities';
  const isEmergency = category === 'emergency';
  const canBrowseEmergency = isProfessional(user?.accountType);
  const locked = isOpportunities && !isProfessional(user?.accountType);

  const [listings, setListings] = useState<Listing[]>([]);
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restricted tiers never fetch Emergency at all here -- the section
    // below shows an unconditional "Locked" marker instead (never real
    // inventory, and never a count derived from a real fetch either,
    // since we can't safely tell "zero results" apart from "some exist
    // but you're blocked" without leaking which one it is).
    if (isEmergency && !canBrowseEmergency) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    // Fetches one extra row beyond the preview limit purely to answer "are
    // there more than 5 total" (spec: only show View all when true) without
    // a separate COUNT query -- only the first ALL_PAGE_PREVIEW_LIMIT are
    // ever rendered. A locked-tier Opportunities preview never asks for
    // that extra row at all -- the query itself stays capped at their
    // permanent limit, not just the display.
    const to = locked ? ALL_PAGE_PREVIEW_LIMIT - 1 : ALL_PAGE_PREVIEW_LIMIT;
    fetchCategoryPage(category, navState, 0, to, user?.id).then(({ listings: l, creators: c }) => {
      if (cancelled) return;
      const total = category === 'creators' ? c.length : l.length;
      setHasMore(total > ALL_PAGE_PREVIEW_LIMIT);
      setListings(l.slice(0, ALL_PAGE_PREVIEW_LIMIT));
      setCreators(c.slice(0, ALL_PAGE_PREVIEW_LIMIT));
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, isEmergency, canBrowseEmergency, user?.id, navState.query, JSON.stringify(navState.filters)]);

  // Emergency is ALWAYS shown as a locked category for a restricted tier --
  // never fully hidden (so the category itself isn't a secret), but never
  // real inventory either. This is the one section that ignores the
  // "hide when count is 0" rule below, since count is never computed for
  // a tier that never fetches.
  if (isEmergency && !canBrowseEmergency) {
    return (
      <section className="mb-6">
        <div className="flex items-center justify-between w-full px-4 mb-2">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-black text-gray-900">{CATEGORY_LABEL[category]}</p>
            <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
              <Lock className="w-2.5 h-2.5"/> Locked
            </span>
          </div>
        </div>
        <div className="px-4">
          <button
            onClick={() => navigate('/account/upgrade?auto=professional')}
            className="w-full rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-left flex items-center gap-3 active:scale-[0.99] transition-transform"
          >
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-red-600"/>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-gray-900">Upgrade to Professional or Business</p>
              <p className="text-xs text-gray-600">Emergency listings are exclusive to Professional and Business accounts.</p>
            </div>
          </button>
        </div>
      </section>
    );
  }

  const count = category === 'creators' ? creators.length : listings.length;
  if (!loading && count === 0) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between w-full px-4 mb-2">
        <p className="text-sm font-black text-gray-900">{CATEGORY_LABEL[category]}</p>
        {!loading && !locked && hasMore && (
          <button
            onClick={() => navigate(categoryUrl(category, navState), { state: navState })}
            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
          >
            View all <ArrowRight className="w-3.5 h-3.5"/>
          </button>
        )}
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 className="w-4 h-4 animate-spin"/></div>
      ) : (
        <div className="flex gap-4 px-4 overflow-x-auto no-scrollbar snap-x snap-mandatory">
          {category === 'creators'
            ? creators.map(u => <PreviewCreatorCard key={u.id} u={u}/>)
            : listings.map(l => <PreviewListingCard key={l.id} listing={l}/>)
          }
        </div>
      )}
      {locked && (
        <div className="px-4 mt-2"><OpportunityLockedNotice hasAny={count > 0} onUpgrade={() => navigate('/account/upgrade?auto=professional')}/></div>
      )}
    </section>
  );
}

function AllGroupedResults({ navState }: { navState: NavState }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3 px-4" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
          {/* Always back to Browse Search itself, not browser history --
              this page is reachable from a modal that never had its own
              route (Root.tsx's search icon), so navigate(-1) could land
              anywhere the user was before opening it. */}
          <button onClick={() => navigate('/search')} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors shrink-0 active:scale-90">
            <ArrowLeft className="w-5 h-5 text-gray-700"/>
          </button>
          <p className="text-base font-black text-gray-900">All Results</p>
        </div>
      </div>
      <div className="py-4">
        {CATEGORY_IDS.map(cat => <CategorySection key={cat} category={cat} navState={navState}/>)}
      </div>
    </div>
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function CategoryResults() {
  const { tab } = useParams<{ tab: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAuthenticated = useGuestGuard();
  const stateNav = (location.state || {}) as NavState;
  // The URL's own query params are the fallback/authoritative source when
  // this page is reached directly (a shared link, browser back/forward, a
  // fresh reload) rather than via an in-app "View all" tap that already
  // carries router state -- state wins when both are present.
  const urlPriceMin = searchParams.get('priceMin');
  const urlPriceMax = searchParams.get('priceMax');
  const urlPaid = searchParams.get('paid');
  const navState: NavState = {
    query: stateNav.query ?? searchParams.get('q') ?? undefined,
    sort: stateNav.sort ?? (searchParams.get('sort') as SortOption | null) ?? 'recent',
    filters: stateNav.filters ?? {
      priceRange: (urlPriceMin || urlPriceMax) ? { min: urlPriceMin ? Number(urlPriceMin) : undefined, max: urlPriceMax ? Number(urlPriceMax) : undefined } : null,
      paid: urlPaid != null ? urlPaid === 'true' : null,
      remote: searchParams.get('remote') === '1',
    },
  };

  if (!isAuthenticated) return null;

  if (tab === 'all') return <AllGroupedResults navState={navState}/>;

  const category = (tab && (CATEGORY_IDS as string[]).includes(tab)) ? (tab as CategoryTab) : null;
  if (!category) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-base font-black text-gray-900">Category not found</p>
        <button onClick={() => navigate('/search')} className="px-5 py-2.5 rounded-2xl bg-gray-900 text-white text-sm font-bold">
          Back to Browse
        </button>
      </div>
    );
  }
  return <SingleCategoryResults category={category} navState={navState}/>;
}
