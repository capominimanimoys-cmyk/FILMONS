// ─────────────────────────────────────────────────────────────────────────────
// Filmons Points (FP) — Core system
// Reads from localStorage (instant UI), writes to both localStorage AND server.
// ─────────────────────────────────────────────────────────────────────────────

import { projectId, publicAnonKey } from '/utils/supabase/info';
import { supabase } from '../../lib/supabase';

export const FP = {
  BUY_RATE:             0.04,
  PAYOUT_RATE:          0.027,
  PLATFORM_FEE:         0.15,
  WITHDRAWAL_FEE:       0.05,
  MIN_WITHDRAWAL_CAD:   5,
  MIN_WITHDRAWAL:       186,
  MIN_CUSTOM_BUY_CAD:   1,
  DAILY_VIEW_CAP:       20,
  VIEWS_PER_FP:         1000,
  VIEWS_FP_BASE:        1,
  VIEWS_FP_BONUS:       2,
} as const;

export const FP_PACKS = [
  { id: 'p100',  fp: 100,  cad: 3.99,  label: 'Starter',  color: 'from-blue-400 to-blue-600',    popular: false },
  { id: 'p500',  fp: 500,  cad: 20.99, label: 'Creator',  color: 'from-purple-500 to-purple-700', popular: true  },
  { id: 'p750',  fp: 750,  cad: 30.99, label: 'Pro',      color: 'from-indigo-500 to-blue-700',   popular: false },
  { id: 'p1000', fp: 1000, cad: 38.99, label: 'Power',    color: 'from-blue-700 to-indigo-900',   popular: false },
] as const;

