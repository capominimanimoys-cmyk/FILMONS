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
  Bookmark, Calendar, CalendarClock, X, ChevronDown, ChevronLeft, ChevronRight, Heart, CheckCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { withModerationFilter, LISTING_COLUMNS, mapListingRow } from '../lib/api';
import { Listing } from '../types';
import { useAuth } from '../context/AuthContext';
import { useFollow } from '../context/FollowContext';
import { isProfessional, normalizeTier, getTierBadge, AccountTier } from '../lib/reliabilityApi';
import { ALL_PROFESSIONS } from '../components/ProfessionPicker';
import { ALL_SKILLS, CA_CITIES } from '../components/AboutEditor';
import { fetchEmergencyListings } from '../lib/emergencyListings';
import { savedListingsApi } from '../lib/api';
import { toast } from 'sonner';
import {
  searchMatchingListings, searchMatchingCreators,
  isRentalListing, isSaleListing, isServiceListing, isOpportunityListing, isStudioListing,
  SearchListingRow, SearchProfileRow,
} from '../lib/filmSearch';

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

type SortOption = 'recent' | 'price_low' | 'price_high' | 'name_asc';

interface NavState {
  query?: string;
  filters?: {
    priceRange?: { min?: number; max?: number } | null;
    // Opportunity-only quick filters -- metadata fields, not indexed
    // columns, so these narrow the fetched page client-side (see
    // fetchCategoryPage) rather than via a precise server-side count.
    paid?: boolean | null;
    remote?: boolean | null;
    // Creators-only (see CreatorFilterPanel) -- every other category
    // ignores these. Applied client-side (applyCreatorFilters) for the
    // same reason paid/remote are: not all of these map to a single
    // indexed column comparison (skills/role match against array or
    // fuzzy-matched fields).
    role?: string | null;
    skills?: string[] | null;
    location?: string | null;
    availableOnly?: boolean | null;
    verifiedOnly?: boolean | null;
    accountLevel?: AccountTier | null;
  } | null;
  sort?: SortOption;
}

