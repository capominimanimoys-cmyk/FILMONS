import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { supportApi, STATUS_LABEL, type SupportCase } from '../lib/supportApi';
import { ArrowLeft, LifeBuoy, ChevronRight, Loader2 } from 'lucide-react';

const TOPIC_LABEL: Record<string, string> = {
  orders_rentals: 'Orders & Rentals', payments_refunds: 'Payments & Refunds', wallet_payouts: 'Wallet & Payouts',
  creator_plus: 'Creator+ Verification', account_security: 'Account & Security', listings: 'Listings',
  portfolio: 'Portfolio', trust_safety: 'Trust & Safety', something_else: 'Something Else',
};

const STATUS_CLASS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-600', waiting_for_agent: 'bg-blue-100 text-blue-600',
  in_review: 'bg-amber-100 text-amber-600', waiting_for_customer: 'bg-indigo-100 text-indigo-600',
  resolved: 'bg-green-100 text-green-600', closed: 'bg-gray-100 text-gray-500',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export function MySupportCases() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'open' | 'resolved'>('open');

  useEffect(() => {
    if (!user?.id) return;
    supportApi.getMyCases(user.id).then(c => { setCases(c); setLoading(false); });
  }, [user?.id]);

  if (!user) return null;

  const filtered = cases.filter(c => tab === 'resolved' ? ['resolved', 'closed'].includes(c.status) : !['resolved', 'closed'].includes(c.status));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/support')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>
        <p className="text-sm font-black text-gray-900">My Support Cases</p>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="flex gap-2 mb-4">
          {(['open', 'resolved'] as const).map(t => (
            <button
              key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              {t === 'open' ? 'Open' : 'Resolved'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-16 px-6 text-center">
            <LifeBuoy className="w-8 h-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-900 mb-1">No {tab} cases</p>
            <p className="text-xs text-gray-400">Cases you open with Filmons Support will show up here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(c => (
              <button key={c.id} onClick={() => navigate(`/support/cases/${c.id}`)} className="w-full bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3 text-left hover:border-blue-300">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{c.subject}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Case #{c.case_number} · {TOPIC_LABEL[c.category] || c.category}</p>
                  <p className="text-xs text-gray-300 mt-0.5">Last activity: {timeAgo(c.updated_at)}</p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
