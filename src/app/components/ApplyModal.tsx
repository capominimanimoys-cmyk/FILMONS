import { useState } from 'react';
import { useNavigate } from 'react-router';
import { X, Send, CheckCircle, Briefcase } from 'lucide-react';
import { Listing, User } from '../types';
import { chatApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { boostApi } from '../lib/boostApi';

interface ApplyModalProps {
  listing: Listing;
  host: User;
  onClose: () => void;
}

// Applying to an Opportunity listing is an intentional action, separate
// from swipe-right (which only saves) and from the rental-request flow
// (no payment, no rental agreement — this never touches Checkout).
export function ApplyModal({ listing, host, onClose }: ApplyModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleApply = async () => {
    if (!user) { navigate('/login'); return; }
    if (user.id === host.id) { toast.error("You can't apply to your own listing"); return; }

    setSending(true);
    try {
      const { error: insertError } = await supabase.from('opportunity_applications').insert({
        listing_id: listing.id, applicant_id: user.id, message: message.trim() || null,
      });
      if (insertError) throw new Error(insertError.message);

      const conv = await chatApi.getOrCreateDB(user.id, host.id);
      const text = `📋 New application for "${listing.title}"${message.trim() ? `:\n\n${message.trim()}` : ''}`;
      const msg = chatApi.buildTextMessage(conv.id, user.id, user.name, user.avatar, text);
      await chatApi.sendMessageToDB(conv.id, msg, conv.participantIds, conv.isRequest ?? false, conv.requestedBy ?? null);

      await supabase.from('notifications').insert({
        user_id: host.id, actor_id: user.id, actor_name: user.name,
        type: 'application_received', title: `${user.name} applied to "${listing.title}"`,
        conversation_id: conv.id, is_read: false,
      }).then(undefined, () => {});

      if (listing.boosted) {
        boostApi.logEvent(listing.id, 'application', 'boosted', undefined, user.id);
      }

      setSent(true);
    } catch (e: any) {
      toast.error(e?.message || 'Could not submit your application');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-[22px] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-indigo-600" /> Apply</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {sent ? (
          <div className="px-5 pb-8 pt-4 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-green-600" />
            </div>
            <div>
              <p className="text-base font-black text-gray-900">Application sent</p>
              <p className="text-sm text-gray-500 mt-1">{host.name} will follow up with you directly in Inbox.</p>
            </div>
            <button onClick={onClose} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm mt-2">Done</button>
          </div>
        ) : (
          <div className="px-5 pb-5 space-y-3">
            <p className="text-sm text-gray-500">Applying to <span className="font-bold text-gray-900">{listing.title}</span> — posted by {host.name}.</p>
            <textarea
              value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Add a note about your experience or availability (optional)"
              rows={4}
              className="w-full bg-gray-50 rounded-2xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
            />
            <button
              onClick={handleApply} disabled={sending}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {sending ? 'Sending…' : <><Send className="w-4 h-4" /> Send Application</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