interface CreatorRow {
  id: string; name: string; username: string | null; avatar_url: string | null;
  city: string | null; location: string | null; primary_role: string | null; is_verified: boolean | null;
  secondary_roles?: string[] | null;
  skills?: string[] | null;
  available_for_hire?: boolean | null;
  account_type?: string | null;
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
// When a search term is present, this now runs through the exact same
// searchMatchingListings()/searchMatchingCreators() as /search
// (SearchOverlay.tsx) -- see filmSearch.ts's header comment. This used to
// run its own, narrower query per category (a single-word-split OR clause,
// no alias/synonym expansion, no tags/array containment search), which
// could and did disagree with what /search found for the same query. Now:
// query once against the shared matcher, classify the result into this
// category client-side, then filter/sort/paginate that -- the query itself
// never changes based on who's asking. `total` is the size of that full
// classified set (exact, not approximated), so paid/remote filtering no
// longer needs the old proportional-estimate hack.
const CATEGORY_CLASSIFIER: Record<Exclude<CategoryTab, 'creators' | 'emergency'>, (l: SearchListingRow) => boolean> = {
  rental: isRentalListing, sale: isSaleListing, services: isServiceListing,
  opportunities: isOpportunityListing, studios: isStudioListing,
};

// Pure (no fetch): classify/filter/sort/paginate an already-fetched shared
// match set for one category. Pulled out of fetchCategoryPage so
// /search/category/all can fetch the shared match set ONCE for the whole
// page (see AllGroupedResults) and hand the same array to all 5
// listings-based category sections, instead of each of those 5 sections
// independently re-running the identical searchMatchingListings() query --
// that redundant fan-out (5x the same query, all in flight at once) was
// the actual cause of "other listings take time to fetch" on that page.
function classifyListingsPage(
  category: Exclude<CategoryTab, 'creators' | 'emergency'>, matched: SearchListingRow[], navState: NavState, from: number, to: number,
): { listings: Listing[]; total: number } {
  const price = navState.filters?.priceRange;
  const sortCol = navState.sort === 'price_low' || navState.sort === 'price_high' ? 'price' : 'created_at';
  const ascending = navState.sort === 'price_low';

  let bucket = matched.filter(CATEGORY_CLASSIFIER[category]);
  if (price?.min != null) bucket = bucket.filter(l => (l.price ?? 0) >= price.min!);
  if (price?.max != null) bucket = bucket.filter(l => (l.price ?? 0) <= price.max!);

  let mapped = bucket.map(mapListingRow);
  if (category === 'rental') mapped = mapped.filter(l => l.listingType !== 'opportunity');
  if (category === 'opportunities') {
    if (navState.filters?.paid === true)  mapped = mapped.filter(l => l.opportunity?.paid === true);
    if (navState.filters?.paid === false) mapped = mapped.filter(l => l.opportunity?.paid === false);
    if (navState.filters?.remote)         mapped = mapped.filter(l => l.opportunity?.workArrangement === 'remote');
  }
  mapped.sort((a, b) => sortCol === 'price'
    ? (ascending ? (a.price ?? 0) - (b.price ?? 0) : (b.price ?? 0) - (a.price ?? 0))
    : new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

  return { listings: mapped.slice(from, to + 1), total: mapped.length };
}

// Full field set the creators filter panel needs -- wider than the plain
// browse query used before it (name/username/avatar/city/location/
// primary_role/is_verified only), since role/skills/availability/account
// level all need their backing columns actually selected to filter on.
const CREATOR_SELECT = 'id, name, username, avatar_url, city, location, primary_role, is_verified, secondary_roles, skills, available_for_hire, account_type';
// Same order of magnitude as filmSearch.ts's own per-term cap -- once a
// term or any creator filter is active, there's no single DB query that
// can push every one of these fields at once (skills-contains-all,
// role/location fuzzy match), so this fetches a large candidate batch
// once and filters+paginates it client-side, same pattern as
// classifyListingsPage above.
const CREATOR_BROWSE_FETCH_LIMIT = 300;

function applyCreatorFilters(rows: CreatorRow[], filters: NavState['filters']): CreatorRow[] {
  if (!filters) return rows;
  let out = rows;
  if (filters.role) {
    const r = filters.role.toLowerCase();
    out = out.filter(u => u.primary_role?.toLowerCase() === r || (u.secondary_roles ?? []).some(s => s?.toLowerCase() === r));
  }
  if (filters.skills?.length) {
    const wanted = filters.skills.map(s => s.toLowerCase());
    out = out.filter(u => wanted.every(w => (u.skills ?? []).some(s => s?.toLowerCase() === w)));
  }
  if (filters.location) {
    const loc = filters.location.toLowerCase();
    out = out.filter(u => (u.city ?? '').toLowerCase().includes(loc) || (u.location ?? '').toLowerCase().includes(loc));
  }
  if (filters.availableOnly) out = out.filter(u => u.available_for_hire === true);
  if (filters.verifiedOnly)  out = out.filter(u => u.is_verified === true);
  if (filters.accountLevel)  out = out.filter(u => normalizeTier(u.account_type ?? undefined) === filters.accountLevel);
  return out;
}

function hasCreatorFilters(filters: NavState['filters']): boolean {
  return !!(filters?.role || filters?.skills?.length || filters?.location || filters?.availableOnly || filters?.verifiedOnly || filters?.accountLevel);
}

async function fetchCreatorsForCategory(navState: NavState, from: number, to: number): Promise<{ creators: CreatorRow[]; total: number }> {
  const term = navState.query?.trim();
  const f = navState.filters;
  const nameSort = navState.sort === 'name_asc';

  if (!term && !hasCreatorFilters(f)) {
    // Plain browse, no term, no filters -- cheap, exact DB-level pagination.
    const { data, count } = await supabase.from('profiles')
      .select(CREATOR_SELECT, { count: 'exact' })
      .not('name', 'is', null).neq('name', '').not('primary_role', 'is', null)
      .order(nameSort ? 'name' : 'created_at', { ascending: nameSort })
      .range(from, to);
    return { creators: (data ?? []) as CreatorRow[], total: count ?? (data?.length ?? 0) };
  }

  // A search term and/or a creator filter is active -- same "query once,
  // filter+paginate client-side" shape as classifyListingsPage.
  let rows: CreatorRow[];
  if (term) {
    rows = (await searchMatchingCreators(term)) as CreatorRow[];
  } else {
    const { data } = await supabase.from('profiles')
      .select(CREATOR_SELECT)
      .not('name', 'is', null).neq('name', '').not('primary_role', 'is', null)
      .order('created_at', { ascending: false })
      .limit(CREATOR_BROWSE_FETCH_LIMIT);
    rows = (data ?? []) as CreatorRow[];
  }
  let filtered = applyCreatorFilters(rows, f);
  if (nameSort) filtered = [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return { creators: filtered.slice(from, to + 1), total: filtered.length };
}

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
    const { creators, total } = await fetchCreatorsForCategory(navState, from, to);
    return { listings: [], creators, total };
  }

  const sortCol = navState.sort === 'price_low' || navState.sort === 'price_high' ? 'price' : 'created_at';
  const ascending = navState.sort === 'price_low';

  if (term) {
    const matched = await searchMatchingListings(term);
    const { listings, total } = classifyListingsPage(category, matched, navState, from, to);
    return { listings, creators: [], total };
  }

  // No search term (plain category browse, e.g. landing on the page
  // directly with no query) -- unchanged DB-level query.
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
const SORT_LABEL: Record<SortOption, string> = { recent: 'Most recent', price_low: 'Price: Low to High', price_high: 'Price: High to Low', name_asc: 'Name (A–Z)' };
// Creators have no price to sort by -- every other category keeps the
// price-based options instead of an alphabetical one.
const SORT_OPTIONS_FOR = (category: CategoryTab): SortOption[] =>
  category === 'creators' ? ['recent', 'name_asc'] : ['recent', 'price_low', 'price_high'];
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
  // Creators-only filters -- every other category leaves these null/empty.
  const [role, setRole] = useState(initialNavState.filters?.role ?? '');
  const [skills, setSkills] = useState<string[]>(initialNavState.filters?.skills ?? []);
  const [creatorLocation, setCreatorLocation] = useState(initialNavState.filters?.location ?? '');
  const [availableOnly, setAvailableOnly] = useState(!!initialNavState.filters?.availableOnly);
  const [verifiedOnly, setVerifiedOnly] = useState(!!initialNavState.filters?.verifiedOnly);
  const [accountLevel, setAccountLevel] = useState<AccountTier | ''>(initialNavState.filters?.accountLevel ?? '');
  const toggleSkill = (s: string) => setSkills(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
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
      role: category === 'creators' ? (role || null) : null,
      skills: category === 'creators' && skills.length ? skills : null,
      location: category === 'creators' ? (creatorLocation || null) : null,
      availableOnly: category === 'creators' ? availableOnly : null,
      verifiedOnly: category === 'creators' ? verifiedOnly : null,
      accountLevel: category === 'creators' ? (accountLevel || null) : null,
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
  }, [category, locked, emergencyBlocked, user?.id, debouncedQuery, sort, priceMin, priceMax, chip, role, JSON.stringify(skills), creatorLocation, availableOnly, verifiedOnly, accountLevel]);

