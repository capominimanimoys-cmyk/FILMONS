import { useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Search, ChevronRight, ChevronDown, ExternalLink,
  MessageCircle, Mail, FileText, AlertTriangle, Shield,
  CheckCircle, Clock, Package, CreditCard, Lock, User,
  Briefcase, Film, BookOpen, Zap, LifeBuoy, Activity,
  X, Plus, Send, HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id:'started',      icon: <Zap className="w-5 h-5"/>,          label: 'Getting Started',    color: 'bg-blue-50 text-blue-600',    desc: 'Setup your account and profile' },
  { id:'account',      icon: <User className="w-5 h-5"/>,          label: 'Account & Profile',  color: 'bg-purple-50 text-purple-600', desc: 'Name, email, verification, avatar' },
  { id:'portfolio',    icon: <Film className="w-5 h-5"/>,          label: 'Portfolio',           color: 'bg-pink-50 text-pink-600',    desc: 'Create, edit, and share your work' },
  { id:'messaging',    icon: <MessageCircle className="w-5 h-5"/>, label: 'Messaging',           color: 'bg-green-50 text-green-600',  desc: 'DMs, collaboration requests' },
  { id:'marketplace',  icon: <Package className="w-5 h-5"/>,       label: 'Marketplace',         color: 'bg-orange-50 text-orange-600',desc: 'Listings, rentals, services' },
  { id:'payments',     icon: <CreditCard className="w-5 h-5"/>,    label: 'Payments & Wallet',   color: 'bg-emerald-50 text-emerald-600', desc: 'FP, payouts, transactions' },
  { id:'verification', icon: <CheckCircle className="w-5 h-5"/>,   label: 'Verification',        color: 'bg-teal-50 text-teal-600',    desc: 'ID, professional, business badges' },
  { id:'privacy',      icon: <Lock className="w-5 h-5"/>,          label: 'Privacy & Security',  color: 'bg-gray-50 text-gray-600',    desc: '2FA, devices, privacy controls' },
  { id:'trust',        icon: <Shield className="w-5 h-5"/>,        label: 'Trust & Safety',      color: 'bg-red-50 text-red-600',      desc: 'Reporting, scam prevention' },
  { id:'troubleshoot', icon: <AlertTriangle className="w-5 h-5"/>, label: 'Troubleshooting',     color: 'bg-yellow-50 text-yellow-600',desc: 'Bugs, errors, account recovery' },
];

