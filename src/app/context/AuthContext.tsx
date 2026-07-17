/**
 * AuthContext — session management backed by the `profiles` Postgres table.
 *
 * Email signup / signin: our own server (profiles table) — NO Supabase Auth.
 * Phone OTP:             Supabase Auth (Twilio SMS) — only for OTP delivery.
 *
 * ⚠️  If the `profiles` table is missing the `birthdate` column, run:
 *       ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthdate text;
 *     in the Supabase SQL Editor before using phone signup.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { User } from '../types';
import { authApi } from '../lib/api';
import { seedDemoData } from '../lib/initializeData';

// ── Types ─────────────────────────────────────────────────────────────────────
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;

  // Guest mode — browse without an account
  isGuest:        boolean;
  enterGuestMode: () => void;
  exitGuestMode:  () => void;
  /** Show the guest auth prompt with an optional action-specific message */
  guestPromptMsg:  string | null;
  showGuestPrompt: (msg?: string) => void;
  hideGuestPrompt: () => void;

  // Email/password (profiles table — no Supabase Auth)
  login:    (email: string, password: string) => Promise<string>;
  signup:   (
    email:        string,
    password:     string,
    name:         string,
    phone?:       string,
    accountType?: 'renter' | 'business' | 'service',
    extraFields?: Record<string, any>
  ) => Promise<{ user: User; verificationCode: string }>;

  // Finalise a login/signup flow — sets user state
  completeLogin: (
    email?:         string,
    password?:      string,
    phone?:         string,
    preloadedUser?: User
  ) => Promise<void>;

  // Phone OTP (Supabase Auth / Twilio)
  sendPhoneOTP:   (phone: string) => Promise<void>;
  verifyPhoneOTP: (phone: string, code: string) => Promise<void>;
  signupWithPhone:(phone: string, name: string, accountType?: 'renter' | 'business' | 'service') => Promise<void>;
  signinWithPhone:(phone: string) => Promise<void>;

  // Profile management
  updateUser: (updates: Partial<User>) => Promise<void>;
  setUserDirectly: (u: User) => void;   // update state without an extra API round-trip
  logout:     () => Promise<void>;
}

// ── Session helpers ────────────────────────────────────────────────────────────
const SESSION_KEY = 'filmons_current_user';
const GUEST_KEY   = 'filmons_guest_mode';

/** Parse Postgres array literal "{u1,u2}" → string[] (or passthrough real arrays) */
function pgArr(v: any): string[] {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === 'string' && v.trim()) {
    const s = v.trim();
    if (s === '{}' || s === '') return [];
    if (s.startsWith('{') && s.endsWith('}'))
      return s.slice(1, -1).split(',').map(x => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
    try { const p = JSON.parse(s); return Array.isArray(p) ? p.filter(Boolean).map(String) : []; } catch {}
  }
  return [];
}

function sanitizeUser(u: any): User | null {
  if (!u) return null;
  return { ...u, following: pgArr(u.following), followers: pgArr(u.followers) };
}

