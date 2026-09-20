// FILMONS Browse Search -- /search/category/portfolio. All Portfolio
// Works/Albums matching the active search query. Mirrors
// HashtagCategoryResults.tsx's structure; opens results through the
// existing draggable Portfolio preview (usePortfolioPreview) rather than a
// search-specific viewer, per spec ("do not create a Search-specific
// Portfolio viewer").
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search } from 'lucide-react';
import { searchMatchingPortfolio, type SearchPortfolioRow } from '../lib/filmSearch';
import { usePortfolioPreview } from '../context/PortfolioPreviewContext';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';

export function PortfolioCategoryResults({ query: initialQuery }: { query?: string }) {
  const navigate = useNavigate();
  const { openPortfolioPreview } = usePortfolioPreview();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<SearchPortfolioRow[] | null>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setResults(null);
    const t = setTimeout(() => { searchMatchingPortfolio(query).then(setResults); }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <p className="text-sm font-bold text-gray-900">Portfolio</p>
      </div>

      <div className="lg:max-w-3xl lg:mx-auto px-4 py-4 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query} onChange={e => setQuery(e.target.value)} placeholder="Search portfolio work…"
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-blue-300"
          />
        </div>

        {!query.trim() ? (
          <p className="text-center text-sm text-gray-400 py-16">Search Portfolio work to get started.</p>
        ) : results === null ? (
          <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Searching" /></div>
        ) : results.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">No portfolio work matching "{query}"</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {results.map(r => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => openPortfolioPreview(r.user_id, r.type === 'album' ? r.id : undefined)}
                className="relative rounded-xl overflow-hidden bg-gray-100"
                style={{ aspectRatio: 4 / 5 }}
              >
                {(r.thumbnail_url || r.media_url || r.cover_url) ? (
                  <img src={r.thumbnail_url || r.media_url || r.cover_url || ''} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>
                )}
                <span className="absolute bottom-1.5 left-1.5 right-1.5 text-[11px] font-bold text-white drop-shadow truncate text-left">{r.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
