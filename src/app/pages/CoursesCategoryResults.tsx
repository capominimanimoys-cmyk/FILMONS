// FILMONS Browse Search -- /search/category/courses (and
// /search/category/connect/courses). All Courses matching the active
// search query. Reuses the existing CourseCard (no search-specific course
// card). Filters (Category/Level/Price) apply client-side over the
// already-fetched match set -- same precedent Posts/Portfolio's dedicated
// pages use; Category's options are the real distinct values present in
// the current result set rather than an invented taxonomy (courses have
// no fixed category list anywhere in this codebase).
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search, SlidersHorizontal, X } from 'lucide-react';
import { getCourses, type Course, type CourseLevel } from '../lib/coursesApi';
import { CourseCard } from '../components/courses/CourseCard';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { ConnectCategoryHeader } from '../components/ConnectCategoryHeader';

const LEVEL_LABEL: Record<CourseLevel, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', all_levels: 'All levels' };

interface CourseFilters { category: string; level: CourseLevel | 'any'; priceMin: string; priceMax: string }
const DEFAULT_FILTERS: CourseFilters = { category: '', level: 'any', priceMin: '', priceMax: '' };
const FILTERS_KEY = 'connect:courses:filters';
function loadFilters(): CourseFilters {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY);
    return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS;
  } catch { return DEFAULT_FILTERS; }
}

// Reached two ways: /search/category/courses (a Learning-scoped page,
// own standalone header -- unchanged) and /search/category/connect/courses
// (Courses as Connect's 5th category, per spec -- gets the shared Connect
// header+pill bar instead). `inConnect` is all that distinguishes them;
// everything else (fetch, filters, results, cards) is identical either way.
export function CoursesCategoryResults({ query: initialQuery, inConnect = false }: { query?: string; inConnect?: boolean }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<Course[] | null>(null);
  const [filters, setFilters] = useState<CourseFilters>(loadFilters);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setResults(null);
    const t = setTimeout(() => { getCourses({ query, limit: 50 }).then(setResults); }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => { try { sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters)); } catch {} }, [filters]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of results ?? []) if (c.category) set.add(c.category);
    return [...set].sort();
  }, [results]);

  const filtered = useMemo(() => {
    if (!results) return null;
    const min = filters.priceMin ? Number(filters.priceMin) : null;
    const max = filters.priceMax ? Number(filters.priceMax) : null;
    return results.filter(c =>
      (!filters.category || c.category === filters.category)
      && (filters.level === 'any' || c.level === filters.level)
      && (min == null || c.price >= min)
      && (max == null || c.price <= max)
    );
  }, [results, filters]);

  const clearFilters = () => setFilters(DEFAULT_FILTERS);
  const activeFilterCount = (filters.category ? 1 : 0) + (filters.level !== 'any' ? 1 : 0) + (filters.priceMin || filters.priceMax ? 1 : 0);

  const filterPanel = (
    <div className="bg-white md:border md:border-gray-100 md:rounded-2xl md:p-5 space-y-5">
      <div className="hidden md:flex items-center justify-between">
        <p className="text-sm font-black text-gray-900">Filters</p>
        <button onClick={clearFilters} className="text-xs font-bold text-blue-600 hover:text-blue-700">Clear all</button>
      </div>
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Category</p>
        <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400">
          <option value="">Any category</option>
          {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Level</p>
        <div className="flex flex-wrap gap-2">
          {(['any', 'beginner', 'intermediate', 'advanced'] as (CourseLevel | 'any')[]).map(l => (
            <button key={l} onClick={() => setFilters(f => ({ ...f, level: l }))}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${filters.level === l ? 'bg-gray-900 text-white' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
              {l === 'any' ? 'Any' : LEVEL_LABEL[l]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Price</p>
        <div className="flex items-center gap-2">
          <input type="number" inputMode="numeric" placeholder="Min" value={filters.priceMin}
            onChange={e => setFilters(f => ({ ...f, priceMin: e.target.value }))}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/>
          <span className="text-gray-300">–</span>
          <input type="number" inputMode="numeric" placeholder="Max" value={filters.priceMax}
            onChange={e => setFilters(f => ({ ...f, priceMax: e.target.value }))}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/>
        </div>
      </div>
      <button onClick={clearFilters} className="md:hidden w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-xs">Clear all</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {inConnect ? (
        <ConnectCategoryHeader activeCategory="courses" query={query} onQueryChange={setQuery} placeholder="Search courses..."/>
      ) : (
        <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <ArrowLeft className="w-4 h-4 text-gray-700" />
          </button>
          <p className="text-sm font-bold text-gray-900">Courses</p>
        </div>
      )}

      <div className="max-w-5xl mx-auto w-full md:flex md:gap-8 md:px-4 md:py-6">
        <aside className="hidden md:block shrink-0" style={{ width: 300 }}>
          <div className="sticky top-6 space-y-4">
            {!inConnect && (
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query} onChange={e => setQuery(e.target.value)} placeholder="Search courses…"
                  className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-blue-300"
                />
              </div>
            )}
            {filterPanel}
          </div>
        </aside>

        <div className="flex-1 min-w-0 px-4 md:px-0 py-4 md:py-0 space-y-4">
          {!inConnect && (
            <div className="relative md:hidden">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query} onChange={e => setQuery(e.target.value)} placeholder="Search courses…"
                className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-blue-300"
              />
            </div>
          )}
          <div className="md:hidden">
            <button onClick={() => setShowMobileFilters(true)}
              className="w-full flex items-center justify-center gap-1.5 h-10 rounded-2xl border border-gray-200 bg-white text-xs font-bold text-gray-700 active:scale-[0.99] transition-transform">
              <SlidersHorizontal className="w-4 h-4"/> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          </div>

          {!query.trim() ? (
            <p className="text-center text-sm text-gray-400 py-16">Search courses to get started.</p>
          ) : filtered === null ? (
            <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Searching" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-16">No courses matching "{query}"</p>
          ) : (
            <div data-pop-list className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(c => <CourseCard key={c.id} course={c} />)}
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
