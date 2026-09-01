// Shared FILMONS Admin shell — a real /admin/* route tree, sibling to
// Root (never nested inside it), so the normal user TopBar/DesktopSidebar/
// MobileBottomNav chrome can never leak into the admin area. Owns the
// ONE login gate every admin page sits behind: a passwordless, emailed
// one-time-code flow (see src/app/lib/adminAuth.ts), never the normal
// FILMONS email/password/Google/phone/guest flow, and never a
// sessionStorage/localStorage-held token -- the session lives entirely
// in an HttpOnly cookie this component never touches directly, only
// asks about via checkSession().
//
// Deep links (e.g. a support-case email link to /admin/support/cases/:id)
// work with zero extra redirect logic: this component conditionally
// swaps the LOGIN FORM in for <Outlet/> without ever navigating away
// from the URL the admin actually landed on, so the moment checkSession()
// resolves true, whatever nested route matches that URL renders
// immediately -- no "redirect to dashboard first."
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, NavLink } from 'react-router';
import { toast } from 'sonner';
import { adminAuth, type AdminSession } from '../lib/adminAuth';
import {
  LayoutDashboard, ShieldCheck, LifeBuoy, Receipt, Users, Package,
  Briefcase, Flag, Settings as SettingsIcon, ArrowLeft, Menu, X, Loader2,
} from 'lucide-react';

// Basename-relative -- never '/admin/...' here. The router's basename
// (see adminRoutes.tsx) resolves these to the right real URL whether
// this bundle is being served from filmons.app/admin/* or from
// admin.filmons.app/* directly.
const NAV_ITEMS = [
  { path: '/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { path: '/verifications',  label: 'Verifications',  icon: ShieldCheck },
  { path: '/support-chats',  label: 'Support Chats',  icon: LifeBuoy },
  { path: '/transactions',   label: 'Transactions',   icon: Receipt },
  { path: '/users',          label: 'Users',          icon: Users },
  { path: '/listings',       label: 'Listings',       icon: Package },
  { path: '/opportunities',  label: 'Opportunities',  icon: Briefcase },
  { path: '/reports',        label: 'Reports',        icon: Flag },
  { path: '/settings',       label: 'Settings',       icon: SettingsIcon },
];

// Shown on the "check your email" step -- masked so the exact admin
// inbox address isn't sitting in plaintext in the DOM/screenshots/screen
// shares. The code itself is never sent to the browser at all (see
// adminAuth.ts), so there is nothing to mask there; this is the one
// piece of contact info this screen does display in full otherwise.
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain || user.length <= 2) return email;
  const visible = user.length <= 4 ? 1 : 2;
  const masked = user.slice(0, visible) + '*'.repeat(Math.max(3, user.length - visible * 2)) + user.slice(-visible);
  return `${masked}@${domain}`;
}
const ADMIN_RECIPIENT_EMAIL_MASKED = maskEmail('gabriel@filmons.app');

// Always the real main-site origin, absolute -- deliberately NOT a
// relative '/' navigate(), because on admin.filmons.app a relative '/'
// would just re-resolve to this same Admin bundle (see vercel.json's
// host-matched rewrite), not actually leave the Admin app.
const MAIN_SITE_URL = 'https://filmons.app/';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 45;

