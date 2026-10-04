// Pinterest-style masonry of portfolio work: image tiles at their natural
// shape, title and creator underneath. Used for Trending portfolios on the
// Connect > Portfolio search page when nothing is typed. Columns are
// filled greedily (each tile goes to the shortest column), so appending a
// page never moves the tiles already on screen.
import { useEffect, useMemo, useState } from 'react';
import { Heart, Layers, Play } from 'lucide-react';
import type { PortfolioFeedEntry } from '../../lib/portfolioApi';
import { PortfolioPinDetail, type PortfolioItemEntry } from './PortfolioPinDetail';
import { usePortfolioPreview } from '../../context/PortfolioPreviewContext';

function useColumnCount() {
  const query = '(min-width: 768px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide ? 3 : 2;
}

/** height/width, clamped so a panorama or a very tall piece still reads as a tile. */
function tileRatio(e: PortfolioFeedEntry): number {
  const ar = e.type === 'item' ? (e.item.aspect_ratio ?? (e.item.width && e.item.height ? e.item.width / e.item.height : null)) : e.coverAspectRatio;
  const r = ar && ar > 0 ? 1 / ar : 1.25;
  return Math.min(1.8, Math.max(0.6, r));
}

export function PortfolioPinGrid({ entries, onOpenItem }: {
  entries: PortfolioFeedEntry[];
  /** Inside an open detail page: open the piece there instead of a new page. */
  onOpenItem?: (e: PortfolioItemEntry) => void;
}) {
  const cols = useColumnCount();
  const [focused, setFocused] = useState<PortfolioItemEntry | null>(null);
  const { openPortfolioPreview } = usePortfolioPreview();

  const columns = useMemo(() => {
    const out: PortfolioFeedEntry[][] = Array.from({ length: cols }, () => []);
    const heights = new Array(cols).fill(0);
    for (const e of entries) {
      const i = heights.indexOf(Math.min(...heights));
      out[i].push(e);
      heights[i] += tileRatio(e) + 0.28; // + the caption under the image
    }
    return out;
  }, [entries, cols]);

  return (
    <>
      <div className="flex items-start gap-3">
        {columns.map((col, ci) => (
          <div key={ci} className="flex min-w-0 flex-1 flex-col gap-4">
            {col.map(e => (
              <PinTile key={`${e.type}-${e.id}`} entry={e}
                onOpen={() => (e.type === 'item' ? (onOpenItem ?? setFocused)(e) : openPortfolioPreview(e.creator.id, e.id))} />
            ))}
          </div>
        ))}
      </div>
      {focused && <PortfolioPinDetail entry={focused} seed={entries} onClose={() => setFocused(null)} />}
    </>
  );
}

function PinTile({ entry: e, onOpen }: { entry: PortfolioFeedEntry; onOpen: () => void }) {
  const isItem = e.type === 'item';
  const title = isItem ? e.item.title : e.album.title;
  const image = isItem ? (e.item.thumbnail_url || (e.item.media_type === 'image' ? e.item.media_url : null)) : e.coverUrl;
  const video = isItem && e.item.media_type === 'video' && !e.item.thumbnail_url ? e.item.media_url : null;
  const likes = (isItem ? e.item.likes_count : e.album.likes_count) ?? 0;
  const [failed, setFailed] = useState(false);

  return (
    <div className="min-w-0">
      <button type="button" onClick={onOpen} aria-label={title || 'Open portfolio work'}
        className="relative block w-full overflow-hidden rounded-2xl bg-gray-200 active:scale-[0.98] transition-transform"
        style={{ aspectRatio: `1 / ${tileRatio(e)}` }}>
        {image && !failed ? (
          <img src={image} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        ) : video ? (
          <video src={`${video}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl opacity-40">🎬</div>
        )}
        {isItem && e.item.media_type === 'video' && (
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55"><Play className="h-3.5 w-3.5 fill-white text-white" /></span>
        )}
        {!isItem && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white">
            <Layers className="h-3 w-3" /> {e.itemCount}
          </span>
        )}
      </button>
      <div className="mt-1.5 px-0.5">
        {title && <p className="line-clamp-2 text-[13px] font-bold leading-snug text-gray-900">{title}</p>}
        <div className="mt-1 flex items-center gap-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-300 text-[9px] font-black text-white">
            {e.creator.avatar_url ? <img src={e.creator.avatar_url} alt="" className="h-full w-full object-cover" /> : (e.creator.name || '?').charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-gray-600">{e.creator.name}</span>
          {likes > 0 && <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-gray-500"><Heart className="h-3 w-3" />{likes}</span>}
        </div>
      </div>
    </div>
  );
}
