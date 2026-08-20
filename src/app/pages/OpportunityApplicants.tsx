/**
 * Applicant management for a single Opportunity listing — reached from
 * ListingCard's owner menu rather than a separate Dashboard category, so
 * Opportunities stay mixed into the regular Listings tab like any other
 * listing kind instead of being split out.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Briefcase, ExternalLink, MessageCircle, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listingsApi, authApi, chatApi } from '../lib/api';
import { supabase } from '../../lib/supabase';
import { Listing } from '../types';

const APPLICANT_STATUS_LABEL: Record<string, string> = { pending: 'New', shortlisted: 'Shortlisted', contacted: 'Contacted', accepted: 'Accepted', rejected: 'Declined' };

export function OpportunityApplicants() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [listing, setListing] = useState<Listing | null>(null);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'shortlisted' | 'contacted' | 'accepted' | 'rejected'>('all');

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

  const updateStatus = async (appId: string, status: string) => {
    const { error } = await supabase.from('opportunity_applications').update({ status }).eq('id', appId);
    if (!error) setApplicants(prev => prev.map(a => a.id === appId ? { ...a, status } : a));
  };

  const messageApplicant = async (applicantId: string) => {
    if (!user) return;
    const conv = await chatApi.getOrCreateDB(user.id, applicantId);
    navigate(`/inbox?conv=${conv.id}`);
  };

  const filtered = filter === 'all' ? applicants : applicants.filter(a => a.status === filter);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>;
  }
  if (!listing) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3.5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="min-w-0">
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1"><Briefcase className="w-3 h-3" /> Applicants</p>
          <p className="text-sm font-bold text-gray-900 truncate">{listing.title}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {(['all', 'pending', 'shortlisted', 'contacted', 'accepted', 'rejected'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {f === 'all' ? 'All' : APPLICANT_STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
            <Briefcase className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No applicants{filter !== 'all' ? ` in ${APPLICANT_STATUS_LABEL[filter]}` : ' yet'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(a => (
              <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-100 shrink-0">
                    {a.profile?.avatar && <img src={a.profile.avatar} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate flex items-center gap-1">
                      {a.profile?.name || 'Applicant'} {a.profile?.isVerified && <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                    </p>
                    <p className="text-xs text-gray-400">{[a.profile?.primaryRole, a.profile?.city].filter(Boolean).join(' · ')}</p>
                    <p className="text-[10px] text-gray-300 mt-0.5">{new Date(a.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-600 shrink-0">{APPLICANT_STATUS_LABEL[a.status] || a.status}</span>
                </div>
                {a.message && <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2.5">{a.message}</p>}
                <div className="flex flex-wrap gap-2">
                  {a.portfolio_url && (
                    <a href={a.portfolio_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-full"><ExternalLink className="w-3 h-3" /> Portfolio</a>
                  )}
                  <button onClick={() => messageApplicant(a.applicant_id)} className="flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1.5 rounded-full"><MessageCircle className="w-3 h-3" /> Message</button>
                  {a.status !== 'shortlisted' && <button onClick={() => updateStatus(a.id, 'shortlisted')} className="text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-1.5 rounded-full">Shortlist</button>}
                  {a.status !== 'contacted' && <button onClick={() => updateStatus(a.id, 'contacted')} className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-full">Contacted</button>}
                  {a.status !== 'accepted' && <button onClick={() => updateStatus(a.id, 'accepted')} className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1.5 rounded-full"><CheckCircle className="w-3 h-3" /> Accept</button>}
                  {a.status !== 'rejected' && <button onClick={() => updateStatus(a.id, 'rejected')} className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1.5 rounded-full"><XCircle className="w-3 h-3" /> Decline</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
