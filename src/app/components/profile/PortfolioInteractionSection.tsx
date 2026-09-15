// Owner-only (per spec: "Detailed analytics should only be visible to the
// profile owner") -- real last-30-days-vs-previous-30-days numbers backed
// by portfolio_engagement_events (see getPortfolioInteractionStats,
// src/app/lib/portfolioApi.ts). Callers must not render this for a viewer.
import { useEffect, useState } from 'react';
import { Eye, Heart, MessageCircle, Share2 } from 'lucide-react';
import { getPortfolioInteractionStats, type PortfolioInteractionStats } from '../../lib/portfolioApi';

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

function Metric({ icon, value, label, changePct }: { icon: React.ReactNode; value: number; label: string; changePct: number | null }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 text-gray-400">{icon}</div>
      <p className="text-lg font-black text-gray-900 tabular-nums mt-1">{formatCount(value)}</p>
      <p className="text-[10px] text-gray-400 font-semibold">{label}</p>
      {changePct != null && (
        <p className={`text-[10px] font-bold mt-0.5 ${changePct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {changePct >= 0 ? '↑' : '↓'} {Math.abs(changePct)}%
        </p>
      )}
    </div>
  );
}

export function PortfolioInteractionSection({ userId, onViewAnalytics }: { userId: string; onViewAnalytics?: () => void }) {
  const [stats, setStats] = useState<PortfolioInteractionStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPortfolioInteractionStats(userId).then(s => { if (!cancelled) setStats(s); });
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-black text-gray-900">Portfolio Interaction</p>
          <p className="text-[10px] text-gray-400 font-semibold">Last 30 days</p>
        </div>
      </div>

      {!stats ? (
        <div className="h-16 rounded-xl bg-gray-50 animate-pulse" />
      ) : (
        <div className="flex items-start gap-3">
          <Metric icon={<Eye className="w-4 h-4" />}          value={stats.views}    label="Views"    changePct={stats.viewsChangePct} />
          <Metric icon={<Heart className="w-4 h-4" />}        value={stats.likes}    label="Likes"    changePct={stats.likesChangePct} />
          <Metric icon={<MessageCircle className="w-4 h-4" />} value={stats.comments} label="Comments" changePct={stats.commentsChangePct} />
          <Metric icon={<Share2 className="w-4 h-4" />}       value={stats.shares}   label="Shares"   changePct={stats.sharesChangePct} />
        </div>
      )}

      {onViewAnalytics && (
        <button onClick={onViewAnalytics} className="mt-3 text-xs font-semibold text-blue-600 hover:underline">View analytics →</button>
      )}
    </section>
  );
}
