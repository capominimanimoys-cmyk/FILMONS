// FILMONS Browse Search -- /search/category/portfolio (and
// /search/category/connect/portfolio). All Portfolio Works/Albums matching
// the active search query, rendered through the EXACT same
// PortfolioProjectCard/PortfolioAlbumCard Home's Connect feed uses (View
// portfolio, Like/Comment/Repost/Share, all included) in a 2-column
// masonry -- not a compact thumbnail grid -- per the FILMONS Connect View
// All spec: "Portfolio results ... must use the existing Portfolio post
// postcard." Still opens the creator's real Portfolio through the existing
// draggable-page behavior (usePortfolioPreview), unchanged -- these cards
// already do that internally. Filters (Creative category/Media type/
// Location/Date) apply client-side over the already-fetched match set --
// same precedent PostsCategoryResults/Marketplace's dedicated page use.
import { useEffect, useState, useMemo } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { searchMatchingPortfolio, type SearchPortfolioRow } from '../lib/filmSearch';
import { getPortfolioEntriesByIds, PORTFOLIO_CATEGORIES, type PortfolioFeedEntry } from '../lib/portfolioApi';
import { PortfolioProjectCard } from '../components/connect/PortfolioProjectCard';
import { PortfolioAlbumCard } from '../components/connect/PortfolioAlbumCard';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { ConnectCategoryHeader } from '../components/ConnectCategoryHeader';
import { useAuth } from '../context/AuthContext';

// Splits an already-ordered list into 2 columns by alternating index --
// preserves each card's own real height (an album card and an item card
// are rarely the same height) instead of a plain grid forcing every row
// to match its tallest cell.
function splitTwoColumns<T>(items: T[]): [T[], T[]] {
  return [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];
}

type DatePreset = 'any' | 'today' | 'week' | 'month';
const DATE_PRESET_LABEL: Record<DatePreset, string> = { any: 'Any time', today: 'Today', week: 'This week', month: 'This month' };
function withinDatePreset(iso: string | undefined, preset: DatePreset): boolean {
  if (preset === 'any' || !iso) return true;
  const age = Date.now() - new Date(iso).getTime();
  const day = 86400000;
  if (preset === 'today') return age < day;
  if (preset === 'week') return age < day * 7;
  return age < day * 30;
}

type MediaFilter = 'any' | 'image' | 'video';
interface PortfolioFilters { category: string; media: MediaFilter; location: string; date: DatePreset }
const DEFAULT_FILTERS: PortfolioFilters = { category: '', media: 'any', location: '', date: 'any' };
const FILTERS_KEY = 'connect:portfolio:filters';
function loadFilters(): PortfolioFilters {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY);
    return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS;
  } catch { return DEFAULT_FILTERS; }
}

function entryCategory(e: PortfolioFeedEntry): string | undefined {
  return e.type === 'item' ? e.item.category : e.album.category;
}
function entryLocation(e: PortfolioFeedEntry): string | undefined {
  return e.type === 'item' ? e.item.location : e.album.location;
}
// Albums are collections -- "does it contain a video" rather than "is it
// itself a video," checked against its own preview items rather than
// treating a media-type filter as item-only (which would just hide every
// album the moment a type is picked).
function entryMatchesMedia(e: PortfolioFeedEntry, media: MediaFilter): boolean {
  if (media === 'any') return true;
  return e.type === 'item' ? e.item.media_type === media : e.previewItems.some(p => p.media_type === media);
}

