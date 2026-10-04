// Global "View Portfolio" preview state, provided at Root.tsx (the one
// layout component that never unmounts across in-app navigation) rather
// than owned locally by whichever card opened it. This is what lets the
// draggable Portfolio preview SURVIVE the moment it activates the real
// /portfolio route -- if it were local state inside e.g. ViewPortfolioLink
// (itself rendered inside /connect's own route tree), calling navigate()
// to '/portfolio/:id' would unmount /connect's whole subtree -- including
// the overlay itself -- mid-animation, producing exactly the abrupt cut
// the sequenced-transition spec explicitly calls out as the bug to avoid.
import { createContext, useContext } from 'react';
import type { PortfolioFeedEntry } from '../lib/portfolioApi';

export interface PortfolioPreviewRequest {
  creatorId: string;
  initialAlbumId?: string;
}

interface PortfolioPreviewContextValue {
  openPortfolioPreview: (creatorId: string, initialAlbumId?: string) => void;
  /** Opens a piece of portfolio work, or an album, on its Pinterest-style
   *  detail page (PortfolioPinDetail). Pass the entry when you have it, or
   *  just its id (`kind` says which); `seed` is the list around it (swipe
   *  order, and More to explore while related work loads). */
  openPortfolioItem: (item: string | PortfolioFeedEntry, seed?: PortfolioFeedEntry[], kind?: 'item' | 'album') => void;
}

export const PortfolioPreviewContext = createContext<PortfolioPreviewContextValue | null>(null);

export function usePortfolioPreview(): PortfolioPreviewContextValue {
  const ctx = useContext(PortfolioPreviewContext);
  if (!ctx) throw new Error('usePortfolioPreview must be used within Root (PortfolioPreviewContext.Provider)');
  return ctx;
}
