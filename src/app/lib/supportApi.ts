// Support-case data access. Case creation and the user's own message sends
// go directly through Supabase (same open-RLS trust model as the rest of
// this app's tables the signed-in user already writes to, e.g.
// conversations/messages). AI turns and admin actions go through edge
// functions — see support-ai-chat and support-case-admin-action.
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { uploadSupportAttachment, signSupportAttachment } from '../../lib/upload';

export type SupportCaseStatus = 'open' | 'waiting_for_agent' | 'in_review' | 'waiting_for_customer' | 'resolved' | 'closed';
export type SupportPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface RelatedIds {
  orderId?: string;
  listingId?: string;
  walletTransactionId?: string;
  payoutRequestId?: string;
  verificationId?: string;
}

export interface SupportCase {
  id: string;
  case_number: string;
  user_id: string;
  category: string;
  subcategory: string | null;
  subject: string;
  status: SupportCaseStatus;
  priority: SupportPriority;
  related_order_id: string | null;
  related_listing_id: string | null;
  related_wallet_transaction_id: string | null;
  related_payout_request_id: string | null;
  related_verification_id: string | null;
  ai_summary: string | null;
  assigned_admin_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
}

export interface SupportMessage {
  id: string;
  case_id: string;
  sender_type: 'user' | 'ai' | 'agent' | 'system';
  sender_id: string | null;
  sender_name: string | null;
  content: string;
  attachments: { path: string; name: string }[];
  is_internal_note: boolean;
  created_at: string;
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

export const STATUS_LABEL: Record<SupportCaseStatus, string> = {
  open: 'Open',
  waiting_for_agent: 'Waiting for Support',
  in_review: 'In Review',
  waiting_for_customer: 'Waiting for You',
  resolved: 'Resolved',
  closed: 'Closed',
};

const FUNCTIONS_BASE = `https://${projectId}.supabase.co/functions/v1`;

export const supportApi = {
  // ── AI chat (pre-escalation, ephemeral) ──────────────────────────────
  async aiChat(params: { userId: string; category: string; subcategory?: string; relatedIds: RelatedIds; history: ChatTurn[] }) {
    const res = await fetch(`${FUNCTIONS_BASE}/support-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
      body: JSON.stringify({ mode: 'chat', ...params }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'AI request failed');
    return data as { reply: string; recommendEscalate: boolean };
  },

  async aiSummarize(params: { userId: string; category: string; subcategory?: string; relatedIds: RelatedIds; history: ChatTurn[] }) {
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/support-ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ mode: 'summarize', ...params }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return null;
      return data.summary as string;
    } catch {
      return null;
    }
  },

  // ── Case creation (escalation) ───────────────────────────────────────
  async createCase(params: {
    userId: string; category: string; subcategory?: string; subject: string;
    relatedIds: RelatedIds; aiSummary: string | null; priorTurns: ChatTurn[];
  }): Promise<SupportCase> {
    const priority: SupportPriority =
      params.category === 'trust_safety' || ['account_compromised', 'missing_balance', 'payout_problem'].includes(params.subcategory || '')
        ? 'urgent'
        : ['payments_refunds', 'wallet_payouts'].includes(params.category) ? 'high' : 'normal';

    const { data, error } = await supabase.from('support_cases').insert({
      user_id: params.userId,
      category: params.category,
      subcategory: params.subcategory || null,
      subject: params.subject,
      status: 'waiting_for_agent',
      priority,
      related_order_id: params.relatedIds.orderId || null,
      related_listing_id: params.relatedIds.listingId || null,
      related_wallet_transaction_id: params.relatedIds.walletTransactionId || null,
      related_payout_request_id: params.relatedIds.payoutRequestId || null,
      related_verification_id: params.relatedIds.verificationId || null,
      ai_summary: params.aiSummary,
    }).select('*').single();
    if (error || !data) throw new Error(error?.message || 'Could not create case');

    if (params.priorTurns.length) {
      const rows = params.priorTurns.map(t => ({
        case_id: data.id,
        sender_type: t.role === 'user' ? 'user' : 'ai',
        content: t.content,
      }));
      await supabase.from('support_messages').insert(rows);
    }

    fetch(`https://${projectId}.supabase.co/functions/v1/notify-event`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
      body: JSON.stringify({ type: 'support_case_admin', caseId: data.id, userId: params.userId, category: params.category, message: params.aiSummary || params.subject }),
    }).catch(() => {});

    return data as SupportCase;
  },

  // ── User-facing reads/writes ─────────────────────────────────────────
  async getMyCases(userId: string): Promise<SupportCase[]> {
    const { data } = await supabase.from('support_cases').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
    return data || [];
  },

  async getCase(caseId: string): Promise<SupportCase | null> {
    const { data } = await supabase.from('support_cases').select('*').eq('id', caseId).maybeSingle();
    return data || null;
  },

  async getMessages(caseId: string): Promise<SupportMessage[]> {
    const { data } = await supabase.from('support_messages').select('*').eq('case_id', caseId).eq('is_internal_note', false).order('created_at', { ascending: true });
    return data || [];
  },

  async sendUserMessage(caseId: string, userId: string, userName: string, content: string, attachments: { path: string; name: string }[] = []) {
    const { error } = await supabase.from('support_messages').insert({
      case_id: caseId, sender_type: 'user', sender_id: userId, sender_name: userName,
      content, attachments,
    });
    if (error) throw new Error(error.message);
    await supabase.from('support_cases').update({ updated_at: new Date().toISOString(), status: 'in_review' }).eq('id', caseId);
  },

  async uploadAttachment(userId: string, file: File): Promise<{ path: string; name: string }> {
    const path = await uploadSupportAttachment(userId, file);
    return { path, name: file.name };
  },

  async signAttachment(path: string): Promise<string | null> {
    return signSupportAttachment(path);
  },

  subscribeToCase(caseId: string, onMessage: (msg: SupportMessage) => void) {
    const channel = supabase
      .channel(`support-case-${caseId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `case_id=eq.${caseId}` }, (payload) => {
        const row = payload.new as SupportMessage;
        if (!row.is_internal_note) onMessage(row);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },
};
