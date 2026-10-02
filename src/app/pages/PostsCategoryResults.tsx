// FILMONS Browse Search -- /search/category/posts. All Posts matching the
// active search query, rendered through the exact same universal PostCard
// Home uses (full like/comment/repost/share interactions) -- no
// search-specific post card, per spec.
import { useEffect, useState } from 'react';
import { searchAndHydratePosts } from '../lib/filmSearch';
import { PostCard } from '../components/PostCard';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { ConnectCategoryHeader } from '../components/ConnectCategoryHeader';
import type { Post } from '../types';

// Splits an already-ordered list into 2 columns by alternating index --
// preserves each post's own real height instead of a plain grid forcing
// every row to match its tallest cell.
function splitTwoColumns<T>(items: T[]): [T[], T[]] {
  return [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];
}

export function PostsCategoryResults({ query: initialQuery }: { query?: string }) {
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
      <ConnectCategoryHeader activeCategory="posts" query={query} onQueryChange={setQuery} placeholder="Search posts..."/>

      <div className="lg:max-w-4xl lg:mx-auto px-4 py-4 space-y-4">
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
