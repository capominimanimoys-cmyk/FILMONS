// FILMONS -- /search/locations/:slug. Everything in ONE place (e.g. "Surrey, BC"): marketplace
// listings, posts, portfolio work, profiles and courses, filtered by the selected location and
// then by the in-page search + category filters. Data lives in lib/locationSearch.ts.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router';
import { ArrowLeft, MapPin, MessageCircle, Search, X, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocationScope, type LocationScope } from '../lib/locationsApi';
import {
  CATEGORY_FILTERS, LOCATION_CATEGORIES, SECTION_ORDER, hydrateCourses, hydratePortfolio, hydratePosts,
  searchLocationCategory, type CategoryMatches, type LocationCategory, type LocationFilters, type PortfolioRef, type SectionCategory,
} from '../lib/locationSearch';
import { useLoadDeadline } from '../lib/useLoadDeadline';
import { useSearchChromeVisibility } from '../lib/useSearchChromeVisibility';
import { SlideHeader } from '../components/SlideHeader';
import { FilmonsLogo } from '../components/FilmonsLogo';
import { ProfileCardSkeleton, ProfileSearchCard } from '../components/search/ProfileSearch';
import { PostCard } from '../components/PostCard';
import { PortfolioPinGrid } from '../components/connect/PortfolioPinGrid';
import { CourseCard } from '../components/courses/CourseCard';
import { useAuth } from '../context/AuthContext';
import type { Listing } from '../types';
import type { PortfolioFeedEntry } from '../lib/portfolioApi';

const PREVIEW_MAX = 5;
const DEBOUNCE_MS = 300;

// ── Persisted page state (category, query, filters, how far the list was loaded, scroll) ─────
interface SavedState {
  category: LocationCategory; query: string; filters: Record<string, LocationFilters>; shown: number; scrollY: number;
}
const stateKey = (slug: string) => `filmons:location-page:${slug.toLowerCase()}`;
function readSaved(slug: string): SavedState | null {
  try { return JSON.parse(sessionStorage.getItem(stateKey(slug)) || 'null'); } catch { return null; }
}
function writeSaved(slug: string, s: SavedState) {
  try { sessionStorage.setItem(stateKey(slug), JSON.stringify(s)); } catch { /* storage unavailable */ }
}

