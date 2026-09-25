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
import { X, Search, Music2, Link as LinkIcon, FileText, Check, FolderOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getPortfolioItems, getAlbums, type PortfolioItem, type PortfolioAlbum } from '../lib/portfolioApi';

interface PortfolioBrowserProps {
  /** 'work' (default) lists individual portfolio items -- one post
   *  attaches at most one. 'album' lists the user's own Albums instead,
   *  for attaching an ENTIRE album (Portfolio -> Share to Connect / Create
   *  Post's own "+ Album" shortcut), a live reference (postsApi.create's
   *  extraMeta.ownAlbum) rather than a copy of its items. */
  mode?:       'work' | 'album';
  selectedId?: string;
  onSelect:    (item: PortfolioItem) => void;
  onSelectAlbum?: (album: PortfolioAlbum) => void;
  onClose:     () => void;
}

function AlbumCard({ album, selected, onSelect }: {
  album: PortfolioAlbum; selected: boolean; onSelect: () => void;
}) {
  return (
    <button onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
      style={{ borderTop: '1px solid #f3f4f6' }}>
      <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-100 shrink-0 relative">
        {album.cover_url
          ? <img src={album.cover_url} className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center"><FolderOpen className="w-5 h-5 text-gray-300" /></div>}
        {selected && (
          <div className="absolute inset-0 bg-blue-600/80 flex items-center justify-center rounded-2xl">
            <Check className="w-5 h-5 text-white" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-gray-900 truncate">{album.title}</p>
        {album.category && <p className="text-[11px] text-gray-400 mt-0.5">{album.category}</p>}
      </div>
    </button>
  );
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

export function PortfolioBrowser({ mode = 'work', selectedId, onSelect, onSelectAlbum, onClose }: PortfolioBrowserProps) {
  const { user } = useAuth();
  const [activeMode, setActiveMode] = useState<'work' | 'album'>(mode);
  const isAlbumMode = activeMode === 'album';
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [albums, setAlbums] = useState<PortfolioAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    if (isAlbumMode) getAlbums(user.id).then(setAlbums).finally(() => setLoading(false));
    else getPortfolioItems(user.id).then(setItems).finally(() => setLoading(false));
  }, [user?.id, isAlbumMode]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(i => i.title?.toLowerCase().includes(q) || (i.category ?? '').toLowerCase().includes(q) || (i.subcategory ?? '').toLowerCase().includes(q));
  }, [items, query]);

  const filteredAlbums = useMemo(() => {
    if (!query.trim()) return albums;
    const q = query.toLowerCase();
    return albums.filter(a => a.title?.toLowerCase().includes(q) || (a.category ?? '').toLowerCase().includes(q));
  }, [albums, query]);

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
              <p className="text-base font-black text-gray-900">{isAlbumMode ? 'Select Album' : 'Select Portfolio Work'}</p>
              {loading && <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </div>
          {onSelectAlbum && (
            <div className="flex gap-1.5 mb-3">
              {(['work', 'album'] as const).map(m => (
                <button key={m} onClick={() => setActiveMode(m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${activeMode === m ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {m === 'work' ? 'Work' : 'Album'}
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={isAlbumMode ? 'Search albums…' : 'Search portfolio…'}
              className="w-full bg-gray-100 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isAlbumMode ? (
            filteredAlbums.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <FolderOpen className="w-10 h-10 text-gray-200" />
                <p className="text-sm font-semibold text-gray-400">
                  {albums.length === 0 ? 'No albums yet' : 'No matches'}
                </p>
                {albums.length === 0 && (
                  <p className="text-xs text-gray-300 text-center px-8">Create an album in your Portfolio first</p>
                )}
              </div>
            ) : (
              <div>
                {filteredAlbums.map(album => (
                  <AlbumCard key={album.id} album={album} selected={selectedId === album.id} onSelect={() => onSelectAlbum?.(album)} />
                ))}
                <div className="h-6" />
              </div>
            )
          ) : filtered.length === 0 && !loading ? (
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
