import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { socialApi } from '../lib/api';
import { useAuth } from './AuthContext';

interface FollowContextValue {
  isFollowing: (targetId: string) => boolean;
  isPending:   (targetId: string) => boolean;
  follow:      (targetId: string) => Promise<void>;
  unfollow:    (targetId: string) => Promise<void>;
}

const FollowContext = createContext<FollowContextValue | null>(null);

/**
 * Single source of truth for "does the current user follow this person" —
 * every follow button in the app reads from this instead of its own local
 * useState, and stays live via a realtime subscription on the current
 * user's own follows rows (same postgres_changes pattern Inbox.tsx uses
 * for messages), so a follow/unfollow anywhere is reflected everywhere
 * (other tabs, other components showing the same user) without a reload.
 */
export function FollowProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth() as any;
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [pendingIds,   setPendingIds]   = useState<Set<string>>(new Set());
  const userId = user?.id as string | undefined;

  useEffect(() => {
    if (!userId) { setFollowingIds(new Set()); return; }

    let cancelled = false;
    supabase.from('follows').select('following_id').eq('follower_id', userId)
      .then(({ data }) => {
        if (cancelled) return;
        setFollowingIds(new Set((data ?? []).map((r: any) => r.following_id)));
      });

    const channel = supabase
      .channel(`follows_mine_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'follows', filter: `follower_id=eq.${userId}` },
        (payload: any) => {
          const id = payload.new?.following_id;
          if (!id) return;
          setFollowingIds(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'follows', filter: `follower_id=eq.${userId}` },
        (payload: any) => {
          const id = payload.old?.following_id;
          if (!id) return;
          setFollowingIds(prev => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [userId]);

  const setPending = (id: string, on: boolean) => {
    setPendingIds(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const follow = async (targetId: string) => {
    if (pendingIds.has(targetId) || followingIds.has(targetId)) return;
    setPending(targetId, true);
    setFollowingIds(prev => new Set(prev).add(targetId));
    try {
      await socialApi.follow(targetId);
    } catch (e: any) {
      setFollowingIds(prev => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
      toast.error(e?.message || 'Could not follow. Please try again.');
    } finally {
      setPending(targetId, false);
    }
  };

  const unfollow = async (targetId: string) => {
    if (pendingIds.has(targetId) || !followingIds.has(targetId)) return;
    setPending(targetId, true);
    setFollowingIds(prev => {
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
    try {
      await socialApi.unfollow(targetId);
    } catch (e: any) {
      setFollowingIds(prev => new Set(prev).add(targetId));
      toast.error(e?.message || 'Could not unfollow. Please try again.');
    } finally {
      setPending(targetId, false);
    }
  };

  const value: FollowContextValue = {
    isFollowing: id => followingIds.has(id),
    isPending:   id => pendingIds.has(id),
    follow,
    unfollow,
  };

  return <FollowContext.Provider value={value}>{children}</FollowContext.Provider>;
}

export function useFollow(): FollowContextValue {
  const ctx = useContext(FollowContext);
  if (!ctx) throw new Error('useFollow must be used within FollowProvider');
  return ctx;
}
