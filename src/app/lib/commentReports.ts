import { supabase } from '../../lib/supabase';

/** Files a report for one comment (same `content_reports` table the portfolio reporting flow uses). */
export async function reportComment(reporterId: string, commentId: string, kind: 'post' | 'portfolio'): Promise<boolean> {
  const { error } = await supabase.from('content_reports').insert({
    reporter_id: reporterId, target_id: commentId, target_type: kind === 'post' ? 'post_comment' : 'portfolio_comment', reason: null,
  });
  if (error) console.error('[comment report]', error.message);
  return !error;
}