export const BOOST_OPTIONS = [
  { id: 'b_small',    fp: 25,  label: 'Quick Boost',   days: 7,  reach: '~500 extra views',   color: 'bg-blue-50 border-blue-200 text-blue-800' },
  { id: 'b_strong',   fp: 100, label: 'Strong Boost',  days: 14, reach: '~3,000 extra views', color: 'bg-purple-50 border-purple-200 text-purple-800' },
  { id: 'b_featured', fp: 300, label: 'Featured Spot', days: 30, reach: 'Top of marketplace', color: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
] as const;

export const PAYMENT_METHODS = [
  { id: 'fp',          label: 'FP (Filmons Points)', icon: '⚡', desc: 'Pay instantly with your FP balance' },
  { id: 'credit',      label: 'Credit Card',          icon: '💳', desc: 'Visa, Mastercard, Amex' },
  { id: 'debit',       label: 'Debit Card',            icon: '🏦', desc: 'Interac, Visa Debit' },
  { id: 'apple_pay',   label: 'Apple Pay',             icon: '🍎', desc: 'Touch ID / Face ID' },
  { id: 'paypal',      label: 'PayPal',                icon: '🅿️', desc: 'Pay with your PayPal account' },
] as const;

export type PaymentMethodId = typeof PAYMENT_METHODS[number]['id'];

export const BUY_PAYMENT_METHODS = [
  { id: 'credit',    label: 'Credit Card',  icon: '💳' },
  { id: 'debit',     label: 'Debit Card',   icon: '🏦' },
  { id: 'paypal',    label: 'PayPal',       icon: '🅿️' },
  { id: 'apple_pay', label: 'Apple Pay',    icon: '🍎' },
] as const;

export const PAYOUT_METHODS = [
  { id: 'paypal',    label: 'PayPal',      icon: '🅿️', placeholder: 'PayPal email address', requiresCardForm: false },
  { id: 'etransfer', label: 'E-Transfer',  icon: '📲', placeholder: 'Email for e-Transfer',  requiresCardForm: false },
  { id: 'credit',    label: 'Credit Card', icon: '💳', placeholder: 'Card number',           requiresCardForm: true  },
  { id: 'debit',     label: 'Debit Card',  icon: '🏦', placeholder: 'Card number',           requiresCardForm: true  },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────

export type FPTxType =
  | 'purchase' | 'earn_sale' | 'earn_views'
  | 'boost_post' | 'boost_listing'
  | 'marketplace_spend' | 'marketplace_earn'
  | 'withdrawal' | 'send_fp' | 'receive_fp' | 'admin_credit';

export interface FPTransaction {
  id: string; userId: string; type: FPTxType;
  fpAmount: number; cadEquiv: number; description: string;
  status: 'completed' | 'pending' | 'processing';
  createdAt: string; metadata?: Record<string, any>;
}

export interface FPAccount {
  userId: string; balance: number;
  lifetimeEarned: number; lifetimeSpent: number;
  lifetimePurchased: number; lifetimeWithdrawn: number;
  pendingViewsFP: number; dailyViewsFP: number; dailyViewsDate: string;
  withdrawalPending: boolean; payoutMethod?: string; payoutDetails?: string;
}

// ── LocalStorage keys (kept for instant reads) ────────────────────────────

const KEY_ACCOUNTS = 'filmons_fp_accounts';
const KEY_TXS      = 'filmons_fp_transactions';

// ── Server helper ──────────────────────────────────────────────────────────

const SERVER = `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879`;
const H = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` };

function serverPost(path: string, body: any): Promise<any> {
  return fetch(`${SERVER}${path}`, { method: 'POST', headers: H, body: JSON.stringify(body) })
    .then(r => r.json())
    .catch(e => { console.error(`FP server error ${path}:`, e); });
}
function serverPut(path: string, body: any): Promise<any> {
  return fetch(`${SERVER}${path}`, { method: 'PUT', headers: H, body: JSON.stringify(body) })
    .then(r => r.json())
    .catch(e => { console.error(`FP server error ${path}:`, e); });
}

// ── Local helpers ──────────────────────────────────────────────────────────

function loadAccounts(): Record<string, FPAccount> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_ACCOUNTS) || '{}');
    // Fix corrupted data: if any value is a string, parse it
    const fixed: Record<string, FPAccount> = {};
    for (const [k, v] of Object.entries(raw)) {
      fixed[k] = typeof v === 'string' ? JSON.parse(v) : v as FPAccount;
    }
    return fixed;
  } catch { return {}; }
}
function saveAccounts(data: Record<string, FPAccount>) {
  localStorage.setItem(KEY_ACCOUNTS, JSON.stringify(data));
}
function loadTxs(): FPTransaction[] {
  try { return JSON.parse(localStorage.getItem(KEY_TXS) || '[]'); } catch { return []; }
}
function saveTxs(data: FPTransaction[]) {
  localStorage.setItem(KEY_TXS, JSON.stringify(data));
}
function mkId() { return `fp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

// ── Public API (sync reads + dual-write to localStorage & server) ─────────

export const fpApi = {
  getAccount(userId: string): FPAccount {
    const accounts = loadAccounts();
    if (!accounts[userId]) {
      accounts[userId] = {
        userId, balance: 0,
        lifetimeEarned: 0, lifetimeSpent: 0,
        lifetimePurchased: 0, lifetimeWithdrawn: 0,
        pendingViewsFP: 0, dailyViewsFP: 0, dailyViewsDate: '',
        withdrawalPending: false,
      };
      saveAccounts(accounts);
    }
    return accounts[userId];
  },

  /** Async version — fetches from server and syncs local cache */
  async getAccountAsync(userId: string): Promise<FPAccount> {
    try {
      const res = await fetch(`${SERVER}/fp/account/${userId}`, { headers: H });
      const data = await res.json();
      if (data.account) {
        const accounts = loadAccounts();
        accounts[userId] = data.account;
        saveAccounts(accounts);
        return data.account;
      }
    } catch (e) { console.error('getAccountAsync error:', e); }
    return fpApi.getAccount(userId);
  },

  getBalance(userId: string): number {
    return fpApi.getAccount(userId).balance;
  },

  getTransactions(userId: string): FPTransaction[] {
    return loadTxs()
      .filter(t => t.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /** Async version — fetches from server */
  async getTransactionsAsync(userId: string): Promise<FPTransaction[]> {
    try {
      const res = await fetch(`${SERVER}/fp/transactions/${userId}`, { headers: H });
      const data = await res.json();
      if (data.transactions) {
        // Merge into local cache
        const existing = loadTxs().filter(t => t.userId !== userId);
        saveTxs([...existing, ...data.transactions]);
        return data.transactions;
      }
    } catch (e) { console.error('getTransactionsAsync error:', e); }
    return fpApi.getTransactions(userId);
  },

  getAllTransactions(): FPTransaction[] {
    return loadTxs().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getAllTransactionsAsync(): Promise<FPTransaction[]> {
    try {
      const res = await fetch(`${SERVER}/fp/transactions/all`, { headers: H });
      const data = await res.json();
      if (data.transactions) { saveTxs(data.transactions); return data.transactions; }
    } catch (e) { console.error('getAllTransactionsAsync error:', e); }
    return fpApi.getAllTransactions();
  },

  getAllAccounts(): FPAccount[] {
    return Object.values(loadAccounts());
  },

  async getAllAccountsAsync(): Promise<FPAccount[]> {
    try {
      const res = await fetch(`${SERVER}/fp/accounts/all`, { headers: H });
      const data = await res.json();
      if (data.accounts) {
        const map: Record<string, FPAccount> = {};
        (data.accounts as FPAccount[]).forEach(a => { map[a.userId] = a; });
        saveAccounts(map);
        return data.accounts;
      }
    } catch (e) { console.error('getAllAccountsAsync error:', e); }
    return fpApi.getAllAccounts();
  },

  savePayoutInfo(userId: string, method: string, details: string) {
    const accounts = loadAccounts();
    const acc = fpApi.getAccount(userId);
    accounts[userId] = { ...acc, payoutMethod: method, payoutDetails: details };
    saveAccounts(accounts);
    // Sync to server (fire & forget)
    serverPut(`/fp/payout/${userId}`, { method, details });
  },

  credit(userId: string, fpAmount: number, type: FPTxType, description: string, metadata?: Record<string, any>): FPTransaction {
    // Local write (instant)
    const accounts = loadAccounts();
    const acc = fpApi.getAccount(userId);
    acc.balance += fpAmount; acc.lifetimeEarned += fpAmount;
    if (type === 'purchase') acc.lifetimePurchased += fpAmount;
    accounts[userId] = acc; saveAccounts(accounts);
    const tx: FPTransaction = { id: mkId(), userId, type, fpAmount, cadEquiv: parseFloat((fpAmount * FP.BUY_RATE).toFixed(2)), description, status: 'completed', createdAt: new Date().toISOString(), metadata };
    const txs = loadTxs(); txs.push(tx); saveTxs(txs);
    // DB write (async) — only for non-Stripe credits (Stripe credits are written by edge function)
    if (!metadata?.stripe) {
      supabase.from('transactions').insert({
        user_id: userId, type, fp_amount: fpAmount,
        cad_amount: parseFloat((fpAmount * FP.BUY_RATE).toFixed(2)),
        description, status: 'completed', metadata: metadata || {},
      }).then(({ error }) => {
        if (error) console.error('[DB] fp credit transaction failed:', error);
        return supabase.from('fp_wallets').upsert({
          user_id: userId, balance: acc.balance,
          lifetime_earned: acc.lifetimeEarned, lifetime_spent: acc.lifetimeSpent,
          lifetime_purchased: acc.lifetimePurchased, lifetime_withdrawn: acc.lifetimeWithdrawn,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      }).then(({ error }: any) => {
        if (error) console.error('[DB] fp_wallets upsert failed:', error);
      }).catch((e: any) => console.error('[DB] fp credit error:', e));
    }
    // Server write (async)
    serverPost('/fp/credit', { userId, fpAmount, type, description, metadata });
    return tx;
  },

  debit(userId: string, fpAmount: number, type: FPTxType, description: string, metadata?: Record<string, any>): FPTransaction | false {
    const accounts = loadAccounts();
    const acc = fpApi.getAccount(userId);
    if (acc.balance < fpAmount) return false;
    acc.balance -= fpAmount; acc.lifetimeSpent += fpAmount;
    accounts[userId] = acc; saveAccounts(accounts);
    const tx: FPTransaction = { id: mkId(), userId, type, fpAmount: -fpAmount, cadEquiv: -parseFloat((fpAmount * FP.BUY_RATE).toFixed(2)), description, status: 'completed', createdAt: new Date().toISOString(), metadata };
    const txs = loadTxs(); txs.push(tx); saveTxs(txs);
    // DB write (async)
    supabase.from('transactions').insert({
      user_id: userId, type, fp_amount: -fpAmount,
      cad_amount: -parseFloat((fpAmount * FP.BUY_RATE).toFixed(2)),
      description, status: 'completed', metadata: metadata || {},
    }).then(() => {
      supabase.from('fp_wallets').upsert({
        user_id: userId, balance: acc.balance,
        lifetime_earned: acc.lifetimeEarned, lifetime_spent: acc.lifetimeSpent,
        lifetime_purchased: acc.lifetimePurchased, lifetime_withdrawn: acc.lifetimeWithdrawn,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' }).catch(() => {});
    }).catch(() => {});
    // Server write (async)
    serverPost('/fp/debit', { userId, fpAmount, type, description, metadata });
    return tx;
  },

  purchasePack(userId: string, packId: string): { success: boolean; tx?: FPTransaction; error?: string } {
    const pack = FP_PACKS.find(p => p.id === packId);
    if (!pack) return { success: false, error: 'Pack not found' };
    const tx = fpApi.credit(userId, pack.fp, 'purchase', `Purchased ${pack.fp} FP (${pack.label} Pack) — $${pack.cad} CAD`, { packId, cad: pack.cad });
    return { success: true, tx };
  },

  purchaseCustom(userId: string, cadAmount: number, paymentMethod: string): { success: boolean; fpAmount?: number; error?: string } {
    if (cadAmount < FP.MIN_CUSTOM_BUY_CAD) return { success: false, error: `Minimum purchase is $${FP.MIN_CUSTOM_BUY_CAD}` };
    const fpAmount = Math.floor(cadAmount / FP.BUY_RATE);
    if (fpAmount < 1) return { success: false, error: 'Amount too small' };
    fpApi.credit(userId, fpAmount, 'purchase', `Purchased ${fpAmount} FP — $${cadAmount.toFixed(2)} CAD via ${paymentMethod}`, { cadAmount, paymentMethod });
    return { success: true, fpAmount };
  },

  sendFP(fromId: string, toId: string, fpAmount: number, note?: string): { success: boolean; error?: string } {
    if (fpAmount < 1) return { success: false, error: 'Minimum 1 FP to send' };
    const fromAcc = fpApi.getAccount(fromId);
    if (fromAcc.balance < fpAmount) return { success: false, error: 'Insufficient FP balance' };
    const accounts = loadAccounts();
    const toAcc = fpApi.getAccount(toId);
    accounts[fromId] = { ...fromAcc, balance: fromAcc.balance - fpAmount, lifetimeSpent: fromAcc.lifetimeSpent + fpAmount };
    accounts[toId]   = { ...toAcc,   balance: toAcc.balance + fpAmount, lifetimeEarned: toAcc.lifetimeEarned + fpAmount };
    saveAccounts(accounts);
    const txs = loadTxs();
    const sharedNote = note ? ` — "${note}"` : '';
    const toUser   = (JSON.parse(localStorage.getItem('filmons_users_cache') || '{}'))[toId];
    const fromUser = (JSON.parse(localStorage.getItem('filmons_users_cache') || '{}'))[fromId];
    txs.push({ id: mkId(), userId: fromId, type: 'send_fp',    fpAmount: -fpAmount, cadEquiv: -parseFloat((fpAmount * FP.BUY_RATE).toFixed(2)), description: `Sent ${fpAmount} FP to ${toUser?.name || 'user'}${sharedNote}`, status: 'completed', createdAt: new Date().toISOString(), metadata: { toId, note } });
    txs.push({ id: mkId(), userId: toId,   type: 'receive_fp', fpAmount,            cadEquiv:  parseFloat((fpAmount * FP.BUY_RATE).toFixed(2)), description: `Received ${fpAmount} FP from ${fromUser?.name || 'user'}${sharedNote}`, status: 'completed', createdAt: new Date().toISOString(), metadata: { fromId, note } });
    saveTxs(txs);
    // Server write (async)
    serverPost('/fp/send', { fromId, toId, fpAmount, note, toName: toUser?.name, fromName: fromUser?.name });
    return { success: true };
  },

  recordSaleEarning(sellerId: string, buyerId: string, totalCad: number, listingTitle: string): void {
    const feeCAD    = totalCad * FP.PLATFORM_FEE;
    const sellerCAD = totalCad - feeCAD;
    const sellerFP  = Math.floor(sellerCAD / FP.BUY_RATE);
    if (sellerFP > 0) fpApi.credit(sellerId, sellerFP, 'marketplace_earn', `Sale: ${listingTitle} — earned ${sellerFP} FP ($${sellerCAD.toFixed(2)})`, { listingTitle, totalCad });
  },

  recordViewEarning(userId: string, newViews: number, hasEngagement: boolean): void {
    const accounts = loadAccounts();
    const acc = fpApi.getAccount(userId);
    const today = new Date().toISOString().slice(0, 10);
    if (acc.dailyViewsDate !== today) { acc.dailyViewsFP = 0; acc.dailyViewsDate = today; }
    const remaining = FP.DAILY_VIEW_CAP - acc.dailyViewsFP;
    if (remaining <= 0) return;
    const fpPerThousand = hasEngagement ? FP.VIEWS_FP_BONUS : FP.VIEWS_FP_BASE;
    const earned = Math.min(Math.floor((newViews / FP.VIEWS_PER_FP) * fpPerThousand), remaining);
    if (earned <= 0) return;
    acc.dailyViewsFP += earned; acc.pendingViewsFP += earned;
    accounts[userId] = acc; saveAccounts(accounts);
    if (acc.pendingViewsFP >= 5) {
      const batch = acc.pendingViewsFP;
      accounts[userId].pendingViewsFP = 0; saveAccounts(accounts);
      fpApi.credit(userId, batch, 'earn_views', `View earnings — ${batch} FP from content views`, { views: newViews });
    }
    // Server sync (async)
    serverPost('/fp/views', { userId, newViews, hasEngagement });
  },

  boostContent(userId: string, boostId: string, targetId: string, targetType: 'listing' | 'post', targetTitle: string): { success: boolean; error?: string } {
    const opt = BOOST_OPTIONS.find(b => b.id === boostId);
    if (!opt) return { success: false, error: 'Invalid boost option' };
    // Update listing/post in local cache
    if (targetType === 'listing') {
      const listings = JSON.parse(localStorage.getItem('filmons_listings') || '[]');
      const idx = listings.findIndex((l: any) => l.id === targetId);
      if (idx !== -1) { listings[idx].boostLevel = boostId; listings[idx].boostedUntil = new Date(Date.now() + opt.days * 86400000).toISOString(); localStorage.setItem('filmons_listings', JSON.stringify(listings)); }
    } else {
      const posts = JSON.parse(localStorage.getItem('filmons_posts') || '[]');
      const idx = posts.findIndex((p: any) => p.id === targetId);
      if (idx !== -1) { posts[idx].boostLevel = boostId; posts[idx].boostedUntil = new Date(Date.now() + opt.days * 86400000).toISOString(); localStorage.setItem('filmons_posts', JSON.stringify(posts)); }
    }
    const txType: FPTxType = targetType === 'listing' ? 'boost_listing' : 'boost_post';
    const result = fpApi.debit(userId, opt.fp, txType, `${opt.label}: ${targetTitle}`, { boostId, targetId, targetType, days: opt.days });
    if (result === false) return { success: false, error: 'Insufficient FP balance' };
    // Server write (async) — debit already handled above; just update target on server
    serverPost('/fp/boost', { userId, boostId, targetId, targetType, targetTitle });
    return { success: true };
  },

  requestWithdrawal(userId: string, fpAmount: number): { success: boolean; payoutCad?: number; error?: string } {
    const minFP = FP.MIN_WITHDRAWAL;
    if (fpAmount < minFP) return { success: false, error: `Minimum withdrawal is ${minFP} FP (≈ $${FP.MIN_WITHDRAWAL_CAD})` };
    const acc = fpApi.getAccount(userId);
    if (acc.balance < fpAmount)    return { success: false, error: 'Insufficient FP balance' };
    if (acc.withdrawalPending)     return { success: false, error: 'A withdrawal is already pending' };

    const gross  = fpAmount * FP.PAYOUT_RATE;
    const fee    = gross * FP.WITHDRAWAL_FEE;
    const payout = parseFloat((gross - fee).toFixed(2));

    const accounts = loadAccounts();
    accounts[userId].balance           -= fpAmount;
    accounts[userId].lifetimeWithdrawn += fpAmount;
    accounts[userId].withdrawalPending  = true;
    saveAccounts(accounts);

    const tx: FPTransaction = { id: mkId(), userId, type: 'withdrawal', fpAmount: -fpAmount, cadEquiv: -payout, description: `Withdrawal of ${fpAmount.toLocaleString()} FP → $${payout} CAD (5% fee deducted)`, status: 'processing', createdAt: new Date().toISOString(), metadata: { fpAmount, grossCad: gross, feeCad: fee, payoutCad: payout, method: acc.payoutMethod, details: acc.payoutDetails } };
    const txs = loadTxs(); txs.push(tx); saveTxs(txs);

    // Server write (async)
    serverPost('/fp/withdraw', { userId, fpAmount });

    return { success: true, payoutCad: payout };
  },

  fmt:     (fp: number)  => (fp ?? 0).toLocaleString('en-CA'),
  fmtCad:  (cad: number) => `$${cad.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  fpToCad: (fp: number, rate: 'buy' | 'payout' = 'buy') => parseFloat((fp * (rate === 'buy' ? FP.BUY_RATE : FP.PAYOUT_RATE)).toFixed(2)),
  cadToFp: (cad: number) => Math.floor(cad / FP.BUY_RATE),
};

// ── CAD Wallet ────────────────────────────────────────────────────────────────
const CAD_WALLET_KEY = 'filmons_cad_wallet';

export interface CadTransaction {
  id: string;
  userId: string;
  type: 'received' | 'withdrawal' | 'refund';
  amount: number;              // CAD
  description: string;
  status: 'completed' | 'pending' | 'processing';
  createdAt: string;
  metadata?: Record<string, any>;
}

function loadCadWallets(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CAD_WALLET_KEY + '_balances') || '{}'); } catch { return {}; }
}
function saveCadWallets(w: Record<string, number>) {
  localStorage.setItem(CAD_WALLET_KEY + '_balances', JSON.stringify(w));
}
function loadCadTxs(): CadTransaction[] {
  try { return JSON.parse(localStorage.getItem(CAD_WALLET_KEY + '_txs') || '[]'); } catch { return []; }
}
function saveCadTxs(txs: CadTransaction[]) {
  localStorage.setItem(CAD_WALLET_KEY + '_txs', JSON.stringify(txs));
}

export const cadWalletApi = {
  getBalance(userId: string): number {
    return loadCadWallets()[userId] || 0;
  },

  credit(userId: string, amount: number, description: string, metadata?: Record<string, any>): CadTransaction {
    const wallets = loadCadWallets();
    wallets[userId] = (wallets[userId] || 0) + amount;
    saveCadWallets(wallets);
    const tx: CadTransaction = {
      id: `cad-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      userId, type: 'received', amount,
      description, status: 'completed',
      createdAt: new Date().toISOString(), metadata,
    };
    const txs = loadCadTxs(); txs.push(tx); saveCadTxs(txs);
    return tx;
  },

  getTransactions(userId: string): CadTransaction[] {
    return loadCadTxs().filter(t => t.userId === userId).reverse();
  },

  getAllTransactions(): CadTransaction[] {
    return loadCadTxs().reverse();
  },

  // Called when a payment is confirmed in Checkout
  onPaymentReceived(hostId: string, amount: number, description: string, metadata?: Record<string, any>) {
    return cadWalletApi.credit(hostId, amount, description, metadata);
  },
};