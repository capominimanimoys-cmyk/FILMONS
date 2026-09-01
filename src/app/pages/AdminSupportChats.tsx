// Admin "Support Chats" — every user who has tapped Contact Agent (or
// submitted the guest form), continued straight from AdminSupport.tsx's
// existing 3-pane console (queue / conversation / context), extended
// with search, an Unread filter + live unread badges/bold rows, realtime
// (the user-facing SupportCaseDetail.tsx already had this; the admin side
// didn't), mark-as-read-on-open, and clickable attachments. Runs inside
// AdminLayout (routes.tsx) -- no login form or header of its own anymore,
// that's the layout's job.
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { adminFn } from '../lib/adminAuth';
import { STATUS_LABEL, supportApi, type SupportCase, type SupportMessage } from '../lib/supportApi';
import {
  ArrowLeft, Send, Loader2, Search, Paperclip,
  Package, WalletCards, Landmark, ShieldCheck, Sparkles,
} from 'lucide-react';

const TOPIC_LABEL: Record<string, string> = {
  orders_rentals: 'Orders & Rentals', payments_refunds: 'Payments & Refunds', wallet_payouts: 'Wallet & Payouts',
  creator_plus: 'Creator+ Verification', account_security: 'Account & Security', listings: 'Listings',
  portfolio: 'Portfolio', trust_safety: 'Trust & Safety', something_else: 'Something Else',
};

// Spec'd filter labels mapped onto the real support_cases.status enum --
// "Open" covers both 'open' and 'waiting_for_agent' (a case nothing has
// touched yet; createCase always starts a case at 'waiting_for_agent', so
// mapping "Open" to only the literal 'open' value would leave that tab
// permanently empty).
type FilterId = 'all' | 'unread' | 'open' | 'in_progress' | 'waiting_for_user' | 'resolved' | 'closed';
const FILTER_TABS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'unread', label: 'Unread' }, { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' }, { id: 'waiting_for_user', label: 'Waiting for User' },
  { id: 'resolved', label: 'Resolved' }, { id: 'closed', label: 'Closed' },
];
function matchesFilter(c: CaseRow, f: FilterId): boolean {
  if (f === 'all') return true;
  if (f === 'unread') return c.unread_count > 0;
  if (f === 'open') return c.status === 'open' || c.status === 'waiting_for_agent';
  if (f === 'in_progress') return c.status === 'in_review';
  if (f === 'waiting_for_user') return c.status === 'waiting_for_customer';
  return c.status === f;
}

const PRIORITY_CLASS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-500', normal: 'bg-blue-100 text-blue-600',
  high: 'bg-amber-100 text-amber-600', urgent: 'bg-red-100 text-red-600',
};
const STATUS_DOT: Record<string, string> = {
  open: 'bg-blue-500', waiting_for_agent: 'bg-blue-500', in_review: 'bg-amber-500',
  waiting_for_customer: 'bg-purple-500', resolved: 'bg-green-500', closed: 'bg-gray-400',
};

interface CaseRow extends SupportCase {
  user_name: string | null; user_email: string | null; user_avatar: string | null;
  guest_name: string | null; guest_email: string | null;
  last_message_content: string | null; last_message_at: string | null; last_message_sender_type: string | null;
  unread_count: number; assigned_admin_name: string | null;
}

