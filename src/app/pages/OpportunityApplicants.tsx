/**
 * Applicant management for a single Opportunity listing — the ONE
 * implementation reached both from ListingCard's owner menu and from
 * Dashboard → Opportunities → Manage Applications. Every status mutation
 * goes through manage-application (applicationApi), the same path the
 * Inbox Application Card uses, so status never drifts between surfaces.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { toast } from 'sonner';
import {
  ArrowLeft, Briefcase, ExternalLink, MessageCircle, CheckCircle2, XCircle,
  ShieldCheck, Search, SlidersHorizontal, MoreHorizontal, Users, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listingsApi, authApi, chatApi } from '../lib/api';
import { applicationApi, opportunityPaymentApi, OpportunityApplicationRow } from '../lib/applicationApi';
import { supabase } from '../../lib/supabase';
import { Listing, User } from '../types';
import { BottomSheet } from '../components/BottomSheet';

type Row = OpportunityApplicationRow & { profile: User | null };
type TabKey = 'all' | 'new' | 'shortlisted' | 'accepted' | 'closed';

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending:     { label: 'New',         color: 'bg-indigo-100 text-indigo-700' },
  viewed:      { label: 'Viewed',      color: 'bg-gray-100 text-gray-600' },
  shortlisted: { label: 'Shortlisted', color: 'bg-purple-100 text-purple-700' },
  contacted:   { label: 'Contacted',   color: 'bg-blue-100 text-blue-700' },
  accepted:    { label: 'Accepted',    color: 'bg-green-100 text-green-700' },
  offer_sent:      { label: 'Offer Sent',     color: 'bg-amber-100 text-amber-700' },
  offer_accepted:  { label: 'Offer Accepted', color: 'bg-green-100 text-green-700' },
  payment_pending: { label: 'Funding…',       color: 'bg-amber-100 text-amber-700' },
  hired:           { label: 'Hired',          color: 'bg-green-100 text-green-700' },
  completed:       { label: 'Completed',      color: 'bg-gray-100 text-gray-600' },
  rejected:    { label: 'Declined',    color: 'bg-red-50 text-red-500' },
  withdrawn:   { label: 'Withdrawn',   color: 'bg-gray-100 text-gray-500' },
};
const TERMINAL = new Set(['accepted', 'rejected', 'withdrawn', 'offer_sent', 'offer_accepted', 'payment_pending', 'hired', 'completed']);
const RATE_TYPE_SUFFIX: Record<string, string> = { hourly: '/hr', daily: '/day', flat: ' flat', per_project: '/project' };
function proposedRateLabel(a: { proposed_rate_amount: number | null; proposed_rate_currency: string | null; proposed_rate_type: string | null }): string | null {
  if (!a.proposed_rate_amount) return null;
  return `$${a.proposed_rate_amount} ${a.proposed_rate_currency || 'CAD'}${a.proposed_rate_type ? RATE_TYPE_SUFFIX[a.proposed_rate_type] || '' : ''}`;
}
const tabOf = (status: string): TabKey =>
  status === 'pending' || status === 'viewed' ? 'new' :
  status === 'shortlisted' || status === 'contacted' ? 'shortlisted' :
  status === 'rejected' || status === 'withdrawn' ? 'closed' : 'accepted';

export function OpportunityApplicants() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [listing, setListing] = useState<Listing | null>(null);
  const [applicants, setApplicants] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [creatorPlusOnly, setCreatorPlusOnly] = useState(false);
  const [cityFilter, setCityFilter] = useState('');
  const [hasPortfolio, setHasPortfolio] = useState(false);
  const [hasResume, setHasResume] = useState(false);

  useEffect(() => {
    if (!id || !user?.id) return;
    (async () => {
      try {
        const l = await listingsApi.getOne(id);
        if (l.userId !== user.id) { toast.error("You don't have permission to view this"); navigate('/dashboard'); return; }
        setListing(l);
        const { data } = await supabase.from('opportunity_applications').select('*').eq('listing_id', id).order('created_at', { ascending: false });
        const rows = data || [];
        // Never fetches identity_verifications — applicant cards show only
        // public-profile info, per the spec's explicit instruction.
        const profiles = await Promise.all(rows.map((r: any) => authApi.getUserById(r.applicant_id).catch(() => null)));
        setApplicants(rows.map((r: any, i: number) => ({ ...r, profile: profiles[i] })));
      } catch {
        toast.error('Could not load applicants');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user?.id]);

  const patch = (appId: string, changes: Partial<Row>) =>
    setApplicants(prev => prev.map(a => a.id === appId ? { ...a, ...changes } : a));

  const counts = useMemo(() => ({
    all: applicants.length,
    new: applicants.filter(a => tabOf(a.status) === 'new').length,
    shortlisted: applicants.filter(a => tabOf(a.status) === 'shortlisted').length,
    accepted: applicants.filter(a => tabOf(a.status) === 'accepted').length,
    closed: applicants.filter(a => tabOf(a.status) === 'closed').length,
  }), [applicants]);

  const filtered = useMemo(() => {
    let list = tab === 'all' ? applicants : applicants.filter(a => tabOf(a.status) === tab);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(a =>
      a.profile?.name?.toLowerCase().includes(q) ||
      a.profile?.primaryRole?.toLowerCase().includes(q) ||
      a.message?.toLowerCase().includes(q)
    );
    if (creatorPlusOnly) list = list.filter(a => a.profile?.isVerified);
    if (cityFilter.trim()) list = list.filter(a => a.profile?.city?.toLowerCase().includes(cityFilter.trim().toLowerCase()));
    if (hasPortfolio) list = list.filter(a => !!a.portfolio_url);
    if (hasResume) list = list.filter(a => !!a.resume_url);
    return [...list].sort((a, b) => sortBy === 'newest'
      ? b.created_at.localeCompare(a.created_at)
      : a.created_at.localeCompare(b.created_at));
  }, [applicants, tab, search, creatorPlusOnly, cityFilter, hasPortfolio, hasResume, sortBy]);

  const selected = applicants.find(a => a.id === selectedId) || null;
  const numPeopleNeeded = listing?.opportunity?.numPeopleNeeded;
  const positionsFilled = counts.accepted;
  const allFilled = !!numPeopleNeeded && positionsFilled >= numPeopleNeeded;

  const openApplicant = (a: Row) => {
    setSelectedId(a.id);
    if (a.status === 'pending' && user) {
      applicationApi.view(a.id, user.id).then(r => { if (r.application) patch(a.id, r.application); }).catch(() => {});
    }
  };

  const messageApplicant = async (a: Row) => {
    if (!user) return;
    const conv = await chatApi.getOrCreateDB(user.id, a.applicant_id);
    if (!a.conversation_id) patch(a.id, { conversation_id: conv.id });
    navigate(`/inbox?conv=${conv.id}`);
  };

  const doShortlist = async (a: Row) => {
    if (!user) return;
    try { const r = await applicationApi.shortlist(a.id, user.id); if (r.application) patch(a.id, r.application); toast.success('Applicant shortlisted'); }
    catch (e: any) { toast.error(e?.message || 'Could not shortlist'); }
  };
  const doAccept = async (a: Row, details?: { position?: string; agreedRate?: string; startDate?: string }) => {
    if (!user) return;
    try { const r = await applicationApi.accept(a.id, user.id, details); if (r.application) patch(a.id, r.application); toast.success('Applicant accepted'); }
    catch (e: any) { toast.error(e?.message || 'Could not accept'); }
  };
  const doDecline = async (a: Row, reason?: string, note?: string) => {
    if (!user) return;
    try { const r = await applicationApi.decline(a.id, user.id, reason, note); if (r.application) patch(a.id, r.application); toast.success('Application declined'); }
    catch (e: any) { toast.error(e?.message || 'Could not decline'); }
  };
  const saveNotes = async (a: Row, notes: string) => {
    if (!user) return;
    patch(a.id, { host_notes: notes });
    try { await applicationApi.updateNotes(a.id, user.id, notes); } catch {}
  };
  const doSendOffer = async (a: Row) => {
    if (!user) return;
    try { await applicationApi.sendOffer(a.id, user.id); patch(a.id, { status: 'offer_sent' } as any); toast.success('Offer sent'); }
    catch (e: any) { toast.error(e?.message || 'Could not send offer'); }
  };
  const doFund = async (a: Row) => {
    if (!user || !listing) return;
    try {
      const origin = window.location.origin;
      const { url } = await opportunityPaymentApi.startFunding(user.id, a.id, `${origin}/listing/${listing.id}/applicants?opp_fund=1`, `${origin}/listing/${listing.id}/applicants`);
      window.location.href = url;
    } catch (e: any) { toast.error(e?.message || 'Could not start payment'); }
  };

  const toggleBulk = (id: string) => setBulkIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const bulkShortlist = async () => {
    if (!user || !bulkIds.size) return;
    const ids = [...bulkIds];
    try {
      await applicationApi.bulkShortlist(ids, user.id);
      ids.forEach(id => patch(id, { status: 'shortlisted' } as any));
      toast.success(`${ids.length} applicant(s) shortlisted`);
      setBulkIds(new Set()); setBulkMode(false);
    } catch (e: any) { toast.error(e?.message || 'Bulk shortlist failed'); }
  };
  const bulkDecline = async () => {
    if (!user || !bulkIds.size) return;
    const ids = [...bulkIds];
    try {
      await applicationApi.bulkDecline(ids, user.id);
      ids.forEach(id => patch(id, { status: 'rejected' } as any));
      toast.success(`${ids.length} applicant(s) declined`);
      setBulkIds(new Set()); setBulkMode(false);
    } catch (e: any) { toast.error(e?.message || 'Bulk decline failed'); }
  };

  const toggleCloseApplications = async () => {
    if (!listing || !user) return;
    const closed = listing.opportunity?.opportunityStatus === 'applications_closed';
    const nextStatus = closed ? 'active' : 'applications_closed';
    // Direct write, same pattern CreateOpportunity.tsx's edit-mode uses for
    // metadata.opportunity — listingsApi.update()'s edge-function-timeout
    // fallback doesn't round-trip opportunity/listingKind at all, which
    // would silently drop this field if it ever fell through to that path.
    try {
      const { error } = await supabase.from('listings')
        .update({ metadata: { listingKind: listing.listingKind, opportunity: { ...listing.opportunity, opportunityStatus: nextStatus } } })
        .eq('id', listing.id);
      if (error) throw error;
      setListing(prev => prev ? { ...prev, opportunity: { ...prev.opportunity!, opportunityStatus: nextStatus } } : prev);
      toast.success(closed ? 'Applications reopened' : 'Applications closed');
    } catch { toast.error('Could not update applications status'); }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>;
  }
  if (!listing) return null;

  const applicationsClosed = listing.opportunity?.opportunityStatus === 'applications_closed';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3.5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1"><Briefcase className="w-3 h-3" /> Applicants · {counts.all}</p>
          <p className="text-sm font-bold text-gray-900 truncate">{listing.title}</p>
        </div>
        <button onClick={toggleCloseApplications} className="shrink-0 text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1.5 rounded-full whitespace-nowrap">
          {applicationsClosed ? 'Reopen Applications' : 'Close Applications'}
        </button>
      </div>

      {numPeopleNeeded ? (
        <div className={`px-4 py-2.5 flex items-center gap-2 text-xs font-semibold ${allFilled ? 'bg-green-50 text-green-700' : 'bg-indigo-50 text-indigo-700'}`}>
          <Users className="w-3.5 h-3.5" />
          Positions filled: {positionsFilled} of {numPeopleNeeded}
          {allFilled && !applicationsClosed && (
            <button onClick={toggleCloseApplications} className="ml-auto underline font-bold">All positions filled ✓ — Close Applications</button>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] md:h-[calc(100vh-52px)]">
        {/* ── List pane ── */}
        <div className={`md:border-r md:border-gray-100 md:overflow-y-auto ${selectedId ? 'hidden md:block' : ''}`}>
          <div className="px-4 py-3 space-y-2 sticky top-0 bg-gray-50 md:bg-white z-[1]">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {(['all', 'new', 'shortlisted', 'accepted', 'closed'] as TabKey[]).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {t === 'all' ? 'All' : t[0].toUpperCase() + t.slice(1)} {counts[t] > 0 && `(${counts[t]})`}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search applicants…"
                className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400" />
              {search && <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5 text-gray-400" /></button>}
              <button onClick={() => setFilterOpen(true)}><SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" /></button>
            </div>
            <div className="flex items-center justify-between">
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="text-xs font-semibold text-gray-500 bg-transparent outline-none">
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
              <button onClick={() => { setBulkMode(v => !v); setBulkIds(new Set()); }} className="text-xs font-semibold text-indigo-600">
                {bulkMode ? 'Cancel' : 'Select'}
              </button>
            </div>
          </div>

          {bulkMode && bulkIds.size > 0 && (
            <div className="sticky top-[104px] z-[1] mx-4 mb-2 flex gap-2 bg-white border border-gray-100 shadow-sm rounded-xl p-2">
              <button onClick={bulkShortlist} className="flex-1 text-xs font-bold text-purple-700 bg-purple-50 rounded-lg py-2">Shortlist ({bulkIds.size})</button>
              <button onClick={bulkDecline} className="flex-1 text-xs font-bold text-red-600 bg-red-50 rounded-lg py-2">Decline ({bulkIds.size})</button>
            </div>
          )}

          <div className="px-4 pb-6 space-y-2.5">
            {filtered.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
                <Briefcase className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No applicants found</p>
              </div>
            ) : filtered.map(a => (
              <ApplicantRow key={a.id} a={a} active={selectedId === a.id} bulkMode={bulkMode}
                checked={bulkIds.has(a.id)} onToggleBulk={() => toggleBulk(a.id)}
                onOpen={() => openApplicant(a)} onMessage={() => messageApplicant(a)}
                onShortlist={() => doShortlist(a)} onDecline={() => doDecline(a)} />
            ))}
          </div>
        </div>

        {/* ── Detail pane (desktop inline) ── */}
        <div className="hidden md:block md:overflow-y-auto">
          {selected ? (
            <ApplicantDetail a={selected} listing={listing} onBack={() => setSelectedId(null)} showBack={false}
              onMessage={() => messageApplicant(selected)} onShortlist={() => doShortlist(selected)}
              onAccept={(d) => doAccept(selected, d)} onDecline={(r, n) => doDecline(selected, r, n)}
              onSaveNotes={(n) => saveNotes(selected, n)}
              onSendOffer={() => doSendOffer(selected)} onFund={() => doFund(selected)} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">Select an applicant to view their application</div>
          )}
        </div>
      </div>

      {/* Mobile detail sheet */}
      {selected && (
        <div className="md:hidden">
          <BottomSheet title="Application" onClose={() => setSelectedId(null)}>
            <ApplicantDetail a={selected} listing={listing} onBack={() => setSelectedId(null)} showBack
              onMessage={() => messageApplicant(selected)} onShortlist={() => doShortlist(selected)}
              onAccept={(d) => doAccept(selected, d)} onDecline={(r, n) => doDecline(selected, r, n)}
              onSaveNotes={(n) => saveNotes(selected, n)}
              onSendOffer={() => doSendOffer(selected)} onFund={() => doFund(selected)} />
          </BottomSheet>
        </div>
      )}

      {filterOpen && (
        <BottomSheet title="Filters" onClose={() => setFilterOpen(false)}>
          <div className="px-5 py-4 space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Creator+ only</span>
              <input type="checkbox" checked={creatorPlusOnly} onChange={e => setCreatorPlusOnly(e.target.checked)} className="w-4 h-4" />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Has portfolio</span>
              <input type="checkbox" checked={hasPortfolio} onChange={e => setHasPortfolio(e.target.checked)} className="w-4 h-4" />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Has resume</span>
              <input type="checkbox" checked={hasResume} onChange={e => setHasResume(e.target.checked)} className="w-4 h-4" />
            </label>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1.5">City</p>
              <input value={cityFilter} onChange={e => setCityFilter(e.target.value)} placeholder="e.g. Vancouver"
                className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none" />
            </div>
            <button onClick={() => setFilterOpen(false)} className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm">Apply Filters</button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function ApplicantRow({ a, active, bulkMode, checked, onToggleBulk, onOpen, onMessage, onShortlist, onDecline }: {
  a: Row; active: boolean; bulkMode: boolean; checked: boolean; onToggleBulk: () => void;
  onOpen: () => void; onMessage: () => void; onShortlist: () => void; onDecline: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const badge = STATUS_BADGE[a.status] || STATUS_BADGE.pending;
  const nonTerminal = !TERMINAL.has(a.status);
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-3.5 space-y-2.5 cursor-pointer ${active ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-100'}`} onClick={onOpen}>
      <div className="flex items-start gap-2.5">
        {bulkMode && (
          <input type="checkbox" checked={checked} onClick={e => { e.stopPropagation(); onToggleBulk(); }} onChange={() => {}} className="w-4 h-4 mt-1 shrink-0" />
        )}
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 shrink-0">
          {a.profile?.avatar && <img src={a.profile.avatar} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate flex items-center gap-1">
            {a.profile?.name || 'Applicant'} {a.profile?.isVerified && <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
          </p>
          <p className="text-xs text-gray-400 truncate">{[a.profile?.primaryRole, a.profile?.city].filter(Boolean).join(' · ')}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${badge.color}`}>{badge.label}</span>
        <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => setMenuOpen(v => !v)} className="w-6 h-6 flex items-center justify-center text-gray-400"><MoreHorizontal className="w-4 h-4" /></button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-10 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[160px]">
              <Link to={`/host/${a.applicant_id}`} className="block px-3.5 py-2 text-xs text-gray-700 hover:bg-gray-50">View Profile</Link>
              {a.portfolio_url && <a href={a.portfolio_url} target="_blank" rel="noreferrer" className="block px-3.5 py-2 text-xs text-gray-700 hover:bg-gray-50">View Portfolio</a>}
              {nonTerminal && <button onClick={() => { setMenuOpen(false); onDecline(); }} className="block w-full text-left px-3.5 py-2 text-xs text-red-600 hover:bg-red-50">Decline Application</button>}
            </div>
          )}
        </div>
      </div>
      {proposedRateLabel(a) && (
        <p className="text-sm font-black text-indigo-700">Proposed rate: {proposedRateLabel(a)}</p>
      )}
      {a.proposed_rate_note && <p className="text-xs text-gray-500 line-clamp-2">{a.proposed_rate_note}</p>}
      {a.message && <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-2.5 py-2 line-clamp-2">{a.message}</p>}
      <div className="flex flex-wrap gap-1.5">
        {a.portfolio_url && <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Portfolio ✓</span>}
        {a.resume_url && <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Resume ✓</span>}
        {a.expected_rate && <span className="text-[10px] font-semibold text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">{a.expected_rate}</span>}
      </div>
      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
        <button onClick={onMessage} className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1.5 rounded-full"><MessageCircle className="w-3 h-3" /> Message</button>
        {nonTerminal && a.status !== 'shortlisted' && <button onClick={onShortlist} className="flex-1 text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-1.5 rounded-full">Shortlist</button>}
        {nonTerminal && (
          <button onClick={onDecline} className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1.5 rounded-full"><XCircle className="w-3 h-3" /> Decline</button>
        )}
      </div>
    </div>
  );
}

function ApplicantDetail({ a, listing, onBack, showBack, onMessage, onShortlist, onAccept, onDecline, onSaveNotes, onSendOffer, onFund }: {
  a: Row; listing: Listing; onBack: () => void; showBack: boolean;
  onMessage: () => void; onShortlist: () => void;
  onAccept: (details?: { position?: string; agreedRate?: string; startDate?: string }) => void;
  onDecline: (reason?: string, note?: string) => void;
  onSaveNotes: (notes: string) => void;
  onSendOffer: () => void; onFund: () => void;
}) {
  const [notes, setNotes] = useState(a.host_notes || '');
  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  useEffect(() => { setNotes(a.host_notes || ''); }, [a.id]);

  const nonTerminal = !TERMINAL.has(a.status);
  const badge = STATUS_BADGE[a.status] || STATUS_BADGE.pending;

  return (
    <div className="flex flex-col h-full">
      {showBack && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <button onClick={onBack}><ArrowLeft className="w-4 h-4 text-gray-600" /></button>
          <p className="text-sm font-bold text-gray-900">Application</p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 shrink-0">
            {a.profile?.avatar && <img src={a.profile.avatar} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <Link to={`/host/${a.applicant_id}`} className="text-sm font-bold text-gray-900 flex items-center gap-1 hover:text-indigo-600">
              {a.profile?.name || 'Applicant'} {a.profile?.isVerified && <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />}
            </Link>
            <p className="text-xs text-gray-400">{[a.profile?.primaryRole, a.profile?.city].filter(Boolean).join(' · ')}</p>
          </div>
          <span className={`text-[10px] font-black px-2 py-1 rounded-full shrink-0 ${badge.color}`}>{badge.label.toUpperCase()}</span>
        </div>

        {a.portfolio_url && <a href={a.portfolio_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600"><ExternalLink className="w-3 h-3" /> View Portfolio</a>}

        {proposedRateLabel(a) && (
          <Section label="Proposed Rate">
            <p className="text-base font-black text-indigo-700">{proposedRateLabel(a)}</p>
            {a.proposed_rate_note && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{a.proposed_rate_note}</p>}
          </Section>
        )}
        {a.message && <Section label="Application Message"><p className="text-sm text-gray-700 whitespace-pre-wrap">{a.message}</p></Section>}
        {a.availability && <Section label="Availability"><p className="text-sm text-gray-700">{a.availability}</p></Section>}
        {a.expected_rate && <Section label="Expected Rate"><p className="text-sm text-gray-700">{a.expected_rate}</p></Section>}
        {a.resume_url && <Section label="Resume"><a href={a.resume_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600"><ExternalLink className="w-3.5 h-3.5" /> View Resume</a></Section>}
        {a.demo_reel_url && <Section label="Work Samples"><a href={a.demo_reel_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600"><ExternalLink className="w-3.5 h-3.5" /> View Work</a></Section>}
        {a.custom_answers && Object.keys(a.custom_answers).length > 0 && (
          <Section label="Screening Questions">
            <div className="space-y-2">
              {Object.entries(a.custom_answers).map(([q, ans]) => (
                <div key={q}><p className="text-xs font-semibold text-gray-500">{q}</p><p className="text-sm text-gray-700">{ans}</p></div>
              ))}
            </div>
          </Section>
        )}
        <p className="text-[11px] text-gray-300">Submitted {new Date(a.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>

        <Section label="Private Notes (only you can see this)">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => onSaveNotes(notes)}
            placeholder="e.g. Strong cinematography portfolio. Ask about FX6 experience."
            rows={3} className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none resize-none" />
        </Section>
      </div>

      <div className="shrink-0 border-t border-gray-100 px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        {confirmingAccept ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Accept {a.profile?.name || 'this applicant'} for {listing.title}?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmingAccept(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Cancel</button>
              <button onClick={() => { onAccept(); setConfirmingAccept(false); }} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold">Accept Applicant</button>
            </div>
          </div>
        ) : confirmingDecline ? (
          <div className="space-y-2">
            <select value={declineReason} onChange={e => setDeclineReason(e.target.value)} className="w-full bg-gray-100 rounded-xl px-3 py-2 text-xs outline-none">
              <option value="">Reason (optional)</option>
              <option>Position filled</option><option>Experience</option><option>Availability</option><option>Rate</option><option>Not the right fit</option><option>Other</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setConfirmingDecline(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Cancel</button>
              <button onClick={() => { onDecline(declineReason || undefined); setConfirmingDecline(false); }} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Decline Application</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {nonTerminal && a.status !== 'shortlisted' && (
              <>
                <button onClick={() => setConfirmingDecline(true)} className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-bold">Decline</button>
                <button onClick={onMessage} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Message</button>
                <button onClick={onShortlist} className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold">Shortlist</button>
              </>
            )}
            {a.status === 'shortlisted' && (
              <>
                <button onClick={() => setConfirmingDecline(true)} className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-bold">Decline</button>
                <button onClick={onMessage} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Message</button>
                <button onClick={() => setConfirmingAccept(true)} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold">Accept</button>
              </>
            )}
            {a.status === 'accepted' && listing.opportunity?.paid && (
              <>
                <button onClick={onMessage} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Message</button>
                <button onClick={onSendOffer} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">Choose Applicant</button>
              </>
            )}
            {a.status === 'accepted' && !listing.opportunity?.paid && (
              <>
                <span className="flex-1 py-2.5 rounded-xl bg-green-50 text-green-700 text-sm font-bold text-center flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4" /> Accepted</span>
                <button onClick={onMessage} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Message</button>
              </>
            )}
            {a.status === 'offer_sent' && (
              <span className="flex-1 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-sm font-bold text-center">{badge.label}</span>
            )}
            {a.status === 'payment_pending' && (
              <>
                <button onClick={onMessage} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Message</button>
                <button onClick={onFund} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">Retry Payment</button>
              </>
            )}
            {a.status === 'offer_accepted' && (
              <>
                <button onClick={onMessage} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Message</button>
                <button onClick={onFund} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">Pay for Opportunity</button>
              </>
            )}
            {(a.status === 'hired' || a.status === 'completed') && (
              <>
                <span className="flex-1 py-2.5 rounded-xl bg-green-50 text-green-700 text-sm font-bold text-center">{badge.label}</span>
                <button onClick={onMessage} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Message</button>
              </>
            )}
            {(a.status === 'rejected' || a.status === 'withdrawn') && (
              <span className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold text-center">{badge.label}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  );
}