function loadCached(): User | null {
  try { return sanitizeUser(JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')); } catch { return null; }
}
function cache(u: User | null) {
  if (u) localStorage.setItem(SESSION_KEY, JSON.stringify(u));
  else   localStorage.removeItem(SESSION_KEY);
}

// ── Context ───────────────────────────────────────────────────────────────────
// Provide a safe no-op default so components rendered outside AuthProvider
// (e.g. Figma Make's isolated component preview) don't throw.
const _noop = () => Promise.resolve() as any;
const defaultCtx: AuthContextType = {
  user:             null,
  isAuthenticated:  false,
  isGuest:          false,
  enterGuestMode:   () => {},
  exitGuestMode:    () => {},
  guestPromptMsg:   null,
  showGuestPrompt:  () => {},
  hideGuestPrompt:  () => {},
  login:            async () => '',
  signup:           async () => ({ user: null as unknown as User, verificationCode: '' }),
  completeLogin:    _noop,
  sendPhoneOTP:     _noop,
  verifyPhoneOTP:   _noop,
  signupWithPhone:  _noop,
  signinWithPhone:  _noop,
  updateUser:       _noop,
  setUserDirectly:  () => {},
  logout:           _noop,
};

const AuthContext = createContext<AuthContextType>(defaultCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialise from localStorage so the UI never flashes "logged out"
  const [user, setUser] = useState<User | null>(() => loadCached());

  // Guest mode
  const [isGuest,       setIsGuest]       = useState(() => localStorage.getItem(GUEST_KEY) === 'true');
  const [guestPromptMsg, setGuestPromptMsg] = useState<string | null>(null);

  const enterGuestMode = () => { localStorage.setItem(GUEST_KEY, 'true');  setIsGuest(true);  };
  const exitGuestMode  = () => { localStorage.removeItem(GUEST_KEY);        setIsGuest(false); };

  const showGuestPrompt = (msg = 'Create an account to continue') => setGuestPromptMsg(msg);
  const hideGuestPrompt = () => setGuestPromptMsg(null);

  // Must be defined before useEffect so it's captured in closure
  const setAndCache = (u: User | null) => { const s = sanitizeUser(u); setUser(s); cache(s); };

  // Refresh session from server on mount — ensures name/avatar are always current
  useEffect(() => {
    const cached = loadCached();
    if (!cached) return;
    authApi.getMe().then(({ user: fresh }) => {
      if (fresh && fresh.id === cached.id) { const s = sanitizeUser(fresh)!; setUser(s); cache(s); }
    }).catch(() => {});
  }, []); // eslint-disable-line

  // Update last_seen every 2 minutes while app is open so the notification system
  // can detect if the receiver is currently active (skips email/SMS if online).
  useEffect(() => {
    if (!user?.id) return;
    const update = () => {
      import('../../lib/supabase').then(({ supabase }) =>
        supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', user!.id)
          .then(() => {}, () => {}) // silence if column doesn't exist yet
      ).catch(() => {});
    };
    update(); // on mount / login
    const interval = setInterval(update, 2 * 60 * 1000);
    const onFocus = () => update();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [user?.id]); // eslint-disable-line

  // ── Email / password ──────────────────────────────────────────────────────
  // `login` only validates credentials (server lookup) and returns a dummy code;
  // the actual session is set in `completeLogin` after OTP is confirmed.
  const login = async (email: string, password: string): Promise<string> => {
    const { user: found } = await authApi.signin(email, password);
    if (!found) throw new Error('Invalid credentials');
    setAndCache(found);
    exitGuestMode();
    seedDemoData(found.id);
    return '000000';
  };

  // `signup` creates the profile row in the DB and returns the user.
  // Does NOT call supabase.auth.signUp — no email rate limits.
  const signup = async (
    email:        string,
    _password:    string,
    name:         string,
    phone?:       string,
    accountType:  'renter' | 'business' | 'service' = 'renter',
    extraFields?: Record<string, any>
  ): Promise<{ user: User; verificationCode: string }> => {
    return authApi.signup(email, _password, name, phone, accountType, extraFields);
  };

  // ── Complete Login ────────────────────────────────────────────────────────
  // Called after any verification step to commit the session.
  const completeLogin = async (
    email?:         string,
    password?:      string,
    phone?:         string,
    preloadedUser?: User
  ) => {
    if (preloadedUser) {
      setAndCache(preloadedUser);
      exitGuestMode();
      seedDemoData(preloadedUser.id);
      return;
    }

    if (email) {
      const { user: found } = await authApi.signin(email, password || '');
      setAndCache(found);
      exitGuestMode();
      seedDemoData(found.id);
      return;
    }

    if (phone) {
      const normalized = phone.replace(/\D/g, '');
      const resp = await fetch(
        `https://${(await import('/utils/supabase/info')).projectId}.supabase.co/functions/v1/make-server-ec8fe879/users/by-phone/${encodeURIComponent(normalized)}`,
        { headers: { Authorization: `Bearer ${(await import('/utils/supabase/info')).publicAnonKey}` } }
      );
      const data = await resp.json();
      if (data.user) {
        setAndCache(data.user);
        exitGuestMode();
        seedDemoData(data.user.id);
      }
    }
  };

  // ── Phone OTP — routed through our edge function → Twilio directly ───────
  // No Supabase Auth phone settings required.
  const sendPhoneOTP = async (phone: string) => {
    await authApi.sendPhoneOTP(phone);
  };

  const verifyPhoneOTP = async (phone: string, code: string) => {
    await authApi.verifyPhoneOTP(phone, code);
  };

  const signupWithPhone = async (
    phone:       string,
    name:        string,
    accountType: 'renter' | 'business' | 'service' = 'renter'
  ) => {
    await sendPhoneOTP(phone);
    sessionStorage.setItem('pending_signup', JSON.stringify({ phone, name, accountType }));
  };

  const signinWithPhone = async (phone: string) => {
    // Verify phone exists in our profiles table before burning an OTP
    const normalized = phone.replace(/\D/g, '');
    const { user: found } = await authApi.getUserById(normalized).then(u => ({ user: u })).catch(() => ({ user: null }));
    // fall back to by-phone lookup
    if (!found) {
      const resp = await fetch(
        `https://${(await import('/utils/supabase/info')).projectId}.supabase.co/functions/v1/make-server-ec8fe879/users/by-phone/${encodeURIComponent(normalized)}`,
        { headers: { Authorization: `Bearer ${(await import('/utils/supabase/info')).publicAnonKey}` } }
      );
      const data = await resp.json();
      if (!data.user) throw new Error('No account found with this phone number');
    }
    await sendPhoneOTP(phone);
  };

  // ── Profile updates ───────────────────────────────────────────────────────
  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;
    const updated = await authApi.updateUser(user.id, updates);
    setAndCache(updated);
  };

  const setUserDirectly = (u: User) => {
    setAndCache(u);
    exitGuestMode();
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = async () => {
    setAndCache(null);
    supabase.auth.signOut().catch(() => {}); // best-effort phone-session cleanup
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isGuest,
      enterGuestMode,
      exitGuestMode,
      guestPromptMsg,
      showGuestPrompt,
      hideGuestPrompt,
      login,
      signup,
      completeLogin,
      sendPhoneOTP,
      verifyPhoneOTP,
      signupWithPhone,
      signinWithPhone,
      updateUser,
      setUserDirectly,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}