// adminFn() routes through the same-origin /api/fn/* proxy (see
// vercel.json + src/app/lib/adminAuth.ts) so the browser attaches the
// HttpOnly admin session cookie automatically -- a direct
// https://<project>.supabase.co/... call would be cross-origin and
// wouldn't carry it.
async function callAdminAction(body: Record<string, unknown>) {
  const res = await fetch(adminFn('support-case-admin-action'), {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Action failed');
  return data;
}

// Compact relative time for the queue row ("5 min ago") -- the message
// thread itself still shows real timestamps, this is just for scanning
// the list quickly.
function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  if (url) return <img src={url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />;
  return (
    <div className="w-9 h-9 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center shrink-0">
      {initials}
    </div>
  );
}

function AttachmentChip({ a }: { a: { path: string; name: string } }) {
  const [opening, setOpening] = useState(false);
  const open = async () => {
    setOpening(true);
    const url = await supportApi.signAttachment(a.path);
    setOpening(false);
    if (url) window.open(url, '_blank', 'noopener');
    else toast.error('Could not open attachment');
  };
  return (
    <button onClick={open} disabled={opening} className="text-[10px] bg-black/10 hover:bg-black/20 rounded-full px-2 py-0.5 flex items-center gap-1 transition-colors">
      {opening ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Paperclip className="w-2.5 h-2.5" />} {a.name}
    </button>
  );
}

function ContextPanel({ c }: { c: CaseRow }) {
  const [order, setOrder] = useState<any>(null);
  const [wtx, setWtx] = useState<any>(null);
  const [payout, setPayout] = useState<any>(null);
  const [verification, setVerification] = useState<any>(null);

  useEffect(() => {
    setOrder(null); setWtx(null); setPayout(null); setVerification(null);
    if (c.related_order_id) supabase.from('orders').select('id,status,payment_method,paid_at,refund_status,dispute_status,listing_title').eq('id', c.related_order_id).maybeSingle().then(({ data }) => setOrder(data));
    if (c.related_wallet_transaction_id) supabase.from('wallet_transactions').select('id,transaction_type,status,balance_type,amount,currency').eq('id', c.related_wallet_transaction_id).maybeSingle().then(({ data }) => setWtx(data));
    if (c.related_payout_request_id) supabase.from('payout_requests').select('id,status,amount,currency,payout_method').eq('id', c.related_payout_request_id).maybeSingle().then(({ data }) => setPayout(data));
    if (c.related_verification_id) supabase.from('identity_verifications').select('id,status,decision_reason').eq('id', c.related_verification_id).maybeSingle().then(({ data }) => setVerification(data));
  }, [c.id]);

  const isGuest = !c.user_id;
  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Customer</p>
        <div className="flex items-center gap-2">
          <Avatar name={c.user_name || c.guest_name || '?'} url={c.user_avatar} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{c.user_name || c.guest_name || c.user_id}</p>
            <p className="text-xs text-gray-400 truncate">{c.user_email || c.guest_email}</p>
            {isGuest && <span className="text-[9px] font-bold uppercase text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Guest</span>}
          </div>
        </div>
      </div>

      {order && (
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Package className="w-3 h-3" /> Related Order</p>
          <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1">
            <p className="font-bold text-gray-800">{order.listing_title}</p>
            <p className="text-gray-500">Status: {order.status} · Payment: {order.paid_at ? 'Paid' : 'Unpaid'}</p>
            <p className="text-gray-500">Refund: {order.refund_status} · Dispute: {order.dispute_status}</p>
          </div>
        </div>
      )}
      {wtx && (
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><WalletCards className="w-3 h-3" /> Wallet Transaction</p>
          <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1">
            <p className="text-gray-500">{wtx.transaction_type} · {wtx.status} · {wtx.balance_type}</p>
            <p className="font-bold text-gray-800">${Number(wtx.amount).toFixed(2)} {wtx.currency}</p>
          </div>
        </div>
      )}
      {payout && (
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Landmark className="w-3 h-3" /> Payout Status</p>
          <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1">
            <p className="text-gray-500">{payout.payout_method} · {payout.status}</p>
            <p className="font-bold text-gray-800">${Number(payout.amount).toFixed(2)} {payout.currency}</p>
          </div>
        </div>
      )}
      {verification && (
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Verification Status</p>
          <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1">
            <p className="text-gray-500">{verification.status}</p>
            {verification.decision_reason && <p className="text-gray-500">{verification.decision_reason}</p>}
          </div>
        </div>
      )}

      {c.ai_summary && (
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI Summary</p>
          <pre className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 whitespace-pre-wrap font-sans">{c.ai_summary}</pre>
        </div>
      )}
    </div>
  );
}

export function AdminSupportChats() {
  const { caseNumber } = useParams<{ caseNumber?: string }>();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState('');
  const [asNote, setAsNote] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadCases = async () => {
    const { data, error } = await supabase.from('support_cases_admin_view').select('*').order('updated_at', { ascending: false }).limit(200);
    if (error) { console.error('[AdminSupportChats] loadCases failed:', error.message); return; }
    setCases((data || []) as CaseRow[]);
  };
  useEffect(() => { loadCases(); }, []);

  const selected = cases.find(c => c.id === selectedId) || null;

  const loadMessages = async (caseId: string) => {
    const { data } = await supabase.from('support_messages').select('*').eq('case_id', caseId).order('created_at', { ascending: true });
    setMessages(data || []);
  };

  const openCase = async (id: string) => {
    setSelectedId(id);
    await loadMessages(id);
    // Mark read the moment the admin opens it -- optimistic local zero-out
    // so the badge/bold disappear immediately, real state confirmed by
    // the next loadCases().
    setCases(prev => prev.map(c => c.id === id ? { ...c, unread_count: 0 } : c));
    supabase.rpc('fn_mark_case_read_by_admin', { p_case_id: id }).then(() => loadCases()).catch(() => {});
  };

  // Deep link (/admin/support/cases/:caseNumber, from the "new case"
  // admin-notification email) -- once the case list has loaded, find and
  // open the matching conversation automatically. Never overrides a case
  // the admin has already navigated to/away from within this session.
  useEffect(() => {
    if (!caseNumber || selectedId || !cases.length) return;
    const match = cases.find(c => c.case_number === caseNumber);
    if (match) openCase(match.id);
    else toast.error(`Case ${caseNumber} not found`);
  }, [caseNumber, cases, selectedId]);

  // Realtime: any new message anywhere refreshes the queue (unread badge/
  // bold + reordering to top); if it lands in the case currently open,
  // also append it to the thread and immediately mark it read (the admin
  // is already looking at it) instead of leaving a stale unread badge on
  // a case they're actively viewing.
  useEffect(() => {
    const channel = supabase
      .channel('admin_support_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        const row = payload.new as SupportMessage;
        loadCases();
        if (row.case_id === selectedId) {
          setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, row]));
          if (row.sender_type === 'user') {
            supabase.rpc('fn_mark_case_read_by_admin', { p_case_id: row.case_id }).then(() => loadCases()).catch(() => {});
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases
      .filter(c => matchesFilter(c, filter))
      .filter(c => {
        if (!q) return true;
        const name = (c.user_name || c.guest_name || '').toLowerCase();
        const email = (c.user_email || c.guest_email || '').toLowerCase();
        return name.includes(q) || email.includes(q) || c.case_number.toLowerCase().includes(q);
      });
  }, [cases, filter, search]);

  const doReply = async () => {
    if (!selected || !reply.trim() || busy) return;
    setBusy(true);
    try {
      await callAdminAction({ caseId: selected.id, action: asNote ? 'internal_note' : 'reply', content: reply.trim() });
      setReply('');
      await Promise.all([loadMessages(selected.id), loadCases()]);
      toast.success(asNote ? 'Internal note added' : 'Reply sent');
    } catch (e: any) {
      toast.error(e?.message || 'Could not send');
    } finally {
      setBusy(false);
    }
  };

  const doAssign = async () => {
    if (!selected) return;
    try {
      await callAdminAction({ caseId: selected.id, action: 'assign_to_me' });
      await loadCases();
      toast.success('Case assigned to you');
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
  };
  const doPriority = async (priority: string) => {
    if (!selected) return;
    try {
      await callAdminAction({ caseId: selected.id, action: 'set_priority', priority });
      await loadCases();
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
  };
  const doStatus = async (status: string) => {
    if (!selected) return;
    try {
      await callAdminAction({ caseId: selected.id, action: 'set_status', status });
      await Promise.all([loadCases(), loadMessages(selected.id)]);
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
  };

  return (
    // Fixed to the viewport (minus AdminLayout's mobile top bar) rather
    // than h-full -- AdminLayout's <main> is a normal overflow-y-auto page
    // container (so other nested admin pages keep their own natural
    // scrolling), so this component owns bounding its own height instead
    // of relying on an ancestor to constrain it for the 3-pane layout below.
    <div className="h-[calc(100vh-3rem)] lg:h-screen grid grid-cols-1 md:grid-cols-[320px_1fr_280px] overflow-hidden">
      {/* Queue */}
      <div className={`border-r border-gray-100 bg-white overflow-y-auto flex flex-col ${selectedId ? 'hidden md:flex' : ''}`}>
        <div className="p-3 border-b border-gray-50 space-y-2">
          <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, case ID…"
              className="flex-1 bg-transparent text-xs outline-none" />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTER_TABS.map(t => {
              const count = t.id === 'unread' ? cases.filter(c => c.unread_count > 0).length : null;
              return (
                <button key={t.id} onClick={() => setFilter(t.id)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${filter === t.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {t.label}{count ? <span className={`px-1 rounded-full ${filter === t.id ? 'bg-white/25' : 'bg-blue-600 text-white'}`}>{count}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="divide-y divide-gray-50 flex-1">
          {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-10">No conversations.</p>}
          {filtered.map(c => {
            const displayName = c.user_name || c.guest_name || 'Unknown';
            const unread = c.unread_count > 0;
            return (
              <button key={c.id} onClick={() => openCase(c.id)} className={`w-full text-left px-3 py-3 hover:bg-gray-50 flex gap-2.5 ${selectedId === c.id ? 'bg-blue-50' : unread ? 'bg-blue-50/40' : ''}`}>
                <Avatar name={displayName} url={c.user_avatar} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs truncate ${unread ? 'font-black text-gray-900' : 'font-bold text-gray-800'}`}>{displayName}</span>
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${PRIORITY_CLASS[c.priority]}`}>{c.priority}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 truncate">{c.user_email || c.guest_email}</p>
                  <p className="text-[11px] text-gray-400">#{c.case_number}</p>
                  {c.last_message_content && (
                    <p className={`text-xs mt-1 truncate ${unread ? 'font-bold text-gray-800' : 'text-gray-500'}`}>{c.last_message_content}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[c.status]}`} />
                    <span className="text-[10px] text-gray-400">{STATUS_LABEL[c.status]}</span>
                    <span className="text-[10px] text-gray-300">·</span>
                    <span className="text-[10px] text-gray-400">{timeAgo(c.last_message_at || c.updated_at)}</span>
                    {unread && <span className="ml-auto text-[9px] font-bold text-white bg-blue-600 rounded-full px-1.5 py-0.5">{c.unread_count} unread</span>}
                  </div>
                  {c.assigned_admin_name && <p className="text-[9px] text-gray-300 mt-0.5">Assigned: {c.assigned_admin_name}</p>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex flex-col bg-gray-50 overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Select a conversation</div>
        ) : (
          <>
            <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-2.5">
              <div className="flex items-start gap-3">
                <button onClick={() => setSelectedId(null)} className="md:hidden w-7 h-7 mt-0.5 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0">
                  <ArrowLeft className="w-4 h-4 text-gray-500" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-black text-gray-900 leading-snug break-words">{selected.subject}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-bold font-mono">
                      #{selected.case_number}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px] font-semibold">
                      {TOPIC_LABEL[selected.category] || selected.category}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={selected.priority} onChange={e => doPriority(e.target.value)} className="text-xs font-semibold border border-gray-200 rounded-lg px-2 py-1.5">
                  {['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={selected.status} onChange={e => doStatus(e.target.value)} className="text-xs font-semibold border border-gray-200 rounded-lg px-2 py-1.5">
                  {Object.keys(STATUS_LABEL).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                {!selected.assigned_admin_id && (
                  <button onClick={doAssign} className="text-xs font-bold text-blue-600 whitespace-nowrap px-2 py-1.5 rounded-lg hover:bg-blue-50">Assign to me</button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.sender_type === 'user' ? 'justify-start' : m.sender_type === 'system' ? 'justify-center' : 'justify-end'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                    m.sender_type === 'user' ? 'bg-white border border-gray-100 text-gray-800'
                    : m.sender_type === 'system' ? 'bg-gray-200 text-gray-500 text-xs italic'
                    : m.is_internal_note ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : m.sender_type === 'ai' ? 'bg-indigo-50 text-indigo-800 border border-indigo-100'
                    : 'bg-blue-600 text-white'
                  }`}>
                    {m.sender_type !== 'user' && m.sender_type !== 'system' && (
                      <p className="text-[9px] font-bold uppercase mb-0.5 opacity-70">
                        {m.is_internal_note ? 'Internal Note' : m.sender_type === 'ai' ? 'AI' : m.sender_name || 'Agent'}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.attachments?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {m.attachments.map((a, i) => <AttachmentChip key={i} a={a} />)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white border-t border-gray-100 p-3">
              <div className="flex items-center gap-2 mb-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  <input type="checkbox" checked={asNote} onChange={e => setAsNote(e.target.checked)} /> Internal note (not visible to customer)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={reply} onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doReply(); }}
                  placeholder={asNote ? 'Add an internal note…' : 'Reply to customer…'}
                  className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm outline-none focus:border-blue-400"
                />
                <button onClick={doReply} disabled={busy || !reply.trim()} className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white disabled:opacity-40 ${asNote ? 'bg-amber-500' : 'bg-blue-600'}`}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Context */}
      <div className={`border-l border-gray-100 bg-white overflow-hidden ${selected ? 'hidden lg:block' : 'hidden'}`}>
        {selected && <ContextPanel c={selected} />}
      </div>
    </div>
  );
}
