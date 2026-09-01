// FILMONS Admin — single-user detail page. Every tab is a real,
// existing data source (reusing walletApi/reviewsApi where they already
// exist, matching HostProfile.tsx's own numbers rather than a
// separately hand-rolled query) -- lazy-loaded per tab so opening a
// user doesn't fire every join up front.
//
// Deliberately has NO Suspend/Restrict/Delete actions: no column or
// table anywhere in this schema represents account status, and no
// delete/deactivate flow exists server-side (Settings.tsx's own "Delete
// Account" is a dead-end stub today) -- building buttons with nothing
// real behind them would be worse than not having them.
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, ExternalLink, Star, Package, Briefcase, FileText, Wallet as WalletIcon, LifeBuoy, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { walletApi, type WalletTransaction, type PayoutRequest } from '../lib/walletApi';
import { reviewsApi } from '../lib/api';
import type { Review } from '../types';

interface Profile {
  id: string; name: string; username: string; email: string; phone: string | null;
  avatar_url: string | null; account_type: string; city: string | null; province: string | null;
  created_at: string; email_verified: boolean; phone_verified: boolean; bio: string | null;
}
interface ListingRow { id: string; title: string; listing_type: string | null; price: number | null; is_active: boolean; created_at: string; }
interface AppRow { id: string; listing_id: string; status: string; created_at: string; listingTitle?: string; }
interface SupportCaseRow { id: string; case_number: string; subject: string; status: string; unread_count: number; updated_at: string; }
interface ActivityItem { id: string; label: string; detail: string; at: string; }

const TYPE_LABEL: Record<string, string> = { creator: 'Creator', creator_plus: 'Creator+', service: 'Creator+', professional: 'Professional', business: 'Business' };
const TABS = ['overview', 'activity', 'wallet', 'listings', 'applications', 'reviews', 'support'] as const;
type Tab = typeof TABS[number];
const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });

