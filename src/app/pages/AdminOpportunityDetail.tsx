// FILMONS Admin — single opportunity detail + moderation + real
// applications list. "Close Opportunity" reuses the exact same
// pause/restore/remove mechanism as AdminListingDetail (same
// moderation_status column, same admin-moderate-listing action) --
// opportunities are listings under the hood, so there's one real
// backing mechanism for both, just labeled to match how admins think
// about each type ("Close" vs "Pause").
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, ExternalLink, PauseCircle, PlayCircle, XCircle, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminFn } from '../lib/adminAuth';
import { toast } from 'sonner';

interface OpportunityMeta {
  compensationType?: string; compensationAmount?: number; compensationMin?: number; compensationMax?: number;
  paid?: boolean; skills?: string[]; workArrangement?: 'onsite' | 'remote' | 'hybrid';
  applicationDeadline?: string; noDeadline?: boolean; startDate?: string; endDate?: string;
}
interface Listing {
  id: string; title: string; description: string | null; city: string | null; price: number | null;
  metadata: { opportunity?: OpportunityMeta } | null;
  created_at: string; is_active: boolean; moderation_status: string; user_id: string;
}
interface Poster { id: string; name: string; username: string; avatar_url: string | null; account_type: string; is_verified: boolean; }
interface Application { id: string; applicant_id: string; status: string; created_at: string; applicantName?: string; }
interface LogRow { id: string; action: string; reason: string | null; admin_identifier: string; created_at: string; }

const STATUS_LABEL: Record<string, string> = { active: 'Active', paused: 'Closed', removed: 'Removed' };
const TIER_LABEL: Record<string, string> = { creator: 'Creator', creator_plus: 'Creator+', service: 'Creator+', professional: 'Professional', business: 'Business' };
const APP_STATUS_LABEL: Record<string, string> = { pending: 'Applied', viewed: 'Applied', shortlisted: 'Shortlisted', contacted: 'Shortlisted', accepted: 'Accepted', selected: 'Accepted', rejected: 'Rejected', withdrawn: 'Withdrawn' };

