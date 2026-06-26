/**
 * OAuthCallback — handles the redirect from Google / Apple OAuth.
 * Supabase places tokens in the URL; this page waits for the session,
 * then checks whether a Filmons profile already exists.
 *
 * Existing account  → sign in → redirect to "/"
 * No account found  → show "Email not found" screen (do NOT auto-create)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';
import { toast } from 'sonner';
import { FilmonsLogo } from '../components/FilmonsLogo';
import { Mail, Phone } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pgArr(v: any): string[] {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === 'string' && v.trim()) {
    const s = v.trim();
    if (s === '{}') return [];
    if (s.startsWith('{') && s.endsWith('}'))
      return s.slice(1, -1).split(',').map(x => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
    try { const p = JSON.parse(s); return Array.isArray(p) ? p.filter(Boolean).map(String) : []; } catch {}
  }
  return [];
}

function rowToUser(row: any): User {
  return {
    id:                 row.id,
    email:              row.email ?? undefined,
    name:               row.name || row.username || row.email?.split('@')[0] || 'User',
    username:           row.username ?? undefined,
    avatar:             row.avatar_url || row.avatar || undefined,
    coverPhoto:         row.cover_photo || row.banner_url || undefined,
    bio:                row.bio ?? undefined,
    location:           row.location ?? undefined,
    phone:              row.phone ?? undefined,
    accountType:        row.account_type ?? undefined,
    accountMode:        row.account_mode ?? undefined,
    isVerified:         row.is_verified ?? false,
    verificationStatus: row.verification_status ?? 'not_started',
    following:          pgArr(row.following),
    followers:          pgArr(row.followers),
  };
}

function isComplete(user: User): boolean {
  return !!(user.username && user.accountType);
}

// ── Dark background (same as Login / CreateAccount) ───────────────────────────
function CinematicBg() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950"/>
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")',
          backgroundSize: '256px 256px',
        }}
      />
      <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full bg-blue-600 opacity-10 blur-[120px]"/>
      <div className="absolute bottom-1/4 right-1/3 w-64 h-64 rounded-full bg-indigo-500 opacity-10 blur-[80px]"/>
    </div>
  );
}

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface NotFoundState {
  email: string;
  name: string;
  avatar: string | null;
}

export function OAuthCallback() {
  const navigate           = useNavigate();
  const { completeLogin }  = useAuth();
  const handled            = useRef(false);
  const [loadError,  setLoadError]  = useState('');
  const [notFound,   setNotFound]   = useState<NotFoundState | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && !handled.current) {
        subscription.unsubscribe();
        handleSession(session);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !handled.current) {
        subscription.unsubscribe();
        handleSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSession(session: any) {
    if (handled.current) return;
    handled.current = true;

    try {
      const { user } = session;
      const provider = (user.app_metadata?.provider as string) || 'google';
      const email    = user.email?.toLowerCase() ?? null;
      const name     = user.user_metadata?.full_name || user.user_metadata?.name || '';
      const avatar   = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;

      // 1. Existing profile by Supabase auth ID (returning user)
      const { data: byId } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (byId) {
        const u = rowToUser(byId);
        await completeLogin(undefined, undefined, undefined, u);
        toast.success('Welcome back.');
        navigate(isComplete(u) ? '/' : '/onboarding', { replace: true });
        return;
      }

      // 2. Existing profile by email — link OAuth provider to existing account
      if (email) {
        const { data: byEmail } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        if (byEmail) {
          const existingMeta: Record<string, any> =
            typeof byEmail.profile_meta === 'string'
              ? JSON.parse(byEmail.profile_meta || '{}')
              : (byEmail.profile_meta || {});

          const alreadyLinked = existingMeta[`${provider}Id`] === user.id;

          if (!alreadyLinked) {
            const updatedMeta = {
              ...existingMeta,
              providers: [...new Set([...(existingMeta.providers || ['email']), provider])],
              [`${provider}Id`]: user.id,
            };
            await supabase.from('profiles').update({ profile_meta: updatedMeta }).eq('id', byEmail.id);
          }

          const u = rowToUser(byEmail);
          await completeLogin(undefined, undefined, undefined, u);

          toast.success(alreadyLinked ? 'Welcome back.' : 'Google account linked — welcome back!', {
            description: alreadyLinked ? undefined : "We've connected your Google account to your existing Filmons account.",
            duration: alreadyLinked ? 3000 : 5000,
          });

          navigate(isComplete(u) ? '/' : '/onboarding', { replace: true });
          return;
        }
      }

      // 3. No Filmons account found for this Google email.
      // Sign out from Supabase so we don't create a dangling session,
      // then show the friendly "Email not found" screen.
      await supabase.auth.signOut().catch(() => {});
      setNotFound({ email: email ?? '', name, avatar });

    } catch (e: any) {
      console.error('[OAuthCallback]', e);
      setLoadError(e?.message || 'Sign-in failed. Please try again.');
    }
  }

  const restartGoogleOAuth = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(error.message);
  };

  // ── Email not found screen ────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden">
        <CinematicBg/>
        <div className="relative z-10 flex flex-col h-full px-5 overflow-y-auto">
          {/* Logo */}
          <div className="flex justify-center pt-14 pb-8">
            <FilmonsLogo iconSize={28} theme="dark"/>
          </div>

          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative w-20 h-20">
              <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                <Mail className="w-9 h-9 text-white/50"/>
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center border-2 border-[#0f172a] shadow-lg">
                <span className="text-white text-xs font-black leading-none">✕</span>
              </div>
            </div>
          </div>

          {/* Title + message */}
          <div className="text-center mb-5">
            <p className="text-2xl font-black text-white mb-2">Email not found</p>
            <p className="text-white/60 text-sm leading-relaxed">
              We couldn't find a Filmons account with this email address.
            </p>
          </div>

          {/* Google account info pill */}
          <div className="flex justify-center mb-2">
            <div className="flex items-center gap-2.5 bg-white/10 border border-white/20 rounded-full px-4 py-2.5">
              {notFound.avatar ? (
                <img src={notFound.avatar} alt="" className="w-5 h-5 rounded-full object-cover"/>
              ) : (
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-white text-[9px] font-bold">{notFound.name?.[0]?.toUpperCase() || 'G'}</span>
                </div>
              )}
              <span className="text-white/80 text-sm font-medium truncate max-w-[220px]">{notFound.email}</span>
            </div>
          </div>

          {/* Google account label */}
          <p className="text-center text-[11px] text-white/30 mb-6">
            Signed in as Google account
          </p>

          {/* CTA copy */}
          <p className="text-center text-white/40 text-xs leading-relaxed mb-6 px-2">
            New to Filmons? Create your account in a few seconds and start connecting with creators, clients, and marketplace hosts.
          </p>

          {/* Primary CTA */}
          <button
            onClick={() => navigate(`/create-account?email=${encodeURIComponent(notFound.email)}&provider=google`)}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-900/30 mb-3"
          >
            Create account with this email
          </button>

          {/* Secondary */}
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3.5 border border-white/20 hover:bg-white/5 text-white font-semibold text-sm rounded-2xl transition-all active:scale-[0.98] mb-5"
          >
            Try another email
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/10"/>
            <p className="text-white/30 text-xs font-medium">or continue with</p>
            <div className="flex-1 h-px bg-white/10"/>
          </div>

          {/* OAuth + Phone alternatives */}
          <div className="space-y-3 pb-8">
            <button
              onClick={restartGoogleOAuth}
              className="w-full flex items-center gap-3 bg-white hover:bg-gray-50 border border-white/80 text-gray-800 font-semibold text-sm rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-all"
            >
              <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                <GoogleLogo size={20}/>
              </span>
              <span className="flex-1 text-left">Continue with Google</span>
            </button>
            <button
              onClick={() => navigate('/phone-login')}
              className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-sm rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-all"
            >
              <Phone className="w-5 h-5 shrink-0"/>
              <span className="flex-1 text-left">Continue with Phone Number</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Technical error screen ────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden">
        <CinematicBg/>
        <div className="relative z-10 flex flex-col items-center justify-center h-full gap-5 px-6">
          <FilmonsLogo iconSize={32} theme="dark"/>
          <p className="text-white/60 text-sm text-center max-w-xs">{loadError}</p>
          <button
            onClick={() => navigate('/login')}
            className="text-blue-400 text-sm font-semibold hover:underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // ── Loading screen ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-5 bg-gray-950">
      <FilmonsLogo iconSize={32} theme="dark"/>
      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"/>
      <p className="text-white/40 text-sm">Signing you in…</p>
    </div>
  );
}
