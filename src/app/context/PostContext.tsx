/**
 * PostContext — global in-memory store for posts.
 *
 * Keeps likes, comment counts, repost counts, and saved state
 * consistent across every page in the app. Persists to sessionStorage
 * so data survives navigation within a session.
 *
 * Usage:
 *   const { getPost, updatePost, setPosts, addPost, removePost } = usePostStore();
 */
import {
  createContext, useContext, useCallback,
  useRef, useState, ReactNode,
} from 'react';
import { Post } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────
type PostMap = Map<string, Post>;

interface PostStoreCtx {
  getPost: (id: string) => Post | undefined;
  setPosts: (posts: Post[]) => void;
  updatePost: (id: string, patch: Partial<Post>) => Post;
  addPost: (post: Post) => void;
  removePost: (id: string) => void;
  getAllPosts: () => Post[];
  mergePosts: (posts: Post[], currentUserId?: string) => Post[];
  /** Evict cached posts whose IDs are not in freshIds — call on full reload only */
  clearStaleIds: (freshIds: string[], currentUserId?: string) => void;
  updatePostsForUser: (userId: string, patch: Partial<any>) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const SESSION_KEY = 'filmons_post_store';

function normMedia(p: any): Post {
  const a = (v: any): string[] => {
    if (Array.isArray(v)) return v;
    if (!v) return [];
    if (typeof v === 'string') {
      if (v.startsWith('{')) return v.slice(1,-1).split(',').map((s:string)=>s.trim().replace(/^"|"$/g,'')).filter(Boolean);
      if (v.startsWith('http')) return [v];
      try { const r = JSON.parse(v); if (Array.isArray(r)) return r; } catch {}
    }
    return [];
  };
  return { ...p, images: a(p.images), videos: a(p.videos), audios: a(p.audios) };
}

function loadFromSession(): PostMap {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return new Map();
    const arr: Post[] = JSON.parse(raw);
    return new Map(arr.map(p => { const n = normMedia(p); return [n.id, n]; }));
  } catch {
    return new Map();
  }
}

function saveToSession(map: PostMap) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...map.values()]));
  } catch {}
}

// ── Context ───────────────────────────────────────────────────────────────────
const PostStoreContext = createContext<PostStoreCtx | null>(null);

export function PostProvider({ children }: { children: ReactNode }) {
  // Use a ref for the map so updates don't re-render the whole tree;
  // components subscribe via a version counter that triggers local re-renders.
  const storeRef = useRef<PostMap>(loadFromSession());
  // Version bump forces consumers to re-read after mutations
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  const getPost = useCallback((id: string) => {
    return storeRef.current.get(id);
  }, []);

  const setPosts = useCallback((posts: Post[]) => {
    posts.forEach(p => {
      // Only overwrite if we don't have a newer client-side version
      const existing = storeRef.current.get(p.id);
      if (!existing) {
        storeRef.current.set(p.id, p);
      } else {
        // Preserve client-patched counts, merge the rest
        storeRef.current.set(p.id, {
          ...p,
          likes:        existing.likes       ?? p.likes,
          likesCount:   existing.likesCount  ?? p.likesCount,
          commentCount: existing.commentCount ?? p.commentCount,
          repostCount:  existing.repostCount  ?? p.repostCount,
        });
      }
    });
    saveToSession(storeRef.current);
    bump();
  }, [bump]);

  const updatePost = useCallback((id: string, patch: Partial<Post>): Post => {
    const existing = storeRef.current.get(id);
    const updated = existing ? { ...existing, ...patch } : (patch as Post);
    storeRef.current.set(id, updated);
    saveToSession(storeRef.current);
    // Don't call bump() here — PostCard manages its own render via setLocalPost.
    // bump() is only needed for components reading directly from the store (Feed).
    return updated;
  }, []);

  const addPost = useCallback((post: Post) => {
    storeRef.current.set(post.id, normMedia(post));
    saveToSession(storeRef.current);
    bump();
  }, [bump]);

  const removePost = useCallback((id: string) => {
    storeRef.current.delete(id);
    saveToSession(storeRef.current);
    bump();
  }, [bump]);

  const getAllPosts = useCallback(() => {
    return [...storeRef.current.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, []);

  const mergePosts = useCallback((posts: Post[], currentUserId?: string): Post[] => {
    const merged = posts.map(p => {
      const norm   = normMedia(p);
      const cached = storeRef.current.get(norm.id);
      if (!cached) { storeRef.current.set(norm.id, norm); return norm; }
      const mergedPost = {
        // Cached wins for extra fields not yet in DB (audioTitle, listingId, etc.)
        ...cached,
        // Fresh DB data wins for content + media
        ...norm,
        // Preserve engagement state
        likesCount:   norm.likesCount ?? cached.likesCount ?? 0,
        likes:        (norm.likes && norm.likes.length > 0) ? norm.likes : (cached.likes ?? []),
        commentCount: Math.max(cached.commentCount ?? 0, norm.commentCount ?? 0),
        repostCount:  Math.max(cached.repostCount  ?? 0, norm.repostCount  ?? 0),
        // Keep extra fields from cache if DB doesn't have them yet
        audioTitle:   norm.audioTitle   || (cached as any).audioTitle   || undefined,
        audioArtist:  norm.audioArtist  || (cached as any).audioArtist  || undefined,
        audioId:      norm.audioId      || (cached as any).audioId      || undefined,
        listingId:    norm.listingId    || (cached as any).listingId    || undefined,
        listingTitle: norm.listingTitle || (cached as any).listingTitle || undefined,
        listingPrice: norm.listingPrice ?? (cached as any).listingPrice ?? undefined,
        listingMode:  norm.listingMode  || (cached as any).listingMode  || undefined,
        listingCity:  norm.listingCity  || (cached as any).listingCity  || undefined,
        listingImage: norm.listingImage || (cached as any).listingImage || undefined,
      };
      storeRef.current.set(norm.id, mergedPost);
      return mergedPost;
    });
    saveToSession(storeRef.current);
    bump();
    return merged;
  }, [bump]);

  // Evict ghost posts but preserve posts the current user has liked
  const clearStaleIds = useCallback((freshIds: string[], currentUserId?: string) => {
    const freshSet = new Set(freshIds);
    for (const [id, post] of storeRef.current) {
      if (freshSet.has(id)) continue;
      const isLikedByUser = currentUserId && (post.likes ?? []).includes(currentUserId);
      if (!isLikedByUser) storeRef.current.delete(id);
    }
    saveToSession(storeRef.current);
  }, []);

  // Patch all posts by a given userId (e.g. after avatar update)
  const updatePostsForUser = useCallback((userId: string, patch: Partial<any>) => {
    for (const [id, post] of storeRef.current) {
      if (post.userId === userId) {
        storeRef.current.set(id, { ...post, ...patch });
      }
    }
    saveToSession(storeRef.current);
    bump();
  }, [bump]);

  return (
    <PostStoreContext.Provider value={{
      getPost, setPosts, updatePost, addPost, removePost, getAllPosts, mergePosts, clearStaleIds, updatePostsForUser,
    }}>
      {children}
    </PostStoreContext.Provider>
  );
}

export function usePostStore(): PostStoreCtx {
  const ctx = useContext(PostStoreContext);
  if (!ctx) throw new Error('usePostStore must be used inside <PostProvider>');
  return ctx;
}