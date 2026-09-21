// A "Repost with your thoughts" on a Portfolio card doesn't invent a new
// compose mechanism -- it opens the ordinary Post composer (CreatePostSheet)
// with the portfolio item pre-attached via the SAME flat-column attachment
// pattern already used for "attach a Portfolio item to a Post"
// (portfolioItemId/Title/Category/Thumb), so the result is a real, normal
// post with its own likes/comments around a live reference to the original
// work -- never a copy of it.
//
// Hoisted here (rather than passed as a prop through ConnectFeedCard ->
// PortfolioProjectCard/PortfolioAlbumCard) because the trigger lives deep
// in Home.tsx's Connect feed tree while the actual CreatePostSheet mount
// lives at Home.tsx's own top level -- same reasoning as
// PortfolioPreviewContext/LearningTransitionContext.
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { PortfolioItem } from '../lib/portfolioApi';

interface RepostComposeContextValue {
  pendingRepostItem: PortfolioItem | null;
  requestRepostCompose: (item: PortfolioItem) => void;
  clearRepostCompose: () => void;
}

const RepostComposeContext = createContext<RepostComposeContextValue | null>(null);

export function RepostComposeProvider({ children }: { children: ReactNode }) {
  const [pendingRepostItem, setPendingRepostItem] = useState<PortfolioItem | null>(null);
  return (
    <RepostComposeContext.Provider
      value={{
        pendingRepostItem,
        requestRepostCompose: setPendingRepostItem,
        clearRepostCompose: () => setPendingRepostItem(null),
      }}
    >
      {children}
    </RepostComposeContext.Provider>
  );
}

export function useRepostCompose(): RepostComposeContextValue {
  const ctx = useContext(RepostComposeContext);
  if (!ctx) throw new Error('useRepostCompose must be used within RepostComposeProvider');
  return ctx;
}
