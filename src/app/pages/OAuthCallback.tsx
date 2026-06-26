/**
 * OAuthCallback — handles the redirect from Google / Apple OAuth.
 * Supabase places tokens in the URL; this page waits for the session,
 * then checks whether a Filmons profile already exists.
 *
 * Existing account  → sign in → redirect to "/"
 * No account found  → keep session alive, navigate to /google-signup
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';
import { toast } from 'sonner';
import { FilmonsLogo } from '../components/FilmonsLogo';

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

// ── Dark background ───────────────────────────────────────────────────────────
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

// ── Component ─────────────────────────────────────────────────────────────────

export function OAuthCallback() {
  const navigate           = useNavigate();
  const { completeLogin }  = useAuth();
  const handled            = useRef(false);
  const [loadError, setLoadError] = useState('');

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

      // 3. No Filmons account found — keep the Supabase session alive so
      //    GoogleSignup can read user metadata, then let them complete signup.
      navigate('/google-signup', { replace: true });

    } catch (e: any) {
      console.error('[OAuthCallback]', e);
      setLoadError(e?.message || 'Sign-in failed. Please try again.');
    }
  }

  // ── Error screen ─────────────────────────────────────────────────────────
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
