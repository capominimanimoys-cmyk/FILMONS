/**
 * Admin -> Marketplace -> Boosts. Active/completed boost lists, real
 * performance aggregated from boost_events, computed delivery rate, and a
 * config editor for boost_config — the only place those admin-configurable
 * knobs (budget/duration bounds, priority multiplier, audience threshold,
 * frequency cap) can be changed, since they're used to keep V1 honest
 * (no fake reach numbers, no spammy repeat placement).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Zap, Eye, EyeOff, Settings2 } from 'lucide-react';
import { adminAuth as adminAuthClient, type AdminSession } from '../lib/adminAuth';
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';

type Tab = 'active' | 'completed' | 'revenue';

interface BoostRow {
  id: string; listing_id: string; owner_id: string; goal: string; audience_type: string;
  daily_budget: number; duration_days: number; total_budget: number; currency: string;
  status: string; starts_at: string | null; ends_at: string | null; created_at: string;
  impressions_target: number | null;
}
interface Perf { impressions: number; view: number; save: number; message: number; application: number; rental_request: number; booking_request: number; }

const GOAL_LABEL: Record<string, string> = {
  more_views: 'More Views', more_messages: 'More Messages', more_rental_requests: 'More Rental Requests',
  more_booking_requests: 'More Booking Requests', more_applications: 'More Applications',
};
const AUDIENCE_LABEL: Record<string, string> = { automatic: 'Automatic', local: 'Nearby', canada_us: 'Canada & U.S.', custom: 'Custom' };

export function AdminBoosts() {
  const navigate = useNavigate();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const [tab, setTab] = useState<Tab>('active');
  const [boosts, setBoosts] = useState<BoostRow[]>([]);
  const [listingsById, setListingsById] = useState<Record<string, { title: string; listingType: string }>>({});
  const [ownersById, setOwnersById] = useState<Record<string, string>>({});
  const [perfByBoost, setPerfByBoost] = useState<Record<string, Perf>>({});
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Record<string, number> | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => { setSession(adminAuthClient.getAdmin()); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) return;
    setLoggingIn(true);
    const { success, error } = await adminAuthClient.login(name.trim(), password);
    if (success) setSession(adminAuthClient.getAdmin());
    else toast.error(error || 'Incorrect name or password');
    setLoggingIn(false);
  };

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    (async () => {
      const statuses = tab === 'active' ? ['active', 'paused', 'pending_payment']
        : tab === 'completed' ? ['completed', 'stopped', 'failed', 'refunded']
        : ['active', 'paused', 'completed', 'stopped'];
      const { data: rows } = await supabase.from('listing_boosts').select('*').in('status', statuses).order('created_at', { ascending: false }).limit(200);
      const list = (rows || []) as BoostRow[];
      setBoosts(list);

      const listingIds = [...new Set(list.map(b => b.listing_id))];
      const ownerIds = [...new Set(list.map(b => b.owner_id))];
      const boostIds = list.map(b => b.id);

      const [{ data: listingRows }, { data: profileRows }, { data: eventRows }] = await Promise.all([
        listingIds.length ? supabase.from('listings').select('id, title, listing_type').in('id', listingIds) : Promise.resolve({ data: [] as any[] }),
        ownerIds.length ? supabase.from('profiles').select('id, name').in('id', ownerIds) : Promise.resolve({ data: [] as any[] }),
        boostIds.length ? supabase.from('boost_events').select('boost_id, event_type').in('boost_id', boostIds) : Promise.resolve({ data: [] as any[] }),
      ]);

      setListingsById(Object.fromEntries((listingRows || []).map((l: any) => [l.id, { title: l.title, listingType: l.listing_type }])));
      setOwnersById(Object.fromEntries((profileRows || []).map((p: any) => [p.id, p.name])));

      const perf: Record<string, Perf> = {};
      boostIds.forEach(id => { perf[id] = { impressions: 0, view: 0, save: 0, message: 0, application: 0, rental_request: 0, booking_request: 0 }; });
      (eventRows || []).forEach((e: any) => {
        const p = perf[e.boost_id]; if (!p) return;
        const key = e.event_type === 'impression' ? 'impressions' : e.event_type;
        if (key in p) (p as any)[key]++;
      });
      setPerfByBoost(perf);
      setLoading(false);
    })();
  }, [session, tab]);

  useEffect(() => {
    if (!session) return;
    fetch(`https://${projectId}.supabase.co/functions/v1/admin-boost-config`, {
      headers: { Authorization: `Bearer ${publicAnonKey}`, ...adminAuthClient.authHeader() },
    }).then(r => r.json()).then(d => { if (d.config) setConfig(d.config); }).catch(() => {});
  }, [session]);

  const saveConfig = async () => {
    if (!config) return;
    setSavingConfig(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/admin-boost-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, ...adminAuthClient.authHeader() },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Could not save');
      toast.success('Boost config saved');
    } catch (e: any) { toast.error(e?.message || 'Could not save config'); }
    setSavingConfig(false);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-amber-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4"><Zap className="w-8 h-8 text-white fill-white" /></div>
            <h1 className="text-2xl font-black text-gray-900">Boosts</h1>
            <p className="text-gray-400 text-sm mt-1">Filmons admin console</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Admin name" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 pr-10" />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button type="submit" disabled={loggingIn} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl py-3 transition-colors disabled:opacity-60">
              {loggingIn ? 'Signing in…' : 'Sign In'}
            </button>
            <button type="button" onClick={() => navigate('/')} className="w-full text-gray-500 hover:text-gray-700 text-sm flex items-center justify-center gap-2 py-2">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </button>
          </form>
        </div>
      </div>
    );
  }

  const totalRevenue = boosts.filter(b => ['active', 'completed', 'paused', 'stopped'].includes(b.status)).reduce((s, b) => s + Number(b.total_budget || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"><ArrowLeft className="w-4 h-4" /></button>
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center"><Zap className="w-4 h-4 text-white fill-white" /></div>
          <div>
            <h1 className="text-sm font-black text-gray-900">Marketplace · Boosts</h1>
            <p className="text-[11px] text-gray-400">Signed in as {session.name}</p>
          </div>
        </div>
        <button onClick={() => { adminAuthClient.logout(); setSession(null); }} className="text-xs font-bold text-gray-500">Log out</button>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        <div className="flex gap-2">
          {(['active', 'completed', 'revenue'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs font-bold px-3.5 py-2 rounded-full capitalize ${tab === t ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
              {t === 'active' ? 'Active Boosts' : t === 'completed' ? 'Completed Boosts' : 'Boost Revenue'}
            </button>
          ))}
        </div>

        {tab === 'revenue' ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Total Boost Revenue</p>
            <p className="text-3xl font-black text-gray-900 mt-1">${totalRevenue.toFixed(2)} CAD</p>
            <p className="text-xs text-gray-400 mt-1">Across {boosts.length} boost{boosts.length === 1 ? '' : 's'} (active, completed, paused, stopped)</p>
          </div>
        ) : loading ? (
          <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" /></div>
        ) : boosts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">No boosts in this view</div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="px-3 py-2.5 font-bold">Listing</th>
                  <th className="px-3 py-2.5 font-bold">Owner</th>
                  <th className="px-3 py-2.5 font-bold">Goal</th>
                  <th className="px-3 py-2.5 font-bold">Audience</th>
                  <th className="px-3 py-2.5 font-bold">Budget</th>
                  <th className="px-3 py-2.5 font-bold">Duration</th>
                  <th className="px-3 py-2.5 font-bold">Total Paid</th>
                  <th className="px-3 py-2.5 font-bold">Start</th>
                  <th className="px-3 py-2.5 font-bold">End</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                  <th className="px-3 py-2.5 font-bold">Impr.</th>
                  <th className="px-3 py-2.5 font-bold">Views</th>
                  <th className="px-3 py-2.5 font-bold">Saves</th>
                  <th className="px-3 py-2.5 font-bold">Msgs</th>
                  <th className="px-3 py-2.5 font-bold">Apps</th>
                  <th className="px-3 py-2.5 font-bold">Rentals</th>
                  <th className="px-3 py-2.5 font-bold">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {boosts.map(b => {
                  const l = listingsById[b.listing_id];
                  const p = perfByBoost[b.id] || { impressions: 0, view: 0, save: 0, message: 0, application: 0, rental_request: 0, booking_request: 0 };
                  const deliveryRate = b.impressions_target ? Math.round((p.impressions / b.impressions_target) * 100) : null;
                  return (
                    <tr key={b.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap max-w-[160px] truncate">{l?.title || b.listing_id}</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{ownersById[b.owner_id] || b.owner_id.slice(0, 8)}</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{GOAL_LABEL[b.goal] || b.goal}</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{AUDIENCE_LABEL[b.audience_type] || b.audience_type}</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">${b.daily_budget}/day</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{b.duration_days}d</td>
                      <td className="px-3 py-2.5 font-bold text-gray-900 whitespace-nowrap">${Number(b.total_budget).toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{b.starts_at ? new Date(b.starts_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{b.ends_at ? new Date(b.ends_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.status === 'active' ? 'bg-green-100 text-green-700' : b.status === 'completed' ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-600'}`}>{b.status}</span></td>
                      <td className="px-3 py-2.5 text-gray-500">{p.impressions}</td>
                      <td className="px-3 py-2.5 text-gray-500">{p.view}</td>
                      <td className="px-3 py-2.5 text-gray-500">{p.save}</td>
                      <td className="px-3 py-2.5 text-gray-500">{p.message}</td>
                      <td className="px-3 py-2.5 text-gray-500">{p.application}</td>
                      <td className="px-3 py-2.5 text-gray-500">{p.rental_request + p.booking_request}</td>
                      <td className="px-3 py-2.5 font-bold text-gray-700">{deliveryRate !== null ? `${deliveryRate}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {config && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Settings2 className="w-4 h-4" /> Boost Configuration</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['min_daily_budget', 'Min daily budget ($)'], ['max_daily_budget', 'Max daily budget ($)'],
                ['min_duration_days', 'Min duration (days)'], ['max_duration_days', 'Max duration (days)'],
                ['priority_multiplier', 'Priority multiplier'], ['min_audience_threshold', 'Min audience threshold'],
                ['frequency_cap_per_user', 'Frequency cap per user'], ['frequency_cooldown_hours', 'Frequency cooldown (hrs)'],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-[11px] font-bold text-gray-500">{label}</span>
                  <input type="number" value={config[key] ?? ''} onChange={e => setConfig(prev => ({ ...(prev || {}), [key]: Number(e.target.value) }))}
                    className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none mt-1" />
                </label>
              ))}
            </div>
            <button onClick={saveConfig} disabled={savingConfig} className="w-full py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold disabled:opacity-50">
              {savingConfig ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
