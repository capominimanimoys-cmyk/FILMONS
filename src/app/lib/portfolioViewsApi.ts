// FILMONS Portfolio View Notifications -- client side. The actual
// aggregation/race-condition-safe counting lives entirely server-side
// (fn_record_portfolio_view + record-portfolio-view edge function, see
// supabase/migrations/20240519000000_portfolio_view_notifications.sql);
// this file is just the fire-and-forget trigger plus the analytics reads.
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';

/** Call once per eligible full-Portfolio entry (never for the 70% draggable
 *  preview, never for the owner viewing their own work -- see the callers
 *  in Portfolio.tsx/DraggablePortfolioPage.tsx for exactly which moments
 *  count). Fire-and-forget: a failed/slow notification write must never
 *  block or visibly affect the Portfolio page itself. */
export function recordPortfolioView(viewerId: string, ownerId: string): void {
  if (!viewerId || !ownerId || viewerId === ownerId) return;
  fetch(`https://${projectId}.supabase.co/functions/v1/record-portfolio-view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify({ viewerId, ownerId }),
  }).catch(() => {});
}

export interface PortfolioViewStats {
  total: number;
  uniqueViewers: number;
  today: number;
  last7Days: number;
  last30Days: number;
}

/** Lifetime Portfolio analytics -- separate from the notification's own
 *  (unread, resettable) count. Reads portfolio_view_events directly, same
 *  table fn_record_portfolio_view writes to for every valid, non-owner
 *  view (independent of the notification dedup window). */
export async function getPortfolioViewStats(ownerId: string): Promise<PortfolioViewStats> {
  const empty: PortfolioViewStats = { total: 0, uniqueViewers: 0, today: 0, last7Days: 0, last30Days: 0 };
  if (!ownerId) return empty;

  const { data, error } = await supabase
    .from('portfolio_view_events')
    .select('viewer_id, created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error || !data) return empty;

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

  const uniqueViewers = new Set(data.map((r: any) => r.viewer_id)).size;
  const today = data.filter((r: any) => new Date(r.created_at).getTime() >= startOfToday.getTime()).length;
  const last7Days = data.filter((r: any) => now - new Date(r.created_at).getTime() <= 7 * DAY).length;
  const last30Days = data.filter((r: any) => now - new Date(r.created_at).getTime() <= 30 * DAY).length;

  return { total: data.length, uniqueViewers, today, last7Days, last30Days };
}
