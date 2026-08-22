/**
 * Dashboard → Opportunities — a cross-listing applicant pipeline overview,
 * distinct from the Listings tab (which deliberately stays unfiltered by
 * listing type per an earlier explicit decision). This aggregates
 * application counts per Opportunity and links into the one shared
 * Applicants Manager (OpportunityApplicants.tsx) — never a second
 * implementation of applicant management.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Briefcase, Users, Share2, Pencil, Zap } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { Listing } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { getEntitlement, getOpportunityUsage, formatLimit } from '../../lib/entitlements';
import { normalizeTier } from '../../lib/reliabilityApi';

interface Counts { all: number; new: number; shortlisted: number; accepted: number; }

export function MyOpportunitiesOverview({ opportunities }: { opportunities: Listing[] }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<{ posts: number; applications: number } | null>(null);
  const tier = normalizeTier(user?.accountType);
  const entitlement = getEntitlement(user?.accountType);

  useEffect(() => {
    if (!user) return;
    getOpportunityUsage(user.id).then(setUsage).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!opportunities.length) { setLoading(false); return; }
    const ids = opportunities.map(o => o.id);
    supabase.from('opportunity_applications').select('listing_id, status').in('listing_id', ids)
      .then(({ data }) => {
        const map: Record<string, Counts> = {};
        ids.forEach(id => { map[id] = { all: 0, new: 0, shortlisted: 0, accepted: 0 }; });
        (data || []).forEach((r: any) => {
          const c = map[r.listing_id]; if (!c) return;
          c.all++;
          if (r.status === 'pending' || r.status === 'viewed') c.new++;
          else if (r.status === 'shortlisted' || r.status === 'contacted') c.shortlisted++;
          else if (r.status === 'accepted') c.accepted++;
        });
        setCounts(map);
      })
      .finally(() => setLoading(false));
  }, [opportunities.map(o => o.id).join(',')]);

  const toggleApplications = async (o: Listing) => {
    const closed = o.opportunity?.opportunityStatus === 'applications_closed';
    const nextStatus = closed ? 'active' : 'applications_closed';
    try {
      const { error } = await supabase.from('listings')
        .update({ metadata: { listingKind: o.listingKind, opportunity: { ...o.opportunity, opportunityStatus: nextStatus } } })
        .eq('id', o.id);
      if (error) throw error;
      toast.success(closed ? 'Applications reopened' : 'Applications closed');
    } catch { toast.error('Could not update applications status'); }
  };

  const share = async (o: Listing) => {
    const url = `${window.location.origin}/listing/${o.id}`;
    if (navigator.share) { try { await navigator.share({ title: o.title, url }); } catch {} }
    else { await navigator.clipboard.writeText(url); toast.success('Link copied!'); }
  };

  const usageHeader = (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 grid grid-cols-2 gap-3">
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide flex items-center gap-1"><Briefcase className="w-3 h-3" /> Opportunity Posts</p>
        <p className="text-sm font-bold text-gray-900">
          {tier === 'business' ? 'Unlimited' : `${usage?.posts ?? 0} / ${formatLimit(entitlement.posts)} this month`}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide flex items-center gap-1"><Users className="w-3 h-3" /> Applications</p>
        <p className="text-sm font-bold text-gray-900">
          {tier === 'business' ? 'Unlimited' : `${usage?.applications ?? 0} / ${formatLimit(entitlement.applications)} used this month`}
        </p>
      </div>
    </div>
  );

  if (!opportunities.length) {
    return (
      <div className="space-y-3">
        {usageHeader}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-2">
          <Briefcase className="w-10 h-10 text-indigo-200 mx-auto" />
          <h3 className="font-bold text-gray-900">No Opportunities posted yet</h3>
          <p className="text-sm text-gray-400">Post a job, gig, or casting call to start receiving applications.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {usageHeader}
      {opportunities.map(o => {
        const c = counts[o.id] || { all: 0, new: 0, shortlisted: 0, accepted: 0 };
        const status = o.opportunity?.opportunityStatus || 'active';
        const numPeopleNeeded = o.opportunity?.numPeopleNeeded;
        return (
          <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{o.title}</p>
                <p className="text-xs text-gray-400">{o.city}{o.opportunity?.paid ? ` · $${o.opportunity.compensationAmount ?? o.opportunity.compensationMin ?? o.price}` : ' · Unpaid'}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${
                status === 'completed' ? 'bg-gray-100 text-gray-500' :
                status === 'applications_closed' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-700'
              }`}>
                {status === 'completed' ? 'Completed' : status === 'applications_closed' ? 'Applications Closed' : 'Active'}
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <span className="text-gray-500">All <b className="text-gray-900">{c.all}</b></span>
              <span className="text-gray-500">New <b className="text-indigo-600">{c.new}</b></span>
              <span className="text-gray-500">Shortlisted <b className="text-purple-600">{c.shortlisted}</b></span>
              <span className="text-gray-500">Accepted <b className="text-green-600">{c.accepted}</b></span>
              {numPeopleNeeded ? <span className="text-gray-400 ml-auto">{c.accepted} of {numPeopleNeeded} filled</span> : null}
            </div>

            <button onClick={() => navigate(`/listing/${o.id}/applicants`)}
              className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 rounded-xl">
              <Users className="w-3.5 h-3.5" /> Manage Applications
            </button>

            <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-500">
              <button onClick={() => navigate(`/edit-listing/${o.id}`)} className="flex items-center gap-1 hover:text-gray-800"><Pencil className="w-3 h-3" /> Edit</button>
              <button onClick={() => navigate(`/boost/${o.id}`)} className="flex items-center gap-1 hover:text-gray-800"><Zap className="w-3 h-3" /> Boost</button>
              <button onClick={() => share(o)} className="flex items-center gap-1 hover:text-gray-800"><Share2 className="w-3 h-3" /> Share</button>
              <button onClick={() => toggleApplications(o)} className="ml-auto hover:text-gray-800">
                {status === 'applications_closed' ? 'Reopen Applications' : 'Close Applications'}
              </button>
            </div>
          </div>
        );
      })}
      {loading && <p className="text-xs text-gray-300 text-center">Loading application counts…</p>}
    </div>
  );
}
