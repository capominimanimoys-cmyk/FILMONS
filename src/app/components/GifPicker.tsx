import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

const API_KEY = 'dc6zaTOxFJmzC'; // Giphy public beta key
const LIMIT = 24;

interface GiphyItem {
  id: string;
  title: string;
  images: {
    fixed_height: { url: string; width: string; height: string };
    fixed_height_small: { url: string };
    original: { url: string };
  };
}

interface GifPickerProps {
  onSelect: (url: string, previewUrl: string) => void;
  onClose: () => void;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GiphyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 400);

  const fetchGifs = useCallback(async (q: string) => {
    setLoading(true);
    setError('');
    try {
      const url = q.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${API_KEY}&q=${encodeURIComponent(q)}&limit=${LIMIT}&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${API_KEY}&limit=${LIMIT}&rating=g`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch GIFs');
      const json = await res.json();
      setGifs(json.data || []);
    } catch (e) {
      setError('Could not load GIFs. Check your connection.');
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGifs(debouncedQuery); }, [debouncedQuery, fetchGifs]);

  // Focus search on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    /* Full-screen overlay */
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col max-h-[85vh] z-10">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search GIFs…"
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Label */}
        <p className="px-4 pt-2 pb-1 text-xs text-gray-400 font-medium">
          {query.trim() ? `Results for "${query}"` : '🔥 Trending GIFs'}
        </p>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <p className="text-sm text-red-500 mb-2">{error}</p>
              <button onClick={() => fetchGifs(debouncedQuery)} className="text-sm text-blue-600 hover:underline">Try again</button>
            </div>
          ) : gifs.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">No GIFs found. Try a different search.</div>
          ) : (
            <div className="columns-3 gap-1.5 space-y-1.5">
              {gifs.map(gif => (
                <button
                  key={gif.id}
                  onClick={() => onSelect(gif.images.original.url, gif.images.fixed_height.url)}
                  className="w-full block overflow-hidden rounded-lg hover:opacity-90 hover:scale-[1.02] transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-100"
                  title={gif.title}
                >
                  <img
                    src={gif.images.fixed_height_small.url}
                    alt={gif.title}
                    className="w-full h-auto"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer attribution — required by Giphy TOS */}
        <div className="border-t border-gray-100 px-4 py-2 flex items-center justify-center gap-2">
          <img src="https://developers.giphy.com/branch/master/static/header-logo-8974b8ae658f704a5b48a2d039b8ad93.gif" alt="Powered by GIPHY" className="h-4" />
        </div>
      </div>
    </div>
  );
}
