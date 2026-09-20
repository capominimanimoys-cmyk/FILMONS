import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

let instanceCounter = 0;

/**
 * Live follower/following counts for a profile being viewed. Separate from
 * FollowContext (which only tracks the current user's own follow set) since
 * these counts must react to ANY user's follow/unfollow of this profile, not
 * just the current viewer's — e.g. a third party following the profile you
 * currently have open should bump the count on your screen live.
 */
export function useFollowCounts(profileId: string | undefined) {
  const [followerCount,  setFollowerCount]  = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);

  // Unique per hook instance, not just per profileId -- Portfolio.tsx is
  // now mountable both at its own route AND embedded inside the draggable
  // "View Portfolio" overlay (DraggablePortfolioPage), so two instances of
  // this hook can legitimately be live for the SAME profileId at once (e.g.
  // HostProfile.tsx's own header plus an embedded Portfolio for that same
  // creator). Reusing `follow_counts_${profileId}` as the channel topic in
  // that case throws "cannot add postgres_changes callbacks... after
  // subscribe()" -- the second mount's channel object collides with the
  // first's already-subscribed one. A per-instance suffix makes every
  // mount's channel topic distinct regardless of how many are watching the
  // same profile simultaneously.
  const instanceId = useRef(0);
  if (!instanceId.current) instanceId.current = ++instanceCounter;

  useEffect(() => {
    if (!profileId) { setFollowerCount(null); setFollowingCount(null); return; }

    let cancelled = false;
    Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profileId),
    ]).then(([fcRes, fgRes]) => {
      if (cancelled) return;
      setFollowerCount(fcRes.count ?? 0);
      setFollowingCount(fgRes.count ?? 0);
    });

    const channel = supabase
      .channel(`follow_counts_${profileId}_${instanceId.current}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'follows', filter: `following_id=eq.${profileId}` },
        () => setFollowerCount(c => (c ?? 0) + 1),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'follows', filter: `following_id=eq.${profileId}` },
        () => setFollowerCount(c => Math.max(0, (c ?? 0) - 1)),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'follows', filter: `follower_id=eq.${profileId}` },
        () => setFollowingCount(c => (c ?? 0) + 1),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'follows', filter: `follower_id=eq.${profileId}` },
        () => setFollowingCount(c => Math.max(0, (c ?? 0) - 1)),
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [profileId]);

  return { followerCount, followingCount };
}
