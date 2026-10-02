// Shared header for every /search/category/connect view -- the "All"
// landing (CategoryResults.tsx's AllGroupedResults) and the 4 dedicated
// category pages (PostsCategoryResults, PortfolioCategoryResults,
// SingleCategoryResults for Profiles/creators, CoursesCategoryResults).
// Before this, each of those 5 views had its own separate ad-hoc header
// with no way to switch between categories except browser-back or
// re-navigating to the root -- this makes switching feel like one
// persistent page instead of 5 unrelated ones.
//
// Deliberately a shared PRESENTATIONAL component, not a shared state
// container -- each view keeps owning its own local search/filter state
// as it already did. Switching categories carries the CURRENT search text
// along via the destination URL's own `q` param (every Connect view
// already reads its initial query from `q` the same way the rest of this
// app's category pages do), so typing "cinematography" then tapping
// Portfolio lands there with the same text still in the box.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, ArrowLeft, X } from 'lucide-react';
import { useSearchChromeVisibility } from '../lib/useSearchChromeVisibility';
import { SlideHeader } from './SlideHeader';

export type ConnectCategoryId = 'all' | 'posts' | 'portfolio' | 'profiles' | 'courses';

const CONNECT_CATEGORIES: { id: ConnectCategoryId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'posts', label: 'Posts' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'courses', label: 'Courses' },
];

export function ConnectCategoryHeader({ activeCategory, query, onQueryChange, placeholder = 'Search Connect...' }: {
  activeCategory: ConnectCategoryId;
  query: string;
  onQueryChange: (q: string) => void;
  placeholder?: string;
}) {
  const navigate = useNavigate();
  const [inputFocused, setInputFocused] = useState(false);
  const { headerVisible } = useSearchChromeVisibility({ inputFocused });

  const goTo = (id: ConnectCategoryId) => {
    if (id === activeCategory) return;
    const path = id === 'all' ? '/search/category/connect' : `/search/category/connect/${id}`;
    navigate(query.trim() ? `${path}?q=${encodeURIComponent(query)}` : path, { state: { query } });
  };

  return (
    // z-40, not z-20 -- PostCard's own-post "..." menu button sits at z-30
    // (absolutely positioned inside the card), so a lower header z-index
    // let it visually poke in front of this sticky header whenever a post
    // scrolled partway underneath it. z-40 matches TopBar.tsx's own
    // precedent for "the header sits above everything in the content
    // below it," not an arbitrary bump.
    <div className="sticky top-0 z-40 bg-white border-b border-gray-100">
      <SlideHeader visible={headerVisible}>
        <div className="flex items-center gap-3 px-4" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '10px' }}>
          <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors shrink-0 active:scale-90">
            <ArrowLeft className="w-5 h-5 text-gray-700"/>
          </button>
          <div className="min-w-0">
            <p className="text-base md:text-lg font-black text-gray-900">Connect</p>
            {activeCategory === 'all' && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">Discover creators, work, profiles and courses.</p>
            )}
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"/>
            <input
              value={query} onChange={e => onQueryChange(e.target.value)} placeholder={placeholder}
              onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)}
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-10 pr-9 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors"
            />
            {query && (
              <button onClick={() => onQueryChange('')} aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4"/>
              </button>
            )}
          </div>
        </div>

        {/* Horizontally scrollable so it never wraps to a 2nd line, per
            spec -- active pill is semibold/dark with a blue underline. */}
        <div className="px-4 flex gap-5 overflow-x-auto no-scrollbar">
          {CONNECT_CATEGORIES.map(c => (
            <button key={c.id} onClick={() => goTo(c.id)}
              className={`shrink-0 pb-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeCategory === c.id ? 'font-semibold text-gray-900 border-blue-600' : 'font-medium text-gray-400 border-transparent hover:text-gray-600'
              }`}>
              {c.label}
            </button>
          ))}
        </div>
      </SlideHeader>
    </div>
  );
}