const FAQS: Record<string, { q: string; a: string }[]> = {
  started: [
    { q: 'How do I create my Filmons profile?', a: 'After signing up, go to your Profile page and tap "Edit profile". Fill in your bio, primary role, skills, and upload a profile photo. The more complete your profile, the more collaboration opportunities you\'ll receive.' },
    { q: 'What is a Creator+ account?', a: 'Creator+ is our verified professional tier. It unlocks higher rental limits, portfolio priority, and a Creator+ badge on your profile. You can apply through Settings → Verification.' },
    { q: 'How do I upload my first reel?', a: 'Go to your Profile → About section → scroll to Portfolio. Tap "Create Portfolio", choose your theme, and upload your reel. Your portfolio gets a public URL at filmons.com/@username once set to Public.' },
    { q: 'Can I use Filmons if I\'m a beginner?', a: 'Absolutely. Filmons is for all experience levels. Start by completing your profile, exploring the marketplace, and connecting with other creators in your area.' },
  ],
  account: [
    { q: 'How do I change my email or phone?', a: 'Go to Profile → About → Personal Details. Tap "Change" next to your email or phone. A verification code will be sent to your current contact before changes are applied.' },
    { q: 'How do I enable Two-Factor Authentication?', a: 'Go to Settings → Security → Two-Factor Authentication. Choose SMS, Email, or Authenticator App. We recommend an Authenticator App for the highest security.' },
    { q: 'How do I view my login activity?', a: 'Settings → Linked Devices → Login Activity shows all recent logins with device, location, and timestamp. You can log out individual sessions or all other devices from there.' },
    { q: 'What if I forgot my password?', a: 'On the login screen, tap "Forgot password?". A reset link will be sent to your registered email. If you\'ve lost access to your email, contact support.' },
  ],
  portfolio: [
    { q: 'How do I make my portfolio public?', a: 'Go to Settings → Portfolio → Visibility, and select "Public". Your portfolio will immediately be accessible at filmons.com/@username and shareable via QR code and link.' },
    { q: 'What media types can I upload?', a: 'Filmons supports MP4, MOV, JPG, PNG, PDF, and ZIP. Video files up to 2GB. Images up to 50MB. For large reels, compress to 1080p or 4K H.264 for best quality.' },
    { q: 'How do I build a strong portfolio?', a: 'Feature your 3-5 best projects. Include a 60-90 second reel on the hero section. Add a clear services section, your gear list, and client testimonials. Portfolios with reels get 4x more views.' },
  ],
  messaging: [
    { q: 'Why can\'t some users message me?', a: 'Your messaging permissions control who can reach you. Check Settings → Messages → Who Can Message You. If set to "Followers Only", users must follow you first.' },
    { q: 'What are Collaboration Requests?', a: 'Collaboration Requests are separate from DMs. They appear in your Inbox under the Collaborations tab. You can accept, decline, or negotiate project terms directly in the thread.' },
    { q: 'How do I set an auto-reply?', a: 'Settings → Messages → Advanced Creator Features → Auto Reply. Add a message like "Currently on set — I\'ll reply within 24h" and it sends automatically to new conversations.' },
  ],
  marketplace: [
    { q: 'How do I create a gear listing?', a: 'Tap the + button in the Marketplace, select "Gear Rental" or "Sale". Add photos, description, pricing, availability, and your location. Verified users\' listings get priority placement.' },
    { q: 'How does gear pickup work?', a: 'After a booking is confirmed, the renter and owner coordinate pickup directly through the in-app chat. Always confirm the handover with a signed receipt and photos of the gear condition.' },
    { q: 'What if the gear is returned damaged?', a: 'Document damage with photos immediately. Report through the conversation → "Report Issue". Our team reviews all damage claims within 24 hours. ID-verified renters have higher accountability.' },
    { q: 'Can I offer services, not just gear?', a: 'Yes. Create a "Service" listing for editing, cinematography, photography, sound, and more. Set your hourly or day rate, availability, and working area.' },
  ],
  payments: [
    { q: 'What is FP (Filmons Points)?', a: 'FP is Filmons\' internal currency. You earn FP on every transaction and can redeem them for platform credits, premium features, or cash out to your linked bank account (Creator+ users).' },
    { q: 'How long do payouts take?', a: 'Standard payouts process within 3-5 business days after a rental or service is marked complete. Creator+ users with verified bank accounts get priority 24-48h payouts.' },
    { q: 'What payment methods are accepted?', a: 'Filmons accepts Visa, Mastercard, American Express, and Interac (Canada). Apple Pay and Google Pay are coming soon. All payments are secured via Stripe.' },
    { q: 'How do I dispute a charge?', a: 'Go to Wallet → Transaction History → tap the transaction → "Dispute". Provide details and any evidence. Our payments team responds within 48 hours.' },
  ],
  verification: [
    { q: 'What documents do I need for ID verification?', a: 'Accepted documents: government-issued passport, Canadian driver\'s license, or national ID card. The document must be valid (not expired) and clearly photographed.' },
    { q: 'How long does verification take?', a: 'ID verification: 24-48 hours. Professional verification: 3-5 business days. Business verification: 5-7 business days. You\'ll receive an email and in-app notification on approval or rejection.' },
    { q: 'Why was my verification rejected?', a: 'Common reasons: blurry document photo, expired ID, name mismatch with account, or incomplete selfie. You can resubmit after addressing the issue. Check the rejection notification for specific details.' },
    { q: 'Is my ID data safe?', a: 'Yes. Documents are encrypted at rest and in transit. We use ISO 27001-compliant infrastructure. You can request deletion of your verification data at any time from Settings → Verification.' },
  ],
  privacy: [
    { q: 'How do I control who sees my profile?', a: 'Settings → Privacy → Profile Privacy → Account Visibility. Options: Public, Private, or Followers Only. Private accounts require approval before others can follow you.' },
    { q: 'How do I set up Two-Factor Authentication?', a: 'Settings → Security → Two-Factor Authentication. Enable SMS, Email OTP, or Authenticator App (recommended). Backup codes are generated upon setup — save these securely.' },
    { q: 'Can I hide my activity status?', a: 'Yes. Settings → Privacy → Activity Visibility → toggle off "Show Active Status". You can also control last seen visibility separately (Everyone / Followers / Nobody).' },
    { q: 'How do I manage my login sessions?', a: 'Settings → Linked Devices shows all active sessions. You can log out individual devices or all other sessions with one tap. New device logins trigger an email alert.' },
  ],
  trust: [
    { q: 'How do I report a scam?', a: 'If you suspect a scam, do not send money or transfer gear. Use the Report button on the user\'s profile or conversation. Our Trust & Safety team reviews reports within 4 hours.' },
    { q: 'What are safe collaboration practices?', a: 'Always verify a creator\'s profile (ID badge, reviews). Start with a discovery call. Use Filmons messaging for all agreements so there\'s a record. Never pay outside the platform.' },
    { q: 'How do I report copyright infringement?', a: 'If your work is being used without permission, go to the content → Report → Copyright Violation. Include the original source URL and proof of ownership.' },
    { q: 'What should I do if I\'m harassed?', a: 'Block the user immediately via their profile → Block. Then report through the conversation → Report → Harassment. You can also contact support directly for urgent safety concerns.' },
  ],
  troubleshoot: [
    { q: 'The app is loading slowly. What should I do?', a: 'Check your internet connection. Clear your browser cache or reinstall the app. If the issue persists, check filmons.ca/status for any ongoing incidents.' },
    { q: 'I can\'t log in to my account.', a: 'First try "Forgot password?" on the login screen. If that doesn\'t work, contact support with your registered email and we\'ll verify your identity and restore access.' },
    { q: 'My upload is failing.', a: 'Check file size (max 2GB for video, 50MB for images). Ensure your connection is stable. For large files, try switching to Wi-Fi. If the issue persists, try a different browser.' },
    { q: 'I\'m not receiving notifications.', a: 'Check your device notification permissions for Filmons. Then go to Settings → Notifications and ensure the notification types you want are enabled.' },
  ],
};

