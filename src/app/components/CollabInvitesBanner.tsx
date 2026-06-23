/**
 * Filmons — CollabInvitesBanner
 * Shows pending collaboration invites as a dismissible banner.
 * src/app/components/CollabInvitesBanner.tsx
 */
import { useState, useEffect } from 'react';
import { Users, Check, X } from 'lucide-react';
import { getPendingCollabs, acceptCollaboration, declineCollaboration, type CollabInvite } from '../lib/collabApi';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

export function CollabInvitesBanner() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<CollabInvite[]>([]);
  const [acting,  setActing]  = useState<string|null>(null);

  useEffect(() => {
    if (!user?.id) return;
    getPendingCollabs(user.id).then(setInvites);
  }, [user?.id]);

  if (!invites.length) return null;

  const handle = async (id: string, accept: boolean) => {
    setActing(id);
    try {
      if (accept) {
        await acceptCollaboration(id);
        toast.success('🤝 Collaboration accepted! Post now appears on your profile.');
      } else {
        await declineCollaboration(id);
        toast.info('Collaboration declined');
      }
      setInvites(prev => prev.filter(i => i.id !== id));
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="mx-4 mb-3 space-y-2">
      {invites.map(invite => (
        <div key={invite.id}
          className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden"
          style={{animation:'fadeIn 0.3s ease'}}>
          <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
          <div className="flex items-start gap-3 p-3">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden shrink-0">
              {invite.inviter_avatar
                ? <img src={invite.inviter_avatar} className="w-full h-full object-cover"/>
                : <div className="w-full h-full flex items-center justify-center font-black text-gray-400">
                    {(invite.inviter_name || '?')[0].toUpperCase()}
                  </div>}
            </div>
            {/* Text */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-500 shrink-0"/>
                <p className="text-xs font-black text-gray-900">Collaboration Invite</p>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                <span className="font-bold text-gray-800">{invite.inviter_name}</span>
                {' '}invited you to collaborate on a post.
                {invite.post_caption && (
                  <span className="text-gray-400"> "{invite.post_caption.slice(0, 40)}{invite.post_caption.length > 40 ? '…' : ''}"</span>
                )}
              </p>
              {/* Actions */}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handle(invite.id, true)}
                  disabled={acting === invite.id}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black text-white disabled:opacity-50 transition-all active:scale-95"
                  style={{background:'#51A2FF'}}>
                  {acting === invite.id
                    ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                    : <><Check className="w-3 h-3"/> Accept</>}
                </button>
                <button
                  onClick={() => handle(invite.id, false)}
                  disabled={acting === invite.id}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-500 bg-gray-100 disabled:opacity-50 transition-all active:scale-95">
                  <X className="w-3 h-3"/> Decline
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}