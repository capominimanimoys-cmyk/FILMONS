// FILMONS Admin — Users list. Search + account-type filter + a table
// that links into AdminUserDetail. No suspended/active-status filter --
// no such column exists anywhere on profiles (confirmed before building
// this), so a status filter here would just be decorative.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, Users as UsersIcon, Sparkles, CalendarPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface UserRow {
  id: string; name: string; username: string; email: string;
  avatar_url: string | null; account_type: string; created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  creator: 'Creator', creator_plus: 'Creator+', service: 'Creator+',
  professional: 'Professional', business: 'Business',
};
const TYPE_BADGE: Record<string, string> = {
  creator: 'bg-gray-100 text-gray-600', creator_plus: 'bg-blue-100 text-blue-700', service: 'bg-blue-100 text-blue-700',
  professional: 'bg-purple-100 text-purple-700', business: 'bg-amber-100 text-amber-700',
};
const FILTER_TABS = ['all', 'creator', 'creator_plus', 'professional', 'business'] as const;

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) return <img src={url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />;
  return (
    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

export function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<typeof FILTER_TABS[number]>('all');

  useEffect(() => {
    supabase.from('profiles')
      .select('id, name, username, email, avatar_url, account_type, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => { setUsers(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const newThisMonth = useMemo(() => {
    const now = new Date();
    return users.filter(u => {
      const d = new Date(u.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [users]);
  const creatorPlusCount = useMemo(() => users.filter(u => u.account_type === 'creator_plus' || u.account_type === 'service').length, [users]);

  const filtered = useMemo(() => {
    let list = users;
    if (filter !== 'all') list = list.filter(u => u.account_type === filter || (filter === 'creator_plus' && u.account_type === 'service'));
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(u =>
      u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.id.includes(q)
    );
    return list;
  }, [users, filter, search]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-black text-gray-900">Users</h1>
        <p className="text-sm text-gray-400">Manage FILMONS accounts</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Users', value: users.length, icon: UsersIcon, bg: 'bg-blue-50', color: 'text-blue-500' },
          { label: 'Creator+', value: creatorPlusCount, icon: Sparkles, bg: 'bg-indigo-50', color: 'text-indigo-500' },
          { label: 'New This Month', value: newThisMonth, icon: CalendarPlus, bg: 'bg-green-50', color: 'text-green-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center shrink-0`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400 font-medium truncate">{s.label}</p>
              <p className="text-lg font-black text-gray-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, username, email, user ID..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-blue-300" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {FILTER_TABS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}>
              {f === 'all' ? 'All' : TYPE_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center"><div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-400">No users match.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(u => (
              <button key={u.id} onClick={() => navigate(`/users/${u.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left">
                <Avatar url={u.avatar_url} name={u.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{u.name || 'Unnamed'}</p>
                  <p className="text-xs text-gray-400 truncate">@{u.username || 'no-username'}</p>
                </div>
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full shrink-0 ${TYPE_BADGE[u.account_type] || 'bg-gray-100 text-gray-500'}`}>
                  {TYPE_LABEL[u.account_type] || u.account_type || 'Unknown'}
                </span>
                <span className="text-xs text-gray-400 shrink-0 hidden sm:block w-20 text-right">
                  {new Date(u.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
