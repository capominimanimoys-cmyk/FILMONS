// Shared "From Portfolio" picker -- lets a creator attach content they've
// ALREADY uploaded to their Portfolio (projects, albums, or standalone
// media) into an album, by reference only: this never uploads or
// duplicates a file, it just calls addItemToAlbum for the picked ids
// (looping is the established pattern here -- CreateAlbumSheet already
// did this, no batch RPC exists or is needed). Reused by AlbumEditorPage
// (create + edit) and the live Album Detail page's own "+ Add Project/
// Media" trigger, per spec -- one implementation, not one per surface.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Search, Check, FolderOpen, Layers, Loader2 } from 'lucide-react';
import { getPortfolioItems, getAlbums, getAlbumItems, type PortfolioItem, type PortfolioAlbum } from '../lib/portfolioApi';

type Tab = 'projects' | 'albums' | 'media';

const PROJECT_WORK_TYPES = new Set(['project', 'case_study']);

export function PortfolioContentPicker({ userId, excludeItemIds = [], onClose, onAdd }: {
  userId: string;
  /** Item ids to hide from every tab -- already in the album being edited. */
  excludeItemIds?: string[];
  onClose: () => void;
  onAdd: (items: PortfolioItem[]) => void;
}) {
  const [tab, setTab] = useState<Tab>('projects');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [albums, setAlbums] = useState<PortfolioAlbum[]>([]);
  // Lazily fetched once an album tile is tapped -- lets the Albums tab
  // toggle "select this whole album's items" without a full album->items
  // fetch up front for every album.
  const [albumItemIds, setAlbumItemIds] = useState<Map<string, string[]>>(new Map());
  const [albumsLoading, setAlbumsLoading] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getPortfolioItems(userId), getAlbums(userId)]).then(([its, albs]) => {
      if (cancelled) return;
      setItems(its);
      setAlbums(albs);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const excluded = new Set(excludeItemIds);
  const q = query.trim().toLowerCase();
  const matchesQuery = (title: string) => !q || title.toLowerCase().includes(q);

  const projectItems = items.filter(i => PROJECT_WORK_TYPES.has(i.work_type ?? '') && !excluded.has(i.id) && matchesQuery(i.title));
  const mediaItems = items.filter(i => !PROJECT_WORK_TYPES.has(i.work_type ?? '') && !excluded.has(i.id) && matchesQuery(i.title));
  const filteredAlbums = albums.filter(a => matchesQuery(a.title));

  const toggleItem = (id: string) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const toggleAlbum = async (album: PortfolioAlbum) => {
    let ids = albumItemIds.get(album.id);
    if (!ids) {
      setAlbumsLoading(prev => new Set(prev).add(album.id));
      const albumItems = await getAlbumItems(album.id);
      ids = albumItems.map(i => i.id).filter(id => !excluded.has(id));
      setAlbumItemIds(prev => new Map(prev).set(album.id, ids!));
      setAlbumsLoading(prev => { const s = new Set(prev); s.delete(album.id); return s; });
    }
    const allSelected = ids.length > 0 && ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const s = new Set(prev);
      ids!.forEach(id => allSelected ? s.delete(id) : s.add(id));
      return s;
    });
  };

  const isAlbumSelected = (album: PortfolioAlbum) => {
    const ids = albumItemIds.get(album.id);
    return !!ids && ids.length > 0 && ids.every(id => selectedIds.has(id));
  };

  const handleAdd = () => {
    const picked = items.filter(i => selectedIds.has(i.id));
    onAdd(picked);
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'projects', label: 'Projects' },
    { id: 'albums',   label: 'Albums' },
    { id: 'media',    label: 'Media' },
  ];

  return createPortal((
    <div className="fixed inset-0 z-[95] bg-gray-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <p className="text-sm font-black text-gray-900">From Portfolio</p>
        <button
          onClick={handleAdd}
          disabled={selectedIds.size === 0}
          className="text-sm font-black text-blue-600 disabled:text-gray-300"
        >
          Add{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
        </button>
      </div>

      <div className="flex gap-1.5 px-4 py-2.5 bg-white border-b border-gray-100 shrink-0 overflow-x-auto no-scrollbar">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-2.5 bg-white border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search your portfolio..."
            className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
        ) : tab === 'albums' ? (
          filteredAlbums.length === 0 ? (
            <EmptyState icon={FolderOpen} label="No albums yet" />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredAlbums.map(album => {
                const sel = isAlbumSelected(album);
                const busy = albumsLoading.has(album.id);
                return (
                  <button
                    key={album.id}
                    onClick={() => toggleAlbum(album)}
                    disabled={busy}
                    className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 text-left"
                  >
                    {album.cover_url ? (
                      <img src={album.cover_url} alt={album.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100">
                        <FolderOpen className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                    <div className={`absolute inset-0 transition-colors ${sel ? 'bg-purple-600/50' : 'bg-transparent'}`} />
                    <div className="absolute top-1.5 right-1.5">
                      {busy ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : (
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${sel ? 'bg-purple-600 border-purple-600' : 'bg-black/30 border-white/70'}`}>
                          {sel && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-2" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.75) 0%,transparent 100%)' }}>
                      <p className="text-white text-[11px] font-bold truncate">{album.title}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          (() => {
            const list = tab === 'projects' ? projectItems : mediaItems;
            if (list.length === 0) return <EmptyState icon={Layers} label={tab === 'projects' ? 'No projects yet' : 'No media yet'} />;
            return (
              <div className="grid grid-cols-2 gap-3">
                {list.map(item => {
                  const thumb = item.thumbnail_url || item.media_url;
                  const sel = selectedIds.has(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 text-left"
                    >
                      {thumb ? <img src={thumb} alt={item.title} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gray-200" />}
                      <div className={`absolute inset-0 transition-colors ${sel ? 'bg-purple-600/50' : 'bg-transparent'}`} />
                      <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2" style={{ background: sel ? '#9333ea' : 'rgba(0,0,0,0.3)', borderColor: sel ? '#9333ea' : 'rgba(255,255,255,0.7)' }}>
                        {sel && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 p-1.5" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 100%)' }}>
                        <p className="text-white text-[10px] font-bold truncate">{item.title}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })()
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          <button
            onClick={handleAdd}
            className="w-full py-3.5 rounded-2xl font-black text-white text-sm"
            style={{ background: 'linear-gradient(135deg,#9333ea,#6366f1)' }}
          >
            Add to Album ({selectedIds.size})
          </button>
        </div>
      )}
    </div>
  ), document.body);
}

function EmptyState({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-10 h-10 text-gray-200 mb-3" />
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );
}
