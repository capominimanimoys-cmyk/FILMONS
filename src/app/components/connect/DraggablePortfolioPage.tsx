// FILMONS "View Portfolio" draggable presentation -- per explicit
// correction: this must NOT be a separate Portfolio viewer/implementation.
// It mounts the SAME <Portfolio/> page component /portfolio itself renders
// (same header, tabs, cards, albums, likes/comments/share, three-dot
// menus, empty/loading states, visibility rules) inside a draggable
// container, via Portfolio.tsx's own overrideUserId/initialAlbumId/embedded
// props (small additive integration points, not a redesign). There is only
// one Portfolio UI across FILMONS; this is a presentation mode for it.
import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { DraggablePage } from '../DraggablePage';
import { Portfolio } from '../../pages/Portfolio';

const SNAP_POINTS = [0, 0.7, 1];
const PREVIEW_INDEX = 1;

export function DraggablePortfolioPage({ creatorId, initialAlbumId, onClose }: {
  creatorId: string;
  initialAlbumId?: string;
  onClose: () => void;
}) {
  const [snapIndex, setSnapIndex] = useState(PREVIEW_INDEX);
  const scrollRef = useRef<HTMLDivElement>(null);

  // One pushed history entry for the whole presentation (not per snap
  // point, to avoid duplicate entries from dragging between 70%/100%) --
  // popped on full close so browser/hardware Back collapses this instead
  // of leaving whatever page opened it (spec: preserve the Connect/feed
  // scroll position underneath, never navigate it away).
  useEffect(() => {
    window.history.pushState({ filmonsPortfolioOverlay: true }, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line

  const handleClose = useCallback(() => {
    if (window.history.state?.filmonsPortfolioOverlay) window.history.back();
    else onClose();
  }, [onClose]);

  return (
    <DraggablePage
      snapIndex={snapIndex}
      onSnapIndexChange={setSnapIndex}
      onClose={handleClose}
      snapPoints={SNAP_POINTS}
      scrollRef={scrollRef}
      header={({ isTop }) => (
        <div className="flex items-center justify-between px-3" onPointerDown={e => e.stopPropagation()}>
          {isTop ? (
            <button onClick={() => setSnapIndex(PREVIEW_INDEX)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
              <ArrowLeft className="w-4 h-4 text-gray-700" />
            </button>
          ) : <div className="w-8" />}
          <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-700" />
          </button>
        </div>
      )}
    >
      {() => (
        <div ref={scrollRef} className="overflow-y-auto h-full">
          <Portfolio overrideUserId={creatorId} initialAlbumId={initialAlbumId} embedded />
        </div>
      )}
    </DraggablePage>
  );
}
