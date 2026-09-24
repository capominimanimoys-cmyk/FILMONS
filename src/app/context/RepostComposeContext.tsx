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
import type { Post } from '../types';

interface RepostComposeContextValue {
  pendingRepostItem: PortfolioItem | null;
  // onPosted, once the composer actually publishes -- without this, the
  // triggering PortfolioProjectCard had no way to reflect the fresh
  // repost (count, "You reposted this" row) in its own state; it just
  // sat stale until a full reload, even though the repost itself
  // registered correctly server-side.
  requestRepostCompose: (item: PortfolioItem, onPosted?: (newPost: Post) => void) => void;
  pendingRepostOnPosted: ((newPost: Post) => void) | null;
  clearRepostCompose: () => void;
}

const RepostComposeContext = createContext<RepostComposeContextValue | null>(null);

export function RepostComposeProvider({ children }: { children: ReactNode }) {
  const [pendingRepostItem, setPendingRepostItem] = useState<PortfolioItem | null>(null);
  const [pendingRepostOnPosted, setPendingRepostOnPosted] = useState<((newPost: Post) => void) | null>(null);
  return (
    <RepostComposeContext.Provider
      value={{
        pendingRepostItem,
        pendingRepostOnPosted,
        requestRepostCompose: (item, onPosted) => {
          setPendingRepostItem(item);
          // Function state needs the () => ... wrapper form, else React
          // treats the argument itself as a lazy updater.
          setPendingRepostOnPosted(() => onPosted ?? null);
        },
        clearRepostCompose: () => { setPendingRepostItem(null); setPendingRepostOnPosted(null); },
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
