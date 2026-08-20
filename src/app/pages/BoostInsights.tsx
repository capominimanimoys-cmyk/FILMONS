import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Zap, Loader2, Eye, MessageCircle, CalendarCheck, Bookmark, TrendingUp, AlertTriangle, Briefcase } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listingsApi } from '../lib/api';
import { boostApi, ListingBoost, BoostEventType } from '../lib/boostApi';
import { Listing } from '../types';

const FUNNEL: { type: BoostEventType; label: string; icon: any }[] = [
  { type: 'impression', label: 'Impressions', icon: TrendingUp },
  { type: 'view', label: 'Views', icon: Eye },
  { type: 'save', label: 'Saves', icon: Bookmark },
  { type: 'message', label: 'Messages', icon: MessageCircle },
  { type: 'rental_request', label: 'Rental Requests', icon: CalendarCheck },
  { type: 'application', label: 'Applications', icon: Briefcase },
];

export function BoostInsights() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [listing, setListing] = useState<Listing | null>(null);
  const [boost, setBoost] = useState<ListingBoost | null>(null);
  const [insights, setInsights] = useState<Record<BoostEventType, { organic: number; boosted: number }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    (async () => {
      try {
        const [l, b, i] = await Promise.all([
          listingsApi.getOne(listingId),
          boostApi.getActiveBoost(listingId),
          boostApi.getInsights(listingId),
        ]);
        setListing(l);
        setBoost(b);
        setInsights(i);
      } catch (e: any) {
        toast.error(e?.message || 'Could not load boost insights');
      } finally {
        setLoading(false);
      }
    })();
  }, [listingId]);

  const handleStop = async () => {
    if (!boost || !user) return;
    setStopping(true);
    try {
      await boostApi.stop(boost.id, user.id);
      toast.success('Boost stopped');
      setBoost({ ...boost, status: 'stopped' });
      setConfirmStop(false);
    } catch (e: any) {
      toast.error(e?.message || 'Could not stop boost');
    } finally {
      setStopping(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;
  }
  if (!listing) return null;

  const daysRemaining = boost?.endsAt ? Math.max(0, Math.ceil((new Date(boost.endsAt).getTime() - Date.now()) / 86400000)) : null;

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1"><Zap className="w-3 h-3 fill-amber-500 text-amber-500" /> Boost Insights</p>
          <p className="text-sm font-bold text-gray-900 truncate">{listing.title}</p>
        </div>
      </div>

      <div className="px-5 py-5 space-y-5 max-w-lg mx-auto">
        {boost ? (
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${
                boost.status === 'active' ? 'bg-green-100 text-green-700'
                : boost.status === 'pending_payment' ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-200 text-gray-600'
              }`}>{boost.status.replace('_', ' ')}</span>
              {daysRemaining !== null && boost.status === 'active' && (
                <span className="text-xs text-gray-500">{daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-gray-400 text-xs">Daily budget</p><p className="font-bold text-gray-900">${boost.dailyBudget} {boost.currency}</p></div>
              <div><p className="text-gray-400 text-xs">Total budget</p><p className="font-bold text-gray-900">${boost.totalBudget.toFixed(2)} {boost.currency}</p></div>
              <div><p className="text-gray-400 text-xs">Goal</p><p className="font-bold text-gray-900 capitalize">{boost.goal.replace(/_/g, ' ')}</p></div>
              <div><p className="text-gray-400 text-xs">Audience</p><p className="font-bold text-gray-900 capitalize">{boost.audienceType}</p></div>
            </div>
            {boost.status === 'active' && (
              <button onClick={() => setConfirmStop(true)} className="w-full py-3 rounded-2xl border border-red-200 text-red-600 font-bold text-sm mt-1">
                Stop Boost
              </button>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-500">
            This listing has no active boost right now.
            <button onClick={() => navigate(`/boost/${listingId}`)} className="block mt-2 text-amber-600 font-bold">Start a new boost →</button>
          </div>
        )}

        <div>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Performance funnel</p>
          <p className="text-[11px] text-gray-400 mb-3">Split by whether this listing was boosted at the time of each event.</p>
          <div className="space-y-2">
            {FUNNEL.map(f => {
              const Icon = f.icon;
              const row = insights?.[f.type] || { organic: 0, boosted: 0 };
              const total = row.organic + row.boosted;
              return (
                <div key={f.type} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50">
                  <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-gray-500" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{f.label}</p>
                    <p className="text-[11px] text-gray-400">{row.organic} organic · {row.boosted} boosted</p>
                  </div>
                  <p className="text-lg font-black text-gray-900">{total}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {confirmStop && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmStop(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-base font-black text-gray-900 mb-1.5">Stop this boost?</h3>
            <p className="text-sm text-gray-500 mb-5">Your listing will stop being promoted immediately. Any unused budget is not refunded.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmStop(false)} disabled={stopping} className="flex-1 py-3 border border-gray-200 text-gray-600 font-bold rounded-2xl text-sm">Cancel</button>
              <button onClick={handleStop} disabled={stopping} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Stop Boost'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
