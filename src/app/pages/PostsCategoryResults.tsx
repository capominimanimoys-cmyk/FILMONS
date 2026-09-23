// FILMONS Browse Search -- /search/category/posts. All Posts matching the
// active search query, rendered through the exact same universal PostCard
// Home uses (full like/comment/repost/share interactions) -- no
// search-specific post card, per spec.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search } from 'lucide-react';
import { searchAndHydratePosts } from '../lib/filmSearch';
import { PostCard } from '../components/PostCard';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import type { Post } from '../types';

// Splits an already-ordered list into 2 columns by alternating index --
// preserves each post's own real height instead of a plain grid forcing
// every row to match its tallest cell.
function splitTwoColumns<T>(items: T[]): [T[], T[]] {
  return [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];
}

export function PostsCategoryResults({ query: initialQuery }: { query?: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<Post[] | null>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setResults(null);
    const t = setTimeout(() => { searchAndHydratePosts(query).then(setResults); }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <p className="text-sm font-bold text-gray-900">Posts</p>
      </div>

      <div className="lg:max-w-4xl lg:mx-auto px-4 py-4 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query} onChange={e => setQuery(e.target.value)} placeholder="Search posts…"
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-blue-300"
          />
        </div>

        {!query.trim() ? (
          <p className="text-center text-sm text-gray-400 py-16">Search posts to get started.</p>
        ) : results === null ? (
          <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Searching" /></div>
        ) : results.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">No posts matching "{query}"</p>
        ) : (
          (() => {
            const [left, right] = splitTwoColumns(results);
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                <div className="space-y-3">{left.map(p => <PostCard key={p.id} post={p} />)}</div>
                <div className="space-y-3">{right.map(p => <PostCard key={p.id} post={p} />)}</div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
