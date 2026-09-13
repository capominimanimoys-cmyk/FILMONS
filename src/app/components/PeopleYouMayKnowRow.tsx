// Home -> Portfolio feed's creator-discovery break -- a horizontal
// carousel inserted a few entries into the vertical feed (see Home.tsx),
// not a separate page. Follow uses the exact same FollowContext every
// other Follow button in this app reads/writes -- tapping it here updates
// Home's own "Following" tab (via that context's already-live followingIds
// + Home's existing cache-invalidation effect) with no refresh needed,
// for free, rather than anything new built for this card specifically.
import { useNavigate } from 'react-router';
import { BadgeCheck, MapPin, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFollow } from '../context/FollowContext';
import { UserAvatar } from './AccountTypeBadge';
import { type SuggestedCreator } from '../lib/portfolioApi';

function SuggestedCreatorCard({ creator }: { creator: SuggestedCreator }) {
  const navigate = useNavigate();
  const { user, showGuestPrompt } = useAuth();
  const { isFollowing, isPending, follow, unfollow } = useFollow();
  const following = isFollowing(creator.id);

  const handleFollow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { showGuestPrompt('Create your Filmons account to follow creators.', 'Sign up to follow'); return; }
    following ? unfollow(creator.id) : follow(creator.id);
  };

  return (
    <button
      onClick={() => navigate(`/host/${creator.id}`)}
      className="shrink-0 w-[38%] min-w-[128px] max-w-[160px] snap-start bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3 flex flex-col items-center text-center"
    >
      <UserAvatar user={{ id: creator.id, name: creator.name, avatar: creator.avatar_url }} size={56} />
      <div className="flex items-center gap-1 mt-2 min-w-0 max-w-full">
        <p className="text-sm font-bold text-gray-900 truncate">{creator.name}</p>
        {creator.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
      </div>
      {creator.primary_role && <p className="text-xs text-blue-600 font-semibold truncate w-full mt-0.5">{creator.primary_role}</p>}
      {creator.city && (
        <p className="text-[11px] text-gray-400 flex items-center gap-0.5 truncate w-full justify-center mt-0.5">
          <MapPin className="w-3 h-3 shrink-0" /> {creator.city}
        </p>
      )}
      <p className="text-[10px] text-gray-400 mt-1 h-3.5">
        {creator.mutualCount > 0 ? `${creator.mutualCount} mutual follow${creator.mutualCount === 1 ? '' : 's'}` : ''}
      </p>
      <button
        onClick={handleFollow}
        disabled={isPending(creator.id)}
        className={`mt-1.5 w-full py-1.5 rounded-full text-xs font-bold transition-colors disabled:opacity-60 ${
          following ? 'bg-gray-100 text-gray-700' : 'bg-blue-600 text-white'
        }`}
      >
        {following ? <span className="flex items-center justify-center gap-1"><UserCheck className="w-3 h-3" /> Following</span> : 'Follow'}
      </button>
    </button>
  );
}

export function PeopleYouMayKnowRow({ creators, onSeeAll }: { creators: SuggestedCreator[]; onSeeAll?: () => void }) {
  if (!creators.length) return null;
  return (
    <div className="bg-white rounded-[20px] border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">People You May Know</p>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-xs font-bold text-blue-600 shrink-0">See all →</button>
        )}
      </div>
      {/* Only this row scrolls sideways -- the surrounding Portfolio feed
          stays a plain vertical list; scroll-snap gives a clear "there's
          more" affordance without needing arrows/dots. */}
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-3.5 px-3.5" style={{ scrollSnapType: 'x mandatory' }}>
        {creators.map(c => <SuggestedCreatorCard key={c.id} creator={c} />)}
      </div>
    </div>
  );
}
