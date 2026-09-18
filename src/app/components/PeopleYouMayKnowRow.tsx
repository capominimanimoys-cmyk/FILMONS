// Home -> Connect feed's creator-discovery break -- a horizontal carousel
// inserted a few entries into the vertical feed (see Home.tsx), not a
// separate page. Per spec, the primary action here is Connect (the real
// professional relationship), not Follow -- getSuggestedCreators already
// excludes anyone already connected/pending, so every card starts at
// 'none' and only needs to reflect what THIS session does to it.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BadgeCheck, MapPin, Clock, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sendConnectionRequest } from '../lib/connectionsApi';
import { ConnectFlowSheet } from './ConnectFlowSheet';
import { UserAvatar } from './AccountTypeBadge';
import { type SuggestedCreator } from '../lib/portfolioApi';

function SuggestedCreatorCard({ creator }: { creator: SuggestedCreator }) {
  const navigate = useNavigate();
  const { user, showGuestPrompt } = useAuth();
  const [requested, setRequested] = useState(false);
  const [showConnectFlow, setShowConnectFlow] = useState(false);

  const handleConnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { showGuestPrompt('Create your Filmons account to connect with creators.', 'Sign up to connect'); return; }
    setShowConnectFlow(true);
  };

  const sendConnect = async (note?: string) => {
    setShowConnectFlow(false);
    if (!user) return;
    setRequested(true); // optimistic -- the whole point is instant "Requested" feedback, no refresh
    const ok = await sendConnectionRequest(user.id, creator.id, note);
    if (!ok) setRequested(false);
  };

  return (
    <>
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
          {creator.mutualCount > 0 ? `${creator.mutualCount} mutual connection${creator.mutualCount === 1 ? '' : 's'}` : ''}
        </p>
        <button
          onClick={requested ? (e => e.stopPropagation()) : handleConnect}
          disabled={requested}
          className={`mt-1.5 w-full py-1.5 rounded-full text-xs font-bold transition-colors flex items-center justify-center gap-1 ${
            requested ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white'
          }`}
        >
          {requested ? <><Clock className="w-3 h-3" /> Requested</> : <><UserCheck className="w-3 h-3" /> Connect</>}
        </button>
      </button>

      {showConnectFlow && (
        <ConnectFlowSheet
          name={creator.name}
          avatar={creator.avatar_url}
          onSend={sendConnect}
          onClose={() => setShowConnectFlow(false)}
        />
      )}
    </>
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