const GUIDES = [
  { icon: '🎬', title: 'How to Build Your Portfolio',          sub: '8 min read', cat: 'portfolio'    },
  { icon: '📦', title: 'How Gear Rentals Work',                sub: '5 min read', cat: 'marketplace'  },
  { icon: '🔒', title: 'Protecting Your Creative Work',        sub: '6 min read', cat: 'privacy'      },
  { icon: '✓',  title: 'Setting Up Professional Verification', sub: '4 min read', cat: 'verification' },
  { icon: '⭐', title: 'Growing Your Creator Reputation',       sub: '7 min read', cat: 'account'      },
  { icon: '💰', title: 'Getting Paid: FP & Payouts Guide',     sub: '5 min read', cat: 'payments'     },
];

const SYSTEM_STATUS = [
  { name: 'API',           ok: true  },
  { name: 'Messaging',     ok: true  },
  { name: 'Uploads',       ok: true  },
  { name: 'Payments',      ok: true  },
  { name: 'Rentals',       ok: true  },
  { name: 'Notifications', ok: true  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TICKET FORM
// ─────────────────────────────────────────────────────────────────────────────
function TicketForm({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState('');
  const [subject,  setSubject]  = useState('');
  const [body,     setBody]     = useState('');
  const [sending,  setSending]  = useState(false);

  const submit = async () => {
    if (!category || !subject.trim() || !body.trim()) { toast.error('Please fill all fields'); return; }
    setSending(true);
    await new Promise(r => setTimeout(r, 1200));
    toast.success('Support ticket submitted — we\'ll reply within 24h');
    onClose();
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900">Open Support Ticket</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400 bg-white">
              <option value="">Select a category…</option>
              {['Technical Issue','Account Recovery','Payments','Verification','Rentals','Abuse Report','Other'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Brief description of the issue"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400"/>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Description</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} placeholder="Describe your issue in detail…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400 resize-none"/>
          </div>
          <button onClick={submit} disabled={sending}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors">
            {sending ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Sending…</> : <><Send className="w-4 h-4"/>Submit Ticket</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FAQ ACCORDION
// ─────────────────────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-50 last:border-0">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between px-4 py-4 text-left gap-3 hover:bg-gray-50 transition-colors">
        <p className="text-sm font-semibold text-gray-900 flex-1">{q}</p>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 mt-0.5 transition-transform ${open?'rotate-180':''}`}/>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export function HelpCenter() {
  const navigate   = useNavigate();
  const [query,    setQuery]    = useState('');
  const [activeTab,setActiveTab]= useState<'home'|'faq'|'tickets'|'status'>('home');
  const [activeCat,setActiveCat]= useState<string | null>(null);
  const [showTicket,setShowTicket] = useState(false);
  const searchRef  = useRef<HTMLInputElement>(null);

  const allFaqs = Object.entries(FAQS).flatMap(([, arr]) => arr);
  const filtered = query.trim().length > 1
    ? allFaqs.filter(f => f.q.toLowerCase().includes(query.toLowerCase()) || f.a.toLowerCase().includes(query.toLowerCase()))
    : [];

  const catFaqs = activeCat ? FAQS[activeCat] || [] : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {showTicket && <TicketForm onClose={() => setShowTicket(false)}/>}

      {/* ── Header ── */}
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => activeCat ? setActiveCat(null) : navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700"/>
        </button>
        <h1 className="text-base font-black text-gray-900">
          {activeCat ? CATEGORIES.find(c=>c.id===activeCat)?.label : 'Help Center'}
        </h1>
      </div>

      {/* ── Category detail view ── */}
      {activeCat && (
        <div className="max-w-lg mx-auto px-4 py-5 pb-24">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {catFaqs.map(faq => <FaqItem key={faq.q} q={faq.q} a={faq.a}/>)}
          </div>
          <button onClick={() => setShowTicket(true)}
            className="w-full mt-4 py-3.5 border-2 border-blue-200 text-blue-600 font-bold text-sm rounded-2xl hover:bg-blue-50 transition-colors">
            Still need help? Open a ticket →
          </button>
        </div>
      )}

      {/* ── Main view ── */}
      {!activeCat && (
        <div className="max-w-lg mx-auto">

          {/* Hero search */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-5 pt-6 pb-8">
            <p className="text-white text-xl font-black mb-1">How can we help?</p>
            <p className="text-blue-100 text-sm mb-4">Search guides, FAQs, and tutorials</p>
            <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-3 shadow-md">
              <Search className="w-4 h-4 text-gray-400 shrink-0"/>
              <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)}
                placeholder="e.g. how to verify my account, payment issues…"
                className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder:text-gray-400"/>
              {query && <button onClick={() => setQuery('')}><X className="w-4 h-4 text-gray-400"/></button>}
            </div>
          </div>

          {/* Search results */}
          {query.trim().length > 1 && (
            <div className="px-4 py-4">
              <p className="text-xs text-gray-400 mb-3">{filtered.length} result{filtered.length!==1?'s':''} for "{query}"</p>
              {filtered.length > 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                  {filtered.map(f => <FaqItem key={f.q} q={f.q} a={f.a}/>)}
                </div>
              ) : (
                <div className="text-center py-8">
                  <HelpCircle className="w-10 h-10 text-gray-200 mx-auto mb-3"/>
                  <p className="text-gray-500 text-sm">No results found</p>
                  <button onClick={() => setShowTicket(true)} className="mt-3 text-xs text-blue-600 font-semibold hover:underline">
                    Contact support instead
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Emergency / report actions */}
          {!query && (
            <div className="px-4 pt-5">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">QUICK ACTIONS</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label:'Report User',              icon:'🚫', color:'bg-red-50 border-red-200 text-red-700' },
                  { label:'Report Scam',              icon:'⚠️', color:'bg-orange-50 border-orange-200 text-orange-700' },
                  { label:'Report Copyright',         icon:'©️', color:'bg-purple-50 border-purple-200 text-purple-700' },
                  { label:'Payment Issue',            icon:'💳', color:'bg-blue-50 border-blue-200 text-blue-700' },
                ].map(a => (
                  <button key={a.label} onClick={() => setShowTicket(true)}
                    className={`flex items-center gap-2 p-3 rounded-2xl border-2 text-left hover:opacity-90 transition-opacity ${a.color}`}>
                    <span className="text-xl">{a.icon}</span>
                    <p className="text-xs font-bold leading-tight">{a.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Categories */}
          {!query && (
            <div className="px-4 pt-5">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">BROWSE BY TOPIC</p>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => setActiveCat(cat.id)}
                    className="flex items-start gap-3 p-3.5 bg-white rounded-2xl shadow-sm border border-gray-100 text-left hover:shadow-md transition-shadow active:scale-[0.98]">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cat.color}`}>{cat.icon}</div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 leading-tight">{cat.label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{cat.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Featured guides */}
          {!query && (
            <div className="px-4 pt-5">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">FEATURED GUIDES</p>
              <div className="space-y-2">
                {GUIDES.map(g => (
                  <button key={g.title} onClick={() => setActiveCat(g.cat)}
                    className="w-full flex items-center gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 text-left hover:shadow-md transition-shadow">
                    <span className="text-2xl shrink-0">{g.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{g.title}</p>
                      <p className="text-xs text-gray-400">{g.sub}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* System status */}
          {!query && (
            <div className="px-4 pt-5">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">SYSTEM STATUS</p>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"/>
                  <p className="text-sm font-bold text-green-700">All Systems Operational</p>
                </div>
                <div className="grid grid-cols-3 gap-0 divide-x divide-gray-50">
                  {SYSTEM_STATUS.map(s => (
                    <div key={s.name} className="flex flex-col items-center py-3 gap-1">
                      <div className={`w-2 h-2 rounded-full ${s.ok ? 'bg-green-400' : 'bg-red-400'}`}/>
                      <p className="text-[10px] text-gray-500 font-medium">{s.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Contact support */}
          {!query && (
            <div className="px-4 pt-5 pb-24">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">CONTACT SUPPORT</p>
              <div className="space-y-2">
                <button onClick={() => setShowTicket(true)}
                  className="w-full flex items-center gap-4 p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-md transition-colors text-left">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5"/>
                  </div>
                  <div>
                    <p className="font-bold text-sm">Open a Support Ticket</p>
                    <p className="text-xs text-blue-100">Track your issue — we reply within 24h</p>
                  </div>
                </button>
                <button onClick={() => { window.location.href='mailto:support@filmons.ca'; }}
                  className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-left">
                  <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-gray-600"/>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-gray-900">Email Support</p>
                    <p className="text-xs text-gray-400">support@filmons.ca</p>
                  </div>
                </button>
                <button onClick={() => toast.info('Live chat launching soon — use email or ticket for now')}
                  className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-left">
                  <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5 text-green-600"/>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm text-gray-900">Live Chat</p>
                    <p className="text-xs text-gray-400">Mon–Fri, 9AM–6PM EST</p>
                  </div>
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold shrink-0">SOON</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}