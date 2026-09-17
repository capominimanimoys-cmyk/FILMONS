/**
 * Filmons — PortfolioBrowser
 * "Select Portfolio Work" -- attached page reached from Create Post's
 * Portfolio shortcut. Single-select (a post attaches at most one
 * portfolio_item), scoped to the CURRENT USER's own work only -- this is
 * "your portfolio," not a site-wide browser like ListingBrowser is today.
 * Same bottom-sheet shell/motion as ListingBrowser for visual consistency
 * with the sibling "Select Listing" picker.
 */
import { useState, useEffect, useMemo } from 'react';
import { X, Search, Music2, Link as LinkIcon, FileText, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getPortfolioItems, type PortfolioItem } from '../lib/portfolioApi';

interface PortfolioBrowserProps {
  selectedId?: string;
  onSelect:    (item: PortfolioItem) => void;
  onClose:     () => void;
}

function PortfolioCard({ item, selected, onSelect }: {
  item: PortfolioItem; selected: boolean; onSelect: () => void;
}) {
  const thumb = item.thumbnail_url || item.media_url;
  const isAudio = item.media_type === 'audio';
  const isLink  = item.media_type === 'link';
  return (
    <button onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
      style={{ borderTop: '1px solid #f3f4f6' }}>
      <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-100 shrink-0 relative">
        {thumb && !isAudio && !isLink
          ? <img src={thumb} className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center">
              {isAudio ? <Music2 className="w-5 h-5 text-gray-300" /> : isLink ? <LinkIcon className="w-5 h-5 text-gray-300" /> : <FileText className="w-5 h-5 text-gray-300" />}
            </div>}
        {selected && (
          <div className="absolute inset-0 bg-blue-600/80 flex items-center justify-center rounded-2xl">
            <Check className="w-5 h-5 text-white" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-gray-900 truncate">{item.title}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{[item.category, item.subcategory].filter(Boolean).join(' · ')}</p>
      </div>
    </button>
  );
}

export function PortfolioBrowser({ selectedId, onSelect, onClose }: PortfolioBrowserProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    getPortfolioItems(user.id).then(setItems).finally(() => setLoading(false));
  }, [user?.id]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(i => i.title?.toLowerCase().includes(q) || (i.category ?? '').toLowerCase().includes(q) || (i.subcategory ?? '').toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div className="fixed inset-0 z-[92] flex flex-col justify-end">
      <style>{`@keyframes listingSheetIn{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl flex flex-col"
        style={{ height: '80vh', animation: 'listingSheetIn 0.3s cubic-bezier(0.32,0.72,0,1)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-9 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-4 pb-3 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <p className="text-base font-black text-gray-900">Select Portfolio Work</p>
              {loading && <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search portfolio…"
              className="w-full bg-gray-100 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <FileText className="w-10 h-10 text-gray-200" />
              <p className="text-sm font-semibold text-gray-400">
                {items.length === 0 ? 'No portfolio work yet' : 'No matches'}
              </p>
              {items.length === 0 && (
                <p className="text-xs text-gray-300 text-center px-8">Add work to your Portfolio first</p>
              )}
            </div>
          ) : (
            <div>
              {filtered.map(item => (
                <PortfolioCard key={item.id} item={item} selected={selectedId === item.id} onSelect={() => onSelect(item)} />
              ))}
              <div className="h-6" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
