// "Repost with your thoughts" on a POST -- same idea as
// RepostComposeContext.tsx (which does this for a Portfolio item), just for
// the other repostable content type. Hoisted to Root.tsx rather than
// Home.tsx/Profile.tsx's own local CreatePostSheet mounts, because a Post's
// repost trigger lives inside PostCard.tsx, which renders on many more
// pages than just those two (Search, PostDetail, HostProfile, category
// discovery rows, ...) -- the composer needs to be reachable from ALL of
// them, not just whichever page happens to already have its own
// CreatePostSheet mounted.
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Post } from '../types';
import { CreatePostSheet } from '../components/CreatePostSheet';

interface PendingPostRepost {
  post: Post;
  /** Optional -- lets the ORIGINATING PostCard's parent react to the new
   * repost (e.g. Home's feed inserting it at the top), same as the old
   * per-instance RepostComposer's onPosted prop. Omitted callers just don't
   * get a local update; the new post still shows up next time that list
   * reloads. */
  onPosted?: (newPost: Post) => void;
}

interface PostRepostComposeContextValue {
  pendingPostRepost: PendingPostRepost | null;
  requestPostRepostCompose: (post: Post, onPosted?: (newPost: Post) => void) => void;
  clearPostRepostCompose: () => void;
}

const PostRepostComposeContext = createContext<PostRepostComposeContextValue | null>(null);

export function PostRepostComposeProvider({ children }: { children: ReactNode }) {
  const [pendingPostRepost, setPendingPostRepost] = useState<PendingPostRepost | null>(null);
  return (
    <PostRepostComposeContext.Provider
      value={{
        pendingPostRepost,
        requestPostRepostCompose: (post, onPosted) => setPendingPostRepost({ post, onPosted }),
        clearPostRepostCompose: () => setPendingPostRepost(null),
      }}
    >
      {children}
    </PostRepostComposeContext.Provider>
  );
}

export function usePostRepostCompose(): PostRepostComposeContextValue {
  const ctx = useContext(PostRepostComposeContext);
  if (!ctx) throw new Error('usePostRepostCompose must be used within PostRepostComposeProvider');
  return ctx;
}

// Mounted once at Root.tsx's own top level (a sibling of Outlet, same as
// DraggablePortfolioPage/PortfolioPreviewContext) -- rendering the real
// CreatePostSheet, pre-loaded with the original post, from WHATEVER page
// the "Repost with thoughts" trigger fired on, not just Home/Profile's own
// separate CreatePostSheet mounts (which only cover their own pages).
export function GlobalPostRepostComposer() {
  const { pendingPostRepost, clearPostRepostCompose } = usePostRepostCompose();
  const [closing, setClosing] = useState(false);

  // pendingPostRepost flips to null the instant clearPostRepostCompose
  // runs -- close() below delays that until CreatePostSheet's own slide-
  // down exit animation (380ms, matching Home.tsx's closeCompose) finishes,
  // instead of yanking it off-screen immediately.
  useEffect(() => { if (!pendingPostRepost) setClosing(false); }, [pendingPostRepost]);

  if (!pendingPostRepost) return null;

  const close = () => {
    setClosing(true);
    setTimeout(clearPostRepostCompose, 380);
  };

  return (
    <CreatePostSheet
      closing={closing}
      initialRepostOfPost={pendingPostRepost.post}
      onPost={newPost => pendingPostRepost.onPosted?.(newPost)}
      onClose={close}
    />
  );
}
