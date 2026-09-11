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
import { ArrowLeft, ArrowRight, Loader2, Lock, MapPin, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { withModerationFilter, LISTING_COLUMNS, mapListingRow } from '../lib/api';
import { ListingCard } from '../components/ListingCard';
import { Listing } from '../types';
import { useAuth } from '../context/AuthContext';
import { isProfessional } from '../lib/reliabilityApi';

type CategoryTab = 'rental' | 'sale' | 'services' | 'creators' | 'studios' | 'opportunities' | 'emergency';
const CATEGORY_IDS: CategoryTab[] = ['rental', 'sale', 'services', 'creators', 'studios', 'opportunities', 'emergency'];
const CATEGORY_LABEL: Record<CategoryTab, string> = {
  rental: 'Rentals', sale: 'Sales', services: 'Services',
  creators: 'Creators', studios: 'Studios', opportunities: 'Opportunities', emergency: 'Emergency',
};
// Same permanent cap as SearchOverlay.tsx's OPPORTUNITY_LOCKED_LIMIT --
// duplicated rather than imported since that one lives in a component
// module; kept in sync deliberately (see that file's own comment on it).
const OPPORTUNITY_LOCKED_LIMIT = 5;
const PAGE_SIZE = 30;

interface NavState { query?: string; filters?: { priceRange?: { min?: number; max?: number } | null } | null; sort?: string; }

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
async function fetchCategoryPage(category: CategoryTab, navState: NavState, from: number, to: number): Promise<{ listings: Listing[]; creators: CreatorRow[] }> {
  const term = navState.query?.trim();
  const price = navState.filters?.priceRange;

  if (category === 'creators') {
    let q = supabase.from('profiles')
      .select('id, name, username, avatar_url, city, location, primary_role, is_verified')
      .not('name', 'is', null).neq('name', '').not('primary_role', 'is', null);
    if (term) q = q.or(`name.ilike.%${term}%,username.ilike.%${term}%,primary_role.ilike.%${term}%,city.ilike.%${term}%`);
    const { data } = await q.order('created_at', { ascending: false }).range(from, to);
    return { listings: [], creators: (data ?? []) as CreatorRow[] };
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
      // Same clause as SearchOverlay.tsx's own 'emergency' tab -- a real,
      // still-active Emergency listing, not a listing_type/listing_mode
      // value of its own (Emergency is a status any Rental/Sale/Service
      // listing can carry).
      case 'emergency':      query = query.eq('is_emergency', true).gt('emergency_expires_at', new Date().toISOString()); break;
    }
    if (term) query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%,city.ilike.%${term}%`);
    if (price?.min != null) query = query.gte('price', price.min);
    if (price?.max != null) query = query.lte('price', price.max);
    return query.order('created_at', { ascending: false }).range(from, to);
  });
  let listings = (res.data ?? []).map(mapListingRow);
  if (category === 'rental') listings = listings.filter(l => l.listingType !== 'opportunity');
  return { listings, creators: [] };
}

// ── /search/category/:tab ────────────────────────────────────────────────────
function SingleCategoryResults({ category, navState }: { category: CategoryTab; navState: NavState }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOpportunities = category === 'opportunities';
  const locked = isOpportunities && !isProfessional(user?.accountType);
  // Emergency isn't a partially-visible-then-locked category like
  // Opportunities -- for a restricted tier it's not browsable as its own
  // page at all (see SearchOverlay.tsx's Emergency tab), so this blocks the
  // whole page instead of capping+showing a notice below real results.
  const isEmergency = category === 'emergency';
  const emergencyBlocked = isEmergency && !isProfessional(user?.accountType);

  const [listings, setListings] = useState<Listing[]>([]);
  const [creators, setCreators] = useState<CreatorRow[]>([]);
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
    const { listings: l, creators: c } = await fetchCategoryPage(category, navState, from, to);
    if (pageNum === 0) { setListings(l); setCreators(c); } else { setListings(prev => [...prev, ...l]); setCreators(prev => [...prev, ...c]); }
    setHasMore(!locked && (l.length + c.length) === PAGE_SIZE);
    setLoading(false); setLoadingMore(false);
  }, [category, locked, emergencyBlocked, navState.query, navState.filters]);

  useEffect(() => { setPage(0); loadPage(0); }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3 px-4" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
          {/* Always back to Browse Search itself, not browser history --
              this page is reachable from a modal that never had its own
              route (Root.tsx's search icon), so navigate(-1) could land
              anywhere the user was before opening it. */}
          <button onClick={() => navigate('/search')} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors shrink-0 active:scale-90">
            <ArrowLeft className="w-5 h-5 text-gray-700"/>
          </button>
          <div className="min-w-0">
            <p className="text-base font-black text-gray-900 truncate">{CATEGORY_LABEL[category]}</p>
            {!loading && !locked && !emergencyBlocked && <p className="text-xs text-gray-400">{count} {count === 1 ? 'result' : 'results'}</p>}
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4">
        {emergencyBlocked ? (
          <EmergencyBlockedNotice onUpgrade={() => navigate('/account/upgrade?auto=professional')}/>
        ) : loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin"/><span className="text-sm">Loading…</span>
          </div>
        ) : count === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-1">
            <p className="text-sm font-bold text-gray-500">No {CATEGORY_LABEL[category].toLowerCase()} found</p>
            <p className="text-xs text-gray-400">Try a different search or check back soon.</p>
          </div>
        ) : category === 'creators' ? (
          // One per line, full-width, vertical scroll -- no horizontal
          // carousel or multi-column grid on the dedicated category page
          // (that's Browse Search / the All page's job).
          <div className="grid grid-cols-1 gap-3">
            {creators.map(u => <CreatorRowFull key={u.id} u={u} onClick={() => navigate(`/host/${u.id}`)}/>)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {listings.map(l => <ListingCard key={l.id} listing={l}/>)}
          </div>
        )}

        {locked && (
          <OpportunityLockedNotice hasAny={count > 0} onUpgrade={() => navigate('/account/upgrade?auto=professional')}/>
        )}

        {!emergencyBlocked && !loading && hasMore && <div ref={sentinelRef} className="h-1"/>}
        {loadingMore && (
          <div className="flex items-center justify-center py-6 text-gray-400"><Loader2 className="w-4 h-4 animate-spin"/></div>
        )}
      </div>
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
      <p className="text-base font-black text-gray-900">Emergency Listings</p>
      <p className="text-sm text-gray-600">
        Emergency Listings are available to Professional and Business accounts. Upgrade to browse them.
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
const PREVIEW_CARD_CLASS = 'shrink-0 w-40 h-[213px] sm:w-60 sm:h-80 rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-sm text-left flex flex-col active:scale-[0.97] transition-transform';
const PREVIEW_IMAGE_CLASS = 'relative w-full h-[120px] sm:h-[180px] shrink-0 bg-gray-100 overflow-hidden';

function PreviewListingCard({ listing }: { listing: Listing }) {
  const navigate = useNavigate();
  const price = `$${Number(listing.price ?? 0).toLocaleString()}${listing.listingMode === 'rent' ? '/day' : ''}`;
  const isEmergency = !!listing.isEmergency && !!listing.emergencyExpiresAt && new Date(listing.emergencyExpiresAt) > new Date();
  return (
    <button onClick={() => navigate(`/listing/${listing.id}`)} className={PREVIEW_CARD_CLASS}>
      <div className={PREVIEW_IMAGE_CLASS}>
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

function PreviewCreatorCard({ u }: { u: CreatorRow }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/host/${u.id}`)} className={PREVIEW_CARD_CLASS}>
      <div className={PREVIEW_IMAGE_CLASS}>
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

