// FILMONS Browse Search -- /search/category/posts (and
// /search/category/connect/posts). All Posts matching the active search
// query, rendered through the exact same universal PostCard Home uses
// (full like/comment/repost/share interactions) -- no search-specific
// post card, per spec. Filters (Date/Content type/Location) apply
// client-side over the already-fetched match set -- searchAndHydratePosts
// is already internally capped, same precedent Marketplace's own
// dedicated page filters (price/location) use.
import { useEffect, useState, useMemo } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { searchAndHydratePosts } from '../lib/filmSearch';
import { PostCard } from '../components/PostCard';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { ConnectCategoryHeader } from '../components/ConnectCategoryHeader';
import type { Post, PostType } from '../types';

// Splits an already-ordered list into 2 columns by alternating index --
// preserves each post's own real height instead of a plain grid forcing
// every row to match its tallest cell.
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

interface PostsFilters { contentType: PostType | 'any'; location: string; date: DatePreset }
const DEFAULT_FILTERS: PostsFilters = { contentType: 'any', location: '', date: 'any' };
const FILTERS_KEY = 'connect:posts:filters';
function loadFilters(): PostsFilters {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY);
    return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS;
  } catch { return DEFAULT_FILTERS; }
}

export function PostsCategoryResults({ query: initialQuery }: { query?: string }) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<Post[] | null>(null);
  const [filters, setFilters] = useState<PostsFilters>(loadFilters);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setResults(null);
    const t = setTimeout(() => { searchAndHydratePosts(query).then(setResults); }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // "Preserve when practical" -- filter STATE persists across a remount
  // (e.g. switching to another Connect category and back); the fetched
  // results themselves don't, a fresh search still runs.
  useEffect(() => { try { sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters)); } catch {} }, [filters]);

  const filtered = useMemo(() => {
    if (!results) return null;
    return results.filter(p =>
      (filters.contentType === 'any' || p.postType === filters.contentType)
      && (!filters.location.trim() || (p.location ?? '').toLowerCase().includes(filters.location.trim().toLowerCase()))
      && withinDatePreset(p.createdAt, filters.date)
    );
  }, [results, filters]);

  const clearFilters = () => setFilters(DEFAULT_FILTERS);
  const activeFilterCount = (filters.contentType !== 'any' ? 1 : 0) + (filters.location.trim() ? 1 : 0) + (filters.date !== 'any' ? 1 : 0);

  const filterPanel = (
    <div className="bg-white md:border md:border-gray-100 md:rounded-2xl md:p-5 space-y-5">
      <div className="hidden md:flex items-center justify-between">
        <p className="text-sm font-black text-gray-900">Filters</p>
        <button onClick={clearFilters} className="text-xs font-bold text-blue-600 hover:text-blue-700">Clear all</button>
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
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Content type</p>
        <div className="flex flex-wrap gap-2">
          {(['any', 'photo', 'video', 'audio', 'text'] as (PostType | 'any')[]).map(t => (
            <button key={t} onClick={() => setFilters(f => ({ ...f, contentType: t }))}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold capitalize transition-colors ${filters.contentType === t ? 'bg-gray-900 text-white' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
              {t === 'any' ? 'Any' : t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Location</p>
        <input value={filters.location} onChange={e => setFilters(f => ({ ...f, location: e.target.value }))} placeholder="City"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/>
      </div>
      <button onClick={clearFilters} className="md:hidden w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-xs">Clear all</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <ConnectCategoryHeader activeCategory="posts" query={query} onQueryChange={setQuery} placeholder="Search posts..."/>

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
            <p className="text-center text-sm text-gray-400 py-16">Search posts to get started.</p>
          ) : filtered === null ? (
            <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Searching" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-16">No posts matching "{query}"</p>
          ) : (
            (() => {
              const [left, right] = splitTwoColumns(filtered);
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                  <div data-pop-list className="space-y-3">{left.map(p => <PostCard key={p.id} post={p} />)}</div>
                  <div data-pop-list className="space-y-3">{right.map(p => <PostCard key={p.id} post={p} />)}</div>
                </div>
              );
            })()
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
