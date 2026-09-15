// Owner-only (per spec: "Detailed analytics should only be visible to the
// profile owner") -- real last-30-days-vs-previous-30-days numbers backed
// by portfolio_engagement_events (see getPortfolioInteractionStats,
// src/app/lib/portfolioApi.ts). Callers must not render this for a viewer.
//
// Shows ONE combined metric (views+likes+comments+shares, saves excluded)
// per spec -- the four counts are still tracked individually in the
// backend/PortfolioInteractionStats for analytics and future features, but
// this section deliberately never breaks them out separately.
import { useEffect, useState } from 'react';
import { getPortfolioInteractionStats, type PortfolioInteractionStats } from '../../lib/portfolioApi';

export function PortfolioInteractionSection({ userId, onViewAnalytics }: { userId: string; onViewAnalytics?: () => void }) {
  const [stats, setStats] = useState<PortfolioInteractionStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPortfolioInteractionStats(userId).then(s => { if (!cancelled) setStats(s); });
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-sm font-black text-gray-900 mb-3">Portfolio Interaction</p>

      {!stats ? (
        <div className="h-16 rounded-xl bg-gray-50 animate-pulse" />
      ) : (
        <div>
          <p className="text-3xl font-black text-gray-900 tabular-nums">{stats.total.toLocaleString()}</p>
          <p className="text-xs text-gray-400 font-semibold mt-0.5">Total interactions</p>
          {stats.totalChangePct != null && (
            <p className={`text-xs font-bold mt-1.5 ${stats.totalChangePct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {stats.totalChangePct >= 0 ? '↑' : '↓'} {Math.abs(stats.totalChangePct)}% in the last 30 days
            </p>
          )}
        </div>
      )}

      {onViewAnalytics && (
        <button onClick={onViewAnalytics} className="mt-3 text-xs font-semibold text-blue-600 hover:underline">View analytics →</button>
      )}
    </section>
  );
}
