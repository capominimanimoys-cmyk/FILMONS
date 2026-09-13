// Extracted out of Portfolio.tsx so PortfolioItemActionSheet (the unified
// Home-feed + Portfolio-page three-dot menu) can trigger the exact same
// "Add to Album" flow in both places -- was previously only reachable from
// Portfolio.tsx's own grid. Upgraded to the shared BottomSheet component
// (was a bespoke fixed/backdrop pair with its own one-off `casUp` keyframe)
// for the same slide-up/backdrop/drag-to-dismiss motion every other sheet
// in this app already uses.
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, FolderOpen } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { addItemToAlbum, type PortfolioItem, type PortfolioAlbum } from '../lib/portfolioApi';

export function AddToAlbumSheet({
  item, albums, onClose,
}: {
  item:    PortfolioItem;
  albums:  PortfolioAlbum[];
  onClose: () => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);

  const handleAdd = async (albumId: string) => {
    setAdding(albumId);
    const ok = await addItemToAlbum(albumId, item.id);
    setAdding(null);
    if (ok) { toast.success('Added to album'); onClose(); }
    else     { toast.error('Could not add to album'); }
  };

  return (
    <BottomSheet onClose={onClose} title="Add to Album">
      {albums.length === 0 ? (
        <div className="flex items-center justify-center px-4 py-12">
          <p className="text-sm text-gray-400 text-center">No albums yet. Create an album first.</p>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-2" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          {albums.map(album => (
            <button
              key={album.id}
              onClick={() => handleAdd(album.id)}
              disabled={!!adding}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-gray-100 active:scale-[0.98] transition-all text-left disabled:opacity-60"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                {album.cover_url
                  ? <img src={album.cover_url} alt={album.title} className="w-full h-full object-cover" />
                  : <FolderOpen className="w-5 h-5 text-gray-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{album.title}</p>
                <p className="text-xs text-gray-400 capitalize">{album.visibility}</p>
              </div>
              {adding === album.id && <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
