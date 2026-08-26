import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

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
      .channel(`follow_counts_${profileId}`)
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
