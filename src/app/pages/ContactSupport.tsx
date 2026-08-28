import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  ArrowLeft, Search, ChevronRight, Package, CreditCard, Wallet as WalletIcon,
  ShieldCheck, Lock, Film, Image as ImageIcon, AlertTriangle, HelpCircle,
  Sparkles, Send, Loader2, Check, X, Mail, Phone, MessageCircle, Paperclip,
} from 'lucide-react';
import { supportApi, type ChatTurn, type RelatedIds, type SupportCase } from '../lib/supportApi';
import { AgentContactedCard } from '../components/AgentContactedCard';

interface Topic {
  id: string; label: string; desc: string; icon: any;
}
const TOPICS: Topic[] = [
  { id: 'orders_rentals',   label: 'Orders & Rentals',      desc: 'Rental, pickup, return, cancellations, rental agreements', icon: Package },
  { id: 'payments_refunds', label: 'Payments & Refunds',    desc: 'Payment problems, charges, refunds and receipts',          icon: CreditCard },
  { id: 'wallet_payouts',   label: 'Wallet & Payouts',      desc: 'Missing balance, pending earnings, payout requests',        icon: WalletIcon },
  { id: 'creator_plus',     label: 'Creator+ Verification', desc: 'Identity, proof of address and verification status',        icon: ShieldCheck },
  { id: 'account_security', label: 'Account & Security',    desc: 'Login, email, phone, devices and account recovery',         icon: Lock },
  { id: 'listings',         label: 'Listings',              desc: 'Create/edit listings, photos, videos and rental rules',     icon: Film },
  { id: 'portfolio',        label: 'Portfolio',             desc: 'Portfolio settings, albums and sharing',                    icon: ImageIcon },
  { id: 'trust_safety',     label: 'Trust & Safety',        desc: 'Fraud, suspicious users, stolen equipment and safety',      icon: AlertTriangle },
  { id: 'something_else',   label: 'Something Else',        desc: "Anything that doesn't fit another category",               icon: HelpCircle },
];

const SUBTOPICS: Record<string, { id: string; label: string }[]> = {
  orders_rentals: [
    { id: 'rental_problem', label: 'Problem with my rental' }, { id: 'rental_agreement', label: 'Rental Agreement' },
    { id: 'pickup_problem', label: 'Pickup problem' }, { id: 'return_problem', label: 'Return problem' },
    { id: 'cancellation', label: 'Cancellation' }, { id: 'damage', label: 'Damage' },
    { id: 'missing_equipment', label: 'Missing equipment' }, { id: 'other', label: 'Other' },
  ],
  payments_refunds: [
    { id: 'payment_problem', label: 'Payment problem' }, { id: 'refund_issue', label: 'Refund status' },
    { id: 'charge_dispute', label: 'Charge dispute' }, { id: 'receipt_request', label: 'Receipt request' }, { id: 'other', label: 'Other' },
  ],
  wallet_payouts: [
    { id: 'missing_balance', label: 'My balance is missing' }, { id: 'balance_pending', label: 'My balance is pending' },
    { id: 'payout_under_review', label: 'My payout is under review' }, { id: 'havent_received_payout', label: "I haven't received my payout" },
    { id: 'wrong_amount', label: 'My transaction amount is incorrect' }, { id: 'other', label: 'Other' },
  ],
  creator_plus: [
    { id: 'verification_pending', label: 'Verification pending' }, { id: 'changes_requested', label: 'Changes requested' },
    { id: 'verification_denied', label: 'Verification denied' }, { id: 'id_upload_problem', label: 'ID upload problem' },
    { id: 'proof_of_address_problem', label: 'Proof-of-address problem' }, { id: 'other', label: 'Other' },
  ],
  account_security: [
    { id: 'unrecognized_login', label: "I don't recognize a login" }, { id: 'lost_phone', label: 'Lost access to phone' },
    { id: 'lost_email', label: 'Lost access to email' }, { id: 'account_compromised', label: 'Account compromised' },
    { id: 'code_problem', label: 'Verification-code problem' }, { id: 'other', label: 'Other' },
  ],
  listings: [
    { id: 'create_listing', label: 'Create a listing' }, { id: 'edit_listing', label: 'Edit a listing' },
    { id: 'media_problem', label: 'Photos or video problem' }, { id: 'rental_rules', label: 'Rental rules question' }, { id: 'other', label: 'Other' },
  ],
  portfolio: [
    { id: 'portfolio_settings', label: 'Portfolio settings' }, { id: 'albums', label: 'Albums' },
    { id: 'sharing', label: 'Sharing' }, { id: 'other', label: 'Other' },
  ],
  trust_safety: [
    { id: 'fraud', label: 'Fraud' }, { id: 'stolen_equipment', label: 'Stolen equipment' },
    { id: 'harassment', label: 'Threats or harassment' }, { id: 'suspicious_user', label: 'Suspicious user' }, { id: 'other', label: 'Other' },
  ],
  something_else: [{ id: 'general_question', label: 'General question' }, { id: 'other', label: 'Other' }],
};

