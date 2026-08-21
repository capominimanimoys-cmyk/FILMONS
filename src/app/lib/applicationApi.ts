// Thin client for the manage-application edge function — the ONE path that
// mutates opportunity_applications.status (shortlist/accept/decline/withdraw/
// view/mark_contacted/bulk_*), server-verifying ownership the same way
// delete-listing does. Both the Inbox Application Card and the Dashboard
// Applicants Manager call through here, never a raw supabase.update(), so
// status can never drift between the two surfaces.
import { projectId, publicAnonKey } from '/utils/supabase/info';

export interface OpportunityApplicationRow {
  id: string;
  listing_id: string;
  applicant_id: string;
  message: string | null;
  status: 'pending' | 'viewed' | 'shortlisted' | 'contacted' | 'accepted' | 'rejected' | 'withdrawn';
  created_at: string;
  portfolio_url: string | null;
  resume_url: string | null;
  demo_reel_url: string | null;
  availability: string | null;
  expected_rate: string | null;
  custom_answers: Record<string, string>;
  viewed_at?: string | null;
  shortlisted_at?: string | null;
  contacted_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  withdrawn_at?: string | null;
  decline_reason?: string | null;
  host_notes?: string | null;
  owner_id?: string | null;
  accepted_details?: { position?: string; agreedRate?: string; startDate?: string } | null;
  conversation_id?: string | null;
}

async function call(action: string, body: Record<string, unknown>): Promise<{ success?: boolean; error?: string; application?: OpportunityApplicationRow; results?: any[] }> {
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/manage-application`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data;
}

export const applicationApi = {
  view: (applicationId: string, userId: string) => call('view', { applicationId, userId }),
  shortlist: (applicationId: string, userId: string) => call('shortlist', { applicationId, userId }),
  accept: (applicationId: string, userId: string, details?: { position?: string; agreedRate?: string; startDate?: string }) =>
    call('accept', { applicationId, userId, ...details }),
  decline: (applicationId: string, userId: string, reason?: string, hostNote?: string) =>
    call('decline', { applicationId, userId, reason, hostNote }),
  withdraw: (applicationId: string, userId: string) => call('withdraw', { applicationId, userId }),
  markContacted: (applicationId: string, userId: string) => call('mark_contacted', { applicationId, userId }),
  updateNotes: (applicationId: string, userId: string, notes: string) => call('update_notes', { applicationId, userId, notes }),
  bulkShortlist: (applicationIds: string[], userId: string) => call('bulk_shortlist', { applicationIds, userId }),
  bulkDecline: (applicationIds: string[], userId: string, reason?: string) => call('bulk_decline', { applicationIds, userId, reason }),
};
