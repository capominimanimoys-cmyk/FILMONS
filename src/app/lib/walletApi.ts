// Real Supabase-backed wallet — replaces the old cadWalletApi (pure
// localStorage, no pending/available split). This module only ever SELECTs
// from wallets/wallet_transactions — actual balance changes only ever
// happen via fn_finalize_payment / fn_release_pending_earnings /
// fn_request_payout / fn_process_refund, called with the service-role key
// from the Stripe webhook and dedicated Edge Functions. See
// supabase/migrations/20240216000000_wallet_ledger.sql and
// 20240218000000_refunds_disputes.sql.
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export interface WalletBalance {
  pending: number;
  available: number;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  order_id: string | null;
  transaction_type: 'rental_earning' | 'service_earning' | 'sale_earning' | 'filmons_fee' | 'refund' | 'payout' | 'adjustment' | 'reversal' | 'boost_purchase' | 'instant_payout_fee';
  amount: number;
  currency: string;
  balance_type: 'pending' | 'available';
  status: 'pending' | 'available' | 'reversed' | 'collected' | 'paid_out' | 'held' | 'processing';
  description: string | null;
  created_at: string;
  available_at: string | null;
}

// 'card'/'bank' are the new Stripe Connect-backed methods; 'interac'/
// 'bank_transfer' are grandfathered legacy rows from before Stripe Connect
// existed in this app — still fully functional for hosts who already saved
// one, just no longer offered for new Add/Change setups.
export type PayoutMethodType = 'interac' | 'bank_transfer' | 'card' | 'bank';
export type PayoutSpeed = 'standard' | 'instant';

export interface InteracDestination {
  email: string;
  name?: string;
}

export interface BankTransferDestination {
  accountHolder: string;
  institutionNumber: string;
  transitNumber: string;
  accountNumber: string;
}

export type PayoutDestination = InteracDestination | BankTransferDestination;

export interface PayoutMethod {
  id: string;
  host_id: string;
  method: PayoutMethodType;
  details: PayoutDestination | null; // null for Stripe-backed rows — Filmons never has raw numbers to store
  is_default: boolean;
  created_at: string;
  // Stripe Connect fields — present only when provider === 'stripe'
  provider?: 'manual' | 'stripe';
  display_name?: string | null;
  last4?: string | null;
  country?: string | null;
  currency?: string | null;
  standard_payout_eligible?: boolean;
  instant_payout_eligible?: boolean;
  status?: 'pending' | 'ready' | 'incomplete';
  stripe_connect_account_id?: string | null;
}

export interface PayoutRequest {
  id: string;
  host_id: string;
  amount: number;
  currency: string;
  status: 'requested' | 'under_review' | 'approved' | 'processing' | 'paid' | 'rejected' | 'cancelled';
  payout_method: PayoutMethodType | null;
  payout_destination: PayoutDestination | null;
  payment_reference: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  requested_at: string;
  processed_at: string | null;
  processed_by: string | null;
  payout_speed: PayoutSpeed;
  fee_amount: number;
  net_amount: number | null;
  estimated_arrival_at: string | null;
}

function maskDestination(method: PayoutMethodType, details: PayoutDestination | null, last4?: string | null): string {
  if (method === 'card' || method === 'bank') return `•••• ${last4 || '----'}`;
  if (method === 'interac') {
    const email = (details as InteracDestination)?.email || '';
    const [user, domain] = email.split('@');
    if (!domain) return email;
    return `${user.slice(0, 2)}${'•'.repeat(Math.max(user.length - 2, 3))}@${domain}`;
  }
  const acct = (details as BankTransferDestination)?.accountNumber || '';
  return `••••${acct.slice(-4)}`;
}

async function getOrCreateHostWalletId(hostId: string): Promise<string | null> {
  const { data } = await supabase.from('wallets').select('id').eq('owner_type', 'host').eq('owner_id', hostId).maybeSingle();
  return data?.id || null;
}