// Full-width row variant -- used on the dedicated category page's
// one-per-line vertical list.
function CreatorRowFull({ u, onClick }: { u: CreatorRow; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full bg-white rounded-2xl border border-gray-100 flex items-center gap-3 p-4 text-left">
      <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
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
  const q = navState.query?.trim();
  return `/search/category/${category}${q ? `?q=${encodeURIComponent(q)}` : ''}`;
}

function CategorySection({ category, navState }: { category: CategoryTab; navState: NavState }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOpportunities = category === 'opportunities';
  const isEmergency = category === 'emergency';
  const canBrowseEmergency = isProfessional(user?.accountType);
  // Emergency isn't a browsable category at all for a restricted tier (they
  // still see emergency-flagged items embedded within Rental/Sale/etc via
  // Home/SearchOverlay) -- no preview, no locked teaser, section just
  // doesn't exist for them here, matching SearchOverlay's own Emergency tab.
  const locked = isOpportunities && !isProfessional(user?.accountType);

  const [listings, setListings] = useState<Listing[]>([]);
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    fetchCategoryPage(category, navState, 0, to).then(({ listings: l, creators: c }) => {
      if (cancelled) return;
      const total = category === 'creators' ? c.length : l.length;
      setHasMore(total > ALL_PAGE_PREVIEW_LIMIT);
      setListings(l.slice(0, ALL_PAGE_PREVIEW_LIMIT));
      setCreators(c.slice(0, ALL_PAGE_PREVIEW_LIMIT));
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, isEmergency, canBrowseEmergency, navState.query, JSON.stringify(navState.filters)]);

  if (isEmergency && !canBrowseEmergency) return null;

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
            ? creators.map(u => <div key={u.id} className="snap-start"><PreviewCreatorCard u={u}/></div>)
            : listings.map(l => <div key={l.id} className="snap-start"><PreviewListingCard listing={l}/></div>)
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
  // The URL's own `?q=` is the fallback/authoritative source when this page
  // is reached directly (a shared link, browser back/forward, a fresh
  // reload) rather than via an in-app "View all" tap that already carries
  // richer router state -- state wins when both are present since it can
  // also carry filters/sort that have no URL representation yet.
  const navState: NavState = {
    ...stateNav,
    query: stateNav.query ?? searchParams.get('q') ?? undefined,
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