export function PortfolioCategoryResults({ query: initialQuery }: { query?: string }) {
  const { user } = useAuth();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [matches, setMatches] = useState<SearchPortfolioRow[] | null>(null);
  const [entries, setEntries] = useState<PortfolioFeedEntry[] | null>(null);
  const [filters, setFilters] = useState<PortfolioFilters>(loadFilters);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setMatches([]); setEntries([]); return; }
    setMatches(null); setEntries(null);
    const t = setTimeout(() => { searchMatchingPortfolio(query).then(setMatches); }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!matches) { return; }
    if (!matches.length) { setEntries([]); return; }
    const itemIds = matches.filter(r => r.type === 'item').map(r => r.id);
    const albumIds = matches.filter(r => r.type === 'album').map(r => r.id);
    let cancelled = false;
    getPortfolioEntriesByIds(itemIds, albumIds, user?.id).then(byId => {
      if (cancelled) return;
      setEntries(matches.map(r => byId.get(r.id)).filter((e): e is PortfolioFeedEntry => !!e));
    });
    return () => { cancelled = true; };
  }, [matches, user?.id]);

  useEffect(() => { try { sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters)); } catch {} }, [filters]);

  const filtered = useMemo(() => {
    if (!entries) return null;
    return entries.filter(e =>
      (!filters.category || entryCategory(e) === filters.category)
      && entryMatchesMedia(e, filters.media)
      && (!filters.location.trim() || (entryLocation(e) ?? '').toLowerCase().includes(filters.location.trim().toLowerCase()))
      && withinDatePreset(e.created_at, filters.date)
    );
  }, [entries, filters]);

  const clearFilters = () => setFilters(DEFAULT_FILTERS);
  const activeFilterCount = (filters.category ? 1 : 0) + (filters.media !== 'any' ? 1 : 0) + (filters.location.trim() ? 1 : 0) + (filters.date !== 'any' ? 1 : 0);

  const filterPanel = (
    <div className="bg-white md:border md:border-gray-100 md:rounded-2xl md:p-5 space-y-5">
      <div className="hidden md:flex items-center justify-between">
        <p className="text-sm font-black text-gray-900">Filters</p>
        <button onClick={clearFilters} className="text-xs font-bold text-blue-600 hover:text-blue-700">Clear all</button>
      </div>
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Creative category</p>
        <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400">
          <option value="">Any category</option>
          {PORTFOLIO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Media type</p>
        <div className="flex flex-wrap gap-2">
          {([{ id: 'any', label: 'Any' }, { id: 'image', label: 'Photo' }, { id: 'video', label: 'Video' }] as { id: MediaFilter; label: string }[]).map(m => (
            <button key={m.id} onClick={() => setFilters(f => ({ ...f, media: m.id }))}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${filters.media === m.id ? 'bg-gray-900 text-white' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Location</p>
        <input value={filters.location} onChange={e => setFilters(f => ({ ...f, location: e.target.value }))} placeholder="City"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/>
      </div>
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Date</p>
        <div className="flex flex-wrap gap-2">
          {(['any', 'today', 'week', 'month'] as DatePreset[]).map(d => (
            <button key={d} onClick={() => setFilters(f => ({ ...f, date: d }))}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${filters.date === d ? 'bg-gray-900 text-white' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
              {DATE_PRESET_LABEL[d]}
            </button>
          ))}
        </div>
      </div>
      <button onClick={clearFilters} className="md:hidden w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-xs">Clear all</button>
    </div>
  );

  const [left, right] = splitTwoColumns(filtered ?? []);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <ConnectCategoryHeader activeCategory="portfolio" query={query} onQueryChange={setQuery} placeholder="Search portfolio work..."/>

      <div className="px-4 py-2.5 md:hidden">
        <button onClick={() => setShowMobileFilters(true)}
          className="w-full flex items-center justify-center gap-1.5 h-10 rounded-2xl border border-gray-200 bg-white text-xs font-bold text-gray-700 active:scale-[0.99] transition-transform">
          <SlidersHorizontal className="w-4 h-4"/> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      <div className="max-w-5xl mx-auto w-full md:flex md:gap-8 md:px-4 md:py-6">
        <aside className="hidden md:block shrink-0" style={{ width: 300 }}>
          <div className="sticky top-6">{filterPanel}</div>
        </aside>

        <div className="flex-1 min-w-0 px-4 md:px-0 py-4 md:py-0 space-y-4">
          {!query.trim() ? (
            <p className="text-center text-sm text-gray-400 py-16">Search Portfolio work to get started.</p>
          ) : filtered === null ? (
            <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Searching" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-16">No portfolio work matching "{query}"</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              <div className="space-y-3">
                {left.map(e => e.type === 'item'
                  ? <PortfolioProjectCard key={`item-${e.id}`} entry={e as Extract<PortfolioFeedEntry, { type: 'item' }>}/>
                  : <PortfolioAlbumCard key={`album-${e.id}`} entry={e as Extract<PortfolioFeedEntry, { type: 'album' }>}/>)}
              </div>
              <div className="space-y-3">
                {right.map(e => e.type === 'item'
                  ? <PortfolioProjectCard key={`item-${e.id}`} entry={e as Extract<PortfolioFeedEntry, { type: 'item' }>}/>
                  : <PortfolioAlbumCard key={`album-${e.id}`} entry={e as Extract<PortfolioFeedEntry, { type: 'album' }>}/>)}
              </div>
            </div>
          )}
        </div>
      </div>

      {showMobileFilters && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setShowMobileFilters(false)}>
          <div className="absolute inset-0 bg-black/40"/>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-black text-gray-900">Filters</p>
              <button onClick={() => setShowMobileFilters(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-500"/>
              </button>
            </div>
            {filterPanel}
            <button onClick={() => setShowMobileFilters(false)} className="w-full mt-4 py-3 rounded-2xl bg-gray-900 text-white font-bold text-sm">Apply filters</button>
          </div>
        </div>
      )}
    </div>
  );
}
