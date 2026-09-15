// Professional endorsements -- distinct from Reviews (transactional,
// listing/booking-tied). See src/app/lib/recommendationsApi.ts and
// supabase/migrations/20240426000000_recommendations.sql. The compose CTA
// ("Recommend {name}") only makes sense on someone ELSE's profile, so
// callers pass `onRecommend` only from HostProfile.tsx.
import { useNavigate } from 'react-router';
import { BadgeCheck, MapPin } from 'lucide-react';
import { UserAvatar } from '../AccountTypeBadge';
import { Recommendation } from '../../lib/recommendationsApi';

function timeAgo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const navigate = useNavigate();
  const r = rec.recommender;
  return (
    <div className="border-t border-gray-50 pt-3 first:border-t-0 first:pt-0">
      <button onClick={() => r && navigate(`/${r.username || r.id}`)} className="flex items-center gap-2.5 text-left">
        <UserAvatar user={r ? { name: r.name, avatar: r.avatar_url ?? undefined, id: r.id } : null} size={36} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 flex items-center gap-1 truncate">
            {r?.name ?? 'Filmons member'}
            {r?.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {[rec.role_snapshot, r?.city].filter(Boolean).join(' · ')}
          </p>
        </div>
      </button>
      <p className="text-sm text-gray-700 leading-relaxed mt-2">"{rec.body}"</p>
      {rec.relationship && <p className="text-[11px] text-gray-400 mt-1">{rec.relationship}</p>}
      <p className="text-[10px] text-gray-400 mt-1">{timeAgo(rec.created_at)}</p>
    </div>
  );
}

export function RecommendationsSection({
  recommendations, count, isOwner, onViewAll, onRecommend,
}: {
  recommendations: Recommendation[];
  count: number;
  isOwner: boolean;
  onViewAll: () => void;
  onRecommend?: () => void;
}) {
  if (!count && !onRecommend) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900">Recommendations {count > 0 ? `(${count})` : ''}</p>
        {count > 0 && (
          <button onClick={onViewAll} className="text-xs font-semibold text-blue-600 hover:underline">View all →</button>
        )}
      </div>

      {!recommendations.length ? (
        <p className="text-xs text-gray-400">
          {isOwner ? 'No recommendations yet.' : 'Be the first to recommend this creator.'}
        </p>
      ) : (
        <div className="space-y-3">
          {recommendations.slice(0, 2).map(r => <RecommendationCard key={r.id} rec={r} />)}
        </div>
      )}

      {onRecommend && (
        <button onClick={onRecommend} className="mt-3 w-full py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold active:opacity-80">
          Recommend
        </button>
      )}
    </section>
  );
}
