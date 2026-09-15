// Owner-only (per spec: "Detailed analytics should only be visible to the
// profile owner"). Fuller detail (with 30-day trend) than the header's own
// Profile Interaction stat -- Profile Interaction is broader than the
// earlier "Portfolio Interaction" (views/likes/comments/shares on
// portfolio items only): every meaningful engagement with the creator
// across FILMONS (follow, message, portfolio saves, View Portfolio clicks,
// Service/Listing opens and saves, profile shares, recommendations,
// social-link clicks), regardless of which surface it happened on (Home,
// Search, this profile, etc.) -- see getProfileInteractionStats,
// src/app/lib/profileEngagement.ts. Passive profile-page views are
// deliberately excluded and tracked separately (profile_views table) for
// a future private Creator Analytics page, not shown here.
//
// `stats` is fetched once by the page (Profile.tsx) and shared with the
// header's stats row too, rather than this section doing its own second
// fetch of the same number.
import { type ProfileInteractionStats } from '../../lib/profileEngagement';

export function ProfileInteractionSection({ stats, onViewAnalytics }: { stats: ProfileInteractionStats | null; onViewAnalytics?: () => void }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-sm font-black text-gray-900 mb-3">Profile Interaction</p>

      {!stats ? (
        <div className="h-16 rounded-xl bg-gray-50 animate-pulse" />
      ) : (
        <div>
          <p className="text-3xl font-black text-gray-900 tabular-nums">{stats.total.toLocaleString()}</p>
          <p className="text-xs text-gray-400 font-semibold mt-0.5">Interactions</p>
          {stats.totalChangePct != null && (
            <p className={`text-xs font-bold mt-1.5 ${stats.totalChangePct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {stats.totalChangePct >= 0 ? '↑' : '↓'} {Math.abs(stats.totalChangePct)}% last 30 days
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