// ── Data hooks ───────────────────────────────────────────────────────────────
function useCategoryMatches<C extends SectionCategory>(
  slug: string, scope: LocationScope | null, cat: C, query: string, filters: LocationFilters,
) {
  const [state, setState] = useState<{ data: CategoryMatches[C] | null; loading: boolean; error: boolean }>({ data: null, loading: true, error: false });
  const [nonce, setNonce] = useState(0);
  const force = useRef(false);
  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    // Existing results stay on screen (and on failure too) while the next ones load.
    setState(s => ({ ...s, loading: true, error: false }));
    const f = force.current; force.current = false;
    searchLocationCategory(slug, scope, cat, query, filters, f)
      .then(data => { if (!cancelled) setState({ data, loading: false, error: false }); })
      .catch(() => { if (!cancelled) setState(s => ({ ...s, loading: false, error: true })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, scope, cat, query, filtersKey, nonce]);
  const retry = useCallback(() => { force.current = true; setNonce(n => n + 1); }, []);
  return { ...state, retry };
}

/** Fetches the full cards for the slice being shown, once per item (never refetches / duplicates). */
function useHydrated<I, T>(items: I[], keyOf: (i: I) => string, fetch: (items: I[]) => Promise<Map<string, T>>) {
  const cache = useRef(new Map<string, T>());
  const attempted = useRef(new Set<string>());
  const [, bump] = useState(0);
  const [failed, setFailed] = useState(false);
  const run = useCallback((list: I[]) => {
    const missing = list.filter(i => !attempted.current.has(keyOf(i)));
    if (!missing.length) return;
    missing.forEach(i => attempted.current.add(keyOf(i)));
    fetch(missing)
      .then(m => { m.forEach((v, k) => cache.current.set(k, v)); setFailed(false); bump(n => n + 1); })
      .catch(() => { missing.forEach(i => attempted.current.delete(keyOf(i))); setFailed(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const itemsKey = items.map(keyOf).join('|');
  useEffect(() => { run(items); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [itemsKey]);
  const ready = items.map(i => cache.current.get(keyOf(i))).filter((v): v is T => v !== undefined);
  const settled = items.every(i => attempted.current.has(keyOf(i)) && (cache.current.has(keyOf(i)) || !failed));
  return { ready, failed, retry: () => run(items), pending: !settled && !failed };
}

// ── Card rendering per category ──────────────────────────────────────────────
const BADGE: Record<string, { label: string; cls: string }> = {
  rental: { label: 'RENTAL', cls: 'bg-blue-600' }, sale: { label: 'SALE', cls: 'bg-emerald-600' },
  service: { label: 'SERVICE', cls: 'bg-teal-600' }, opportunity: { label: 'OPPORTUNITY', cls: 'bg-purple-600' },
};
function listingKind(l: Listing) {
  return l.listingType === 'opportunity' ? 'opportunity' : l.listingType === 'service' ? 'service' : l.listingMode === 'sale' ? 'sale' : 'rental';
}
function LocationListingCard({ listing }: { listing: Listing }) {
  const navigate = useNavigate();
  const badge = BADGE[listingKind(listing)];
  const price = `$${Number(listing.price ?? 0).toLocaleString()}${listing.listingMode === 'rent' ? '/day' : ''}`;
  return (
    <button onClick={() => navigate(`/listing/${listing.id}`)} className="w-full text-left bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="relative w-full bg-gray-100" style={{ aspectRatio: '4 / 3' }}>
        {listing.images?.[0]
          ? <img src={listing.images[0]} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center text-2xl opacity-25">🎬</div>}
        <span className={`absolute top-1.5 left-1.5 text-[9px] font-black tracking-wide px-1.5 py-0.5 rounded-full text-white shadow-sm ${badge.cls}`}>{badge.label}</span>
      </div>
      <div className="p-3 space-y-0.5">
        <p className="text-xs font-bold text-gray-900 truncate">{listing.title}</p>
        {listing.city && <p className="text-[10px] text-gray-400 truncate flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5 shrink-0" />{listing.city}</p>}
        <p className="text-xs font-black text-blue-600">{price}</p>
      </div>
    </button>
  );
}
const CardSkeleton = ({ h = 'h-52' }: { h?: string }) => <div className={`${h} w-full rounded-2xl bg-white border border-gray-100 animate-pulse`} aria-hidden />;

/** Everything a category needs to render a slice of its matches. */
function useCategoryItems(cat: SectionCategory, matches: unknown[] | null, count: number, viewerId?: string) {
  const slice = (matches ?? []).slice(0, count);
  const posts = useHydrated<string, any>(cat === 'posts' ? (slice as string[]) : [], id => id,
    async ids => new Map((await hydratePosts(ids)).map(p => [p.id, p])));
  const portfolio = useHydrated<PortfolioRef, PortfolioFeedEntry>(cat === 'portfolio' ? (slice as PortfolioRef[]) : [], r => `${r.type}:${r.id}`,
    async refs => new Map((await hydratePortfolio(refs, viewerId)).map(e => [`${e.type}:${e.id}`, e])));
  const courses = useHydrated<string, any>(cat === 'courses' ? (slice as string[]) : [], id => id,
    async ids => new Map((await hydrateCourses(ids)).map(c => [c.id, c])));

  switch (cat) {
    case 'marketplace': return { nodes: (slice as Listing[]).map(l => ({ key: l.id, node: <LocationListingCard listing={l} /> })), pending: false, failed: false, retry: () => {} };
    case 'profiles': return { nodes: (slice as any[]).map(p => ({ key: p.id, node: <ProfileSearchCard profile={p} /> })), pending: false, failed: false, retry: () => {} };
    case 'posts': return { nodes: posts.ready.map(p => ({ key: p.id, node: <PostCard post={p} /> })), pending: posts.pending, failed: posts.failed, retry: posts.retry };
    case 'portfolio': return { nodes: portfolio.ready.map(e => ({ key: `${e.type}-${e.id}`, node: null, entry: e })), pending: portfolio.pending, failed: portfolio.failed, retry: portfolio.retry };
    case 'courses': return { nodes: courses.ready.map(c => ({ key: c.id, node: <CourseCard course={c} /> })), pending: courses.pending, failed: courses.failed, retry: courses.retry };
  }
}

const TITLES: Record<SectionCategory, string> = { marketplace: 'Marketplace', posts: 'Posts', portfolio: 'Portfolio', profiles: 'Profiles', courses: 'Courses' };
const CAROUSEL_W: Record<SectionCategory, string> = {
  marketplace: 'w-60', posts: 'w-[85%] md:w-96', portfolio: 'w-[80%] md:w-80',
  profiles: 'w-[calc(100%-2.5rem)] md:w-[440px]', courses: 'w-56',
};
const PAGE_SIZE: Record<SectionCategory, number> = { marketplace: 20, posts: 10, portfolio: 10, profiles: 20, courses: 20 };

function SectionError({ onRetry, label }: { onRetry: () => void; label: string }) {
  return (
    <button onClick={onRetry} className="flex items-center gap-1.5 text-sm text-gray-500">
      Couldn’t load {label}. <span className="font-bold text-blue-600 inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Retry</span>
    </button>
  );
}

// ── All: one horizontal carousel per category ───────────────────────────────
function AllSection({ cat, slug, scope, query, onViewAll, onSettled }: {
  cat: SectionCategory; slug: string; scope: LocationScope; query: string; onViewAll: () => void;
  onSettled: (cat: SectionCategory, state: 'empty' | 'has' | 'error' | 'loading') => void;
}) {
  const { user } = useAuth() as any;
  const m = useCategoryMatches(slug, scope, cat, query, {});
  const items = useCategoryItems(cat, m.data as unknown[] | null, PREVIEW_MAX, user?.id);
  const scroller = useRef<HTMLDivElement>(null);
  const total = m.data?.length ?? 0;
  const status = m.data ? (total ? 'has' : 'empty') : m.error ? 'error' : 'loading';
  useEffect(() => { onSettled(cat, status); }, [cat, status, onSettled]);
  const late = useLoadDeadline(m.loading && !m.data);

  if (m.data && !total) return null;                              // hide sections with no content
  const scrollBy = (d: 1 | -1) => scroller.current?.scrollBy({ left: d * (scroller.current.clientWidth * 0.85), behavior: 'smooth' });

  return (
    <section className="mb-6" aria-label={TITLES[cat]}>
      <div className="flex items-center justify-between px-4 md:px-0 mb-2.5">
        <h2 className="text-base font-black text-gray-900">{TITLES[cat]}</h2>
        <div className="flex items-center gap-2">
          {total > PREVIEW_MAX && <button onClick={onViewAll} className="text-sm font-bold text-blue-600 hover:text-blue-700">View all →</button>}
          <div className="hidden md:flex items-center gap-1">
            <button onClick={() => scrollBy(-1)} aria-label="Previous" className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => scrollBy(1)} aria-label="Next" className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
      {(m.error && !m.data) || (late && !m.data) ? (
        <div className="px-4 md:px-0"><SectionError onRetry={m.retry} label={TITLES[cat].toLowerCase()} /></div>
      ) : (
        cat === 'portfolio' && m.data && items.nodes.length ? (
          <div className="px-4 md:px-0"><PortfolioPinGrid entries={items.nodes.map((n: any) => n.entry)} /></div>
        ) : (
        <div ref={scroller} className="flex items-start gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-pl-4 md:scroll-pl-0 px-4 md:px-0">
          {!m.data || (items.pending && !items.nodes.length)
            ? Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className={`snap-start shrink-0 ${CAROUSEL_W[cat]}`}>{cat === 'profiles' ? <ProfileCardSkeleton /> : <CardSkeleton />}</div>))
            : items.nodes.map(n => <div key={n.key} className={`snap-start shrink-0 ${CAROUSEL_W[cat]}`}>{n.node}</div>)}
        </div>
        )
      )}
    </section>
  );
}

// ── One category: filters + vertical, infinitely scrolling list ──────────────
function filterLabel(cat: SectionCategory, key: string, value: string) {
  const def = CATEGORY_FILTERS[cat].find(d => d.key === key);
  const opt = def?.options.find(o => o.value === value);
  return def && def.options.length === 1 ? def.options[0].label : `${def?.label ?? key}: ${opt?.label ?? value}`;
}

function CategoryFilters({ cat, filters, onChange }: { cat: SectionCategory; filters: LocationFilters; onChange: (f: LocationFilters) => void }) {
  const active = Object.entries(filters).filter(([, v]) => v);
  const toggle = (key: string, value: string) => {
    const next = { ...filters };
    if (next[key] === value) delete next[key]; else next[key] = value;
    onChange(next);
  };
  return (
    <div className="px-4 md:px-0 pb-3 space-y-2">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {CATEGORY_FILTERS[cat].flatMap(def => def.options.map(o => {
          const on = filters[def.key] === o.value;
          return (
            <button key={`${def.key}:${o.value}`} onClick={() => toggle(def.key, o.value)} aria-pressed={on}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                on ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
              {o.label}
            </button>
          );
        }))}
      </div>
      {active.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {active.map(([k, v]) => (
            <button key={k} onClick={() => toggle(k, v)} aria-label={`Remove filter ${filterLabel(cat, k, v)}`}
              className="shrink-0 inline-flex items-center gap-1 rounded-full bg-blue-600 pl-3 pr-2 py-1 text-xs font-bold text-white">
              {filterLabel(cat, k, v)} <X className="w-3.5 h-3.5" />
            </button>
          ))}
          <button onClick={() => onChange({})} className="shrink-0 text-xs font-bold text-blue-600 px-1">Reset</button>
        </div>
      )}
    </div>
  );
}

function EmptyMessage({ place, refined }: { place: string; refined: boolean }) {
  return (
    <div className="text-center py-16 px-6">
      <p className="text-sm font-semibold text-gray-700">No results found in {place}.</p>
      {refined && <p className="text-sm text-gray-400 mt-1">Try another search or clear your filters.</p>}
    </div>
  );
}

function CategoryList({ cat, slug, scope, query, filters, onFilters, initialShown, onShown, onReady }: {
  cat: SectionCategory; slug: string; scope: LocationScope; query: string; filters: LocationFilters;
  onFilters: (f: LocationFilters) => void; initialShown: number; onShown: (n: number) => void; onReady: () => void;
}) {
  const { user } = useAuth() as any;
  const m = useCategoryMatches(slug, scope, cat, query, filters);
  const [shown, setShown] = useState(Math.max(PAGE_SIZE[cat], initialShown));
  const items = useCategoryItems(cat, m.data as unknown[] | null, shown, user?.id);
  const sentinel = useRef<HTMLDivElement>(null);
  const late = useLoadDeadline(m.loading && !m.data);
  const total = m.data?.length ?? 0;
  const refined = !!query.trim() || Object.values(filters).some(Boolean);

  // A new query / new filters start again from the first page.
  const refineKey = `${query}|${JSON.stringify(filters)}`;
  const firstRefine = useRef(refineKey);
  useEffect(() => { if (firstRefine.current !== refineKey) { firstRefine.current = refineKey; setShown(PAGE_SIZE[cat]); } }, [refineKey, cat]);
  useEffect(() => { onShown(shown); }, [shown, onShown]);

  // Load the next page when the viewer nears the bottom (matches are unique, so nothing repeats).
  useEffect(() => {
    const el = sentinel.current;
    if (!el || shown >= total || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setShown(s => s + PAGE_SIZE[cat]); }, { rootMargin: '700px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, total, cat, items.nodes.length]);

  const settled = !!m.data && !items.pending;
  useEffect(() => { if (settled) onReady(); }, [settled, onReady]);

  const columns = useMemo(() => {
    if (cat === 'posts') return [items.nodes.filter((_, i) => i % 2 === 0), items.nodes.filter((_, i) => i % 2 === 1)];
    return null;
  }, [cat, items.nodes]);

  return (
    <div>
      <CategoryFilters cat={cat} filters={filters} onChange={onFilters} />
      {m.error && (
        <div className="px-4 md:px-0 pb-3"><SectionError onRetry={m.retry} label={TITLES[cat].toLowerCase()} /></div>
      )}
      {!m.data && (late || m.error) ? null : !m.data ? (
        <div className={`px-4 md:px-0 grid gap-3 ${cat === 'marketplace' ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
          {Array.from({ length: 6 }).map((_, i) => cat === 'profiles' ? <ProfileCardSkeleton key={i} /> : <CardSkeleton key={i} h={cat === 'marketplace' ? 'h-56' : 'h-64'} />)}
        </div>
      ) : total === 0 ? (
        <EmptyMessage place={scope.displayName} refined={refined} />
      ) : (
        <div className="px-4 md:px-0">
          {cat === 'portfolio' ? (
            <PortfolioPinGrid entries={items.nodes.map((n: any) => n.entry)} />
          ) : columns ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              {columns.map((col, i) => <div key={i} className="space-y-3 min-w-0">{col.map(n => <div key={n.key}>{n.node}</div>)}</div>)}
            </div>
          ) : (
            <div className={`grid gap-3 items-start ${cat === 'marketplace' ? 'grid-cols-2 md:grid-cols-3' : cat === 'courses' ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
              {items.nodes.map(n => <div key={n.key} className="min-w-0">{n.node}</div>)}
            </div>
          )}
          {items.pending && (
            <div className="grid grid-cols-1 gap-3 mt-3">{cat === 'profiles' ? <ProfileCardSkeleton /> : <CardSkeleton />}</div>
          )}
          {items.failed && <div className="py-4"><SectionError onRetry={items.retry} label="more results" /></div>}
          <div ref={sentinel} className="h-10" aria-hidden />
        </div>
      )}
      {(late && !m.data) && (
        <div role="alert" className="mx-auto my-10 max-w-sm rounded-2xl border border-gray-100 bg-white p-6 text-center">
          <p className="text-sm font-bold text-gray-900">This is taking longer than expected.</p>
          <button onClick={m.retry} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"><RotateCcw className="h-4 w-4" /> Retry</button>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function LocationPage() {
  const { slug = '' } = useParams();
  return <LocationPageInner key={slug.toLowerCase()} slug={slug} />;
}

function LocationPageInner({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const routeState = (useLocation().state ?? {}) as { displayName?: string };
  const saved = useMemo(() => readSaved(slug), [slug]);

  const [scope, setScope] = useState<LocationScope | null>(null);
  const [scopeError, setScopeError] = useState(false);
  const [category, setCategory] = useState<LocationCategory>(saved?.category ?? 'all');
  const [input, setInput] = useState(saved?.query ?? '');
  const [query, setQuery] = useState(saved?.query ?? '');
  const [filtersByCat, setFiltersByCat] = useState<Record<string, LocationFilters>>(saved?.filters ?? {});
  const [inputFocused, setInputFocused] = useState(false);
  const { headerVisible } = useSearchChromeVisibility({ inputFocused });
  const shownRef = useRef(saved?.shown ?? 0);
  const scrollYRef = useRef(saved?.scrollY ?? 0);
  const restored = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sectionStates, setSectionStates] = useState<Partial<Record<SectionCategory, string>>>({});

  const loadScope = useCallback(() => {
    setScopeError(false);
    getLocationScope(slug).then(s => setScope(s ?? { displayName: routeState.displayName ?? slug, city: slug.split(/[,-]/)[0], province: null, locationIds: [], ids: { post: [], portfolio_item: [], portfolio_album: [], listing: [] } }))
      .catch(() => setScopeError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  useEffect(() => { loadScope(); }, [loadScope]);

  // Short typing delay before the query is applied; clearing restores everything at once.
  useEffect(() => {
    if (!input.trim()) { setQuery(''); return; }
    const t = setTimeout(() => setQuery(input.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  // Persist everything needed to come back to this exact view.
  useEffect(() => {
    const save = () => writeSaved(slug, { category, query, filters: filtersByCat, shown: shownRef.current, scrollY: scrollYRef.current });
    const onScroll = () => { scrollYRef.current = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    save();
    return () => { window.removeEventListener('scroll', onScroll); save(); };
  }, [slug, category, query, filtersByCat]);

  const place = scope?.displayName ?? routeState.displayName ?? '…';
  const shortName = scope?.city ?? routeState.displayName?.split(',')[0] ?? 'this place';

  const selectCategory = (c: LocationCategory) => {
    if (c === category) return;
    restored.current = true; shownRef.current = 0; scrollYRef.current = 0;
    window.scrollTo({ top: 0 });
    setCategory(c);
  };

  // Come back to the same scroll position once the restored view has content.
  const onReady = useCallback(() => {
    if (restored.current) return;
    restored.current = true;
    const y = scrollYRef.current;
    if (y > 0) [0, 150, 500, 1200].forEach(d => setTimeout(() => window.scrollTo({ top: y }), d));
  }, []);
  useEffect(() => { if (category === 'all' && scope && !restored.current) { const t = setTimeout(onReady, 600); return () => clearTimeout(t); } }, [category, scope, onReady]);

  const onSettled = useCallback((cat: SectionCategory, state: string) => setSectionStates(s => (s[cat] === state ? s : { ...s, [cat]: state })), []);
  const states = SECTION_ORDER.map(c => sectionStates[c]);
  const allSettled = states.every(s => s && s !== 'loading');
  const allEmpty = allSettled && states.every(s => s === 'empty');
  const allFailed = allSettled && states.every(s => s === 'error');
  useEffect(() => { setSectionStates({}); }, [query, scope, reloadKey]);

  const setCatFilters = (f: LocationFilters) => setFiltersByCat(prev => ({ ...prev, [category]: f }));

  let body: ReactNode;
  if (scopeError) {
    body = (
      <div role="alert" className="mx-auto my-16 max-w-sm rounded-2xl border border-gray-100 bg-white p-6 text-center">
        <p className="text-sm font-bold text-gray-900">We couldn’t load this place.</p>
        <button onClick={loadScope} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"><RotateCcw className="h-4 w-4" /> Retry</button>
      </div>
    );
  } else if (!scope) {
    body = <div className="px-4 md:px-0 space-y-3">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>;
  } else if (category === 'all') {
    body = (
      <>
        {SECTION_ORDER.map(c => (
          <AllSection key={`${c}|${query}|${reloadKey}`} cat={c} slug={slug} scope={scope} query={query} onViewAll={() => selectCategory(c)} onSettled={onSettled} />
        ))}
        {allEmpty && <EmptyMessage place={scope.displayName} refined={!!query.trim()} />}
        {allFailed && (
          <div className="px-4"><div role="alert" className="mx-auto my-10 max-w-sm rounded-2xl border border-gray-100 bg-white p-6 text-center">
            <p className="text-sm font-bold text-gray-900">We couldn’t load results for {scope.displayName}.</p>
            <button onClick={() => { setSectionStates({}); setReloadKey(k => k + 1); }} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"><RotateCcw className="h-4 w-4" /> Retry</button>
          </div></div>
        )}
      </>
    );
  } else {
    body = (
      <CategoryList key={category} cat={category} slug={slug} scope={scope} query={query}
        filters={filtersByCat[category] ?? {}} onFilters={setCatFilters}
        initialShown={restored.current ? 0 : shownRef.current} onShown={n => { shownRef.current = n; }} onReady={onReady} />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <SlideHeader visible={headerVisible}>
          <div className="flex items-center gap-2 px-4" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: '8px' }}>
            <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 active:scale-90 shrink-0">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <Link to="/" className="flex items-center flex-1 min-w-0"><FilmonsLogo iconSize={24} theme="light" /></Link>
            <Link to="/inbox" aria-label="Inbox" className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-600 shrink-0">
              <MessageCircle className="w-5 h-5" />
            </Link>
          </div>

          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={input} onChange={e => setInput(e.target.value)} placeholder={`Search in ${shortName}`}
                onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} aria-label={`Search in ${shortName}`}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-10 pr-9 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors"
              />
              {input && (
                <button onClick={() => { setInput(''); setQuery(''); }} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="px-4 pb-3 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0"><MapPin className="w-6 h-6 text-blue-500" /></div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-gray-900 truncate leading-tight">{place}</h1>
              <p className="text-sm text-gray-400 truncate">Discover creators and listings nearby</p>
            </div>
          </div>

          <div className="px-4 flex gap-5 overflow-x-auto no-scrollbar" role="tablist" aria-label="Categories">
            {LOCATION_CATEGORIES.map(c => (
              <button key={c.id} role="tab" aria-selected={category === c.id} onClick={() => selectCategory(c.id)}
                className={`shrink-0 pb-2.5 pt-1 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  category === c.id ? 'font-semibold text-gray-900 border-blue-600' : 'font-medium text-gray-400 border-transparent hover:text-gray-600'}`}>
                {c.label}
              </button>
            ))}
          </div>
        </SlideHeader>
      </div>

      <div className="lg:max-w-4xl lg:mx-auto pt-4">{body}</div>
    </div>
  );
}
