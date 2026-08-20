import { useState } from 'react';
import { useNavigate } from 'react-router';
import { X, Send, CheckCircle, Briefcase, User as UserIcon } from 'lucide-react';
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
// (no payment, no rental agreement — this never touches Checkout). Which
// fields render here is entirely driven by the poster's own
// listing.opportunity.applicationConfig from the Create Opportunity wizard.
export function ApplyModal({ listing, host, onClose }: ApplyModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cfg = listing.opportunity?.applicationConfig;
  const requireMessage = cfg?.requireMessage ?? true;
  const requirePortfolio = cfg?.requirePortfolio ?? false;
  const requireResume = cfg?.requireResume ?? false;
  const requireDemoReel = cfg?.requireDemoReel ?? false;
  const requireAvailability = cfg?.requireAvailability ?? false;
  const requireExpectedRate = cfg?.requireExpectedRate ?? false;
  const customQuestions = cfg?.customQuestions || [];

  const [message, setMessage] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [demoReelUrl, setDemoReelUrl] = useState('');
  const [availability, setAvailability] = useState('');
  const [expectedRate, setExpectedRate] = useState('');
  const [answers, setAnswers] = useState<string[]>(customQuestions.map(() => ''));
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleApply = async () => {
    if (!user) { navigate('/login'); return; }
    if (user.id === host.id) { toast.error("You can't apply to your own listing"); return; }
    if (requirePortfolio && !portfolioUrl.trim()) { toast.error('A portfolio link is required'); return; }
    if (requireMessage && !message.trim()) { toast.error('A short message is required'); return; }

    setSending(true);
    try {
      const customAnswers = Object.fromEntries(customQuestions.map((q, i) => [q, answers[i] || '']).filter(([, a]) => a));

      const { error: insertError } = await supabase.from('opportunity_applications').insert({
        listing_id: listing.id, applicant_id: user.id, message: message.trim() || null,
        portfolio_url: portfolioUrl.trim() || null, resume_url: resumeUrl.trim() || null,
        demo_reel_url: demoReelUrl.trim() || null, availability: availability.trim() || null,
        expected_rate: expectedRate.trim() || null, custom_answers: customAnswers,
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
      <div className="bg-white w-full md:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl md:rounded-[22px] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2 sticky top-0 bg-white">
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

            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5">
              <UserIcon className="w-3.5 h-3.5" /> Your Filmons Profile will be shared with your application
            </div>

            {requirePortfolio && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Portfolio {requirePortfolio && <span className="text-red-400">*</span>}</label>
                <input value={portfolioUrl} onChange={e => setPortfolioUrl(e.target.value)} placeholder="Link to your portfolio"
                  className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
            )}

            {(requireMessage || true) && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Message {requireMessage && <span className="text-red-400">*</span>}</label>
                <textarea
                  value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Tell them about your experience or availability"
                  rows={4}
                  className="w-full bg-gray-50 rounded-2xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                />
              </div>
            )}

            {requireResume && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Resume (link)</label>
                <input value={resumeUrl} onChange={e => setResumeUrl(e.target.value)} placeholder="Link to your resume"
                  className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
            )}
            {requireDemoReel && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Demo Reel / Work Sample (link)</label>
                <input value={demoReelUrl} onChange={e => setDemoReelUrl(e.target.value)} placeholder="Link to a video or sample"
                  className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
            )}
            {requireAvailability && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Availability</label>
                <input value={availability} onChange={e => setAvailability(e.target.value)} placeholder="e.g. Weekdays after 5pm"
                  className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
            )}
            {requireExpectedRate && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Expected Rate</label>
                <input value={expectedRate} onChange={e => setExpectedRate(e.target.value)} placeholder="e.g. $300/day"
                  className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
            )}

            {customQuestions.map((q, i) => (
              <div key={i}>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">{q}</label>
                <textarea rows={2} value={answers[i] || ''} onChange={e => setAnswers(a => a.map((x, j) => j === i ? e.target.value : x))}
                  className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
              </div>
            ))}

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
