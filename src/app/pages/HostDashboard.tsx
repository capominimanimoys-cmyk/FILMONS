import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { Listing, Conversation } from '../types';
import { UserAvatar } from '../components/AccountTypeBadge';
import { ListingCard } from '../components/ListingCard';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import {
  LayoutDashboard, Package, DollarSign, Users, Star,
  Plus, ChevronRight, Eye, CheckCircle,
  Clock, ArrowUpRight, BarChart3, Wrench, Camera,
  MessageCircle, ShieldCheck, Settings, Bookmark, Heart, MapPin,
  ShoppingCart, Zap, X, CalendarDays, Lock, Briefcase, FileText,
} from 'lucide-react';
import { savedListingsApi, listingsApi, reviewsApi } from '../lib/api';
import { walletApi } from '../lib/walletApi';
import { StatsCard, StatsGrid } from '../components/StatsCard';
import { supabase } from '../../lib/supabase';
import { reliabilityApi, ReputationScore, scoreColor, getCompositeTier, isCreatorPlus as isCreatorPlusTier, normalizeTier } from '../lib/reliabilityApi';
import { getOpportunityUsage, getEntitlement, resetLabel } from '../lib/entitlements';
import { MyOpportunitiesOverview } from './dashboard/MyOpportunitiesOverview';
import { setSettingsReturnTo } from '../lib/settingsReturnTo';

function getStoredListings(): Listing[] {
  try { return JSON.parse(localStorage.getItem('filmons_listings') || '[]'); } catch { return []; }
}
function getStoredConvs(): Conversation[] {
  try { return JSON.parse(localStorage.getItem('filmons_conversations') || '[]'); } catch { return []; }
}
function fmt(n: number) {
  return n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return <StatsCard icon={icon} label={label} value={value} sub={sub} color={color} />;
}

function TxRow({ amount, title, status, date, method, delivery }: {
  amount: number; title: string; status: 'paid' | 'pending'; date: string; method?: string; delivery?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${status === 'paid' ? 'bg-green-100' : 'bg-amber-100'}`}>
        {status === 'paid' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Clock className="w-4 h-4 text-amber-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{title}</p>
        <p className="text-xs text-gray-400">
          {new Date(date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
          {method && <> · {method}</>}{delivery && <> · {delivery}</>}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold ${status === 'paid' ? 'text-green-600' : 'text-amber-600'}`}>
          {status === 'paid' ? '+' : ''} ${fmt(amount)}
        </p>
        <p className="text-[10px] text-gray-400 uppercase font-semibold">{status}</p>
      </div>
    </div>
  );
}

function DbTxRow({ tx }: { tx: any }) {
  const isCredit = tx.cad_amount > 0;
  const isCad    = tx.cad_amount !== 0;

  const typeLabel: Record<string, string> = {
    order_payment:   '🧾 Order Payment',
    order_earning:   '💰 Order Earning',
    stripe_checkout: '💳 Card Payment',
    marketplace_earn:'💰 Sale Earning',
    withdrawal:      '🏦 Withdrawal',
  };

  const bgColor   = isCredit ? 'bg-green-50' : 'bg-red-50';
  const iconColor = isCredit ? 'text-green-500' : 'text-red-500';

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${bgColor}`}>
        {isCredit
          ? <CheckCircle className={`w-4 h-4 ${iconColor}`} />
          : <DollarSign className={`w-4 h-4 ${iconColor}`} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-500">{typeLabel[tx.type] || tx.type}</p>
        <p className="text-sm font-semibold text-gray-800 truncate">{tx.description || tx.listing_title || '—'}</p>
        <p className="text-xs text-gray-400">
          {new Date(tx.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
          {tx.payment_method && <> · {tx.payment_method}</>}
        </p>
      </div>
      <div className="text-right shrink-0 space-y-0.5">
        {isCad && (
          <p className={`text-sm font-black ${tx.cad_amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
            {tx.cad_amount > 0 ? '+' : ''}${fmt(Math.abs(tx.cad_amount))}
          </p>
        )}
        <p className={`text-[10px] font-semibold uppercase ${tx.status === 'completed' ? 'text-green-500' : 'text-amber-500'}`}>
          {tx.status}
        </p>
      </div>
    </div>
  );
}


// Account tier helpers
const PLUS_TIERS = ['creator_plus', 'professional', 'business'];
function isCreatorPlus(user: any): boolean {
  if (PLUS_TIERS.includes(user?.accountType || '') || PLUS_TIERS.includes(user?.accountMode || '')) return true;
  // Verified users always have Creator+ access even if the cached type is stale
  return user?.verificationStatus === 'verified' || user?.isVerified === true;
}

