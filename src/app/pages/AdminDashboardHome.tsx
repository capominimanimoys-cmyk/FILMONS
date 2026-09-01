// FILMONS Admin — Dashboard home. Every number here is a real query
// (counts/sums), not placeholder data -- the one exception is "Reported
// Listings" from the original spec, which is left out entirely: no
// listing-report/flagging feature or table exists anywhere in this app
// yet, so showing a stat for it would just be fabricated.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Users, Package, Briefcase, ShieldCheck, LifeBuoy, Wallet,
  TrendingUp, Clock, AlertTriangle, Sparkles,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Stats {
  totalUsers: number;
  totalListings: number;
  totalOpportunities: number;
  pendingVerifications: number;
  openSupportCases: number;
  pendingPayouts: number;
}
interface Financials {
  grossVolume: number;
  platformRevenue: number;
  pendingBalance: number;
  availableBalance: number;
}
interface ActivityItem {
  id: string;
  label: string;
  detail: string;
  at: string;
}

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export function AdminDashboardHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [fin, setFin] = useState<Financials | null>(null);
  const [attention, setAttention] = useState<{ verifications: number; unreadChats: number; payoutIssues: number } | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Every piece loads independently -- one failing query (e.g. a
      // table that doesn't exist in some environment) must never blank
      // out the rest of an already-working dashboard.
      const [
        usersCount, listingsCount, opportunitiesCount,
        verificationsPending, supportOpen, payoutsPending, payoutsIssues,
        walletsRes, totalsRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).then(r => r.count || 0).catch(() => 0),
        supabase.from('listings').select('*', { count: 'exact', head: true }).then(r => r.count || 0).catch(() => 0),
        supabase.from('listings').select('*', { count: 'exact', head: true }).eq('listing_type', 'opportunity').then(r => r.count || 0).catch(() => 0),
        supabase.from('identity_verifications').select('*', { count: 'exact', head: true }).in('status', ['pending', 'under_review']).then(r => r.count || 0).catch(() => 0),
        supabase.from('support_cases').select('*', { count: 'exact', head: true }).in('status', ['open', 'waiting_for_agent']).then(r => r.count || 0).catch(() => 0),
        supabase.from('payout_requests').select('*', { count: 'exact', head: true }).in('status', ['requested', 'under_review', 'processing']).then(r => r.count || 0).catch(() => 0),
        supabase.from('payout_requests').select('*', { count: 'exact', head: true }).in('status', ['failed', 'rejected']).then(r => r.count || 0).catch(() => 0),
        supabase.from('wallets').select('pending_balance, available_balance').then(r => r.data || []).catch(() => [] as any[]),
        supabase.rpc('fn_admin_dashboard_totals').then(r => r.data?.[0] || null).catch(() => null),
      ]);

      const unreadChatsCount = await supabase
        .from('support_cases_admin_view').select('id, unread_count')
        .then(r => (r.data || []).filter((c: any) => (c.unread_count || 0) > 0).length)
        .catch(() => 0);

      if (cancelled) return;

      setStats({
        totalUsers: usersCount, totalListings: listingsCount, totalOpportunities: opportunitiesCount,
        pendingVerifications: verificationsPending, openSupportCases: supportOpen, pendingPayouts: payoutsPending,
      });
      setAttention({ verifications: verificationsPending, unreadChats: unreadChatsCount, payoutIssues: payoutsIssues });
      setFin({
        grossVolume: Number(totalsRes?.gross_volume || 0),
        platformRevenue: Number(totalsRes?.platform_revenue || 0),
        pendingBalance: walletsRes.reduce((s: number, w: any) => s + Number(w.pending_balance || 0), 0),
        availableBalance: walletsRes.reduce((s: number, w: any) => s + Number(w.available_balance || 0), 0),
      });

      // Recent activity -- no activity-log table exists, so this is
      // assembled from the newest rows across a few tables and merged
      // by timestamp, capped to the 8 most recent overall.
      const [newProfiles, newListings, earnings, newPayouts] = await Promise.all([
        supabase.from('profiles').select('id, name, account_type, created_at').order('created_at', { ascending: false }).limit(5).then(r => r.data || []).catch(() => []),
        supabase.from('listings').select('id, title, listing_type, created_at').order('created_at', { ascending: false }).limit(5).then(r => r.data || []).catch(() => []),
        supabase.from('wallet_transactions').select('id, amount, transaction_type, created_at').in('transaction_type', ['rental_earning', 'service_earning', 'sale_earning', 'opportunity_earning', 'hire_earning']).order('created_at', { ascending: false }).limit(5).then(r => r.data || []).catch(() => []),
        supabase.from('payout_requests').select('id, amount, currency, requested_at').order('requested_at', { ascending: false }).limit(5).then(r => r.data || []).catch(() => []),
      ]);
      if (cancelled) return;

      const items: ActivityItem[] = [
        ...newProfiles.map((p: any) => ({
          id: `p-${p.id}`, at: p.created_at,
          label: p.account_type === 'creator_plus' ? 'New Creator+ account' : 'New account',
          detail: p.name || 'Unnamed user',
        })),
        ...newListings.map((l: any) => ({
          id: `l-${l.id}`, at: l.created_at,
          label: l.listing_type === 'opportunity' ? 'New opportunity posted' : 'New listing posted',
          detail: l.title || 'Untitled',
        })),
        ...earnings.map((t: any) => ({
          id: `t-${t.id}`, at: t.created_at,
          label: 'Payment completed', detail: money(Number(t.amount || 0)),
        })),
        ...newPayouts.map((p: any) => ({
          id: `po-${p.id}`, at: p.requested_at,
          label: 'Payout requested', detail: `${money(Number(p.amount || 0))} ${p.currency || ''}`.trim(),
        })),
      ]
        .filter(i => i.at)
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 8);

      setActivity(items);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const STAT_TILES = stats ? [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, bg: 'bg-blue-50', color: 'text-blue-500', path: '/users' },
    { label: 'Listings', value: stats.totalListings, icon: Package, bg: 'bg-purple-50', color: 'text-purple-500', path: '/listings' },
    { label: 'Opportunities', value: stats.totalOpportunities, icon: Briefcase, bg: 'bg-indigo-50', color: 'text-indigo-500', path: '/opportunities' },
    { label: 'Verifications', value: stats.pendingVerifications, icon: ShieldCheck, bg: 'bg-amber-50', color: 'text-amber-500', path: '/verifications' },
    { label: 'Support Cases', value: stats.openSupportCases, icon: LifeBuoy, bg: 'bg-green-50', color: 'text-green-500', path: '/support-chats' },
    { label: 'Payouts', value: stats.pendingPayouts, icon: Wallet, bg: 'bg-rose-50', color: 'text-rose-500', path: '/transactions' },
  ] : [];

  const FINANCIAL_TILES = fin ? [
    { label: 'Gross Volume', value: money(fin.grossVolume) },
    { label: 'Revenue', value: money(fin.platformRevenue) },
    { label: 'Pending', value: money(fin.pendingBalance) },
    { label: 'Available', value: money(fin.availableBalance) },
  ] : [];

  const attentionItems = attention ? [
    attention.verifications > 0 && { text: `${attention.verifications} verification request${attention.verifications === 1 ? '' : 's'}`, path: '/verifications' },
    attention.unreadChats > 0 && { text: `${attention.unreadChats} unread support chat${attention.unreadChats === 1 ? '' : 's'}`, path: '/support-chats' },
    attention.payoutIssues > 0 && { text: `${attention.payoutIssues} payout issue${attention.payoutIssues === 1 ? '' : 's'}`, path: '/transactions' },
  ].filter(Boolean) as { text: string; path: string }[] : [];

  const QUICK_ACTIONS = [
    { label: 'Verifications', path: '/verifications', icon: ShieldCheck },
    { label: 'Support Chats', path: '/support-chats', icon: LifeBuoy },
    { label: 'Transactions', path: '/transactions', icon: TrendingUp },
    { label: 'Users', path: '/users', icon: Users },
  ];

  if (loading) {
    return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-xl font-black text-gray-900">FILMONS Admin Dashboard</h1>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {STAT_TILES.map(t => (
          <button key={t.label} onClick={() => navigate(t.path)}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow text-left">
            <div className={`w-10 h-10 ${t.bg} rounded-xl flex items-center justify-center shrink-0`}>
              <t.icon className={`w-5 h-5 ${t.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400 font-medium truncate">{t.label}</p>
              <p className="text-lg font-black text-gray-900">{t.value}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Financial overview */}
      <div>
        <h2 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-gray-400" /> Financial Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FINANCIAL_TILES.map(t => (
            <div key={t.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-400 font-medium">{t.label}</p>
              <p className="text-lg font-black text-gray-900 mt-0.5">{t.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Needs attention */}
        <div>
          <h2 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" /> Needs Attention</h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {attentionItems.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">Nothing needs attention right now.</p>
            ) : attentionItems.map(item => (
              <button key={item.text} onClick={() => navigate(item.path)} className="w-full text-left px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                {item.text}
                <span className="text-gray-300">→</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <h2 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-gray-400" /> Recent Activity</h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {activity.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">No recent activity.</p>
            ) : activity.map(item => (
              <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{item.label}</p>
                  <p className="text-xs text-gray-400 truncate">{item.detail}</p>
                </div>
                <span className="text-[11px] text-gray-300 shrink-0 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(item.at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-black text-gray-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map(a => (
            <button key={a.label} onClick={() => navigate(a.path)}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col items-center gap-2 hover:shadow-md hover:border-blue-200 transition-all">
              <a.icon className="w-5 h-5 text-blue-500" />
              <span className="text-xs font-bold text-gray-700">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