export const walletApi = {
  async getBalance(hostId: string): Promise<WalletBalance> {
    const { data } = await supabase.from('wallets').select('pending_balance, available_balance, currency').eq('owner_type', 'host').eq('owner_id', hostId).maybeSingle();
    if (!data) return { pending: 0, available: 0, currency: 'CAD' };
    return { pending: Number(data.pending_balance) || 0, available: Number(data.available_balance) || 0, currency: data.currency || 'CAD' };
  },

  async getTransactions(hostId: string, limit = 100): Promise<WalletTransaction[]> {
    const walletId = await getOrCreateHostWalletId(hostId);
    if (!walletId) return [];
    const { data } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  },

  async requestPayout(
    hostId: string,
    amount: number,
    payoutMethod?: PayoutMethodType,
    payoutDestination?: PayoutDestination,
    payoutSpeed?: PayoutSpeed,
  ): Promise<{
    success: boolean; error?: string; payoutRequestId?: string;
    payoutSpeed?: PayoutSpeed; feeAmount?: number; netAmount?: number; estimatedArrivalAt?: string;
  }> {
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/request-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ hostId, amount, payoutMethod, payoutDestination, payoutSpeed }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return { success: false, error: data.error || 'Could not request payout' };
      return {
        success: true, payoutRequestId: data.payoutRequestId,
        payoutSpeed: data.payoutSpeed, feeAmount: data.feeAmount, netAmount: data.netAmount,
        estimatedArrivalAt: data.estimatedArrivalAt,
      };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  },

  // Display-only — never used to enforce/compute the actual fee, which is
  // always resolved server-side inside request-payout from the same table.
  async getPayoutConfig(): Promise<{ instantFeeRate: number }> {
    const { data } = await supabase.from('payout_config').select('instant_fee_rate').eq('id', 1).maybeSingle();
    return { instantFeeRate: data?.instant_fee_rate ?? 0.02 };
  },

  async getPayoutRequests(hostId: string): Promise<PayoutRequest[]> {
    const { data } = await supabase.from('payout_requests').select('*').eq('host_id', hostId).order('requested_at', { ascending: false });
    return data || [];
  },

  async getPayoutMethods(hostId: string): Promise<PayoutMethod[]> {
    const { data } = await supabase.from('payout_methods').select('*').eq('host_id', hostId).order('created_at', { ascending: false });
    return data || [];
  },

  async getDefaultPayoutMethod(hostId: string): Promise<PayoutMethod | null> {
    const { data } = await supabase
      .from('payout_methods')
      .select('*')
      .eq('host_id', hostId)
      .eq('is_default', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  },

  async savePayoutMethod(hostId: string, method: PayoutMethodType, details: PayoutDestination): Promise<{ success: boolean; error?: string }> {
    try {
      // Only one default method for now — clear any existing default first.
      await supabase.from('payout_methods').update({ is_default: false }).eq('host_id', hostId).eq('is_default', true);
      const { error } = await supabase.from('payout_methods').insert({ host_id: hostId, method, details, is_default: true });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  },

  maskDestination,

  // ── "Verify It's You" step-up + Stripe Connect payout method setup ──────
  async verifyIdentity(userId: string, method: 'password' | 'phone' | 'oauth', payload: Record<string, unknown>): Promise<{ success: boolean; stepUpToken?: string; error?: string }> {
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/verify-identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ userId, method, ...payload }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return { success: false, error: data.error || 'Verification failed' };
      return { success: true, stepUpToken: data.stepUpToken };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  },

  async startPayoutConnect(userId: string, stepUpToken: string, returnUrl: string, refreshUrl: string, country?: 'CA' | 'US'): Promise<{ url?: string; error?: string }> {
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/payout-connect-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ userId, stepUpToken, country, returnUrl, refreshUrl }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return { error: data.error || 'Could not start payout method setup' };
      return { url: data.url };
    } catch (e: any) {
      return { error: e?.message || 'Network error' };
    }
  },

  async getPayoutConnectStatus(userId: string): Promise<{ success: boolean; payoutMethod: SafePayoutMethodResult | null; error?: string }> {
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/payout-connect-status?userId=${userId}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) return { success: false, payoutMethod: null, error: data.error || 'Could not check status' };
      return { success: true, payoutMethod: data.payoutMethod };
    } catch (e: any) {
      return { success: false, payoutMethod: null, error: e?.message || 'Network error' };
    }
  },
};

export interface SafePayoutMethodResult {
  method: 'card' | 'bank';
  displayName: string;
  last4: string | null;
  country: string | null;
  currency: string | null;
  standardPayoutEligible: boolean;
  instantPayoutEligible: boolean;
  status: 'pending' | 'ready' | 'incomplete';
}
