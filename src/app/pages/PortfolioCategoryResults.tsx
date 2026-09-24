// FILMONS Browse Search -- /search/category/portfolio. All Portfolio
// Works/Albums matching the active search query, rendered through the
// EXACT same PortfolioProjectCard/PortfolioAlbumCard Home's Connect feed
// uses (View portfolio, Like/Comment/Repost/Share, all included) in a
// 2-column masonry -- not a compact thumbnail grid -- per the FILMONS
// Connect View All spec: "Portfolio results ... must use the existing
// Portfolio post postcard." Still opens the creator's real Portfolio
// through the existing draggable-page behavior (usePortfolioPreview),
// unchanged -- these cards already do that internally.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search } from 'lucide-react';
import { searchMatchingPortfolio, type SearchPortfolioRow } from '../lib/filmSearch';
import { getPortfolioEntriesByIds, type PortfolioFeedEntry } from '../lib/portfolioApi';
import { PortfolioProjectCard } from '../components/connect/PortfolioProjectCard';
import { PortfolioAlbumCard } from '../components/connect/PortfolioAlbumCard';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { useAuth } from '../context/AuthContext';

// Splits an already-ordered list into 2 columns by alternating index --
// preserves each card's own real height (an album card and an item card
// are rarely the same height) instead of a plain grid forcing every row
// to match its tallest cell.
function splitTwoColumns<T>(items: T[]): [T[], T[]] {
  return [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];
}

export function PortfolioCategoryResults({ query: initialQuery }: { query?: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [matches, setMatches] = useState<SearchPortfolioRow[] | null>(null);
  const [entries, setEntries] = useState<PortfolioFeedEntry[] | null>(null);

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

  const [left, right] = splitTwoColumns(entries ?? []);

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
        ) : entries === null ? (
          <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Searching" /></div>
        ) : entries.length === 0 ? (
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
  );
}
