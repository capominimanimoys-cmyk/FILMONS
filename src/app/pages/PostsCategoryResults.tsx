// FILMONS Browse Search -- /search/category/posts. All Posts matching the
// active search query. Mirrors HashtagCategoryResults.tsx's structure;
// taps open the real /post/:id (reuses the universal Post Card there --
// no search-specific post card, per spec).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search, BadgeCheck } from 'lucide-react';
import { searchMatchingPosts, type SearchPostRow } from '../lib/filmSearch';
import { supabase } from '../../lib/supabase';
import { UserAvatar } from '../components/AccountTypeBadge';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';

interface AuthoredPost extends SearchPostRow {
  authorName: string; authorAvatar: string | null; authorVerified: boolean;
}

async function attachAuthors(rows: SearchPostRow[]): Promise<AuthoredPost[]> {
  if (!rows.length) return [];
  const authorIds = [...new Set(rows.map(r => r.author_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url, is_verified').in('id', authorIds);
  const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return rows.map(r => {
    const p = map.get(r.author_id);
    return { ...r, authorName: p?.name ?? 'Filmons user', authorAvatar: p?.avatar_url ?? null, authorVerified: !!p?.is_verified };
  });
}

export function PostsCategoryResults({ query: initialQuery }: { query?: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<AuthoredPost[] | null>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setResults(null);
    const t = setTimeout(() => { searchMatchingPosts(query).then(attachAuthors).then(setResults); }, 250);
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

      <div className="lg:max-w-2xl lg:mx-auto px-4 py-4 space-y-4">
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
          <div className="space-y-2">
            {results.map(p => (
              <button key={p.id} onClick={() => navigate(`/post/${p.id}`)} className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3 text-left">
                {p.media_urls?.[0] && <img src={p.media_urls[0]} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <UserAvatar user={{ id: p.author_id, name: p.authorName, avatar: p.authorAvatar ?? undefined }} size={20} />
                    <p className="text-xs font-bold text-gray-900 truncate">{p.authorName}</p>
                    {p.authorVerified && <BadgeCheck className="w-3 h-3 text-blue-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-600 truncate mt-0.5">{p.content}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
