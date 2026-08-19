import { supabase } from '../../lib/supabase';

export const swipeApi = {
  // Returns the inserted row id (needed so Undo can delete exactly that row),
  // or null on failure — never blocks the swipe animation on this.
  logSwipe: async (userId: string, listingId: string, action: 'pass' | 'like'): Promise<string | null> => {
    try {
      const { data } = await supabase.from('marketplace_swipes')
        .insert({ user_id: userId, listing_id: listingId, action })
        .select('id').maybeSingle();
      return data?.id ?? null;
    } catch { return null; }
  },

  deleteSwipe: (rowId: string) => {
    supabase.from('marketplace_swipes').delete().eq('id', rowId).then(() => {}, () => {});
  },
};
