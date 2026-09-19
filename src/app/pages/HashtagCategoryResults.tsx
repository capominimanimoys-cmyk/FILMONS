// FILMONS Browse Search -- /search/category/hashtags. All hashtags
// matching the active search query (the "View all" destination from the
// Hashtags section on /search/category/all and from search suggestions).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search, Hash } from 'lucide-react';
import { searchHashtagSuggestions, type HashtagSuggestion } from '../lib/hashtagsApi';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

export function HashtagCategoryResults({ query: initialQuery }: { query?: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<HashtagSuggestion[] | null>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setResults(null);
    const t = setTimeout(() => { searchHashtagSuggestions(query, 50).then(setResults); }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <p className="text-sm font-bold text-gray-900">Hashtags</p>
      </div>

      <div className="lg:max-w-2xl lg:mx-auto px-4 py-4 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query} onChange={e => setQuery(e.target.value)} placeholder="Search hashtags…"
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-blue-300"
          />
        </div>

        {!query.trim() ? (
          <p className="text-center text-sm text-gray-400 py-16">Search for a hashtag to get started.</p>
        ) : results === null ? (
          <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Searching" /></div>
        ) : results.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">No hashtags matching "{query}"</p>
        ) : (
          <div className="space-y-1">
            {results.map(h => (
              <button key={h.tag} onClick={() => navigate(`/hashtag/${h.tag}`)} className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3.5 text-left hover:bg-gray-50">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><Hash className="w-4 h-4 text-blue-500" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">#{h.tag}</p>
                  <p className="text-xs text-gray-400">{formatCount(h.usageCount)} post{h.usageCount === 1 ? '' : 's'}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
