import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Bell, Mail, Users, ShoppingBag, BarChart2, Briefcase, Volume2, Moon, ChevronRight } from 'lucide-react';
import { useT } from '../lib/i18n';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { notificationSettingsApi } from '../lib/settingsApi';
import { useEffect } from 'react';

function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: () => void; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-3 px-4">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{sub}</p>}
      </div>
      <button onClick={onChange}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${on ? 'bg-blue-600' : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200 ${on ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`}/>
      </button>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="w-5 h-5 text-gray-400 flex items-center justify-center">{icon}</div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</p>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
        {children}
      </div>
    </div>
  );
}

function SelectRow({ label, value, options, onChange, sub }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; sub?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <div className="text-left">
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-blue-600 font-semibold">{value}</span>
          <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${open ? 'rotate-90' : ''}`}/>
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-50 bg-gray-50">
          {options.map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false); toast.success('Saved'); }}
              className="w-full flex items-center justify-between px-6 py-2.5 hover:bg-gray-100 text-sm text-gray-700">
              {opt}
              {opt === value && <span className="text-blue-600 font-bold text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotificationSettings() {
  const navigate = useNavigate();
  const t = useT();
  const { user } = useAuth();

  // Load from DB on mount
  useEffect(() => {
    if (!user?.id) return;
    notificationSettingsApi.load(user.id).then(s => {
      if (!s) return;
      setDms(s.notif_dms ?? true);
      setMsgRequests(s.notif_msg_requests ?? true);
      setCollabReqs(s.notif_collab_reqs ?? true);
      setMentions(s.notif_mentions ?? true);
      setReplies(s.notif_replies ?? true);
      setReactions(s.notif_reactions ?? false);
      setNewFollowers(s.notif_new_followers ?? true);
      setComments(s.notif_comments ?? true);
      setShares(s.notif_shares ?? false);
      setSaves(s.notif_saves ?? false);
      setBookingReqs(s.notif_booking_reqs ?? true);
      setCastingCalls(s.notif_casting_calls ?? true);
      setProjectInvites(s.notif_project_invites ?? true);
      setFileRequests(s.notif_file_requests ?? false);
      setNewOrders(s.notif_new_orders ?? true);
      setPayments(s.notif_payments ?? true);
      setRentalReqs(s.notif_rental_reqs ?? true);
      setPortfolioViews(s.notif_portfolio_views ?? true);
      setProjectSaves(s.notif_project_saves ?? true);
      setContactRequests(s.notif_contact_requests ?? true);
      setReelTrending(s.notif_reel_trending ?? true);
      setMilestones(s.notif_milestones ?? true);
      setOpportunities(s.notif_opportunities ?? true);
      setEmailCollab(s.email_collab ?? true);
      setWeeklyAnalytics(s.email_analytics ?? true);
      setMonthlyPortfolio(s.email_portfolio ?? false);
      setEmailSecurity(s.email_security ?? true);
      setProductUpdates(s.email_product ?? false);
      setCreatorTips(s.email_tips ?? false);
      setEmailFreq(s.email_frequency ?? 'Daily');
      setSound(s.notif_sound ?? 'Default');
      setVibration(s.notif_vibration ?? true);
      setDesktop(s.notif_desktop ?? true);
      setQuietHours(s.quiet_hours_enabled ?? false);
      setQuietStart(s.quiet_start ?? '11:00 PM');
      setQuietEnd(s.quiet_end ?? '8:00 AM');
      setPreview(s.notif_preview ?? 'Full Content');
    }).catch(() => {});
  }, [user?.id]);

  // Quick mute
  const [mutedUntil, setMutedUntil] = useState<number | null>(null);
  const quickMute = (ms: number | null) => {
    setMutedUntil(ms ? Date.now() + ms : null);
    toast.success(ms ? 'Notifications muted' : 'Notifications unmuted');
  };
  const isMuted = mutedUntil !== null && Date.now() < mutedUntil;

  // Push — Messaging
  const [dms,          setDms]          = useState(true);
  const [msgRequests,  setMsgRequests]  = useState(true);
  const [msgPreviews,  setMsgPreviews]  = useState(true);
  const [collabReqs,   setCollabReqs]   = useState(true);
  const [mentions,     setMentions]     = useState(true);
  const [replies,      setReplies]      = useState(true);
  const [reactions,    setReactions]    = useState(false);

  // Push — Social
  const [newFollowers,setNewFollowers]= useState(true);
  const [comments,    setComments]    = useState(true);
  const [shares,      setShares]      = useState(false);
  const [saves,       setSaves]       = useState(false);

  // Push — Collaboration
  const [bookingReqs, setBookingReqs] = useState(true);
  const [castingCalls,setCastingCalls]= useState(true);
  const [projectInvites,setProjectInvites] = useState(true);
  const [fileRequests,setFileRequests]= useState(false);

  // Push — Marketplace
  const [newOrders,   setNewOrders]   = useState(true);
  const [payments,    setPayments]    = useState(true);
  const [rentalReqs,  setRentalReqs]  = useState(true);

  // Email
  const [emailCollab, setEmailCollab] = useState(true);
  const [weeklyAnalytics, setWeeklyAnalytics] = useState(true);
  const [monthlyPortfolio, setMonthlyPortfolio] = useState(false);
  const [emailSecurity, setEmailSecurity] = useState(true);
  const [productUpdates, setProductUpdates] = useState(false);
  const [creatorTips, setCreatorTips] = useState(false);
  const [emailFreq, setEmailFreq] = useState('Daily');

  // Portfolio
  const [portfolioViews, setPortfolioViews] = useState(true);
  const [projectSaves,   setProjectSaves]   = useState(true);
  const [contactRequests,setContactRequests]= useState(true);
  const [portfolioPublic,setPortfolioPublic]= useState(true);

  // Analytics
  const [reelTrending, setReelTrending] = useState(true);
  const [milestones,   setMilestones]   = useState(true);
  const [opportunities,setOpportunities]= useState(true);

  // Sound & Quiet
  const [sound,      setSound]      = useState('Default');
  const [vibration,  setVibration]  = useState(true);
  const [desktop,    setDesktop]    = useState(true);
  const [quietHours, setQuietHours] = useState(false);
  const [quietStart, setQuietStart] = useState('11:00 PM');
  const [quietEnd,   setQuietEnd]   = useState('8:00 AM');

  // Preview
  const [preview, setPreview] = useState('Full Content');

  const save = async () => {
    if (!user?.id) { toast.error('Please sign in'); return; }
    try {
      await notificationSettingsApi.save(user.id, {
        notif_dms: dms, notif_msg_requests: msgRequests, notif_collab_reqs: collabReqs,
        notif_mentions: mentions, notif_replies: replies, notif_reactions: reactions,
        notif_new_followers: newFollowers, notif_comments: comments,
        notif_shares: shares, notif_saves: saves,
        notif_booking_reqs: bookingReqs, notif_casting_calls: castingCalls,
        notif_project_invites: projectInvites, notif_file_requests: fileRequests,
        notif_new_orders: newOrders, notif_payments: payments, notif_rental_reqs: rentalReqs,
        notif_portfolio_views: portfolioViews, notif_project_saves: projectSaves,
        notif_contact_requests: contactRequests,
        notif_reel_trending: reelTrending, notif_milestones: milestones,
        notif_opportunities: opportunities,
        email_collab: emailCollab, email_analytics: weeklyAnalytics,
        email_portfolio: monthlyPortfolio, email_security: emailSecurity,
        email_product: productUpdates, email_tips: creatorTips,
        email_frequency: emailFreq, notif_sound: sound, notif_vibration: vibration,
        notif_desktop: desktop, quiet_hours_enabled: quietHours,
        quiet_start: quietStart, quiet_end: quietEnd, notif_preview: preview,
      });
      toast.success('Notification settings saved');
    } catch { toast.error('Failed to save — check your connection'); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-700"/>
          </button>
          <h1 className="text-base font-black text-gray-900">{t('notif.title')}</h1>
        </div>
        <button onClick={save} className="text-xs font-bold text-blue-600">Save</button>
      </div>

      <div className="py-4 space-y-5">

        {/* Quick Mute */}
        <div className="mx-4">
          <div className="flex items-center gap-2 mb-2 px-1">
            <Moon className="w-4 h-4 text-gray-400"/>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mute Notifications</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
            {isMuted && (
              <div className="flex items-center justify-between px-2 py-2 mb-2 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-xs font-semibold text-amber-700">Notifications muted</p>
                <button onClick={() => quickMute(null)} className="text-xs font-bold text-amber-700 underline">Unmute</button>
              </div>
            )}
            <div className="grid grid-cols-4 gap-2">
              {([
                { label: '1 Hour',    ms: 60 * 60 * 1000 },
                { label: '8 Hours',   ms: 8 * 60 * 60 * 1000 },
                { label: '24 Hours',  ms: 24 * 60 * 60 * 1000 },
                { label: 'Until off', ms: 365 * 24 * 60 * 60 * 1000 },
              ] as const).map(opt => (
                <button
                  key={opt.label}
                  onClick={() => quickMute(opt.ms)}
                  className="flex flex-col items-center justify-center py-3 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-colors active:scale-95 text-center">
                  <span className="text-[11px] font-bold text-gray-700 leading-tight">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 1. Push — Messaging */}
        <Section title={t('notif.messages')} icon={<Bell className="w-4 h-4"/>}>
          <Toggle on={dms}          onChange={() => setDms(!dms)}                 label="Direct Messages"          sub="Someone sends you a DM"/>
          <Toggle on={msgRequests}  onChange={() => setMsgRequests(!msgRequests)} label="Message Requests"         sub="Non-followers trying to reach you"/>
          <Toggle on={msgPreviews}  onChange={() => setMsgPreviews(!msgPreviews)} label="Message Previews"         sub="Show message content in notifications"/>
          <Toggle on={collabReqs}   onChange={() => setCollabReqs(!collabReqs)}   label="Collaboration Requests"   sub="Project offers, casting calls, brand deals"/>
          <Toggle on={mentions}     onChange={() => setMentions(!mentions)}        label="Mentions"                 sub="Someone tags you in a post"/>
          <Toggle on={replies}      onChange={() => setReplies(!replies)}          label="Replies"                  sub="Replies to your posts"/>
          <Toggle on={reactions}    onChange={() => setReactions(!reactions)}      label="Reactions"                sub="Reactions to your messages"/>
        </Section>

        {/* 2. Push — Social */}
        <Section title={t('notif.social')} icon={<Users className="w-4 h-4"/>}>
          <Toggle on={newFollowers} onChange={() => setNewFollowers(!newFollowers)} label="New Followers"         sub="Someone followed you"/>
          <Toggle on={comments}     onChange={() => setComments(!comments)}          label="Comments"             sub="Comments on your posts"/>
          <Toggle on={shares}       onChange={() => setShares(!shares)}              label="Shares"               sub="Someone shared your content"/>
          <Toggle on={saves}        onChange={() => setSaves(!saves)}                label="Saves"                sub="Someone saved your post"/>
        </Section>

        {/* 3. Push — Collaboration */}
        <Section title={t('notif.collab')} icon={<Briefcase className="w-4 h-4"/>}>
          <Toggle on={bookingReqs}    onChange={() => setBookingReqs(!bookingReqs)}       label="Booking Requests"      sub="Service and gear booking inquiries"/>
          <Toggle on={castingCalls}   onChange={() => setCastingCalls(!castingCalls)}     label="Casting Calls"         sub="Acting and crew opportunities"/>
          <Toggle on={projectInvites} onChange={() => setProjectInvites(!projectInvites)} label="Project Invitations"   sub="Crew invites, editing requests"/>
          <Toggle on={fileRequests}   onChange={() => setFileRequests(!fileRequests)}     label="File & Contract Requests" sub="Document and file sharing requests"/>
        </Section>

        {/* 4. Push — Marketplace */}
        <Section title={t('notif.marketplace')} icon={<ShoppingBag className="w-4 h-4"/>}>
          <Toggle on={newOrders}   onChange={() => setNewOrders(!newOrders)}     label="New Inquiries"        sub="Someone inquired about your listing"/>
          <Toggle on={bookingReqs} onChange={() => setBookingReqs(!bookingReqs)} label="Booking Requests"     sub="New booking requests awaiting approval"/>
          <Toggle on={payments}    onChange={() => setPayments(!payments)}        label="Booking Approved"     sub="A booking you requested was approved"/>
          <Toggle on={rentalReqs}  onChange={() => setRentalReqs(!rentalReqs)}   label="Rental Requests"      sub="Gear rental inquiries"/>
          <Toggle on={castingCalls} onChange={() => setCastingCalls(!castingCalls)} label="Listing Activity"  sub="Saves, views, and shares on your listings"/>
        </Section>

        {/* 5. Portfolio */}
        <Section title={t('notif.portfolio')} icon={<BarChart2 className="w-4 h-4"/>}>
          <Toggle on={portfolioViews}  onChange={() => setPortfolioViews(!portfolioViews)}   label="Portfolio Views"      sub="New visits to your portfolio"/>
          <Toggle on={projectSaves}    onChange={() => setProjectSaves(!projectSaves)}        label="Project Saves"        sub="Someone saved your project"/>
          <Toggle on={contactRequests} onChange={() => setContactRequests(!contactRequests)}  label="Contact Requests"     sub="Booking clicks and contact forms"/>
          <Toggle on={newFollowers}    onChange={() => setNewFollowers(!newFollowers)}         label="Profile Visits"       sub="When someone views your profile"/>
          <Toggle on={portfolioPublic} onChange={() => setPortfolioPublic(!portfolioPublic)}  label="Visibility Changes"   sub="Your portfolio went public / private"/>
        </Section>

        {/* 6. Analytics */}
        <Section title={t('notif.analytics')} icon={<BarChart2 className="w-4 h-4"/>}>
          <Toggle on={reelTrending} onChange={() => setReelTrending(!reelTrending)} label="Reel Trending"              sub="Your reel is gaining traction"/>
          <Toggle on={milestones}   onChange={() => setMilestones(!milestones)}     label="Audience Milestones"         sub="New follower milestones, view records"/>
          <Toggle on={opportunities}onChange={() => setOpportunities(!opportunities)} label="Opportunity Alerts"        sub="Nearby creators, brand match, festivals"/>
        </Section>

        {/* 7. Email */}
        <Section title={t('notif.email')} icon={<Mail className="w-4 h-4"/>}>
          <Toggle on={emailCollab}        onChange={() => setEmailCollab(!emailCollab)}               label="Collaboration Opportunities"/>
          <Toggle on={weeklyAnalytics}    onChange={() => setWeeklyAnalytics(!weeklyAnalytics)}       label="Weekly Analytics Summary"/>
          <Toggle on={monthlyPortfolio}   onChange={() => setMonthlyPortfolio(!monthlyPortfolio)}     label="Monthly Portfolio Summary"/>
          <Toggle on={emailSecurity}      onChange={() => setEmailSecurity(!emailSecurity)}           label="Security Alerts"           sub="Always recommended"/>
          <Toggle on={productUpdates}     onChange={() => setProductUpdates(!productUpdates)}         label="Product Updates"/>
          <Toggle on={creatorTips}        onChange={() => setCreatorTips(!creatorTips)}               label="Creator Tips & Guides"/>
          <SelectRow
            label="Email Frequency"
            value={emailFreq}
            options={['Instant','Daily','Weekly','Monthly','Never']}
            onChange={setEmailFreq}
          />
        </Section>

        {/* 8. Sound & Vibration */}
        <Section title={t('notif.sound')} icon={<Volume2 className="w-4 h-4"/>}>
          <SelectRow
            label="Notification Sound"
            value={sound}
            options={['Default','Minimal','Cinematic','Silent']}
            onChange={setSound}
          />
          <Toggle on={vibration} onChange={() => setVibration(!vibration)} label="Vibration"/>
          <Toggle on={desktop}   onChange={() => setDesktop(!desktop)}     label="Desktop Notifications" sub="Show alerts on desktop/browser"/>
        </Section>

        {/* 9. Quiet Mode */}
        <Section title={t('notif.quiet')} icon={<Moon className="w-4 h-4"/>}>
          <Toggle on={quietHours} onChange={() => setQuietHours(!quietHours)}
            label="Quiet Hours" sub="Mute all non-urgent notifications during set times"/>
          {quietHours && (
            <div className="px-4 pb-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-1 font-medium">Start</p>
                <select value={quietStart} onChange={e => setQuietStart(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 bg-white">
                  {['9:00 PM','10:00 PM','11:00 PM','12:00 AM'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1 font-medium">End</p>
                <select value={quietEnd} onChange={e => setQuietEnd(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 bg-white">
                  {['6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
          )}
          <SelectRow
            label="Notification Preview"
            value={preview}
            options={['Full Content','Sender Only','Hidden']}
            onChange={setPreview}
            sub={preview === 'Hidden' ? 'No preview shown on lock screen' : undefined}
          />
        </Section>

        {/* Save */}
        <div className="px-4 pb-24">
          <button onClick={save}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl text-sm transition-colors shadow-md">
            {t('notif.save')}
          </button>
        </div>
      </div>
    </div>
  );
}