  useEffect(() => { setPage(0); loadPage(0); }, [category, locked, emergencyBlocked, user?.id, debouncedQuery, sort, priceMin, priceMax, chip, role, JSON.stringify(skills), creatorLocation, availableOnly, verifiedOnly, accountLevel]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Back always returns to the Browse Search "All" hub, carrying the FULL
  // current search state -- query, sort, and every active filter (price,
  // paid/remote, and for Creators: role/skills/location/availability/
  // verified/account level) -- not just the query text, so a user who
  // narrowed this page down and then goes back doesn't lose that framing.
  // categoryUrl already serializes all of it into the URL too, so this is
  // also a shareable/bookmarkable/back-forward-safe link, not just state.
  const goBackToAll = () => {
    navigate(categoryUrl('all', navState), { state: navState });
  };

  const clearFilters = () => {
    setPriceMin(''); setPriceMax(''); setChip('all'); setSort('recent');
    setRole(''); setSkills([]); setCreatorLocation(''); setAvailableOnly(false); setVerifiedOnly(false); setAccountLevel('');
  };

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

  const filterPanel = category === 'creators' ? (
    <CreatorFilterPanel
      role={role} setRole={setRole}
      skills={skills} toggleSkill={toggleSkill}
      location={creatorLocation} setLocation={setCreatorLocation}
      availableOnly={availableOnly} setAvailableOnly={setAvailableOnly}
      verifiedOnly={verifiedOnly} setVerifiedOnly={setVerifiedOnly}
      accountLevel={accountLevel} setAccountLevel={setAccountLevel}
      onClear={clearFilters}
    />
  ) : (
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
        {/* pl-16 (not px-4) on mobile only -- CategoryHeader's label sits
            after a w-9 back button + gap-3 (36px + 12px = 48px) past its
            own px-4, so the header text's true left edge is 64px from the
            screen edge, not 16px. Matching that here (rather than the
            page's raw padding) is what actually keeps every card's left
            edge under the first letter of the category label above it.
            Creators is the one exception -- its mobile card is a full,
            self-contained block (not a thin row that needs to visually
            line up with the label above it), so it gets a plain, simple
            16px px-4 per spec instead. */}
        <div className={`flex-1 min-w-0 ${category === 'creators' ? 'px-4' : 'pl-16 pr-4'} md:px-0 py-4 md:py-0`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-500">
              {loading ? 'Searching…' : `${total} ${total === 1 ? noun.toLowerCase() : CATEGORY_LABEL[category].toLowerCase()}`}
            </p>
            <div className="relative">
              <button onClick={() => setSortOpen(v => !v)} className="flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-gray-900">
                Sort: {SORT_LABEL[sort]} <ChevronDown className="w-3.5 h-3.5"/>
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10 w-44">
                  {SORT_OPTIONS_FOR(category).map(s => (
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
          ) : category === 'creators' ? (
            // Mobile gets a much simpler full-card, one-per-row layout
            // (CreatorCardMobile) than desktop's compact avatar row
            // (CreatorResultRow, unchanged) -- two lists, one hidden per
            // breakpoint, same pattern CategorySection uses on /all.
            <>
              <div className="flex flex-col gap-3.5 md:hidden">
                {creators.map(u => <CreatorCardMobile key={u.id} u={u} onView={() => navigate(`/host/${u.id}`)}/>)}
              </div>
              <div className="hidden md:flex md:flex-col gap-3">
                {creators.map(u => <CreatorResultRow key={u.id} u={u} onClick={() => navigate(`/host/${u.id}`)}/>)}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3 md:gap-3">
              {listings.map(l => <ListingResultRow key={l.id} listing={l} onSave={() => toggleSave(l.id, l)}/>)}
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

function CreatorToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        aria-label={label}
        className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${checked ? 'bg-gray-900' : 'bg-gray-200'}`}>
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-0.5'}`}/>
      </button>
    </div>
  );
}

// ── Creators-only filter sidebar (desktop) / sheet body (mobile) ────────────
// A separate panel from FilterPanel above rather than another branch inside
// it -- Creators has no price at all, and needs several fields (role,
// skills, location, account level) none of the other categories carry, so
// bolting them onto FilterPanel's shared shape would mean every prop being
// optional-and-usually-unused for 6 of 7 categories. Role/location options
// are pulled from this app's own existing canonical lists (ProfessionPicker's
// ALL_PROFESSIONS, AboutEditor's ALL_SKILLS/CA_CITIES) rather than a new,
// separately-maintained taxonomy.
function CreatorFilterPanel({
  role, setRole, skills, toggleSkill, location, setLocation,
  availableOnly, setAvailableOnly, verifiedOnly, setVerifiedOnly,
  accountLevel, setAccountLevel, onClear,
}: {
  role: string; setRole: (v: string) => void;
  skills: string[]; toggleSkill: (s: string) => void;
  location: string; setLocation: (v: string) => void;
  availableOnly: boolean; setAvailableOnly: (v: boolean) => void;
  verifiedOnly: boolean; setVerifiedOnly: (v: boolean) => void;
  accountLevel: AccountTier | ''; setAccountLevel: (v: AccountTier | '') => void;
  onClear: () => void;
}) {
  const [skillQuery, setSkillQuery] = useState('');
  const visibleSkills = (skillQuery.trim()
    ? ALL_SKILLS.filter(s => s.toLowerCase().includes(skillQuery.trim().toLowerCase()))
    : ALL_SKILLS
  ).slice(0, 24);

  return (
    <div className="bg-white md:border md:border-gray-100 md:rounded-2xl md:p-5 space-y-5">
      <div className="hidden md:flex items-center justify-between">
        <p className="text-sm font-black text-gray-900">Filters</p>
        <button onClick={onClear} className="text-xs font-bold text-blue-600 hover:text-blue-700">Clear all</button>
      </div>

      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Role</p>
        <select
          value={role} onChange={e => setRole(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Any role</option>
          {ALL_PROFESSIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Skills</p>
        <input
          value={skillQuery} onChange={e => setSkillQuery(e.target.value)}
          placeholder="Search skills…"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 mb-2"
        />
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
          {visibleSkills.map(s => (
            <button
              key={s} onClick={() => toggleSkill(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                skills.includes(s) ? 'bg-gray-900 text-white' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Location</p>
        <select
          value={location} onChange={e => setLocation(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Any location</option>
          {CA_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Account level</p>
        <select
          value={accountLevel} onChange={e => setAccountLevel(e.target.value as AccountTier | '')}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Any level</option>
          <option value="creator">Creator</option>
          <option value="creator_plus">Creator+</option>
          <option value="professional">Professional</option>
          <option value="business">Business</option>
        </select>
      </div>

      <div className="space-y-1">
        <CreatorToggle label="Available for hire" checked={availableOnly} onChange={setAvailableOnly}/>
        <CreatorToggle label="Verified only" checked={verifiedOnly} onChange={setVerifiedOnly}/>
      </div>

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

// ── Mobile-only full creator card (/search/category/creators) ───────────────
// Deliberately a full, single-column card, not the compact avatar row
// (CreatorResultRow, still used on desktop) -- per spec, mobile stays much
// simpler than desktop: one big card per creator, no side-by-side info
// crammed into a small row. Follow doubles as this card's "save" action --
// there's no separate saved-creators concept in this app, unlike listings.
const CREATOR_CARD_HEIGHT = 392;       // spec: ~360-420px
const CREATOR_CARD_IMAGE_HEIGHT = 236; // spec: ~220-250px

function CreatorCardMobile({ u, onView }: { u: CreatorRow; onView: () => void }) {
  const { user, showGuestPrompt } = useAuth();
  const { isFollowing, isPending, follow, unfollow } = useFollow();
  const following = isFollowing(u.id);
  const tierBadge = getTierBadge(u.account_type ?? undefined);
  const tags = ((u.secondary_roles?.length ? u.secondary_roles : u.skills) ?? []).slice(0, 3);

  const onToggleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { showGuestPrompt('Create your Filmons account to follow creators.', 'Sign up to follow creators'); return; }
    if (following) await unfollow(u.id); else await follow(u.id);
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col" style={{ height: CREATOR_CARD_HEIGHT }}>
      <button onClick={onView} className="relative w-full shrink-0 bg-gray-100 text-left" style={{ height: CREATOR_CARD_IMAGE_HEIGHT }}>
        {u.avatar_url
          ? <img src={u.avatar_url} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-5xl font-black text-gray-300">{u.name?.[0]?.toUpperCase() ?? '?'}</div>}
        {/* Optional Creator+/Pro badge -- omitted entirely for base Creator
            tier (getTierBadge returns null), never a visible "no badge" state. */}
        {tierBadge && (
          <span className="absolute top-2.5 left-2.5 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full bg-indigo-600 text-white shadow-sm">
            {tierBadge.replace('✓ Verified ', '')}
          </span>
        )}
        <button
          onClick={onToggleFollow} disabled={isPending(u.id)} aria-label={following ? 'Unfollow' : 'Follow'}
          className="absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm active:scale-90 transition-transform"
        >
          <Heart className={`w-4 h-4 ${following ? 'text-red-500 fill-red-500' : 'text-gray-700'}`}/>
        </button>
      </button>
      <div className="flex-1 min-h-0 px-4 py-3 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-base font-black text-gray-900 truncate">{u.name}</p>
          {u.is_verified && <CheckCircle className="w-4 h-4 text-blue-500 fill-blue-50 shrink-0"/>}
        </div>
        {u.primary_role && <p className="text-sm text-blue-600 font-semibold truncate">{u.primary_role}</p>}
        {(u.city ?? u.location) && (
          <p className="text-xs text-gray-400 flex items-center gap-1 truncate"><MapPin className="w-3.5 h-3.5 shrink-0"/>{u.city ?? u.location}</p>
        )}
        {tags.length > 0 && <p className="text-xs text-gray-500 truncate mt-0.5">{tags.join(' • ')}</p>}
        <button
          onClick={onView}
          className="mt-auto w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors"
        >
          View profile
        </button>
      </div>
    </div>
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
// Mobile shows exactly ALL_PAGE_PREVIEW_LIMIT (5) cards, full stop -- "View
// all" is the only way to see more there. Desktop shows exactly 5 AT A TIME
// (fluid-width cards filling the row) but the row itself holds up to
// ALL_PAGE_FETCH_LIMIT so the carousel arrows / trackpad scroll have
// somewhere to go beyond the first 5 -- still a capped preview, not the
// dedicated page's uncapped list, just a slightly deeper one on desktop.
const ALL_PAGE_PREVIEW_LIMIT = 5;
const ALL_PAGE_FETCH_LIMIT = 15;

// Builds `/search/category/:tab` (or `/search/category/all`, used by
// goBackToAll below), carrying the search text as a real URL query param
// (not just router state) so the page is a shareable/bookmarkable,
// standalone URL per spec (e.g. `/search/category/all?q=dji` ->
// `/search/category/rentals?q=dji`) -- state is still passed alongside as
// the authoritative source (see CategoryResults() entry point), so the URL
// only has to be a faithful-enough fallback for a fresh load/shared link.
function categoryUrl(category: CategoryTab | 'all', navState: NavState): string {
  const params = new URLSearchParams();
  const q = navState.query?.trim();
  if (q) params.set('q', q);
  if (navState.sort && navState.sort !== 'recent') params.set('sort', navState.sort);
  if (navState.filters?.priceRange?.min != null) params.set('priceMin', String(navState.filters.priceRange.min));
  if (navState.filters?.priceRange?.max != null) params.set('priceMax', String(navState.filters.priceRange.max));
  if (navState.filters?.paid != null) params.set('paid', String(navState.filters.paid));
  if (navState.filters?.remote) params.set('remote', '1');
  if (navState.filters?.role) params.set('role', navState.filters.role);
  if (navState.filters?.skills?.length) params.set('skills', navState.filters.skills.join(','));
  if (navState.filters?.location) params.set('loc', navState.filters.location);
  if (navState.filters?.availableOnly) params.set('avail', '1');
  if (navState.filters?.verifiedOnly) params.set('verified', '1');
  if (navState.filters?.accountLevel) params.set('level', navState.filters.accountLevel);
  const qs = params.toString();
  return `/search/category/${category}${qs ? `?${qs}` : ''}`;
}

// Horizontal padding shared by every section's header row AND its card
// row on desktop -- both must use the identical value or the first card
// won't align under the first letter of the category label (spec's exact
// requirement). ~32px at lg:, ~40px at xl: and up.
const DESKTOP_SECTION_PAD = 'px-4 lg:px-8 xl:px-10';

// `matched` -- the shared search result set from AllGroupedResults, when a
// search term is active: `undefined` means no term is active (this section
// runs its own cheap category-filtered browse query, as before); `null`
// means a term IS active but the ONE shared searchMatchingListings/
// searchMatchingCreators call for the whole page hasn't resolved yet;
// the object means it has, and this section just classifies/slices it
// synchronously (classifyListingsPage), with no fetch of its own. Emergency
// always gets `undefined` regardless of term -- it stays on its own
// per-tier-gated fetch (fetchEmergencyListings), never shares this set.
function CategorySection({ category, navState, matched }: {
  category: CategoryTab; navState: NavState;
  matched?: { listings: SearchListingRow[]; creators: SearchProfileRow[] } | null;
}) {
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
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    // Restricted tiers never fetch Emergency at all here -- the section
    // below shows an unconditional "Locked" marker instead (never real
    // inventory, and never a count derived from a real fetch either,
    // since we can't safely tell "zero results" apart from "some exist
    // but you're blocked" without leaking which one it is).
    if (isEmergency && !canBrowseEmergency) { setLoading(false); return; }

    const to = locked ? ALL_PAGE_PREVIEW_LIMIT - 1 : ALL_PAGE_FETCH_LIMIT - 1;

    // Search-term mode: classify the page's ONE shared match set instead
    // of firing another identical query per section (this was the actual
    // cause of the other categories being slow to fetch -- 5 listings
    // sections were each independently re-running the same search).
    if (matched !== undefined) {
      if (matched === null) { setLoading(true); return; } // shared fetch still in flight
      if (category === 'creators') {
        setHasMore(matched.creators.length > ALL_PAGE_PREVIEW_LIMIT);
        setCreators(matched.creators.slice(0, to + 1) as CreatorRow[]);
        setListings([]);
      } else {
        const { listings: l, total } = classifyListingsPage(category as Exclude<CategoryTab, 'creators' | 'emergency'>, matched.listings, navState, 0, to);
        setHasMore(total > ALL_PAGE_PREVIEW_LIMIT);
        setListings(l);
        setCreators([]);
      }
      setLoading(false);
      return;
    }

    // Browse mode (no search term) -- unchanged, one cheap per-category
    // fetch each (there's no shared set to reuse without a term).
    let cancelled = false;
    setLoading(true);
    // Desktop's carousel needs somewhere to scroll to beyond the first 5 --
    // fetches up to ALL_PAGE_FETCH_LIMIT (mobile still only ever renders
    // the first ALL_PAGE_PREVIEW_LIMIT of whatever comes back). `total` is
    // the real Postgres/edge-function count, not a fetched-row count, so
    // "View all" and the carousel arrows reflect the true dataset even
    // though only a slice of it is ever fetched here. A locked-tier
    // Opportunities preview never asks for more than its permanent cap at
    // all -- the query itself stays capped, not just the display.
    fetchCategoryPage(category, navState, 0, to, user?.id).then(({ listings: l, creators: c, total }) => {
      if (cancelled) return;
      setHasMore(total > ALL_PAGE_PREVIEW_LIMIT);
      setListings(l);
      setCreators(c);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, isEmergency, canBrowseEmergency, user?.id, navState.query, JSON.stringify(navState.filters), matched, locked]);

  const updateScrollState = useCallback(() => {
    const el = desktopScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => { updateScrollState(); }, [listings, creators, updateScrollState]);
  const scrollByPage = (dir: 1 | -1) => {
    desktopScrollRef.current?.scrollBy({ left: dir * (desktopScrollRef.current.clientWidth || 0), behavior: 'smooth' });
  };

  // Emergency is ALWAYS shown as a locked category for a restricted tier --
  // never fully hidden (so the category itself isn't a secret), but never
  // real inventory either. This is the one section that ignores the
  // "hide when count is 0" rule below, since count is never computed for
  // a tier that never fetches.
  if (isEmergency && !canBrowseEmergency) {
    return (
      <section className="mb-6 lg:mb-8">
        <div className={`flex items-center justify-between w-full ${DESKTOP_SECTION_PAD} mb-2 lg:mb-3`}>
          <div className="flex items-center gap-1.5">
            <p className="text-sm lg:text-base font-black text-gray-900">{CATEGORY_LABEL[category]}</p>
            <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
              <Lock className="w-2.5 h-2.5"/> Locked
            </span>
          </div>
        </div>
        <div className={DESKTOP_SECTION_PAD}>
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

  const mobileListings = listings.slice(0, ALL_PAGE_PREVIEW_LIMIT);
  const mobileCreators = creators.slice(0, ALL_PAGE_PREVIEW_LIMIT);

  return (
    <section className="mb-6 lg:mb-8">
      {/* ── Mobile header (unchanged fixed-card design) ─────────────────── */}
      <div className="lg:hidden flex items-center justify-between w-full px-4 mb-2">
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
      {/* ── Desktop header: label + "View all" text+arrow, circular
          prev/next carousel controls far right ─────────────────────────── */}
      <div className={`hidden lg:flex items-center justify-between w-full ${DESKTOP_SECTION_PAD} mb-3`}>
        <div className="flex items-center gap-3">
          <p className="text-base font-black text-gray-900">{CATEGORY_LABEL[category]}</p>
          {!loading && !locked && hasMore && (
            <button
              onClick={() => navigate(categoryUrl(category, navState), { state: navState })}
              className="flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
            >
              View all <ArrowRight className="w-4 h-4"/>
            </button>
          )}
        </div>
        {!loading && hasMore && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollByPage(-1)} disabled={!canScrollLeft} aria-label="Previous"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                canScrollLeft ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-gray-50 text-gray-300 cursor-default'
              }`}
            >
              <ChevronLeft className="w-4 h-4"/>
            </button>
            <button
              onClick={() => scrollByPage(1)} disabled={!canScrollRight} aria-label="Next"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                canScrollRight ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-gray-50 text-gray-300 cursor-default'
              }`}
            >
              <ChevronRight className="w-4 h-4"/>
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 className="w-4 h-4 animate-spin"/></div>
      ) : (
        <>
          {/* ── Mobile row: fixed 240x320 cards (unchanged) ───────────────
              scroll-pl-4 (scroll-padding-left, matching the row's own
              px-4) is the actual fix for the first card rendering flush
              against the screen edge instead of under the category label:
              a snap-x/snap-mandatory scroll container with no explicit
              scroll-padding can settle its initial scroll position so the
              first snap-aligned child's edge lines up with the scrollport
              edge, effectively scrolling past the container's own left
              padding before it's ever seen -- the header above (not a
              scroll container) never had this problem, which is why only
              the row looked misaligned. */}
          <div className="lg:hidden flex gap-4 px-4 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-pl-4">
            {category === 'creators'
              ? mobileCreators.map(u => <PreviewCreatorCard key={u.id} u={u}/>)
              : mobileListings.map(l => <PreviewListingCard key={l.id} listing={l}/>)
            }
          </div>
          {/* ── Desktop row: exactly 5 fluid-width cards fill the row;
              anything past 5 sits outside the viewport, reachable only by
              scrolling or the arrow controls above -- never a partial
              peek, never shrunk to fit 6+, never a wrapping grid. ────── */}
          <div
            ref={desktopScrollRef} onScroll={updateScrollState}
            className={`hidden lg:flex flex-nowrap gap-4 overflow-x-auto no-scrollbar ${DESKTOP_SECTION_PAD}`}
          >
            {category === 'creators'
              ? creators.map(u => <DesktopCreatorCard key={u.id} u={u}/>)
              : listings.map(l => <DesktopListingCard key={l.id} listing={l}/>)
            }
          </div>
        </>
      )}
      {locked && (
        <div className={`${DESKTOP_SECTION_PAD} mt-2`}><OpportunityLockedNotice hasAny={count > 0} onUpgrade={() => navigate('/account/upgrade?auto=professional')}/></div>
      )}
    </section>
  );
}

// Fluid card width -- exactly 5 fill the row (rowWidth - 4*16px gaps) / 5 --
// instead of a fixed 240px. `%` here resolves against the scroll
// container's own content width (after ITS padding), which is exactly
// "rowWidth" as the spec defines it.
//
// Height comes from `aspectRatio` on the CARD ITSELF (not just on the
// image) -- fixes the earlier bug where cards were tall/portrait/
// inconsistent-between-categories because only the image area had a
// ratio, while the text area below it had no height limit, so a card's
// TOTAL height was "image height + however much text this particular
// listing happens to have". With aspect-ratio on the outer box, total
// height is a pure function of width, identical for every category;
// `overflow: hidden` is what makes that actually hold when content would
// otherwise want more room, instead of silently growing past it.
// 1.15:1 (taller than the first pass's 1.55:1) per the "cards are too
// short, increase height while keeping exactly 5 across" follow-up --
// still width-driven, so 5-per-row + full desktop width still holds.
const DESKTOP_CARD_STYLE: React.CSSProperties = {
  flex: '0 0 calc((100% - 64px) / 5)', minWidth: 180, aspectRatio: '0.95 / 1', overflow: 'hidden',
};
// Image area is a fixed PERCENTAGE OF THE CARD'S OWN (aspect-ratio-fixed)
// height, not of the image's intrinsic dimensions -- a portrait creator
// photo is cropped to this box via object-fit: cover, never the reverse.
const DESKTOP_CARD_IMAGE_STYLE: React.CSSProperties = { height: '58%' };

function DesktopListingCard({ listing }: { listing: Listing }) {
  const navigate = useNavigate();
  const { user, showGuestPrompt } = useAuth();
  const isOpp = listing.listingType === 'opportunity';
  const price = `$${Number(listing.price ?? 0).toLocaleString()}${listing.listingMode === 'rent' ? '/day' : ''}`;
  const isEmergencyActive = !!listing.isEmergency && !!listing.emergencyExpiresAt && new Date(listing.emergencyExpiresAt) > new Date();
  const typeLabel = categoryTypeLabel(listing);
  const eventDate = isOpp ? formatShortDate(listing.opportunity?.startDate) : undefined;
  const roleChips = [listing.opportunity?.roleNeeded, listing.opportunity?.categoryIndustry, listing.opportunity?.workArrangement === 'remote' ? 'Remote' : undefined]
    .filter(Boolean) as string[];

  const onSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { showGuestPrompt('Create your Filmons account to save listings.', 'Sign up to save listings'); return; }
    await savedListingsApi.toggle(user.id, listing.id, listing);
    toast.success('Saved');
  };

  return (
    <button
      onClick={() => navigate(`/listing/${listing.id}`)}
      style={DESKTOP_CARD_STYLE}
      className="snap-start text-left bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col hover:shadow-md transition-shadow"
    >
      <div style={DESKTOP_CARD_IMAGE_STYLE} className="relative w-full shrink-0 bg-gray-100">
        {listing.images?.[0]
          ? <img src={listing.images[0]} className="w-full h-full object-cover object-center" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-2xl opacity-25">🎬</div>}
        {isOpp && (
          <span className={`absolute top-1.5 left-1.5 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full shadow-sm ${listing.opportunity?.paid ? 'bg-green-600 text-white' : 'bg-gray-700 text-white'}`}>
            {listing.opportunity?.paid ? 'Paid' : 'Unpaid'}
          </span>
        )}
        {isEmergencyActive && (
          <span className="absolute top-1.5 left-1.5 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-500 text-white flex items-center gap-0.5 shadow-sm">
            <AlertTriangle className="w-2.5 h-2.5 fill-white"/> Emergency
          </span>
        )}
        <button onClick={onSave} aria-label="Save" className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm active:scale-90 transition-transform">
          <Heart className="w-3 h-3 text-gray-700"/>
        </button>
      </div>
      {/* flex-1 fills exactly what's left of the card's fixed total height
          (100% - image's 58%) -- min-h-0 lets it actually shrink instead of
          being pushed to its content's natural size, and overflow-hidden
          on the card above clips anything that still doesn't fit, so a
          long title/many chips can never grow the card. */}
      <div className="flex-1 min-h-0 min-w-0 px-3 py-2 flex flex-col justify-center gap-1 overflow-hidden">
        <p className="text-sm font-bold text-gray-900 truncate leading-tight">{listing.title}</p>
        {typeLabel && <p className="text-xs text-blue-600 font-semibold capitalize truncate leading-tight">{typeLabel}</p>}
        {listing.city && <p className="text-xs text-gray-400 flex items-center gap-1 truncate leading-tight"><MapPin className="w-3 h-3 shrink-0"/>{listing.city}</p>}
        {eventDate && <p className="text-xs text-gray-400 flex items-center gap-1 truncate leading-tight"><Calendar className="w-3 h-3 shrink-0"/>{eventDate}</p>}
        {roleChips.length > 0 && (
          <div className="flex flex-nowrap gap-1 overflow-hidden">
            {roleChips.slice(0, 2).map(c => (
              <span key={c} className="shrink-0 text-[10px] font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded-full capitalize truncate max-w-[45%]">{c}</span>
            ))}
          </div>
        )}
        {!isOpp && <p className="text-sm font-black text-blue-600 leading-tight">{price}</p>}
      </div>
    </button>
  );
}

function DesktopCreatorCard({ u }: { u: CreatorRow }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/host/${u.id}`)}
      style={DESKTOP_CARD_STYLE}
      className="snap-start text-left bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col hover:shadow-md transition-shadow"
    >
      <div style={DESKTOP_CARD_IMAGE_STYLE} className="relative w-full shrink-0 bg-gray-100">
        {u.avatar_url
          ? <img src={u.avatar_url} className="w-full h-full object-cover object-center" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-3xl font-black text-gray-300">{u.name?.[0]?.toUpperCase() ?? '?'}</div>}
      </div>
      <div className="flex-1 min-h-0 min-w-0 px-3 py-2 flex flex-col justify-center gap-1 overflow-hidden">
        <div className="flex items-center gap-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate leading-tight">{u.name}</p>
          {u.is_verified && <CheckCircle className="w-3.5 h-3.5 text-blue-500 fill-blue-50 shrink-0"/>}
        </div>
        {u.primary_role && <p className="text-xs text-blue-600 font-semibold truncate leading-tight">{u.primary_role}</p>}
        {(u.city ?? u.location) && (
          <p className="text-xs text-gray-400 flex items-center gap-1 truncate leading-tight"><MapPin className="w-3 h-3 shrink-0"/>{u.city ?? u.location}</p>
        )}
      </div>
    </button>
  );
}

function AllGroupedResults({ navState }: { navState: NavState }) {
  const navigate = useNavigate();
  const term = navState.query?.trim();

  // The ONE shared searchMatchingListings/searchMatchingCreators call for
  // this whole page -- fetched here, once, and handed to every non-
  // Emergency CategorySection below instead of each of them (5 listings
  // categories + Creators) independently re-running the identical search.
  // That fan-out -- 6 concurrent calls doing the same multi-term Supabase
  // queries -- was why categories other than the first to resolve looked
  // slow to load. `null` while in flight, so sections can tell "no term"
  // (undefined, handled per-section) apart from "term active, still
  // loading" (null).
  const [sharedMatched, setSharedMatched] = useState<{ listings: SearchListingRow[]; creators: SearchProfileRow[] } | null>(null);
  useEffect(() => {
    if (!term) { setSharedMatched(null); return; }
    let cancelled = false;
    setSharedMatched(null);
    Promise.all([searchMatchingListings(term), searchMatchingCreators(term)]).then(([listings, creators]) => {
      if (!cancelled) setSharedMatched({ listings, creators });
    });
    return () => { cancelled = true; };
  }, [term]);

  const matchedFor = (cat: CategoryTab) => (term && cat !== 'emergency') ? sharedMatched : undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        {/* Same DESKTOP_SECTION_PAD as every category row below it, so this
            bar's content lines up with them -- not a separate narrower
            max-width container. */}
        <div className={`flex items-center gap-3 px-4 lg:px-8 xl:px-10`} style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
          {/* Always back to Browse Search itself, not browser history --
              this page is reachable from a modal that never had its own
              route (Root.tsx's search icon), so navigate(-1) could land
              anywhere the user was before opening it. */}
          <button onClick={() => navigate('/search')} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors shrink-0 active:scale-90">
            <ArrowLeft className="w-5 h-5 text-gray-700"/>
          </button>
          <p className="text-base lg:text-lg font-black text-gray-900">All Results</p>
        </div>
      </div>
      <div className="py-4 lg:py-6">
        {CATEGORY_IDS.map(cat => <CategorySection key={cat} category={cat} navState={navState} matched={matchedFor(cat)}/>)}
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
  const urlSkills = searchParams.get('skills');
  const navState: NavState = {
    query: stateNav.query ?? searchParams.get('q') ?? undefined,
    sort: stateNav.sort ?? (searchParams.get('sort') as SortOption | null) ?? 'recent',
    filters: stateNav.filters ?? {
      priceRange: (urlPriceMin || urlPriceMax) ? { min: urlPriceMin ? Number(urlPriceMin) : undefined, max: urlPriceMax ? Number(urlPriceMax) : undefined } : null,
      paid: urlPaid != null ? urlPaid === 'true' : null,
      remote: searchParams.get('remote') === '1',
      role: searchParams.get('role') || null,
      skills: urlSkills ? urlSkills.split(',').filter(Boolean) : null,
      location: searchParams.get('loc') || null,
      availableOnly: searchParams.get('avail') === '1',
      verifiedOnly: searchParams.get('verified') === '1',
      accountLevel: (searchParams.get('level') as AccountTier | null) || null,
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
