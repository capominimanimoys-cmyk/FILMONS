// Shared FILMONS Admin shell — a real /admin/* route tree, sibling to
// Root (never nested inside it), so the normal user TopBar/DesktopSidebar/
// MobileBottomNav chrome can never leak into the admin area (previously
// admin-support/admin-verifications/admin-boosts were nested as Root
// children, which meant Root's own chrome and auth-redirect guards
// technically wrapped around them too). One shared login gate here
// replaces each admin page's own copy-pasted login form -- every admin
// page already reads the same sessionStorage-backed adminAuth session, so
// nesting them under this layout's gate is enough; their own internal
// checks (if any) just see a session already present and skip straight
// to their content.
import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation, NavLink } from 'react-router';
import { toast } from 'sonner';
import { adminAuth, type AdminSession } from '../lib/adminAuth';
import {
  LayoutDashboard, ShieldCheck, LifeBuoy, Receipt, Users, Package,
  Briefcase, Flag, Settings as SettingsIcon, ArrowLeft, Eye, EyeOff, Menu, X,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/admin/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { path: '/admin/verifications',  label: 'Verifications',  icon: ShieldCheck },
  { path: '/admin/support-chats',  label: 'Support Chats',  icon: LifeBuoy },
  { path: '/admin/transactions',   label: 'Transactions',   icon: Receipt },
  { path: '/admin/users',          label: 'Users',          icon: Users },
  { path: '/admin/listings',       label: 'Listings',       icon: Package },
  { path: '/admin/opportunities',  label: 'Opportunities',  icon: Briefcase },
  { path: '/admin/reports',        label: 'Reports',        icon: Flag },
  { path: '/admin/settings',       label: 'Settings',       icon: SettingsIcon },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setSession(adminAuth.getAdmin());
    setChecked(true);
  }, []);

  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) return;
    setLoggingIn(true);
    const { success, error } = await adminAuth.login(name.trim(), password);
    if (success) {
      setSession(adminAuth.getAdmin());
    } else {
      toast.error(error || 'Incorrect name or password');
    }
    setLoggingIn(false);
  };

  if (!checked) return null;

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-blue-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-gray-900">FILMONS Admin</h1>
            <p className="text-gray-400 text-sm mt-1">Sign in to continue</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Admin name" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 pr-10" />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button type="submit" disabled={loggingIn} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3 transition-colors disabled:opacity-60">
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

  const sidebar = (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      {NAV_ITEMS.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'
            }`
          }
        >
          <item.icon className="w-4 h-4 shrink-0" /> {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="h-screen flex bg-gray-50">
      {/* ── Desktop sidebar ── */}
      <div className="hidden lg:flex lg:flex-col w-60 shrink-0 bg-gray-900">
        <div className="px-4 py-5 flex items-center gap-2.5 border-b border-white/10">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0"><ShieldCheck className="w-4 h-4 text-white" /></div>
          <div className="min-w-0">
            <p className="text-sm font-black text-white truncate">FILMONS Admin</p>
            <p className="text-[11px] text-gray-400 truncate">{session.name}</p>
          </div>
        </div>
        {sidebar}
        <div className="p-3 border-t border-white/10 space-y-1">
          <button onClick={() => navigate('/')} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-300 hover:bg-white/10 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to FILMONS
          </button>
          <button onClick={() => { adminAuth.logout(); setSession(null); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-300 hover:bg-white/10 hover:text-red-200 transition-colors">
            Log out
          </button>
        </div>
      </div>

      {/* ── Mobile: top bar + slide-over nav ── */}
      <div className="lg:hidden fixed inset-x-0 top-0 z-30 bg-gray-900 px-3 py-3 flex items-center justify-between">
        <button onClick={() => setMobileNavOpen(true)} className="w-8 h-8 flex items-center justify-center text-white"><Menu className="w-5 h-5" /></button>
        <p className="text-sm font-black text-white">FILMONS Admin</p>
        <div className="w-8" />
      </div>
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
          <div className="relative w-64 bg-gray-900 flex flex-col h-full">
            <div className="px-4 py-4 flex items-center justify-between border-b border-white/10">
              <p className="text-sm font-black text-white">{session.name}</p>
              <button onClick={() => setMobileNavOpen(false)} className="w-8 h-8 flex items-center justify-center text-white"><X className="w-5 h-5" /></button>
            </div>
            {sidebar}
            <div className="p-3 border-t border-white/10 space-y-1">
              <button onClick={() => navigate('/')} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-300 hover:bg-white/10 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to FILMONS
              </button>
              <button onClick={() => { adminAuth.logout(); setSession(null); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-300 hover:bg-white/10 hover:text-red-200 transition-colors">
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {/* overflow-y-auto (not overflow-hidden) -- a normal page-scroll
          container so any nested admin page (e.g. AdminVerifications,
          which expects to own its own vertical scrolling like any other
          full page) behaves exactly as it did as a standalone route.
          Support Chats specifically manages its own fixed-height 3-pane
          scroll regions (see its own h-[calc(100vh-3rem)] root) rather
          than relying on this container to bound its height. */}
      <main className="flex-1 min-w-0 overflow-y-auto pt-12 lg:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
