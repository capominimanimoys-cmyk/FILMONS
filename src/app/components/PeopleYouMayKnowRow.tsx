// Home -> Connect feed's creator-discovery break -- a horizontal carousel
// inserted a few entries into the vertical feed (see Home.tsx), not a
// separate page. A compact PROFESSIONAL DISCOVERY card, not a mini post:
// identity -> creative role -> relevance (location/mutual connections/
// skills) -> Connect, deliberately no Trust Score here (that stays on the
// profile/Trust Score details, per spec). Per spec, the primary action is
// Connect (the real professional relationship), not Follow --
// getSuggestedCreators already excludes anyone already connected/pending,
// so every card starts at 'none' and only needs to reflect what THIS
// session does to it.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BadgeCheck, MapPin, Clock, UserCheck, MoreHorizontal, User as UserIcon, ThumbsDown, Flag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sendConnectionRequest } from '../lib/connectionsApi';
import { ConnectFlowSheet } from './ConnectFlowSheet';
import { UserAvatar } from './AccountTypeBadge';
import { BottomSheet, SheetAction, SheetCancel } from './BottomSheet';
import { toast } from 'sonner';
import { type SuggestedCreator } from '../lib/portfolioApi';

function SuggestedCreatorCard({ creator, onNotInterested }: { creator: SuggestedCreator; onNotInterested: () => void }) {
  const navigate = useNavigate();
  const { user, showGuestPrompt } = useAuth();
  const [requested, setRequested] = useState(false);
  const [showConnectFlow, setShowConnectFlow] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const openProfile = () => navigate(`/host/${creator.id}`);

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

  const topSkills = creator.skills.slice(0, 3);

  return (
    <>
      <div className="relative shrink-0 w-[168px] snap-start bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5 flex flex-col items-center text-center">
        <button
          onClick={e => { e.stopPropagation(); setShowMenu(true); }}
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:bg-gray-50 hover:text-gray-500 transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        <button onClick={openProfile} className="flex flex-col items-center text-center w-full">
          <UserAvatar user={{ id: creator.id, name: creator.name, avatar: creator.avatar_url }} size={72} />

          <div className="flex items-center gap-1 mt-2.5 min-w-0 max-w-full">
            <p className="text-sm font-black text-gray-900 truncate">{creator.name}</p>
            {creator.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
          </div>
          {creator.primary_role && <p className="text-xs text-blue-600 font-bold truncate w-full mt-0.5">{creator.primary_role}</p>}
          {creator.secondary_roles[0] && <p className="text-[11px] text-gray-400 truncate w-full">{creator.secondary_roles[0]}</p>}
          {creator.city && (
            <p className="text-[11px] text-gray-400 flex items-center gap-0.5 truncate w-full justify-center mt-1">
              <MapPin className="w-3 h-3 shrink-0" /> {creator.city}
            </p>
          )}

          <p className="text-[11px] font-semibold text-gray-500 mt-1.5 h-4">
            {creator.mutualCount > 0 ? `${creator.mutualCount} mutual connection${creator.mutualCount === 1 ? '' : 's'}` : ''}
          </p>

          {topSkills.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center mt-1.5">
              {topSkills.map(s => (
                <span key={s} className="text-[10px] font-semibold text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-full truncate max-w-[70px]">
                  {s}
                </span>
              ))}
            </div>
          )}
        </button>

        <button
          onClick={requested ? (e => e.stopPropagation()) : handleConnect}
          disabled={requested}
          className={`mt-2.5 w-full py-2 rounded-full text-xs font-black transition-colors flex items-center justify-center gap-1 ${
            requested ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white'
          }`}
        >
          {requested ? <><Clock className="w-3.5 h-3.5" /> Requested</> : <><UserCheck className="w-3.5 h-3.5" /> Connect</>}
        </button>
      </div>

      {showConnectFlow && (
        <ConnectFlowSheet
          name={creator.name}
          avatar={creator.avatar_url}
          onSend={sendConnect}
          onClose={() => setShowConnectFlow(false)}
        />
      )}

      {showMenu && (
        <BottomSheet onClose={() => setShowMenu(false)}>
          <div className="py-1">
            <SheetAction icon={UserIcon} label="View profile" onClick={() => { setShowMenu(false); openProfile(); }} />
            <SheetAction icon={ThumbsDown} label="Not interested" onClick={() => {
              setShowMenu(false); onNotInterested();
              toast("Got it! We'll show you less of this.");
            }} />
            <SheetAction icon={Flag} label="Report" destructive onClick={() => {
              setShowMenu(false);
              toast.warning("Report submitted. We'll review it shortly.");
            }} />
          </div>
          <div className="px-2 pb-2"><SheetCancel onClick={() => setShowMenu(false)} /></div>
        </BottomSheet>
      )}
    </>
  );
}

export function PeopleYouMayKnowRow({ creators, onSeeAll }: { creators: SuggestedCreator[]; onSeeAll?: () => void }) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const visible = creators.filter(c => !dismissedIds.has(c.id));
  if (!visible.length) return null;

  return (
    <div className="bg-white rounded-[20px] border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">People you may want to connect with</p>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-xs font-bold text-blue-600 shrink-0">See all →</button>
        )}
      </div>
      {/* Only this row scrolls sideways -- the surrounding Portfolio feed
          stays a plain vertical list; scroll-snap gives a clear "there's
          more" affordance without needing arrows/dots. */}
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-3.5 px-3.5" style={{ scrollSnapType: 'x mandatory' }}>
        {visible.map(c => (
          <SuggestedCreatorCard key={c.id} creator={c} onNotInterested={() => setDismissedIds(prev => new Set([...prev, c.id]))} />
        ))}
      </div>
    </div>
  );
}