// ── TransactionHistory ──────────────────────────────────────────────
function TransactionHistory({ userId }: { userId: string }) {
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from('orders')
      .select('id, paid_at, total_price, status, listing_title, listing_id')
      .or(`renter_id.eq.${userId},host_id.eq.${userId}`)
      .order('paid_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setTxs(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  if (loading) return (
    <div className="flex items-center justify-center py-10 gap-2">
      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
      <p className="text-sm text-gray-400">Loading transactions…</p>
    </div>
  );
  if (!txs.length) return (
    <div className="py-10 flex flex-col items-center gap-2">
      <DollarSign className="w-8 h-8 text-gray-200"/>
      <p className="text-sm text-gray-400">No transactions yet</p>
    </div>
  );
  return (
    <div>
      {txs.map((tx, i) => (
        <div key={tx.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <DollarSign className="w-4 h-4 text-blue-500"/>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{tx.listing_title || 'Order'}</p>
            <p className="text-xs text-gray-400">{tx.paid_at ? new Date(tx.paid_at).toLocaleDateString('en-CA', {month:'short',day:'numeric',year:'numeric'}) : '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-gray-900">${Number(tx.total_price||0).toFixed(2)}</p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tx.status==='accepted'?'bg-green-100 text-green-600':tx.status==='pending'?'bg-amber-100 text-amber-600':'bg-gray-100 text-gray-500'}`}>
              {tx.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Creator+ Required Card — same card language as the Wallet/
//    CreatorPlusRequired gate (centered gradient icon badge on white,
//    not a full-bleed colored banner). ──────────────────────────────
function CreatorPlusRequired({ feature, color='blue', navigate }: { feature: string; color?: string; navigate: (p:string)=>void }) {
  const grad = color==='emerald'
    ? 'from-emerald-600 to-teal-700'
    : color==='purple'
    ? 'from-purple-600 to-indigo-700'
    : 'from-blue-600 to-indigo-700';
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 text-center space-y-4">
      <div className={`w-16 h-16 bg-gradient-to-br ${grad} rounded-3xl flex items-center justify-center mx-auto`}>
        <Lock className="w-8 h-8 text-white"/>
      </div>
      <div>
        <h2 className="text-lg font-black text-gray-900">{feature}</h2>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          <strong className="text-gray-700">Creator+</strong> accounts unlock {feature.toLowerCase()}, listings, payouts, and the full marketplace.
        </p>
      </div>
      <button onClick={()=>navigate('/verification')}
        className={`w-full bg-gradient-to-r ${grad} text-white font-black rounded-2xl py-4 hover:opacity-90 transition-opacity`}>
        Upgrade to Creator+ →
      </button>
    </div>
  );
}

// ── Creator Dashboard ──────────────────────────────────────────────
// Real status enum from opportunity_applications.status (includes the paid
// Opportunity hire/fund substates) mapped to what an applicant actually
// wants to see, not the raw DB value.
const APPLICATION_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:          { label: 'Applied',                        cls: 'text-amber-600 bg-amber-50' },
  viewed:           { label: 'Applied',                        cls: 'text-amber-600 bg-amber-50' },
  contacted:        { label: 'Applied',                        cls: 'text-amber-600 bg-amber-50' },
  shortlisted:      { label: 'Shortlisted',                    cls: 'text-blue-600 bg-blue-50' },
  selected:         { label: 'Shortlisted',                    cls: 'text-blue-600 bg-blue-50' },
  accepted:         { label: 'Accepted 🎉',                    cls: 'text-green-600 bg-green-50' },
  offer_sent:       { label: 'Offer Sent — Awaiting Payment',  cls: 'text-indigo-600 bg-indigo-50' },
  offer_accepted:   { label: 'Offer Accepted',                 cls: 'text-indigo-600 bg-indigo-50' },
  payment_pending:  { label: 'Payment Pending',                cls: 'text-indigo-600 bg-indigo-50' },
  hired:            { label: 'Hired',                          cls: 'text-green-600 bg-green-50' },
  completed:        { label: 'Completed',                      cls: 'text-green-600 bg-green-50' },
  rejected:         { label: 'Declined',                       cls: 'text-red-500 bg-red-50' },
  withdrawn:        { label: 'Withdrawn',                      cls: 'text-gray-500 bg-gray-100' },
};

// Buckets the richer paid-Opportunity lifecycle statuses (offer_sent,
// hired, completed, etc.) down into the 6 filter chips -- Applied/
// Shortlisted/Accepted/Declined/Withdrawn cover every real status without
// inventing new ones, per spec ("do not create new duplicate statuses").
type AppFilterBucket = 'all' | 'applied' | 'shortlisted' | 'accepted' | 'declined' | 'withdrawn';
function applicationBucket(status: string): AppFilterBucket {
  if (['shortlisted', 'selected'].includes(status)) return 'shortlisted';
  if (['accepted', 'offer_sent', 'offer_accepted', 'payment_pending', 'hired', 'completed'].includes(status)) return 'accepted';
  if (status === 'rejected') return 'declined';
  if (status === 'withdrawn') return 'withdrawn';
  return 'applied';
}
const APP_FILTERS: { key: AppFilterBucket; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'applied', label: 'Applied' }, { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'accepted', label: 'Accepted' }, { key: 'declined', label: 'Declined' }, { key: 'withdrawn', label: 'Withdrawn' },
];

// ── My Applications ── Opportunities I applied to, distinct from
// "Opportunities" (the ones I posted) -- shared between CreatorDashboard
// and HostDashboardContent so both dashboards show the exact same fetch/
// filter/realtime logic instead of two copies drifting apart.
// showCreatorUpsell only applies to the empty state (CreatorDashboard is
// exclusively rendered for the 'creator' tier, which can't currently
// apply at all -- see submit-opportunity-application's applications: 0
// entitlement -- so an empty list there is worth explaining, not just a
// generic "nothing yet").
function MyApplicationsSection({ userId, showCreatorUpsell }: { userId: string; showCreatorUpsell?: boolean }) {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AppFilterBucket>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: apps } = await supabase.from('opportunity_applications')
          .select('*').eq('applicant_id', userId).order('created_at', { ascending: false }).limit(100);
        if (cancelled) return;
        if (!apps?.length) { setApplications([]); setLoading(false); return; }
        const listingIds = [...new Set(apps.map(a => a.listing_id).filter(Boolean))];
        const ownerIds   = [...new Set(apps.map(a => a.owner_id).filter(Boolean))];
        const [{ data: listings }, { data: owners }] = await Promise.all([
          listingIds.length ? supabase.from('listings').select('id, title, city, province, price, images, is_active').in('id', listingIds) : Promise.resolve({ data: [] as any[] }),
          ownerIds.length   ? supabase.from('profiles').select('id, name').in('id', ownerIds)                                              : Promise.resolve({ data: [] as any[] }),
        ]);
        if (cancelled) return;
        const listingById = new Map((listings || []).map((l: any) => [l.id, l]));
        const ownerById    = new Map((owners   || []).map((o: any) => [o.id, o]));
        setApplications(apps.map(a => {
          const l = listingById.get(a.listing_id);
          return {
            ...a,
            listingTitle: l?.title || 'Opportunity',
            listingLocation: [l?.city, l?.province].filter(Boolean).join(', '),
            listingImage: l?.images?.[0] || null,
            listingPrice: l?.price || null,
            // No separate "closed/expired" status field exists on listings
            // (see the global-search work earlier) -- is_active is the one
            // real signal for whether the Opportunity itself is still live.
            opportunityActive: l ? l.is_active !== false : null,
            ownerName: ownerById.get(a.owner_id)?.name || 'Filmons host',
          };
        }));
      } catch {
        if (!cancelled) setApplications([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Real-time status updates -- same postgres_changes pattern
  // supportApi.subscribeToCase already uses for support cases, filtered to
  // just this applicant's own rows.
  useEffect(() => {
    const channel = supabase
      .channel(`my-applications-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'opportunity_applications', filter: `applicant_id=eq.${userId}` }, payload => {
        const updated = payload.new as any;
        setApplications(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const filtered = filter === 'all' ? applications : applications.filter(a => applicationBucket(a.status) === filter);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {applications.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {APP_FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-bold text-gray-900">My Applications</h3>
          <span className="text-xs text-gray-400">({filtered.length})</span>
        </div>

        {applications.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400 font-medium">No applications yet</p>
            <p className="text-xs text-gray-300 mt-1">
              {showCreatorUpsell
                ? 'Upgrade to Creator+ to apply for Opportunities.'
                : "Opportunities you apply to will appear here."}
            </p>
            <button
              onClick={() => navigate(showCreatorUpsell ? '/verification' : '/search')}
              className="mt-4 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors">
              {showCreatorUpsell ? 'Upgrade to Creator+' : 'Browse Opportunities'}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-400">No {APP_FILTERS.find(f => f.key === filter)?.label.toLowerCase()} applications.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((app: any) => {
              const meta = APPLICATION_STATUS_META[app.status] || { label: app.status, cls: 'text-gray-500 bg-gray-100' };
              return (
                <div key={app.id} className="px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
                      {app.listingImage
                        ? <img src={app.listingImage} alt="" className="w-full h-full object-cover" />
                        : <Briefcase className="w-5 h-5 text-gray-300" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-800 truncate">{app.listingTitle}</p>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${meta.cls}`}>{meta.label}</span>
                      </div>
                      {app.listingLocation && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{app.listingLocation}</p>}
                      <div className="flex items-center gap-2 mt-0.5">
                        {app.listingPrice > 0 && <span className="text-xs font-bold text-blue-600">${Number(app.listingPrice).toLocaleString()}</span>}
                        {app.opportunityActive === false && (
                          <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Opportunity Closed</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">Posted by {app.ownerName} · Applied {new Date(app.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <button onClick={() => navigate(`/listing/${app.listing_id}`)} className="text-xs font-semibold text-blue-600 hover:underline">View Opportunity</button>
                        {app.conversation_id && (
                          <button onClick={() => navigate(`/inbox?conv=${app.conversation_id}`)} className="text-xs font-semibold text-blue-600 hover:underline">View Application</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CreatorDashboard({ user }: { user: any }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<'orders' | 'opportunities' | 'applications' | 'transactions'>(
    initialTab === 'opportunities' || initialTab === 'applications' || initialTab === 'transactions' ? initialTab : 'orders',
  );
  const [orders, setOrders] = useState<any[]>([]);
  const [savedListings, setSavedListings] = useState<any[]>([]);
  const [myOpportunities, setMyOpportunities] = useState<Listing[]>([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showOpportunityGate, setShowOpportunityGate] = useState(false);
  const [rep, setRep] = useState<ReputationScore | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    tabRefs.current[tab]?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [tab]);

  useEffect(() => {
    reliabilityApi.getScore(user.id).then(setRep).catch(() => {});
  }, [user.id]);

  useEffect(() => {
    // Fetch from orders table (source of truth)
    supabase.from('orders').select('*')
      .eq('renter_id', user.id)
      .order('paid_at', { ascending: false })
      .then(({ data }) => setOrders(data || []))
      .catch(() => setOrders([]));
    savedListingsApi.getSaved(user.id).then(listings => setSavedListings(Array.isArray(listings) ? listings : [])).catch(() => setSavedListings([]));
    // Opportunities don't require Creator+ (unlike gear/service listings
    // below, which stay locked) -- every account tier has a monthly
    // Opportunity posting entitlement, see src/app/lib/entitlements.ts.
    listingsApi.getUserListings(user.id)
      .then(listings => setMyOpportunities(listings.filter(l => l.listingType === 'opportunity' || l.listingKind === 'talent')))
      .catch(() => setMyOpportunities([]));
  }, [user.id]);

  const statusColors: Record<string, string> = {
    pending: 'text-amber-600 bg-amber-50',
    accepted: 'text-green-600 bg-green-50',
    declined: 'text-red-600 bg-red-50',
  };

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden w-full max-w-[100vw]">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar user={user} size={40} />
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">Creator Dashboard</h1>
              <p className="text-xs text-gray-400">{user.name}</p>
            </div>
          </div>
          <Link to="/profile" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
            <Settings className="w-4 h-4" />
          </Link>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-0 border-t border-gray-100 overflow-x-auto overflow-y-hidden flex-nowrap no-scrollbar" style={{ scrollBehavior: 'smooth' }}>
          {[
            { key: 'orders',        label: 'My Orders',    icon: ShoppingCart },
            { key: 'opportunities', label: 'Opportunities', icon: Briefcase   },
            { key: 'applications',  label: 'Applications', icon: FileText    },
            { key: 'transactions',  label: 'Transactions', icon: DollarSign   },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} ref={el => { tabRefs.current[key] = el; }} onClick={() => setTab(key as any)}
              className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 overflow-x-hidden">
        {/* Reliability score mini-card */}
        {rep && (() => {
          const composite = rep.reliability_score ?? 0;
          const color = scoreColor(composite);
          const tier = getCompositeTier(rep.reliability_level, isCreatorPlusTier(rep.account_type));
          const tierLabel = tier.label;
          return (
            <button onClick={() => { setSettingsReturnTo(window.location.pathname); navigate('/settings/reviews'); }}
              className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors">
              <svg width={52} height={52} style={{ flexShrink: 0, overflow: 'visible' }}>
                <circle cx={26} cy={26} r={20} fill="none" stroke="#e5e7eb" strokeWidth="5"/>
                <circle cx={26} cy={26} r={20} fill="none" stroke={color} strokeWidth="5"
                  strokeDasharray={`${(composite / 100) * (2 * Math.PI * 20)} ${2 * Math.PI * 20}`}
                  strokeLinecap="round" transform="rotate(-90 26 26)"
                  style={{ filter: `drop-shadow(0 0 4px ${color}55)` }}/>
                <text x={26} y={30} textAnchor="middle" fontSize={13} fontWeight="900" fill={color}>{Math.round(composite)}</text>
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-gray-900">Reliability Score</p>
                <p className="text-xs font-semibold mt-0.5" style={{ color }}>{tierLabel}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  {rep.renter_score !== undefined && (
                    <span className="text-[10px] text-gray-400">🛒 Renter <strong className="text-gray-700">{Math.round(rep.renter_score)}</strong></span>
                  )}
                  {rep.verification_score !== undefined && (
                    <span className="text-[10px] text-gray-400">✓ Verify <strong className="text-gray-700">{Math.round(rep.verification_score)}</strong></span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
            </button>
          );
        })()}
        {/* Become a Host CTA */}
        <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-3xl p-5 text-white shadow-lg shadow-purple-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-purple-200 uppercase tracking-widest mb-0.5">Upgrade</p>
              <h2 className="text-lg font-black leading-tight mb-1">Start listing today &amp; earn</h2>
              <p className="text-purple-200 text-xs leading-relaxed mb-3">
                Become a Creator+ host — rent out gear, offer services, and earn money from your equipment.
              </p>
              <button onClick={() => setShowUpgradeModal(true)}
                className="inline-flex items-center gap-1.5 bg-white text-purple-700 hover:bg-purple-50 font-bold text-sm px-4 py-2 rounded-xl transition-colors shadow-sm">
                <Zap className="w-4 h-4" /> Become a Host
              </button>
            </div>
          </div>
        </div>

        {/* Orders */}
        {tab === 'orders' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-bold text-gray-900">My Orders</h3>
              <span className="text-xs text-gray-400">({orders.length})</span>
            </div>
            {orders.length === 0 ? (
              <div className="p-8 text-center">
                <ShoppingCart className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400 font-medium">No orders yet</p>
                <p className="text-xs text-gray-300 mt-1">When you rent gear or hire services, your orders appear here.</p>
                <button onClick={() => navigate('/')} className="mt-4 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                  Browse listings
                </button>
              </div>
            ) : (
              <div>
                <div className="divide-y divide-gray-50">
                  {orders.slice(0, 3).map((order, i) => (
                    <button key={i} onClick={() => navigate(`/inbox?conv=${order.convId}`)}
                    className="w-full flex gap-3 items-start px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                      {order.listingType === 'service' ? <Camera className="w-5 h-5 text-purple-500" /> : <Wrench className="w-5 h-5 text-blue-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{order.listing_title || order.listingTitle}</p>
                      {order.host_name && <p className="text-xs text-gray-400">from {order.host_name}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        {(order.start_date || order.startDate) && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <CalendarDays className="w-3 h-3" />
                            {new Date(order.start_date || order.startDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {order.duration && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />{order.duration} {order.duration_type || order.durationType}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-1 capitalize ${statusColors[order.status] || 'text-green-600 bg-green-50'}`}>
                      {order.status || 'paid'}
                    </span>
                  </button>
                ))}
                </div>
                <button onClick={() => navigate('/my-orders')}
                  className="w-full py-3 text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5 border-t border-gray-100">
                  View all orders & documents <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Opportunities — open to every account tier, unlike gear/service
            listings below which stay Creator+-gated. */}
        {tab === 'opportunities' && (
          <div className="space-y-3">
            <button onClick={() => setShowOpportunityGate(true)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl transition-colors flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" /> Post Opportunity
            </button>
            <MyOpportunitiesOverview opportunities={myOpportunities} />
          </div>
        )}

        {/* Applications — Opportunities this user has applied to, tracked
            separately from "Opportunities" above (the ones they posted).
            showCreatorUpsell: CreatorDashboard only ever renders for the
            'creator' tier, which can't apply at all right now (see
            submit-opportunity-application's applications: 0 entitlement). */}
        {tab === 'applications' && (
          <MyApplicationsSection userId={user.id} showCreatorUpsell />
        )}

        {/* Saved */}
        {tab === 'saved' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2"><Bookmark className="w-4 h-4 text-blue-500" /><h3 className="text-sm font-bold text-gray-900">Saved Listings</h3><span className="text-xs text-gray-400">({savedListings.length})</span></div>
              <button onClick={() => navigate('/')} className="text-xs text-blue-600 font-semibold flex items-center gap-0.5">Browse <ArrowUpRight className="w-3 h-3" /></button>
            </div>
            {savedListings.length === 0 ? (
              <div className="p-6 text-center"><Bookmark className="w-9 h-9 text-gray-200 mx-auto mb-2" /><p className="text-sm text-gray-400">No saved listings yet</p></div>
            ) : (
              <div className="divide-y divide-gray-50">
                {savedListings.map((l: any) => {
                  const thumb = l.image || l.images?.[0];
                  const addr = [l.city, l.province].filter(Boolean).join(', ');
                  return (
                    <button key={l.id} onClick={() => navigate(`/listing/${l.id}`)} className="w-full flex gap-3 items-start px-4 py-3 hover:bg-gray-50 transition-colors text-left">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
                        {thumb ? <img src={thumb} alt={l.title} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-gray-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{l.title}</p>
                        {addr && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{addr}</p>}
                        <p className="text-sm font-bold text-blue-600 mt-0.5">${l.price?.toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-2" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

        {/* Wallet tab — gated for creator */}
        {tab === 'transactions' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gray-400"/>
              <h3 className="text-sm font-bold text-gray-900">Transactions</h3>
            </div>
            <TransactionHistory userId={user.id}/>
          </div>
        )}

        {/* Listings — Creator+ required; shown in Creator+ upgrade section below */}

            {/* ── Creator+ Required: Listings & Wallet ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pt-2">
          <div className="flex-1 h-px bg-gray-100"/>
          <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Creator+ Features</p>
          <div className="flex-1 h-px bg-gray-100"/>
        </div>
        <CreatorPlusRequired feature="My Listings" color="blue" navigate={navigate}/>
        <CreatorPlusRequired feature="Wallet & Payouts" color="emerald" navigate={navigate}/>
      </div>

      {/* Upgrade modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowUpgradeModal(false)} />
          <div className="relative bg-white w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl shadow-2xl p-6 space-y-4">
            <button onClick={() => setShowUpgradeModal(false)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"><X className="w-4 h-4" /></button>
            <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center"><Zap className="w-7 h-7 text-purple-600" /></div>
            <div>
              <h3 className="text-xl font-black text-gray-900">Upgrade to Creator+</h3>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">A <strong>Creator+</strong> account lets you list gear for rent or sale, offer creative services, and become a verified host on Filmons.</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 space-y-1.5">
              {['List gear for rent or sale', 'Offer creative services', 'Host Dashboard & analytics', 'Verified seller badge'].map(p => (
                <div key={p} className="flex items-center gap-2 text-sm text-purple-800">
                  <CheckCircle className="w-4 h-4 text-purple-500 shrink-0" />{p}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <button onClick={() => { setShowUpgradeModal(false); navigate('/verification'); }}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white font-bold rounded-xl py-3 transition-all shadow-md">
                Start verification →
              </button>
              <button onClick={() => setShowUpgradeModal(false)} className="w-full text-gray-500 text-sm py-2 hover:text-gray-700 transition-colors">Maybe later</button>
            </div>
          </div>
        </div>
      )}

      {/* Creator+ Required gate -- Opportunities are viewable at the
          Creator tier, but posting one requires Creator+ (matches the
          server-side entitlement: creator.posts === 0, see
          src/app/lib/entitlements.ts). Shown instead of navigating to
          /create-opportunity, never as a partial/then-blocked flow. */}
      {showOpportunityGate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowOpportunityGate(false)} />
          <div className="relative bg-white w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl shadow-2xl p-6 space-y-4 text-center">
            <button onClick={() => setShowOpportunityGate(false)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"><X className="w-4 h-4" /></button>
            <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto"><Lock className="w-7 h-7 text-blue-600" /></div>
            <div>
              <h3 className="text-xl font-black text-gray-900">Creator+ Required</h3>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">You need a Creator+ account or higher to post an opportunity on FILMONS.</p>
            </div>
            <div className="space-y-2">
              <button onClick={() => { setShowOpportunityGate(false); navigate('/account/upgrade'); }}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold rounded-xl py-3 transition-all shadow-md">
                Upgrade to Creator+
              </button>
              <button onClick={() => setShowOpportunityGate(false)} className="w-full text-gray-500 text-sm py-2 hover:text-gray-700 transition-colors">Not Now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Host Dashboard Content (business/service accounts) ─────────────
function HostDashboardContent({ user }: { user: any }) {
  const navigate = useNavigate();
  const isCreatorPlus = ['creator_plus', 'professional', 'business'].includes(user.accountType ?? '');
  const goCreate = () => navigate(isCreatorPlus ? '/create-listing' : '/creator-plus-required?type=listings');
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'overview' | 'listings' | 'opportunities' | 'applications' | 'orders'>(
    initialTab === 'opportunities' || initialTab === 'listings' || initialTab === 'applications' || initialTab === 'orders' ? initialTab : 'overview',
  );
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    tabRefs.current[activeTab]?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [activeTab]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [dbTransactions, setDbTransactions] = useState<any[]>([]);
  const [dbTxLoading, setDbTxLoading] = useState(false);
  const [rep, setRep] = useState<ReputationScore | null>(null);

  useEffect(() => {
    reliabilityApi.getScore(user.id).then(setRep).catch(() => {});
  }, [user.id]);

  // Weekly Opportunity posts/applications usage -- shown on this
  // dashboard's Opportunities/Applications tabs. Business is exempt (its
  // entitlement is unlimited/null), so nothing is fetched or shown for it
  // -- "Do not show weekly counters as restrictions for Business users".
  const dashboardTier = normalizeTier(user.accountType);
  const [oppUsage, setOppUsage] = useState<{ posts: number; applications: number } | null>(null);
  useEffect(() => {
    if (dashboardTier === 'business') return;
    getOpportunityUsage(user.id, user.accountType).then(setOppUsage).catch(() => {});
  }, [user.id, dashboardTier]);

  const [savedListings2, setSavedListings2] = useState<any[]>([]);
  const [stats, setStats] = useState({
    balance: 0, totalEarned: 0, pending: 0,
    cadBalance: 0,
    listingCount: 0, followers: 0, following: 0,
    reviewCount: 0, avgRating: 0, activeRequests: 0,
  });

  // Reviews Received (reviewed_user_id = this user, via reviewsApi.
  // getReceivedReviews) -- the same source of truth HostProfile.tsx's
  // public reputation/star rating already computes from, replacing the
  // old getStoredReviews() localStorage read (a dead cache nothing writes
  // real reviews into anymore, which is why this always showed 0). No
  // separate manually-maintained counter -- count and average are derived
  // straight from the reviews rows every time this runs.
  const refreshReviewStats = () => {
    reviewsApi.getReceivedReviews(user.id).then(reviews => {
      const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
      setStats(prev => ({ ...prev, reviewCount: reviews.length, avgRating }));
    }).catch(() => {});
  };

  // Realtime: a new review landing while this page is open must not wait
  // for a manual refresh/re-mount to stop showing a stale count -- same
  // postgres_changes pattern already used for Inbox's live message feed.
  useEffect(() => {
    const ch = supabase
      .channel(`dashboard_reviews_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews', filter: `reviewed_user_id=eq.${user.id}` }, () => {
        refreshReviewStats();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user.id]);

  useEffect(() => {
    // Instant paint from cache, then replaced by a live, is_active-filtered
    // fetch below — the cache alone previously meant a deleted listing kept
    // showing here indefinitely, since nothing ever invalidated it.
    const cached = getStoredListings().filter((l: Listing) => l.userId === user.id);
    setMyListings(cached);

    listingsApi.getUserListings(user.id).then(listings => {
      setMyListings(listings);
    }).catch(() => {}).finally(() => setListingsLoading(false));

    // Load orders from DB (as host)
    supabase.from('orders').select('*')
      .eq('host_id', user.id)
      .order('paid_at', { ascending: false })
      .then(({ data }) => {
        const orders = data || [];
        setMyOrders(orders);
        setOrdersLoading(false);

        // Build transactions from orders (for overview section)
        const txs = orders.map((o: any) => ({
          id: o.id, amount: Number(o.total_amount),
          title: o.listing_title, status: o.status || 'paid',
          date: o.paid_at, method: o.payment_method,
        }));
        setTransactions(txs);

        // Load all transactions from DB transactions table
        setDbTxLoading(true);
        supabase.from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(200)
          .then(({ data: dbTxs }) => {
            setDbTransactions(dbTxs || []);
            setDbTxLoading(false);
          });

        const totalEarned = orders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);

        // Real wallet balance (pending vs available) — replaces the old
        // Math.max(localStorage wallet, order total) approximation.
        walletApi.getBalance(user.id).then(({ pending, available }) => {
          setStats(prev => ({ ...prev, balance: available, cadBalance: available, pending }));
        });

        setStats(prev => ({
          ...prev,
          totalEarned,
          listingCount: cached.length,
          followers: user.followers?.length || 0,
          following: user.following?.length || 0,
          activeRequests: 0,
        }));
      })
      .catch(() => { setOrdersLoading(false); });

    refreshReviewStats();

    savedListingsApi.getSaved(user.id).then(ls => setSavedListings2(Array.isArray(ls) ? ls : [])).catch(() => setSavedListings2([]));
  }, [user]);

  useEffect(() => {
    const handler = () => {
      walletApi.getBalance(user.id).then(({ pending, available }) => {
        setStats(prev => ({ ...prev, balance: available, cadBalance: available, pending }));
      });
    };
    window.addEventListener('filmons:wallet:updated', handler);
    return () => window.removeEventListener('filmons:wallet:updated', handler);
  }, [user.id]);

  const quickActions = [
    { icon: <Plus className="w-4 h-4 text-blue-600" />, label: 'Create a new listing', color: 'bg-blue-50', action: goCreate },
    { icon: <Package className="w-4 h-4 text-purple-600" />, label: 'My listings', color: 'bg-purple-50', action: () => setActiveTab('listings') },
    { icon: <MessageCircle className="w-4 h-4 text-green-600" />, label: 'Open inbox', color: 'bg-green-50', action: () => navigate('/inbox') },
    { icon: <ShieldCheck className="w-4 h-4 text-orange-500" />, label: 'Get verified', color: 'bg-orange-50', action: () => navigate('/verification') },
    { icon: <Eye className="w-4 h-4 text-blue-500" />, label: 'View my public profile', color: 'bg-blue-50', action: () => navigate(`/host/${user.id}`) },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar user={user} size={40} />
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">Host Dashboard</h1>
              <p className="text-xs text-gray-400">{user.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={goCreate} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"><Plus className="w-3.5 h-3.5" /> New Listing</button>
            <Link to="/profile" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"><Settings className="w-4 h-4" /></Link>
          </div>
        </div>
        <div ref={tabScrollRef} className="max-w-2xl mx-auto px-4 flex gap-0 border-t border-gray-100 overflow-x-auto overflow-y-hidden flex-nowrap no-scrollbar" style={{ scrollBehavior: 'smooth' }}>
          {[
            { key: 'overview', label: 'Overview', icon: LayoutDashboard },
            { key: 'listings', label: 'Listings', icon: Package },
            { key: 'opportunities', label: 'Opportunities', icon: Briefcase },
            { key: 'applications', label: 'Applications', icon: FileText },
            { key: 'orders',   label: 'My Orders', icon: ShoppingCart },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} ref={el => { tabRefs.current[key] = el; }} onClick={() => setActiveTab(key as any)}
              className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${activeTab === (key as any) ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {activeTab === 'overview' && (
          <>
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-6 text-white shadow-lg shadow-blue-200">
              <div className="flex items-center justify-between mb-1">
                <p className="text-blue-100 text-sm font-medium">Filmons Balance</p>
                <Link to="/wallet" className="text-blue-200 hover:text-white text-xs font-semibold underline underline-offset-2 transition-colors">
                  My Wallet →
                </Link>
              </div>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-4xl font-black">${fmt(stats.cadBalance)}</span>
                <span className="text-blue-200 text-sm">CAD</span>
              </div>
              <div className="flex gap-4">
                <div><p className="text-blue-200 text-xs">CAD Earned</p><p className="text-white font-bold text-sm">${fmt(stats.cadBalance)}</p></div>
                <div className="w-px bg-blue-500/50" />
                <div><p className="text-blue-200 text-xs">Pending</p><p className="text-white font-bold text-sm">${fmt(stats.pending)}</p></div>
                <div className="w-px bg-blue-500/50" />
                <div><p className="text-blue-200 text-xs">Transactions</p><p className="text-white font-bold text-sm">{dbTransactions.length}</p></div>
              </div>
            </div>
            {/* Reliability score card */}
            {rep && (() => {
              const composite = rep.reliability_score ?? 0;
              const color = scoreColor(composite);
              const tier = getCompositeTier(rep.reliability_level, isCreatorPlusTier(rep.account_type));
              const tierLabel = tier.label;
              return (
                <button onClick={() => { setSettingsReturnTo(window.location.pathname); navigate('/settings/reviews'); }}
                  className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors">
                  <svg width={52} height={52} style={{ flexShrink: 0, overflow: 'visible' }}>
                    <circle cx={26} cy={26} r={20} fill="none" stroke="#e5e7eb" strokeWidth="5"/>
                    <circle cx={26} cy={26} r={20} fill="none" stroke={color} strokeWidth="5"
                      strokeDasharray={`${(composite / 100) * (2 * Math.PI * 20)} ${2 * Math.PI * 20}`}
                      strokeLinecap="round" transform="rotate(-90 26 26)"
                      style={{ filter: `drop-shadow(0 0 4px ${color}55)` }}/>
                    <text x={26} y={30} textAnchor="middle" fontSize={13} fontWeight="900" fill={color}>{Math.round(composite)}</text>
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-900">Reliability Score</p>
                    <p className="text-xs font-semibold mt-0.5" style={{ color }}>{tierLabel}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {rep.renter_score !== undefined && (
                        <span className="text-[10px] text-gray-400">🛒 Renter <strong className="text-gray-700">{Math.round(rep.renter_score)}</strong></span>
                      )}
                      {rep.host_score !== undefined && (
                        <span className="text-[10px] text-gray-400">🏠 Host <strong className="text-gray-700">{Math.round(rep.host_score)}</strong></span>
                      )}
                      {rep.service_score !== undefined && (
                        <span className="text-[10px] text-gray-400">🎬 Service <strong className="text-gray-700">{Math.round(rep.service_score)}</strong></span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
                </button>
              );
            })()}
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={<Package className="w-5 h-5 text-blue-600" />} label="Active Listings" value={stats.listingCount.toString()} sub="on Filmons" color="bg-blue-50" />
              <StatCard icon={<MessageCircle className="w-5 h-5 text-purple-600" />} label="Pending Requests" value={stats.activeRequests.toString()} sub="awaiting review" color="bg-purple-50" />
              <StatCard icon={<Users className="w-5 h-5 text-green-600" />} label="Followers" value={stats.followers.toString()} sub={`${stats.following} following`} color="bg-green-50" />
              <StatCard icon={<Star className="w-5 h-5 text-yellow-500" />} label="Avg Rating" value={stats.reviewCount > 0 ? stats.avgRating.toFixed(1) : '—'} sub={`${stats.reviewCount} review${stats.reviewCount !== 1 ? 's' : ''}`} color="bg-yellow-50" />
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50"><h3 className="text-sm font-bold text-gray-900">Quick Actions</h3></div>
              <div className="divide-y divide-gray-50">
                {quickActions.map((action, i) => (
                  <button key={i} onClick={action.action} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group text-left">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${action.color}`}>{action.icon}</div>
                    <span className="flex-1 text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">{action.label}</span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
            {/* Transactions mini panel */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">Recent Transactions</h3>
                <Link to="/wallet" className="text-xs text-blue-600 font-semibold flex items-center gap-0.5">Wallet <ArrowUpRight className="w-3 h-3" /></Link>
              </div>
              {dbTxLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                </div>
              ) : dbTransactions.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <BarChart3 className="w-8 h-8 text-gray-200 mx-auto mb-1.5" />
                  <p className="text-xs text-gray-400">No transactions yet</p>
                </div>
              ) : (
                <div className="px-4 divide-y divide-gray-50">
                  {dbTransactions.slice(0, 5).map(tx => <DbTxRow key={tx.id} tx={tx} />)}
                  {dbTransactions.length > 5 && (
                    <div className="py-3 text-center">
                      <Link to="/wallet" className="text-xs text-blue-600 font-semibold">
                        View all {dbTransactions.length} transactions →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'listings' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-600">{myListings.length} listing{myListings.length !== 1 ? 's' : ''}</p>
              <button onClick={goCreate} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"><Plus className="w-3.5 h-3.5" /> Add</button>
            </div>
            {listingsLoading ? (
              <div className="flex items-center justify-center py-16">
                <FilmonsBrandLoader size="md" label="Loading listings"/>
              </div>
            ) : myListings.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-3">
                <Package className="w-12 h-12 text-blue-200 mx-auto" />
                <h3 className="font-bold text-gray-900">No listings yet</h3>
                <button onClick={goCreate} className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"><Plus className="w-4 h-4" /> Create Listing</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {myListings.map(listing => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    onDeleted={() => setMyListings(prev => prev.filter(l => l.id !== listing.id))}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'opportunities' && (
          <>
            {oppUsage && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  Opportunity posts this week: <span className="font-black text-gray-900">{oppUsage.posts} of {getEntitlement(user.accountType).posts}</span>
                </p>
                <p className="text-[11px] text-gray-400">{resetLabel(getEntitlement(user.accountType).window)}</p>
              </div>
            )}
            <MyOpportunitiesOverview loading={listingsLoading} opportunities={myListings.filter(l => l.listingType === 'opportunity' || l.listingKind === 'talent')} />
          </>
        )}

        {/* Applications — Opportunities this user applied to elsewhere,
            distinct from "Opportunities" above (the ones they posted). No
            Creator+ upsell here -- every tier that reaches this dashboard
            variant (creator_plus/professional/business) can already apply. */}
        {activeTab === 'applications' && (
          <>
            {oppUsage && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  Applications this week: <span className="font-black text-gray-900">{oppUsage.applications} of {getEntitlement(user.accountType).applications}</span>
                </p>
                <p className="text-[11px] text-gray-400">{resetLabel(getEntitlement(user.accountType).window)}</p>
              </div>
            )}
            <MyApplicationsSection userId={user.id} />
          </>
        )}

        {activeTab === 'orders' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold text-gray-900">My Orders (as Host)</h3>
                <span className="text-xs text-gray-400">({myOrders.length})</span>
              </div>
              <button onClick={() => navigate('/my-orders')} className="text-xs text-blue-600 font-semibold flex items-center gap-0.5">All <ArrowUpRight className="w-3 h-3" /></button>
            </div>
            {ordersLoading ? (
              <div className="flex items-center justify-center py-16">
                <FilmonsBrandLoader size="md" label="Loading orders"/>
              </div>
            ) : myOrders.length === 0 ? (
              <div className="p-8 text-center">
                <ShoppingCart className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No orders yet as host</p>
                <p className="text-xs text-gray-300 mt-1">When renters pay for your gear, orders appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {myOrders.slice(0, 5).map((order, i) => (
                  <div key={order.id || i} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                      <Wrench className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{order.listing_title}</p>
                      <p className="text-xs text-gray-400">{order.renter_name} · {order.start_date ? new Date(order.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'}</p>
                    </div>
                    <span className="text-xs font-bold text-green-700">${Number(order.total_amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Main export: router ────────────────────────────────────────────
export function HostDashboard() {
  const { user, setUserDirectly } = useAuth();
  const navigate = useNavigate();
  const [liveUser, setLiveUser] = useState<any>(user);

  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);

  // Always do a live DB check so stale cache never blocks access
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('profiles')
      .select('account_type, account_mode, verification_status, is_verified')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const rawType = data.account_type || user.accountType || 'creator';
        const verified = data.verification_status === 'verified' || data.is_verified;
        const resolvedType = (verified && !PLUS_TIERS.includes(rawType)) ? 'creator_plus' : rawType;
        const updated = { ...user, accountType: resolvedType, accountMode: data.account_mode || resolvedType, verificationStatus: data.verification_status, isVerified: data.is_verified };
        setLiveUser(updated);
        if (resolvedType !== user.accountType) setUserDirectly(updated as any);
      })
      .catch(() => setLiveUser(user));
  }, [user?.id]); // eslint-disable-line

  if (!liveUser) return null;
  if (!isCreatorPlus(liveUser)) return <CreatorDashboard user={liveUser} />;
  return <HostDashboardContent user={liveUser} />;
}