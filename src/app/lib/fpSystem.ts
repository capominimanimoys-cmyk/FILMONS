// ─────────────────────────────────────────────────────────────────────────────
// CAD Wallet — real-money seller balance (host earnings from marketplace sales).
// Reads/writes localStorage; Checkout.tsx credits it when a payment is confirmed.
// ─────────────────────────────────────────────────────────────────────────────

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
