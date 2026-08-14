// Real Supabase-backed wallet — replaces the old cadWalletApi (pure
// localStorage, no pending/available split). This module only ever SELECTs
// from wallets/wallet_transactions and INSERTs a payout *request* (not a
// balance mutation) — actual balance changes only ever happen via
// fn_finalize_payment / fn_release_pending_earnings, called with the
// service-role key from the Stripe webhook, the cash-payment Edge
// Function, and the scheduled release job. See
// supabase/migrations/20240216000000_wallet_ledger.sql.
import { supabase } from '../../lib/supabase';

export interface WalletBalance {
  pending: number;
  available: number;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  order_id: string | null;
  transaction_type: 'rental_earning' | 'service_earning' | 'sale_earning' | 'filmons_fee' | 'refund' | 'payout' | 'adjustment' | 'reversal';
  amount: number;
  currency: string;
  balance_type: 'pending' | 'available';
  status: 'pending' | 'available' | 'reversed' | 'collected' | 'paid_out';
  description: string | null;
  created_at: string;
  available_at: string | null;
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

  async requestPayout(hostId: string, amount: number): Promise<{ success: boolean; error?: string }> {
    const walletId = await getOrCreateHostWalletId(hostId);
    if (!walletId) return { success: false, error: 'No wallet found' };
    const { data: wallet } = await supabase.from('wallets').select('available_balance, currency').eq('id', walletId).single();
    if (!wallet || amount <= 0 || amount > Number(wallet.available_balance)) {
      return { success: false, error: 'Requested amount exceeds available balance' };
    }
    const { error } = await supabase.from('payout_requests').insert({
      wallet_id: walletId, host_id: hostId, amount, currency: wallet.currency || 'CAD', status: 'requested',
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async getPayoutRequests(hostId: string) {
    const { data } = await supabase.from('payout_requests').select('*').eq('host_id', hostId).order('requested_at', { ascending: false });
    return data || [];
  },
};