export function AdminUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [loadedTabs, setLoadedTabs] = useState<Set<Tab>>(new Set());

  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [balance, setBalance] = useState({ pending: 0, available: 0, currency: 'CAD' });
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [reviewsReceived, setReviewsReceived] = useState<Review[]>([]);
  const [reviewsGiven, setReviewsGiven] = useState<Review[]>([]);
  const [cases, setCases] = useState<SupportCaseRow[]>([]);

  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles')
      .select('id, name, username, email, phone, avatar_url, account_type, city, province, created_at, email_verified, phone_verified, bio')
      .eq('id', userId).maybeSingle()
      .then(({ data }) => { setProfile(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!userId || loadedTabs.has(tab)) return;
    setLoadedTabs(prev => new Set(prev).add(tab));

    if (tab === 'wallet') {
      walletApi.getBalance(userId).then(setBalance).catch(() => {});
      walletApi.getTransactions(userId, 50).then(setTxs).catch(() => {});
      walletApi.getPayoutRequests(userId).then(setPayouts).catch(() => {});
    } else if (tab === 'listings') {
      supabase.from('listings').select('id, title, listing_type, price, is_active, created_at')
        .eq('user_id', userId).order('created_at', { ascending: false })
        .then(({ data }) => setListings(data || [])).catch(() => {});
    } else if (tab === 'applications') {
      supabase.from('opportunity_applications').select('id, listing_id, status, created_at')
        .eq('applicant_id', userId).order('created_at', { ascending: false }).limit(50)
        .then(async ({ data }) => {
          const rows = data || [];
          const listingIds = [...new Set(rows.map(r => r.listing_id))];
          const titles: Record<string, string> = {};
          if (listingIds.length) {
            const { data: ls } = await supabase.from('listings').select('id, title').in('id', listingIds);
            (ls || []).forEach((l: any) => { titles[l.id] = l.title; });
          }
          setApps(rows.map(r => ({ ...r, listingTitle: titles[r.listing_id] })));
        }).catch(() => {});
    } else if (tab === 'reviews') {
      reviewsApi.getReceivedReviews(userId).then(setReviewsReceived).catch(() => {});
      reviewsApi.getUserReviews(userId).then(setReviewsGiven).catch(() => {});
    } else if (tab === 'support') {
      supabase.from('support_cases_admin_view').select('id, case_number, subject, status, unread_count, updated_at')
        .eq('user_id', userId).order('updated_at', { ascending: false })
        .then(({ data }) => setCases(data || [])).catch(() => {});
    } else if (tab === 'activity') {
      Promise.all([
        supabase.from('listings').select('id, title, listing_type, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5).then(r => r.data || []).catch(() => []),
        reviewsApi.getReceivedReviews(userId).then(r => r.slice(0, 5)).catch(() => []),
        supabase.from('opportunity_applications').select('id, created_at').eq('applicant_id', userId).order('created_at', { ascending: false }).limit(5).then(r => r.data || []).catch(() => []),
        supabase.from('identity_verifications').select('id, status, submitted_at').eq('user_id', userId).order('submitted_at', { ascending: false }).limit(3).then(r => r.data || []).catch(() => []),
      ]).then(([ls, revs, appsRows, verifs]) => {
        const items: ActivityItem[] = [
          ...ls.map((l: any) => ({ id: `l-${l.id}`, at: l.created_at, label: l.listing_type === 'opportunity' ? 'Posted an opportunity' : 'Published a listing', detail: l.title || 'Untitled' })),
          ...revs.map((r: any) => ({ id: `r-${r.id}`, at: r.createdAt, label: 'Received a review', detail: `★ ${r.rating}` })),
          ...appsRows.map((a: any) => ({ id: `a-${a.id}`, at: a.created_at, label: 'Applied to an opportunity', detail: '' })),
          ...verifs.map((v: any) => ({ id: `v-${v.id}`, at: v.submitted_at, label: `Verification ${v.status.replace('_', ' ')}`, detail: '' })),
        ].filter(i => i.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 10);
        setActivity(items);
      });
    }
  }, [tab, userId, loadedTabs]);

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>;
  if (!profile) return <div className="h-full flex items-center justify-center text-sm text-gray-400">User not found.</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <button onClick={() => navigate('/users')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Users
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 flex-wrap">
        {profile.avatar_url
          ? <img src={profile.avatar_url} className="w-16 h-16 rounded-full object-cover" alt="" />
          : <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-xl font-bold text-gray-500">{(profile.name || '?').charAt(0).toUpperCase()}</div>}
        <div className="flex-1 min-w-0">
          <p className="text-lg font-black text-gray-900 truncate">{profile.name || 'Unnamed'}</p>
          <p className="text-sm text-gray-400 truncate">@{profile.username || 'no-username'}</p>
          <span className="inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{TYPE_LABEL[profile.account_type] || profile.account_type}</span>
        </div>
        <a href={`/${profile.username || profile.id}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 text-xs font-bold text-gray-600 border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50">
          View Public Profile <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-b border-gray-100 pb-px">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-bold capitalize whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          {[
            ['Email', profile.email], ['Phone', profile.phone || '—'],
            ['Location', [profile.city, profile.province].filter(Boolean).join(', ') || '—'],
            ['Joined', fmtDate(profile.created_at)],
            ['Email Verified', profile.email_verified ? 'Yes' : 'No'],
            ['Phone Verified', profile.phone_verified ? 'Yes' : 'No'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm border-b border-gray-50 pb-2 last:border-0">
              <span className="text-gray-400">{label}</span>
              <span className="font-semibold text-gray-800">{value}</span>
            </div>
          ))}
          {profile.bio && <p className="text-sm text-gray-500 pt-1">{profile.bio}</p>}
        </div>
      )}

      {tab === 'activity' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {activity.length === 0 ? <p className="p-6 text-sm text-gray-400 text-center">No recent activity.</p> : activity.map(i => (
            <div key={i.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="text-sm font-semibold text-gray-800 truncate">{i.label}</p>{i.detail && <p className="text-xs text-gray-400 truncate">{i.detail}</p>}</div>
              <span className="text-[11px] text-gray-300 shrink-0 flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(i.at)}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'wallet' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-400 font-medium">Pending</p>
              <p className="text-lg font-black text-gray-900">{money(balance.pending)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-400 font-medium">Available</p>
              <p className="text-lg font-black text-gray-900">{money(balance.available)}</p>
            </div>
          </div>
          {payouts.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <p className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-50">Payout Requests</p>
              <div className="divide-y divide-gray-50">
                {payouts.slice(0, 10).map(p => (
                  <div key={p.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="font-semibold text-gray-800">{money(p.amount)} {p.currency}</span>
                    <span className="text-xs text-gray-400 capitalize">{p.status.replace('_', ' ')}</span>
                    <span className="text-[11px] text-gray-300">{fmtDate(p.requested_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <p className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-50 flex items-center gap-1.5"><WalletIcon className="w-3.5 h-3.5" /> Transactions</p>
            {txs.length === 0 ? <p className="p-6 text-sm text-gray-400 text-center">No transactions yet.</p> : (
              <div className="divide-y divide-gray-50">
                {txs.map(t => (
                  <div key={t.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="font-semibold text-gray-800 capitalize">{t.transaction_type.replace(/_/g, ' ')}</span>
                    <span className="text-gray-500">{money(t.amount)}</span>
                    <span className="text-[11px] text-gray-300">{fmtDate(t.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'listings' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {listings.length === 0 ? <p className="p-6 text-sm text-gray-400 text-center">No listings.</p> : listings.map(l => (
            <div key={l.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {l.listing_type === 'opportunity' ? <Briefcase className="w-4 h-4 text-indigo-400 shrink-0" /> : <Package className="w-4 h-4 text-purple-400 shrink-0" />}
                <span className="text-sm font-semibold text-gray-800 truncate">{l.title || 'Untitled'}</span>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${l.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{l.is_active ? 'Active' : 'Inactive'}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'applications' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {apps.length === 0 ? <p className="p-6 text-sm text-gray-400 text-center">No applications.</p> : apps.map(a => (
            <div key={a.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-sm font-semibold text-gray-800 truncate">{a.listingTitle || a.listing_id}</span>
              </div>
              <span className="text-[11px] text-gray-400 capitalize shrink-0">{a.status.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'reviews' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            <span className="text-lg font-black text-gray-900">
              {reviewsReceived.length ? (reviewsReceived.reduce((s, r) => s + r.rating, 0) / reviewsReceived.length).toFixed(1) : '—'}
            </span>
            <span className="text-sm text-gray-400">· {reviewsReceived.length} review{reviewsReceived.length === 1 ? '' : 's'} received</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <p className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-50">Received</p>
            {reviewsReceived.length === 0 ? <p className="p-6 text-sm text-gray-400 text-center">No reviews received.</p> : (
              <div className="divide-y divide-gray-50">
                {reviewsReceived.map(r => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /><span className="text-sm font-bold">{r.rating}</span><span className="text-xs text-gray-400">by {r.userName}</span></div>
                    {r.comment && <p className="text-sm text-gray-600 mt-1">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <p className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-50">Written</p>
            {reviewsGiven.length === 0 ? <p className="p-6 text-sm text-gray-400 text-center">No reviews written.</p> : (
              <div className="divide-y divide-gray-50">
                {reviewsGiven.map(r => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /><span className="text-sm font-bold">{r.rating}</span></div>
                    {r.comment && <p className="text-sm text-gray-600 mt-1">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'support' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {cases.length === 0 ? <p className="p-6 text-sm text-gray-400 text-center">No support cases.</p> : cases.map(c => (
            <button key={c.id} onClick={() => navigate(`/support/cases/${c.case_number}`)} className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50">
              <div className="flex items-center gap-2 min-w-0">
                <LifeBuoy className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{c.subject}</p>
                  <p className="text-xs text-gray-400">#{c.case_number} · {c.status.replace(/_/g, ' ')}</p>
                </div>
              </div>
              {c.unread_count > 0 && <span className="text-[11px] font-bold bg-blue-600 text-white rounded-full px-2 py-0.5 shrink-0">{c.unread_count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
