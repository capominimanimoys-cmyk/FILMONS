// Thin client for the manage-hire-request / fund-hire edge functions —
// mirrors src/app/lib/applicationApi.ts's shape exactly. The ONE path
// that mutates hire_requests/hire_transactions, server-verifying
// ownership the same way manage-application does.
import { projectId, publicAnonKey } from '/utils/supabase/info';

export interface HireRequestRow {
  id: string;
  conversation_id: string;
  requester_id: string;
  host_id: string;
  service_listing_id: string | null;
  service_label: string;
  is_custom: boolean;
  project_title: string;
  description: string;
  reference_links: string[] | null;
  portfolio_item_id: string | null;
  work_type: 'on_site' | 'remote' | 'hybrid';
  street_address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  date_type: 'specific' | 'range' | 'flexible';
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  pricing_type: 'hourly' | 'daily' | 'fixed';
  use_creator_rate: boolean;
  budget_amount: number | null;
  currency: string;
  message: string | null;
  last_offer_by: string | null;
  status: 'sent' | 'countered' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'payment_pending' | 'hired' | 'completed';
  viewed_at: string | null;
  decline_reason: string | null;
  created_at: string;
}

export interface HireTransactionRow {
  id: string;
  hire_request_id: string;
  order_id: string | null;
  requester_id: string;
  host_id: string;
  gross_amount: number;
  fee_rate: number;
  fee_amount: number;
  net_amount: number;
  currency: string;
  initial_release_amount: number | null;
  held_amount: number | null;
  payment_status: 'pending' | 'funded' | 'completed' | 'refunded' | 'cancelled';
  work_status: 'in_progress' | 'marked_complete_by_worker' | 'completed';
  funded_at: string | null;
  completed_at: string | null;
}

async function call(action: string, body: Record<string, unknown>): Promise<{ success?: boolean; error?: string; hireRequest?: HireRequestRow }> {
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/manage-hire-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data;
}

export const hireApi = {
  sendHireRequest: (userId: string, params: {
    conversationId: string; hostId: string; serviceListingId?: string | null; serviceLabel: string; isCustom?: boolean;
    projectTitle: string; description: string; referenceLinks?: string[]; portfolioItemId?: string | null;
    workType: 'on_site' | 'remote' | 'hybrid'; streetAddress?: string; city?: string; province?: string; postalCode?: string; country?: string;
    dateType: 'specific' | 'range' | 'flexible'; startDate?: string; endDate?: string; startTime?: string; endTime?: string;
    pricingType: 'hourly' | 'daily' | 'fixed'; useCreatorRate?: boolean; budgetAmount?: number; currency?: string; message?: string;
  }) => call('send_hire_request', { userId, ...params }),

  markViewed: (hireRequestId: string, userId: string) => call('mark_viewed', { hireRequestId, userId }),
  counterOffer: (hireRequestId: string, userId: string, amount: number, extras?: { pricingType?: string; startDate?: string; endDate?: string; message?: string }) =>
    call('counter_offer', { hireRequestId, userId, amount, ...extras }),
  acceptCurrentTerms: (hireRequestId: string, userId: string) => call('accept_current_terms', { hireRequestId, userId }),
  declineCurrentTerms: (hireRequestId: string, userId: string, reason?: string) => call('decline_current_terms', { hireRequestId, userId, reason }),
  cancelHireRequest: (hireRequestId: string, userId: string) => call('cancel_hire_request', { hireRequestId, userId }),
  markWorkCompleted: (hireRequestId: string, userId: string) => call('mark_work_completed', { hireRequestId, userId }),
  confirmCompletion: (hireRequestId: string, userId: string) => call('confirm_completion', { hireRequestId, userId }),
  reportProblem: (hireRequestId: string, userId: string) => call('report_problem', { hireRequestId, userId }),
};

async function callFund(path: string, opts: { method: 'GET' | 'POST'; body?: Record<string, unknown> }) {
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/fund-hire${path}`, {
    method: opts.method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data;
}

export const hirePaymentApi = {
  startFunding: (userId: string, hireRequestId: string, successUrl: string, cancelUrl: string): Promise<{ url: string; session_id: string }> =>
    callFund('', { method: 'POST', body: { userId, hireRequestId, successUrl, cancelUrl } }),
  verifyFunding: (sessionId: string): Promise<{ success: boolean; funded: boolean; hireRequest: HireRequestRow | null }> =>
    callFund(`/verify?session_id=${sessionId}`, { method: 'GET' }),
};