function AdminLoginGate({ onSignedIn }: { onSignedIn: (s: AdminSession) => void }) {
  const [step, setStep] = useState<'start' | 'code'>('start');
  const [sending, setSending] = useState(false);
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const generateCode = async () => {
    setSending(true);
    setError('');
    const { success, error: err } = await adminAuth.generateCode();
    setSending(false);
    if (!success) { setError(err || 'Could not send code'); return; }
    setStep('code');
    setDigits(Array(CODE_LENGTH).fill(''));
    setCooldown(RESEND_COOLDOWN_S);
    setTimeout(() => inputRefs.current[0]?.focus(), 80);
  };

  const setDigit = (i: number, val: string) => {
    const v = val.replace(/\D/g, '').slice(-1);
    setDigits(prev => { const next = [...prev]; next[i] = v; return next; });
    if (v && i < CODE_LENGTH - 1) inputRefs.current[i + 1]?.focus();
  };
  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputRefs.current[i - 1]?.focus();
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!text) return;
    e.preventDefault();
    setDigits(Array.from({ length: CODE_LENGTH }, (_, i) => text[i] || ''));
    inputRefs.current[Math.min(text.length, CODE_LENGTH - 1)]?.focus();
  };

  const code = digits.join('');
  const verify = async () => {
    if (code.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError('');
    const { success, error: err, session } = await adminAuth.verifyCode(code);
    setVerifying(false);
    if (!success || !session) {
      setError(err || 'Incorrect code');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      return;
    }
    onSignedIn(session);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-blue-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">FILMONS ADMIN</h1>
          <p className="text-gray-400 text-sm mt-1">
            {step === 'start' ? 'Secure Admin Access' : 'Check your email'}
          </p>
        </div>

        {step === 'start' ? (
          <div className="space-y-4">
            <button onClick={generateCode} disabled={sending}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3.5 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {sending ? 'Sending…' : 'Generate Code'}
            </button>
            {error && <p className="text-red-500 text-xs text-center">{error}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 text-center">
              A secure admin verification code was sent to<br /><span className="font-bold text-gray-800">{ADMIN_RECIPIENT_EMAIL_MASKED}</span>
            </p>
            <div className="flex gap-2 justify-center" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el; }}
                  type="text" inputMode="numeric" maxLength={1} value={d}
                  onChange={e => setDigit(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  className="w-10 h-12 text-center text-lg font-black text-gray-900 bg-gray-50 border-2 border-gray-200 rounded-xl outline-none focus:border-blue-400 focus:bg-white transition-all"
                />
              ))}
            </div>
            {error && <p className="text-red-500 text-xs text-center">{error}</p>}
            <button onClick={verify} disabled={verifying || code.length !== CODE_LENGTH}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3.5 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {verifying ? 'Verifying…' : 'Verify & Sign In'}
            </button>
            {/* Subtle, non-alert helper text -- matches the same wording/
                placement pattern used on FILMONS' own email-OTP screens. */}
            <p className="text-[12px] text-gray-400 text-center">
              Didn't receive the code? Check your spam or junk folder.
            </p>
            <button onClick={generateCode} disabled={sending || cooldown > 0}
              className="w-full text-gray-500 hover:text-gray-700 text-sm font-semibold py-1 disabled:opacity-40 transition-colors">
              {cooldown > 0 ? `Generate New Code (${cooldown}s)` : sending ? 'Sending…' : 'Generate New Code'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminLayout() {
  const location = useLocation();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checked, setChecked] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    adminAuth.checkSession().then(s => { setSession(s); setChecked(true); });
  }, []);

  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  if (!checked) return null;

  if (!session) {
    return <AdminLoginGate onSignedIn={s => { setSession(s); toast.success(`Signed in as ${s.name}`); }} />;
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

  const doLogout = async () => {
    await adminAuth.logout();
    setSession(null);
  };

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
          <button onClick={() => { window.location.href = MAIN_SITE_URL; }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-300 hover:bg-white/10 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to FILMONS
          </button>
          <button onClick={doLogout} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-300 hover:bg-white/10 hover:text-red-200 transition-colors">
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
              <button onClick={() => { window.location.href = MAIN_SITE_URL; }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-300 hover:bg-white/10 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to FILMONS
              </button>
              <button onClick={doLogout} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-300 hover:bg-white/10 hover:text-red-200 transition-colors">
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <main className="flex-1 min-w-0 overflow-y-auto pt-12 lg:pt-0">
        {/* Outlet context: lets any nested admin page read the current
            AdminSession (name/role) via useOutletContext<AdminSession>()
            instead of re-deriving/re-checking it itself. */}
        <Outlet context={session} />
      </main>
    </div>
  );
}