function maskPhone(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  return `+1 ••• ••• ${last4}`;
}

interface RecentOrder { id: string; listing_title: string; start_date: string; duration: string; status: string; }

type Step = 'home' | 'subtopic' | 'object_picker' | 'chat' | 'sent';

export function ContactSupport() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const prefill = (location.state || {}) as Partial<RelatedIds> & { category?: string; subcategory?: string; role?: string; note?: string };

  const [step, setStep] = useState<Step>(prefill.category ? 'subtopic' : 'home');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(prefill.category || null);
  const [subcategory, setSubcategory] = useState<string | null>(prefill.subcategory || null);
  const [relatedIds, setRelatedIds] = useState<RelatedIds>({
    orderId: prefill.orderId, listingId: prefill.listingId,
    walletTransactionId: prefill.walletTransactionId, payoutRequestId: prefill.payoutRequestId,
    verificationId: prefill.verificationId,
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [recommendEscalate, setRecommendEscalate] = useState(false);
  const [showConnectConfirm, setShowConnectConfirm] = useState(false);
  const [creatingCase, setCreatingCase] = useState(false);
  const [createdCase, setCreatedCase] = useState<SupportCase | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [turns, aiBusy]);

  const objectPickerNeeded = ['orders_rentals', 'payments_refunds', 'wallet_payouts'].includes(category || '') && !relatedIds.orderId;

  const loadRecentOrders = async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('orders').select('id,listing_title,start_date,duration,duration_type,status')
      .or(`renter_id.eq.${user.id},host_id.eq.${user.id}`).order('paid_at', { ascending: false }).limit(6);
    setRecentOrders((data || []).map((r: any) => ({
      id: r.id, listing_title: r.listing_title || 'Listing', status: r.status,
      start_date: r.start_date, duration: `${r.duration || ''} ${r.duration_type || ''}`.trim(),
    })));
  };

  const openTopic = (topicId: string) => {
    setCategory(topicId);
    setSubcategory(null);
    setStep('subtopic');
  };

  const startChatFor = (subId: string) => {
    setSubcategory(subId);
    if (category === 'trust_safety') {
      setShowConnectConfirm(true);
      return;
    }
    if (objectPickerNeeded) {
      loadRecentOrders();
      setStep('object_picker');
      return;
    }
    beginChat();
  };

  const beginChat = () => {
    setTurns([{ role: 'assistant', content: "Hi! Tell me what's happening and I'll help you find a solution." }]);
    setStep('chat');
  };

  const pickOrder = (orderId: string) => {
    setRelatedIds(prev => ({ ...prev, orderId }));
    beginChat();
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || aiBusy || !user?.id) return;
    const nextTurns: ChatTurn[] = [...turns, { role: 'user', content: text }];
    setTurns(nextTurns);
    setInput('');
    setAiBusy(true);
    try {
      const { reply, recommendEscalate: escalate } = await supportApi.aiChat({
        userId: user.id, category: category || 'something_else', subcategory: subcategory || undefined,
        relatedIds, history: nextTurns,
      });
      setTurns(t => [...t, { role: 'assistant', content: reply }]);
      setRecommendEscalate(escalate);
    } catch {
      setTurns(t => [...t, { role: 'assistant', content: "I'm having trouble responding right now — let's connect you with an agent instead." }]);
      setRecommendEscalate(true);
    } finally {
      setAiBusy(false);
    }
  };

  const confirmConnect = async () => {
    if (!user?.id) return;
    setCreatingCase(true);
    try {
      const topic = TOPICS.find(t => t.id === category);
      const sub = SUBTOPICS[category || '']?.find(s => s.id === subcategory);
      const subject = sub?.label || topic?.label || 'Support request';
      const aiSummary = turns.length ? await supportApi.aiSummarize({
        userId: user.id, category: category || 'something_else', subcategory: subcategory || undefined, relatedIds, history: turns,
      }) : null;
      const created = await supportApi.createCase({
        userId: user.id, category: category || 'something_else', subcategory: subcategory || undefined,
        subject, relatedIds, aiSummary, priorTurns: turns,
      });
      setCreatedCase(created);
      setShowConnectConfirm(false);
      setStep('sent');
    } catch (e: any) {
      toast.error(e?.message || 'Could not create your support case.');
    } finally {
      setCreatingCase(false);
    }
  };

  const filteredTopics = TOPICS.filter(t =>
    !search.trim() || t.label.toLowerCase().includes(search.toLowerCase()) || t.desc.toLowerCase().includes(search.toLowerCase())
  );

  // No account/session at all -- the AI-chat triage flow below assumes a
  // real user_id at every step (aiChat, createCase, recent orders, saved
  // contact info), so a guest gets a separate, simple form instead of that
  // flow rather than being bounced to Sign In first.
  if (!user) return <GuestSupportForm onBack={() => navigate('/')} />;

  // ── Sent / case created ──────────────────────────────────────────────
  if (step === 'sent' && createdCase) {
    return (
      <div className="min-h-screen bg-gray-50 pb-10">
        <Header title="Contact Filmons Support" onBack={() => navigate('/help')} />
        <div className="max-w-lg mx-auto px-4 pt-8 space-y-5">
          <div className="text-center">
            <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <h1 className="text-xl font-black text-gray-900">Your support request has been sent ✓</h1>
            <p className="text-sm font-bold text-gray-500 mt-1">Case #{createdCase.case_number}</p>
            <p className="text-xs text-gray-400 mt-2">You can leave this page. We'll notify you when there's an update.</p>
          </div>
          <AgentContactedCard onContinueChat={() => navigate(`/support/cases/${createdCase.id}`)} />
          <button onClick={() => navigate('/help')} className="w-full py-3 text-sm font-bold text-gray-500">
            Back to Help Center
          </button>
        </div>
      </div>
    );
  }

  // ── AI chat ───────────────────────────────────────────────────────────
  if (step === 'chat') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b border-gray-100 sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setStep('subtopic')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <ArrowLeft className="w-4 h-4 text-gray-500" />
          </button>
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-gray-900">Filmons Support</p>
            <span className="text-[10px] font-bold uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">AI Assistant</span>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-w-lg mx-auto w-full">
          {turns.map((t, i) => (
            <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${t.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-100 text-gray-800'}`}>
                {t.content}
              </div>
            </div>
          ))}
          {aiBusy && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-100 rounded-2xl px-4 py-2.5">
                <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
              </div>
            </div>
          )}
          {recommendEscalate && !aiBusy && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setShowConnectConfirm(true)}
                className="px-4 py-2 bg-blue-50 text-blue-700 text-xs font-black rounded-full flex items-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Connect with an Agent
              </button>
            </div>
          )}
        </div>

        <div className="bg-white border-t border-gray-100 px-4 py-3 sticky bottom-0">
          <div className="max-w-lg mx-auto flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
              placeholder="Type your message…"
              className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-base outline-none focus:border-blue-400"
            />
            <button onClick={sendMessage} disabled={!input.trim() || aiBusy} className="w-10 h-10 shrink-0 bg-blue-600 text-white rounded-full flex items-center justify-center disabled:opacity-40">
              <Send className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => setShowConnectConfirm(true)} className="w-full mt-2 text-xs font-bold text-gray-400 hover:text-blue-600">
            Connect with an Agent
          </button>
        </div>

        {showConnectConfirm && (
          <ConnectConfirmModal creating={creatingCase} onCancel={() => setShowConnectConfirm(false)} onConfirm={confirmConnect} />
        )}
      </div>
    );
  }

  // ── Object picker ─────────────────────────────────────────────────────
  if (step === 'object_picker') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header title="Contact Filmons Support" onBack={() => setStep('subtopic')} />
        <div className="max-w-lg mx-auto px-4 pt-6">
          <h2 className="text-base font-black text-gray-900 mb-1">Which order is this about?</h2>
          <p className="text-xs text-gray-400 mb-4">Select one, or skip if this isn't about a specific order.</p>
          <div className="space-y-2">
            {recentOrders.map(o => (
              <button key={o.id} onClick={() => pickOrder(o.id)} className="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left hover:border-blue-300">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{o.listing_title}</p>
                  <p className="text-xs text-gray-400">Order #{o.id} · {o.start_date} {o.duration && `· ${o.duration}`}</p>
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-green-100 text-green-600 shrink-0">{o.status}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            ))}
            {recentOrders.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No recent orders found.</p>}
          </div>
          <button onClick={beginChat} className="w-full mt-4 py-3 text-sm font-bold text-gray-500">
            This isn't about a specific order
          </button>
        </div>
      </div>
    );
  }

  // ── Subtopic picker ────────────────────────────────────────────────────
  if (step === 'subtopic' && category) {
    const topic = TOPICS.find(t => t.id === category)!;
    return (
      <div className="min-h-screen bg-gray-50">
        <Header title="Contact Filmons Support" onBack={() => setStep('home')} />
        <div className="max-w-lg mx-auto px-4 pt-6">
          <h2 className="text-base font-black text-gray-900 mb-1">{topic.label}</h2>
          <p className="text-sm text-gray-500 mb-4">What do you need help with?</p>
          <div className="space-y-2">
            {(SUBTOPICS[category] || []).map(s => (
              <button key={s.id} onClick={() => startChatFor(s.id)} className="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3.5 flex items-center justify-between text-left hover:border-blue-300">
                <span className="text-sm font-semibold text-gray-800">{s.label}</span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
            ))}
          </div>

          <div className="mt-6 bg-white border border-gray-100 rounded-2xl p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Your contact information</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-700"><Mail className="w-3.5 h-3.5 text-gray-400" /> {user.email || '—'} <Lock className="w-3 h-3 text-gray-300 ml-auto" /></div>
              <div className="flex items-center gap-2 text-sm text-gray-700"><Phone className="w-3.5 h-3.5 text-gray-400" /> {maskPhone(user.phone) || '—'} <Lock className="w-3 h-3 text-gray-300 ml-auto" /></div>
            </div>
          </div>
        </div>

        {category === 'trust_safety' && showConnectConfirm && (
          <ConnectConfirmModal creating={creatingCase} onCancel={() => setShowConnectConfirm(false)} onConfirm={confirmConnect} title="Report to Filmons?" />
        )}
      </div>
    );
  }

  // ── Home ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <Header title="Contact Filmons Support" onBack={() => navigate('/help')} />
      <div className="max-w-lg mx-auto px-4 pt-2">
        <p className="text-sm text-gray-500 mb-4">How can we help?</p>
        <div className="relative mb-6">
          <Search className="w-4 h-4 text-gray-300 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search for an answer…"
            className="w-full bg-white border border-gray-200 rounded-2xl pl-11 pr-4 py-3 text-base outline-none focus:border-blue-400"
          />
        </div>

        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Choose a topic</p>
        <div className="grid grid-cols-2 gap-3 mb-8">
          {filteredTopics.map(t => (
            <button key={t.id} onClick={() => openTopic(t.id)} className="bg-white border border-gray-100 rounded-2xl p-4 text-left hover:border-blue-300 transition-colors">
              <t.icon className="w-5 h-5 text-blue-600 mb-2" />
              <p className="text-sm font-black text-gray-900">{t.label}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{t.desc}</p>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <button
            onClick={() => { setCategory('something_else'); setSubcategory('general_question'); beginChat(); }}
            className="w-full py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" /> Chat with Filmons Support
          </button>
          <button onClick={() => navigate('/support/cases')} className="w-full py-3.5 border border-gray-200 text-gray-700 font-black text-sm rounded-2xl">
            My Support Cases
          </button>
        </div>
      </div>
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="bg-white border-b border-gray-100 sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
      <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
        <ArrowLeft className="w-4 h-4 text-gray-500" />
      </button>
      <p className="text-sm font-black text-gray-900">{title}</p>
    </div>
  );
}

function ConnectConfirmModal({ creating, onCancel, onConfirm, title }: { creating: boolean; onCancel: () => void; onConfirm: () => void; title?: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6">
        <h3 className="text-base font-black text-gray-900 mb-2">{title || 'Connect with Filmons Support?'}</h3>
        <p className="text-sm text-gray-500 mb-5">We'll include this conversation and relevant case details so you don't have to explain everything again.</p>
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={creating} className="flex-1 py-3 border border-gray-200 text-gray-600 font-bold rounded-2xl text-sm disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={creating} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect with Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Guest (unauthenticated) support form ─────────────────────────────────
// Values match create-guest-support-case's ALLOWED_CATEGORIES exactly --
// the server rejects anything else, so these two lists must stay in sync.
const GUEST_CATEGORIES: { value: string; label: string }[] = [
  { value: 'account_signin',    label: 'Account or Sign In' },
  { value: 'rental',            label: 'Rental' },
  { value: 'purchase_sale',     label: 'Purchase / Sale' },
  { value: 'payment',           label: 'Payment' },
  { value: 'payout',            label: 'Payout' },
  { value: 'opportunity',       label: 'Opportunity' },
  { value: 'safety_report',     label: 'Safety or Report' },
  { value: 'technical_problem', label: 'Technical Problem' },
  { value: 'other',             label: 'Other' },
];

function GuestSupportForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  // Honeypot -- real visitors never see this field (visually hidden,
  // tabIndex -1, aria-hidden), so anything filling it is treated as a bot;
  // the server silently no-ops instead of erroring, giving no signal back.
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ caseNumber: string } | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = name.trim() && emailValid && category && subject.trim() && message.trim() && !submitting;

  const reset = () => {
    setName(''); setEmail(''); setCategory(''); setSubject(''); setMessage(''); setFile(null); setResult(null);
  };

  const submit = async () => {
    if (!name.trim()) { toast.error('Enter your name'); return; }
    if (!emailValid) { toast.error('Enter a valid email address'); return; }
    if (!category) { toast.error('Choose what you need help with'); return; }
    if (!subject.trim()) { toast.error('Enter a subject'); return; }
    if (!message.trim()) { toast.error('Enter a message'); return; }
    setSubmitting(true);
    try {
      let attachment: { path: string; name: string } | null = null;
      if (file) attachment = await supportApi.uploadGuestAttachment(file);
      const { caseNumber } = await supportApi.createGuestCase({
        name: name.trim(), email: email.trim(), category, subject: subject.trim(), message: message.trim(),
        attachment, website,
      });
      setResult({ caseNumber });
    } catch (e: any) {
      toast.error(e?.message || 'Could not send your message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-gray-50 pb-10">
        <Header title="Contact Filmons Support" onBack={onBack} />
        <div className="max-w-lg mx-auto px-4 pt-8 space-y-5 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-1">
            <Check className="w-7 h-7 text-green-600" />
          </div>
          <h1 className="text-xl font-black text-gray-900">Message sent ✓</h1>
          <p className="text-sm text-gray-500">
            Thanks for contacting FILMONS. We've received your request and will reply to{' '}
            <span className="font-bold text-gray-700">{email.trim()}</span>.
          </p>
          <p className="text-sm font-bold text-gray-500">Request #{result.caseNumber}</p>
          <div className="space-y-2 pt-2">
            <button onClick={onBack} className="w-full py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl">
              Back to FILMONS
            </button>
            <button onClick={reset} className="w-full py-3.5 border border-gray-200 text-gray-700 font-black text-sm rounded-2xl">
              Send Another Message
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <Header title="Contact Filmons Support" onBack={onBack} />
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <div>
          <h1 className="text-xl font-black text-gray-900">Contact FILMONS Support</h1>
          <p className="text-sm text-gray-500 mt-1">Need help? Send us a message and our support team will get back to you.</p>
        </div>

        {/* Honeypot -- visually and programmatically hidden from real users */}
        <input
          type="text" value={website} onChange={e => setWebsite(e.target.value)}
          name="website" autoComplete="off" tabIndex={-1} aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        />

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
            className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-400" />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com"
            className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-400" />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">What can we help you with?</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-400 appearance-none">
            <option value="" disabled>Select a category</option>
            {GUEST_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Subject</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Briefly describe your issue"
            className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-400" />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
            placeholder="Tell us what happened and how we can help."
            className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-400 resize-none" />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Attachment <span className="font-normal normal-case text-gray-400">(optional)</span>
          </label>
          <label className="w-full flex items-center gap-2.5 bg-white border border-gray-200 border-dashed rounded-2xl px-4 py-3 text-sm text-gray-500 cursor-pointer hover:border-blue-300">
            <Paperclip className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="flex-1 truncate">{file ? file.name : 'Attach a screenshot or image'}</span>
            {file && (
              <button type="button" onClick={e => { e.preventDefault(); setFile(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
              onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
        </div>

        <button onClick={submit} disabled={!canSubmit}
          className="w-full py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? 'Sending…' : 'Send Message'}
        </button>
      </div>
    </div>
  );
}
