import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, ChevronRight, MessageCircle, Users, Shield,
  Bell, Settings, Eye, Mic, Image, Lock, Clock,
  ToggleLeft, ToggleRight, Check, Filter, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { messageSettingsApi } from '../lib/settingsApi';

// ── Toggle component ──────────────────────────────────────────────────────────
function Toggle({ on, onToggle, label, sub }: { on: boolean; onToggle: ()=>void; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-3.5 px-4">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{sub}</p>}
      </div>
      <button onClick={onToggle}
        className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-200 ${on ? 'bg-blue-600' : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200 ${on ? 'left-6' : 'left-0.5'}`}/>
      </button>
    </div>
  );
}

// ── Select option row ─────────────────────────────────────────────────────────
function SelectRow({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v:string)=>void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-blue-600 font-semibold">{value}</span>
          <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${open ? 'rotate-90' : ''}`}/>
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-50 bg-gray-50">
          {options.map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false); toast.success('Saved'); }}
              className="w-full flex items-center justify-between px-6 py-2.5 hover:bg-gray-100 transition-colors">
              <span className="text-sm text-gray-700">{opt}</span>
              {opt === value && <Check className="w-4 h-4 text-blue-600"/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 mt-2">
        <div className="w-6 h-6 flex items-center justify-center text-gray-400">{icon}</div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</p>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50 mx-4">
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function MessageSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Load from DB on mount
  useEffect(() => {
    if (!user?.id) return;
    messageSettingsApi.load(user.id).then(s => {
      if (!s) return;
      setWhoCanMsg(s.who_can_msg ?? 'Everyone');
      setAllowRequests(s.allow_requests ?? true);
      setAllowCollab(s.allow_collab ?? true);
      setAllowClient(s.allow_client ?? true);
      setReadReceipts(s.read_receipts ?? true);
      setTypingIndicator(s.typing_indicator ?? true);
      setActiveStatus(s.active_status ?? 'Followers');
      setLastSeen(s.last_seen ?? 'Followers');
      setAllowMedia(s.allow_media ?? true);
      setAllowFiles(s.allow_files ?? true);
      setHdUpload(s.hd_upload ?? false);
      setAutoDownload(s.auto_download ?? 'Wi-Fi Only');
      setSpamFilter(s.spam_filter ?? true);
      setOffensiveFilter(s.offensive_filter ?? true);
      setLinkProtection(s.link_protection ?? true);
      setMsgNotifs(s.msg_notifs ?? true);
      setCollabNotifs(s.collab_notifs ?? true);
      setNotifPreview(s.notif_preview ?? 'Full Preview');
      setQuietHours(s.quiet_hours ?? false);
      setFontSize(s.font_size ?? 'Medium');
      setAllowVoice(s.allow_voice ?? true);
      setAllowVideo(s.allow_video ?? 'Followers');
      setAutoReply(s.auto_reply ?? '');
    }).catch(() => {});
  }, [user?.id]);

  // State
  const [whoCanMsg,      setWhoCanMsg]      = useState('Everyone');
  const [allowRequests,  setAllowRequests]  = useState(true);
  const [allowCollab,    setAllowCollab]    = useState(true);
  const [allowClient,    setAllowClient]    = useState(true);
  const [readReceipts,   setReadReceipts]   = useState(true);
  const [typingIndicator,setTypingIndicator]= useState(true);
  const [activeStatus,   setActiveStatus]   = useState('Followers');
  const [lastSeen,       setLastSeen]       = useState('Followers');
  const [allowMedia,     setAllowMedia]     = useState(true);
  const [allowFiles,     setAllowFiles]     = useState(true);
  const [hdUpload,       setHdUpload]       = useState(false);
  const [autoDownload,   setAutoDownload]   = useState('Wi-Fi Only');
  const [spamFilter,     setSpamFilter]     = useState(true);
  const [offensiveFilter,setOffensiveFilter]= useState(true);
  const [linkProtection, setLinkProtection] = useState(true);
  const [msgNotifs,      setMsgNotifs]      = useState(true);
  const [collabNotifs,   setCollabNotifs]   = useState(true);
  const [notifPreview,   setNotifPreview]   = useState('Full Preview');
  const [quietHours,     setQuietHours]     = useState(false);
  const [allowVoice,     setAllowVoice]     = useState(true);
  const [allowVideo,     setAllowVideo]     = useState('Followers');
  const [fontSize,       setFontSize]       = useState('Medium');
  const [autoReply,      setAutoReply]      = useState('');
  const [editingAutoReply,setEditingAutoReply] = useState(false);

  const save = async () => {
    if (!user?.id) { toast.error('Please sign in'); return; }
    try {
      await messageSettingsApi.save(user.id, {
        who_can_msg: whoCanMsg,
        allow_requests: allowRequests,
        allow_collab: allowCollab,
        allow_client: allowClient,
        read_receipts: readReceipts,
        typing_indicator: typingIndicator,
        active_status: activeStatus,
        last_seen: lastSeen,
        allow_media: allowMedia,
        allow_files: allowFiles,
        hd_upload: hdUpload,
        auto_download: autoDownload,
        spam_filter: spamFilter,
        offensive_filter: offensiveFilter,
        link_protection: linkProtection,
        msg_notifs: msgNotifs,
        collab_notifs: collabNotifs,
        notif_preview: notifPreview,
        quiet_hours: quietHours,
        font_size: fontSize,
        allow_voice: allowVoice,
        allow_video: allowVideo,
        auto_reply: autoReply,
      });
      toast.success('Message settings saved');
    } catch { toast.error('Failed to save — check connection'); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-700"/>
          </button>
          <h1 className="text-base font-black text-gray-900">Message Settings</h1>
        </div>
        <button onClick={save} className="text-xs font-bold text-blue-600 hover:text-blue-700">Save</button>
      </div>

      <div className="py-4 space-y-2">

        {/* 1. Messaging Permissions */}
        <Section title="1. Messaging Permissions" icon={<Users className="w-4 h-4"/>}>
          <SelectRow
            label="Who Can Message You"
            value={whoCanMsg}
            options={['Everyone','Followers Only','Following Only','Verified Users Only','Collaborators Only','Nobody']}
            onChange={setWhoCanMsg}
          />
          <Toggle on={allowRequests}  onToggle={() => setAllowRequests(!allowRequests)}
            label="Allow Message Requests"
            sub="Non-approved users can start a chat request"/>
          <Toggle on={allowCollab}    onToggle={() => setAllowCollab(!allowCollab)}
            label="Allow Collaboration Requests"
            sub="Project offers, casting calls, editing requests, brand deals"/>
          <Toggle on={allowClient}    onToggle={() => setAllowClient(!allowClient)}
            label="Allow Client Inquiries"
            sub="Business messages and booking inquiries"/>
        </Section>

        {/* 2. Inbox Controls */}
        <Section title="2. Inbox Controls" icon={<Filter className="w-4 h-4"/>}>
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-gray-900 mb-2">Inbox Categories</p>
            <div className="flex flex-wrap gap-1.5">
              {['Primary','Collaborations','Clients','Requests','Spam','Archived'].map(tab => (
                <span key={tab} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-medium">{tab}</span>
              ))}
            </div>
          </div>
          <Toggle on={spamFilter}       onToggle={() => setSpamFilter(!spamFilter)}
            label="Auto Spam Detection"   sub="AI-powered spam and bot filtering"/>
          <Toggle on={offensiveFilter}  onToggle={() => setOffensiveFilter(!offensiveFilter)}
            label="Offensive Message Filter" sub="Hide hate speech, harassment, and explicit content"/>
          <Toggle on={linkProtection}   onToggle={() => setLinkProtection(!linkProtection)}
            label="Link Protection"       sub="Warn about phishing and suspicious links"/>
        </Section>

        {/* 3. Read & Activity */}
        <Section title="3. Read & Activity" icon={<Eye className="w-4 h-4"/>}>
          <Toggle on={readReceipts}    onToggle={() => setReadReceipts(!readReceipts)}
            label="Read Receipts"      sub="Show Seen / Read at 4:22 PM"/>
          <Toggle on={typingIndicator} onToggle={() => setTypingIndicator(!typingIndicator)}
            label="Typing Indicators"  sub="Show when you're typing"/>
          <SelectRow
            label="Show Active Status"
            value={activeStatus}
            options={['Everyone','Followers','Nobody']}
            onChange={setActiveStatus}
          />
          <SelectRow
            label="Last Seen"
            value={lastSeen}
            options={['Everyone','Followers','Nobody']}
            onChange={setLastSeen}
          />
        </Section>

        {/* 4. Media & Files */}
        <Section title="4. Media & File Sharing" icon={<Image className="w-4 h-4"/>}>
          <Toggle on={allowMedia} onToggle={() => setAllowMedia(!allowMedia)}
            label="Allow Photos & Videos" sub="Receive media from other users"/>
          <Toggle on={allowFiles} onToggle={() => setAllowFiles(!allowFiles)}
            label="Allow File Uploads"   sub="Scripts, PDFs, LUTs, ZIPs, project files"/>
          <Toggle on={hdUpload}   onToggle={() => setHdUpload(!hdUpload)}
            label="Send HD Media"        sub="Higher quality, larger file size"/>
          <SelectRow
            label="Auto Download Media"
            value={autoDownload}
            options={['Wi-Fi Only','Always','Never']}
            onChange={setAutoDownload}
          />
        </Section>

        {/* 5. Collaboration */}
        <Section title="5. Collaboration Features" icon={<Zap className="w-4 h-4"/>}>
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-gray-900 mb-1">Project Invites</p>
            <p className="text-xs text-gray-400 leading-relaxed">Allow crew invites, casting requests, editing requests, and booking inquiries directly via messages.</p>
          </div>
          <button onClick={() => toast.info('Collaboration threads coming soon')}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50">
            <div>
              <p className="text-sm font-semibold text-gray-900 text-left">Collaboration Threads</p>
              <p className="text-xs text-gray-400">Team project chats — coming soon</p>
            </div>
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">SOON</span>
          </button>
        </Section>

        {/* 6. Safety */}
        <Section title="6. Safety & Moderation" icon={<Shield className="w-4 h-4"/>}>
          <button onClick={() => navigate('/inbox?tab=blocked')}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
            <p className="text-sm font-semibold text-gray-900">Blocked Users</p>
            <ChevronRight className="w-4 h-4 text-gray-300"/>
          </button>
          <button onClick={() => toast.info('Restricted users coming soon')}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">Restricted Users</p>
              <p className="text-xs text-gray-400">Like Instagram — hidden messages without blocking</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300"/>
          </button>
          <button onClick={() => toast.info('Report center coming soon')}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
            <p className="text-sm font-semibold text-gray-900">Report & Safety Center</p>
            <ChevronRight className="w-4 h-4 text-gray-300"/>
          </button>
        </Section>

        {/* 7. Notifications */}
        <Section title="7. Notification Controls" icon={<Bell className="w-4 h-4"/>}>
          <Toggle on={msgNotifs}   onToggle={() => setMsgNotifs(!msgNotifs)}
            label="Message Notifications" sub="All messages, requests, mentions"/>
          <Toggle on={collabNotifs} onToggle={() => setCollabNotifs(!collabNotifs)}
            label="Collaboration Alerts"  sub="Project invites, crew requests"/>
          <SelectRow
            label="Notification Preview"
            value={notifPreview}
            options={['Full Preview','Name Only','Hidden']}
            onChange={setNotifPreview}
          />
          <Toggle on={quietHours} onToggle={() => setQuietHours(!quietHours)}
            label="Quiet Hours"     sub="No notifications 10 PM – 8 AM"/>
        </Section>

        {/* 8. Chat Experience */}
        <Section title="8. Chat Experience" icon={<Settings className="w-4 h-4"/>}>
          <SelectRow
            label="Font Size"
            value={fontSize}
            options={['Small','Medium','Large']}
            onChange={setFontSize}
          />
          <button onClick={() => toast.info('Chat wallpaper coming soon')}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
            <p className="text-sm font-semibold text-gray-900">Chat Wallpaper</p>
            <ChevronRight className="w-4 h-4 text-gray-300"/>
          </button>
        </Section>

        {/* 9. Advanced Creator */}
        <Section title="9. Advanced Creator Features" icon={<Zap className="w-4 h-4"/>}>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-900">Auto Reply Message</p>
              <button onClick={() => setEditingAutoReply(!editingAutoReply)}
                className="text-xs text-blue-600 font-semibold">{editingAutoReply ? 'Done' : 'Edit'}</button>
            </div>
            {editingAutoReply ? (
              <textarea value={autoReply} onChange={e => setAutoReply(e.target.value)}
                rows={3} maxLength={200} placeholder="Currently filming. I'll reply soon."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none"/>
            ) : (
              <p className="text-xs text-gray-400 italic">{autoReply || 'No auto reply set'}</p>
            )}
          </div>
          <button onClick={() => toast.info('Business hours coming soon')}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">Business Hours</p>
              <p className="text-xs text-gray-400">Available Mon–Fri, 10AM–6PM</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300"/>
          </button>
          <button onClick={() => toast.info('Saved replies coming soon')}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">Saved Replies</p>
              <p className="text-xs text-gray-400">Templates for pricing, booking, collaboration</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300"/>
          </button>
        </Section>

        {/* 10. Privacy */}
        <Section title="10. Privacy Features" icon={<Lock className="w-4 h-4"/>}>
          <button onClick={() => toast.info('Disappearing messages coming soon')}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50">
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">Disappearing Messages</p>
              <p className="text-xs text-gray-400">24h, 7d, or custom duration</p>
            </div>
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">SOON</span>
          </button>
          <button onClick={() => toast.info('Conversation lock coming soon')}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50">
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">Conversation Lock</p>
              <p className="text-xs text-gray-400">Face ID, PIN, or fingerprint protection</p>
            </div>
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">SOON</span>
          </button>
        </Section>

        {/* 11. Voice & Video */}
        <Section title="11. Voice & Video" icon={<Mic className="w-4 h-4"/>}>
          <Toggle on={allowVoice} onToggle={() => setAllowVoice(!allowVoice)}
            label="Allow Voice Messages"/>
          <SelectRow
            label="Video Calls"
            value={allowVideo}
            options={['Everyone','Followers','Verified Only','Nobody']}
            onChange={setAllowVideo}
          />
          <button onClick={() => toast.info('Screen sharing coming soon')}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50">
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">Screen Sharing</p>
              <p className="text-xs text-gray-400">Editing reviews, collaboration, creative feedback</p>
            </div>
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">SOON</span>
          </button>
        </Section>

        {/* Save */}
        <div className="px-4 pt-4 pb-24">
          <button onClick={save}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl text-sm transition-colors shadow-md">
            Save Message Settings
          </button>
        </div>
      </div>
    </div>
  );
}