export function AdminOpportunityDetail() {
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [poster, setPoster] = useState<Poster | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [showApplications, setShowApplications] = useState(false);
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState<'pause' | 'remove' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!opportunityId) return;
    supabase.from('listings').select('*').eq('id', opportunityId).maybeSingle()
      .then(async ({ data }) => {
        setListing(data);
        if (data) {
          const [{ data: posterRow }, { data: appRows }, { data: logRows }] = await Promise.all([
            supabase.from('profiles').select('id, name, username, avatar_url, account_type, is_verified').eq('id', data.user_id).maybeSingle(),
            supabase.from('opportunity_applications').select('id, applicant_id, status, created_at').eq('listing_id', opportunityId).order('created_at', { ascending: false }),
            supabase.from('listing_moderation_log').select('id, action, reason, admin_identifier, created_at').eq('listing_id', opportunityId).order('created_at', { ascending: false }),
          ]);
          setPoster(posterRow);
          const apps = appRows || [];
          const applicantIds = [...new Set(apps.map((a: any) => a.applicant_id))];
          const { data: applicants } = applicantIds.length ? await supabase.from('profiles').select('id, name').in('id', applicantIds) : { data: [] as any[] };
          const nameMap = Object.fromEntries((applicants || []).map((p: any) => [p.id, p.name]));
          setApplications(apps.map((a: any) => ({ ...a, applicantName: nameMap[a.applicant_id] })));
          setLog(logRows || []);
        }
        setLoading(false);
      }).catch(() => setLoading(false));
  };
  useEffect(load, [opportunityId]);

  const runAction = async (action: 'pause' | 'restore' | 'remove', actionReason?: string) => {
    if (!opportunityId) return;
    setBusy(true);
    try {
      const res = await fetch(adminFn('admin-moderate-listing'), {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: opportunityId, action, reason: actionReason }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Couldn't save changes. Try again.");
      toast.success(action === 'pause' ? 'Opportunity closed' : action === 'restore' ? 'Opportunity restored' : 'Opportunity removed');
      setActionModal(null); setReason('');
      load();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save changes. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>;
  if (!listing) return <div className="h-full flex items-center justify-center text-sm text-gray-400">Opportunity not found.</div>;

  const meta = listing.metadata?.opportunity || {};
  const compensation = meta.compensationAmount ?? listing.price ?? null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <button onClick={() => navigate('/opportunities')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Opportunities
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-lg font-black text-gray-900">{listing.title}</h1>
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${listing.moderation_status === 'active' ? 'bg-green-50 text-green-700' : listing.moderation_status === 'paused' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>
            {STATUS_LABEL[listing.moderation_status]}
          </span>
        </div>
        {listing.description && <p className="text-sm text-gray-600 mb-3">{listing.description}</p>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><span className="text-gray-400">Compensation</span> <span className="font-semibold text-gray-800">{compensation ? `$${compensation}${meta.paid === false ? ' (unpaid)' : ''}` : 'Not specified'}</span></div>
          <div><span className="text-gray-400">Location</span> <span className="font-semibold text-gray-800">{listing.city || '—'}</span></div>
          <div><span className="text-gray-400">Arrangement</span> <span className="font-semibold text-gray-800 capitalize">{meta.workArrangement || '—'}</span></div>
          <div><span className="text-gray-400">Application Deadline</span> <span className="font-semibold text-gray-800">{meta.noDeadline ? 'Open (no deadline)' : meta.applicationDeadline ? new Date(meta.applicationDeadline).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
          <div><span className="text-gray-400">Created</span> <span className="font-semibold text-gray-800">{new Date(listing.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
        </div>
        {meta.skills && meta.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {meta.skills.map(s => <span key={s} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{s}</span>)}
          </div>
        )}
      </div>

      {poster && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Posted By</p>
          <div className="flex items-center gap-3 mb-3">
            {poster.avatar_url ? <img src={poster.avatar_url} className="w-12 h-12 rounded-full object-cover" alt="" /> : <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500">{poster.name?.charAt(0).toUpperCase()}</div>}
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{poster.name}</p>
              <p className="text-xs text-gray-400 truncate">@{poster.username || 'no-username'} · {TIER_LABEL[poster.account_type] || poster.account_type}{poster.is_verified ? ' · Verified ✓' : ''}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate(`/users/${poster.id}`)} className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5">View User <ExternalLink className="w-3.5 h-3.5" /></button>
            <a href={`/listing/${listing.id}`} target="_blank" rel="noreferrer" className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5">View Public Opportunity <ExternalLink className="w-3.5 h-3.5" /></a>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <button onClick={() => setShowApplications(v => !v)} className="w-full flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Users className="w-4 h-4" /> {applications.length} Application{applications.length === 1 ? '' : 's'}</p>
          <span className="text-xs text-blue-600 font-bold">{showApplications ? 'Hide' : 'View'}</span>
        </button>
        {showApplications && (
          <div className="mt-3 divide-y divide-gray-50">
            {applications.length === 0 ? <p className="text-sm text-gray-400 py-2">No applications yet.</p> : applications.map(a => (
              <div key={a.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{a.applicantName || a.applicant_id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</p>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{APP_STATUS_LABEL[a.status] || a.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {log.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Moderation History</p>
          <div className="space-y-2">
            {log.map(l => (
              <div key={l.id} className="text-sm">
                <span className="font-semibold text-gray-800 capitalize">{l.action}</span>
                <span className="text-gray-400"> — {l.admin_identifier} · {new Date(l.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>
                {l.reason && <p className="text-xs text-gray-500 mt-0.5">{l.reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {listing.moderation_status !== 'active' && (
          <button onClick={() => runAction('restore')} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
            <PlayCircle className="w-4 h-4" /> Restore Opportunity
          </button>
        )}
        {listing.moderation_status === 'active' && (
          <button onClick={() => setActionModal('pause')} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold flex items-center justify-center gap-1.5">
            <PauseCircle className="w-4 h-4" /> Close Opportunity
          </button>
        )}
        {listing.moderation_status !== 'removed' && (
          <button onClick={() => setActionModal('remove')} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold flex items-center justify-center gap-1.5">
            <XCircle className="w-4 h-4" /> Remove Opportunity
          </button>
        )}
      </div>

      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setActionModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-gray-900 mb-1">{actionModal === 'pause' ? 'Close this opportunity?' : 'Remove this opportunity?'}</h3>
            <p className="text-xs text-gray-400 mb-3">{actionModal === 'pause' ? "It will be hidden from Opportunities until restored. Existing applications are kept." : "It will be hidden from Opportunities. Existing applications are kept."}</p>
            <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required)" rows={3}
              className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 mb-3" />
            <div className="flex gap-2">
              <button onClick={() => { setActionModal(null); setReason(''); }} disabled={busy} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold disabled:opacity-50">Cancel</button>
              <button onClick={() => runAction(actionModal, reason)} disabled={busy || !reason.trim()}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50">
                {busy ? 'Saving…' : actionModal === 'pause' ? 'Close' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
