import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { projectId } from '/utils/supabase/info';
import { adminAuth as adminAuthClient, type AdminSession } from '../lib/adminAuth';
import { STATUS_LABEL, type SupportCase, type SupportMessage } from '../lib/supportApi';
import {
  ArrowLeft, LifeBuoy, Send, Lock, Eye, EyeOff, Loader2, UserCircle2,
  Package, WalletCards, Landmark, ShieldCheck, Sparkles,
} from 'lucide-react';

const TOPIC_LABEL: Record<string, string> = {
  orders_rentals: 'Orders & Rentals', payments_refunds: 'Payments & Refunds', wallet_payouts: 'Wallet & Payouts',
  creator_plus: 'Creator+ Verification', account_security: 'Account & Security', listings: 'Listings',
  portfolio: 'Portfolio', trust_safety: 'Trust & Safety', something_else: 'Something Else',
};
const STATUS_TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'waiting_for_agent', label: 'Waiting for Agent' },
  { id: 'in_review', label: 'In Review' }, { id: 'waiting_for_customer', label: 'Waiting for Customer' },
  { id: 'resolved', label: 'Resolved' }, { id: 'closed', label: 'Closed' },
];
const PRIORITY_CLASS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-500', normal: 'bg-blue-100 text-blue-600',
  high: 'bg-amber-100 text-amber-600', urgent: 'bg-red-100 text-red-600',
};

interface CaseRow extends SupportCase { profiles?: { name?: string; email?: string; phone?: string } }

async function callAdminAction(body: Record<string, unknown>) {
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/support-case-admin-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...adminAuthClient.authHeader() },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Action failed');
  return data;
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

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Customer</p>
        <div className="flex items-center gap-2">
          <UserCircle2 className="w-8 h-8 text-gray-300" />
          <div>
            <p className="text-sm font-bold text-gray-900">{c.profiles?.name || c.user_id}</p>
            <p className="text-xs text-gray-400">{c.profiles?.email}</p>
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

function CaseConsole({ admin }: { admin: AdminSession }) {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [statusTab, setStatusTab] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState('');
  const [asNote, setAsNote] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadCases = async () => {
    const { data } = await supabase.from('support_cases').select('*, profiles(name,email,phone)').order('updated_at', { ascending: false }).limit(100);
    setCases(data || []);
  };
  useEffect(() => { loadCases(); }, []);

  const selected = cases.find(c => c.id === selectedId) || null;

  const loadMessages = async (caseId: string) => {
    const { data } = await supabase.from('support_messages').select('*').eq('case_id', caseId).order('created_at', { ascending: true });
    setMessages(data || []);
  };
  useEffect(() => { if (selectedId) loadMessages(selectedId); }, [selectedId]);

  const filtered = statusTab === 'all' ? cases : cases.filter(c => c.status === statusTab);

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
    <div className="flex-1 grid grid-cols-1 md:grid-cols-[280px_1fr_280px] overflow-hidden">
      {/* Queue */}
      <div className={`border-r border-gray-100 bg-white overflow-y-auto ${selectedId ? 'hidden md:block' : ''}`}>
        <div className="flex flex-wrap gap-1 p-3 border-b border-gray-50">
          {STATUS_TABS.map(t => (
            <button key={t.id} onClick={() => setStatusTab(t.id)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${statusTab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="divide-y divide-gray-50">
          {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-10">No cases.</p>}
          {filtered.map(c => (
            <button key={c.id} onClick={() => setSelectedId(c.id)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${selectedId === c.id ? 'bg-blue-50' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-900 truncate">{c.subject}</span>
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${PRIORITY_CLASS[c.priority]}`}>{c.priority}</span>
              </div>
              <p className="text-[11px] text-gray-400">#{c.case_number} · {c.profiles?.name || c.user_id.slice(0, 8)}</p>
              <p className="text-[10px] text-gray-300 mt-0.5">{TOPIC_LABEL[c.category] || c.category} · {STATUS_LABEL[c.status]}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex flex-col bg-gray-50 overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Select a case</div>
        ) : (
          <>
            <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
              <button onClick={() => setSelectedId(null)} className="md:hidden w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
                <ArrowLeft className="w-4 h-4 text-gray-500" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-gray-900 truncate">{selected.subject}</p>
                <p className="text-[11px] text-gray-400">#{selected.case_number}</p>
              </div>
              <select value={selected.priority} onChange={e => doPriority(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1">
                {['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={selected.status} onChange={e => doStatus(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1">
                {Object.keys(STATUS_LABEL).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              {!selected.assigned_admin_id && (
                <button onClick={doAssign} className="text-xs font-bold text-blue-600 whitespace-nowrap">Assign to me</button>
              )}
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
                    <p>{m.content}</p>
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

export function AdminSupport() {
  const navigate = useNavigate();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => { setSession(adminAuthClient.getAdmin()); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) return;
    setLoggingIn(true);
    const { success, error } = await adminAuthClient.login(name.trim(), password);
    if (success) {
      setSession(adminAuthClient.getAdmin());
    } else {
      toast.error(error || 'Incorrect name or password');
    }
    setLoggingIn(false);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-blue-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <LifeBuoy className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-gray-900">Customer Support</h1>
            <p className="text-gray-400 text-sm mt-1">Filmons admin console</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Admin name" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 pr-10" />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button type="submit" disabled={loggingIn} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3 transition-colors disabled:opacity-60">
              {loggingIn ? 'Signing in…' : 'Sign In'}
            </button>
            <button type="button" onClick={() => navigate('/')} className="w-full text-gray-500 hover:text-gray-700 text-sm flex items-center justify-center gap-2 py-2">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><LifeBuoy className="w-4 h-4 text-white" /></div>
          <div>
            <h1 className="text-sm font-black text-gray-900">Customer Support</h1>
            <p className="text-[11px] text-gray-400">Signed in as {session.name}</p>
          </div>
        </div>
        <button onClick={() => { adminAuthClient.logout(); setSession(null); }} className="text-xs font-bold text-gray-500">Log out</button>
      </div>
      <CaseConsole admin={session} />
    </div>
  );
}
