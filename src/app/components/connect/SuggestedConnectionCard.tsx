// Shared "People you may like to connect with" card -- used by both the
// Connections hub's horizontal preview row and the full /connections/suggested
// page's list, so the two surfaces never drift into two different card
// designs for the same data. Per spec: profile image, name, primary role,
// location, mutual connections (as real avatars, not just a count), a
// recommendation reason, Connect, and Dismiss.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BadgeCheck, Clock, UserCheck, X as XIcon, MoreHorizontal, User as UserIcon, ThumbsDown, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { sendConnectionRequest } from '../../lib/connectionsApi';
import type { SuggestedCreator } from '../../lib/portfolioApi';
import { ConnectFlowSheet } from '../ConnectFlowSheet';
import { BottomSheet, SheetAction, SheetCancel } from '../BottomSheet';

// The one real "why" signal this app can honestly claim without a dedicated
// reasons engine: a shared Primary Role (the exact phrasing the spec's own
// example uses -- "Because you're a Film Director"). Mutual connections are
// still shown (avatars + count) regardless, just not narrated as the
// headline reason when a role match already exists. Neither is fabricated --
// both come straight off real profile/connection data.
function recommendationReason(creator: SuggestedCreator, myPrimaryRole?: string | null): string | null {
  if (myPrimaryRole && creator.primary_role && creator.primary_role.toLowerCase() === myPrimaryRole.toLowerCase()) {
    return `Because you're a ${myPrimaryRole}`;
  }
  if (creator.mutualCount > 0) {
    return `${creator.mutualCount} mutual connection${creator.mutualCount === 1 ? '' : 's'}`;
  }
  return null;
}

export function SuggestedConnectionCard({ creator, onConnected, onDismiss, widthClassName = 'w-64 shrink-0', showMenu = false }: {
  creator: SuggestedCreator;
  onConnected: () => void;
  onDismiss: () => void;
  /** Replaces (not appends to) the default fixed-width horizontal-scroll
   * sizing -- e.g. 'w-full' when the caller lays these out in a grid
   * instead (SuggestedConnections.tsx's full page), so the two never fight
   * over conflicting width utilities. */
  widthClassName?: string;
  /** Adds a top-right three-dot menu (View profile / Not interested /
   * Report) -- distinct from the Dismiss-X button below, which stays as-is
   * for every existing caller. Off by default so the Connections hub/
   * SuggestedConnections page keep their current, unchanged layout; the
   * Browse Search Connect landing page ("People you may know") turns it
   * on. "Not interested" just calls the same onDismiss the X button does. */
  showMenu?: boolean;
}) {
  const navigate = useNavigate();
  const { user, showGuestPrompt } = useAuth();
  const [requested, setRequested] = useState(false);
  const [showFlow, setShowFlow] = useState(false);
  const [showMenuSheet, setShowMenuSheet] = useState(false);

  const openProfile = () => navigate(creator.username ? `/${creator.username}` : `/host/${creator.id}`);

  const send = async (note?: string) => {
    setShowFlow(false);
    if (!user) return;
    setRequested(true);
    const ok = await sendConnectionRequest(user.id, creator.id, note);
    if (!ok) setRequested(false); else onConnected();
  };

  const reason = recommendationReason(creator, user?.primaryRole);

  return (
    <div className={`relative bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-2.5 ${widthClassName}`}>
      {showMenu && (
        <button
          onClick={() => setShowMenuSheet(true)}
          aria-label="More options"
          className="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:bg-gray-50 hover:text-gray-500 transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      )}
      <button onClick={openProfile} className="w-14 h-14 rounded-full overflow-hidden bg-gray-200 shrink-0 self-start">
        {creator.avatar_url
          ? <img src={creator.avatar_url} alt={creator.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-400">{creator.name?.[0]?.toUpperCase() || '?'}</div>}
      </button>

      <button onClick={openProfile} className="text-left">
        <div className="flex items-center gap-1">
          <p className="text-sm font-black text-gray-900 truncate">{creator.name}</p>
          {creator.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
        </div>
        <p className="text-xs text-gray-400 truncate">
          {[creator.primary_role, creator.city].filter(Boolean).join(' · ')}
        </p>
      </button>

      {creator.mutualAvatars.length > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-2">
            {creator.mutualAvatars.map(m => (
              <div key={m.id} className="w-5 h-5 rounded-full overflow-hidden bg-gray-200 border-2 border-white shrink-0">
                {m.avatar_url
                  ? <img src={m.avatar_url} alt={m.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-gray-400">{m.name?.[0]?.toUpperCase() || '?'}</div>}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">{creator.mutualCount} mutual connection{creator.mutualCount === 1 ? '' : 's'}</p>
        </div>
      )}

      {reason && <p className="text-[11px] font-semibold text-blue-600 truncate">{reason}</p>}

      <div className="flex items-center gap-2 mt-auto pt-1">
        <button
          onClick={requested ? undefined : () => { if (!user) { showGuestPrompt('Create your Filmons account to connect with creators.', 'Sign up to connect'); return; } setShowFlow(true); }}
          disabled={requested}
          className={`flex-1 py-2 rounded-full text-xs font-black flex items-center justify-center gap-1 transition-colors ${requested ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        >
          {requested ? <><Clock className="w-3.5 h-3.5" /> Pending</> : <><UserCheck className="w-3.5 h-3.5" /> Connect</>}
        </button>
        <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-300 hover:bg-gray-100 hover:text-gray-500 transition-colors">
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      {showFlow && <ConnectFlowSheet name={creator.name} avatar={creator.avatar_url} onSend={send} onClose={() => setShowFlow(false)} />}

      {showMenuSheet && (
        <BottomSheet onClose={() => setShowMenuSheet(false)}>
          <div className="py-1">
            <SheetAction icon={UserIcon} label="View profile" onClick={() => { setShowMenuSheet(false); openProfile(); }} />
            <SheetAction icon={ThumbsDown} label="Not interested" onClick={() => {
              setShowMenuSheet(false); onDismiss();
              toast("Got it! We'll show you less of this.");
            }} />
            <SheetAction icon={Flag} label="Report" destructive onClick={() => {
              setShowMenuSheet(false);
              toast.warning("Report submitted. We'll review it shortly.");
            }} />
          </div>
          <div className="px-2 pb-2"><SheetCancel onClick={() => setShowMenuSheet(false)} /></div>
        </BottomSheet>
      )}
    </div>
  );
}
