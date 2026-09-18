// Relationship actions for an existing/pending Professional Connection --
// what opens when tapping "Connected ✓" or "Pending" on someone's profile,
// instead of the button doing something destructive/silent on a single tap.
// One sheet, content varies by status, per the LinkedIn-inspired spec.
import { MessageCircle, UserCheck, UserPlus, UserMinus, X, Check } from 'lucide-react';
import { BottomSheet, SheetAction, SheetCancel } from './BottomSheet';
import { UserAvatar } from './AccountTypeBadge';
import type { ConnectionDegree } from '../lib/connectionsApi';

interface Props {
  status: 'connected' | 'pending_sent' | 'pending_received';
  name: string;
  avatar?: string | null;
  degree?: ConnectionDegree;
  mutualCount?: number;
  note?: string | null;
  isFollowing?: boolean;
  onMessage?: () => void;
  onToggleFollow?: () => void;
  onRemoveConnection?: () => void;
  onWithdraw?: () => void;
  onAccept?: () => void;
  onIgnore?: () => void;
  onClose: () => void;
}

export function ConnectionActionsSheet({
  status, name, avatar, degree, mutualCount, note, isFollowing,
  onMessage, onToggleFollow, onRemoveConnection, onWithdraw, onAccept, onIgnore, onClose,
}: Props) {
  if (status === 'pending_sent') {
    return (
      <BottomSheet onClose={onClose}>
        <div className="px-4 pt-2 pb-4 text-center">
          <div className="flex justify-center mb-3"><UserAvatar user={{ id: '', name, avatar: avatar || undefined }} size={56} /></div>
          <p className="text-base font-black text-gray-900">Connection request pending</p>
          <p className="text-sm text-gray-500 mt-1">{name} hasn't responded yet.</p>
        </div>
        <SheetAction icon={X} label="Withdraw request" onClick={() => onWithdraw?.()} destructive />
        <SheetCancel onClick={onClose} />
      </BottomSheet>
    );
  }

  if (status === 'pending_received') {
    return (
      <BottomSheet title={`${name} wants to connect`} onClose={onClose}>
        <div className="px-4 pt-2 pb-3">
          <div className="flex items-center gap-3 mb-3">
            <UserAvatar user={{ id: '', name, avatar: avatar || undefined }} size={44} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{name}</p>
              {typeof mutualCount === 'number' && mutualCount > 0 && (
                <p className="text-xs text-gray-400">{mutualCount} mutual connection{mutualCount === 1 ? '' : 's'}</p>
              )}
            </div>
          </div>
          {note && (
            <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 leading-relaxed">"{note}"</p>
          )}
        </div>
        <div className="flex gap-2 px-4 pb-3">
          <button onClick={() => onIgnore?.()} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition-colors">
            Ignore
          </button>
          <button onClick={() => onAccept?.()} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors">
            <Check className="w-4 h-4" /> Accept
          </button>
        </div>
      </BottomSheet>
    );
  }

  // connected
  return (
    <BottomSheet onClose={onClose}>
      <div className="px-4 pt-2 pb-3 text-center">
        <div className="flex justify-center mb-3"><UserAvatar user={{ id: '', name, avatar: avatar || undefined }} size={56} /></div>
        <p className="text-base font-black text-gray-900">{name}</p>
        <p className="text-xs font-bold text-emerald-600 flex items-center justify-center gap-1 mt-1">
          <Check className="w-3.5 h-3.5" /> {degree ? `${degree}${degree === 1 ? 'st' : degree === 2 ? 'nd' : 'rd'}-degree connection` : 'Connected'}
        </p>
        {typeof mutualCount === 'number' && mutualCount > 0 && (
          <p className="text-xs text-gray-400 mt-1">{mutualCount} mutual connection{mutualCount === 1 ? '' : 's'}</p>
        )}
      </div>
      {onMessage && <SheetAction icon={MessageCircle} label="Message" onClick={onMessage} />}
      {onToggleFollow && (
        <SheetAction icon={isFollowing ? UserCheck : UserPlus} label={isFollowing ? 'Unfollow' : 'Follow'} onClick={onToggleFollow} />
      )}
      {onRemoveConnection && <SheetAction icon={UserMinus} label="Remove connection" onClick={onRemoveConnection} destructive />}
      <SheetCancel onClick={onClose} />
    </BottomSheet>
  );
}
