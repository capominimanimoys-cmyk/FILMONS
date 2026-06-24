/**
 * OAuthCallback — handles the redirect from Google / Apple OAuth.
 * Supabase places tokens in the URL; this page waits for the session,
 * finds or creates the profile, then routes the user appropriately.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';
import { toast } from 'sonner';
import { sendWelcomeEmail } from '../lib/emailjs-config';
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

// ── Component ─────────────────────────────────────────────────────────────────

export function OAuthCallback() {
  const navigate    = useNavigate();
  const { completeLogin } = useAuth();
  const handled     = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Listen for SIGNED_IN (fires after Supabase processes callback URL tokens)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && !handled.current) {
        subscription.unsubscribe();
        handleSession(session);
      }
    });

    // Also check synchronously — session may already be available
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
        navigate(isComplete(u) ? '/feed' : '/onboarding', { replace: true });
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
          // Parse existing profile_meta (may be string or object depending on Supabase version)
          const existingMeta: Record<string, any> =
            typeof byEmail.profile_meta === 'string'
              ? JSON.parse(byEmail.profile_meta || '{}')
              : (byEmail.profile_meta || {});

          const alreadyLinked = existingMeta[`${provider}Id`] === user.id;

          if (!alreadyLinked) {
            // First time linking this provider — record it in profile_meta
            const updatedMeta = {
              ...existingMeta,
              providers: [...new Set([...(existingMeta.providers || ['email']), provider])],
              [`${provider}Id`]: user.id,
            };
            await supabase.from('profiles')
              .update({ profile_meta: updatedMeta })
              .eq('id', byEmail.id);
          }

          const u = rowToUser(byEmail);
          await completeLogin(undefined, undefined, undefined, u);

          if (!alreadyLinked) {
            toast.success('Google account linked — welcome back!', {
              description: "We've connected your Google account to your existing Filmons account. You can now sign in with either.",
              duration: 5000,
            });
          } else {
            toast.success('Welcome back.');
          }

          navigate(isComplete(u) ? '/feed' : '/onboarding', { replace: true });
          return;
        }
      }

      // 3. New user — create profile
      const isAppleRelay = email?.endsWith('@privaterelay.appleid.com') ?? false;
      const newRow: Record<string, any> = {
        id:           user.id,
        email:        isAppleRelay ? null : email,   // don't persist Apple relay emails
        name:         name || email?.split('@')[0] || 'User',
        avatar_url:   avatar,
        avatar:       avatar,
        profile_setup_percentage: 0,
        profile_meta: { provider, ...(isAppleRelay ? { appleRelayEmail: email } : {}) },
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      };

      const { data: created, error: insertErr } = await supabase
        .from('profiles')
        .insert(newRow)
        .select()
        .single();

      let finalUser: User;

      if (insertErr) {
        console.warn('[OAuthCallback] direct insert failed:', insertErr.message);
        // RLS may block — try via edge function (bypasses RLS)
        const { projectId, publicAnonKey } = await import('/utils/supabase/info');
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/users`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
            body: JSON.stringify({
              id: user.id, email: newRow.email, name: newRow.name,
              avatar: avatar, provider, skipAuthCreation: true,
            }),
          }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Failed to create account');
        finalUser = body.user ? body.user as User : rowToUser(newRow);
      } else {
        finalUser = rowToUser(created || newRow);
      }

      await completeLogin(undefined, undefined, undefined, finalUser);

      // Fire-and-forget welcome email
      if (!isAppleRelay && email && finalUser.name) {
        sendWelcomeEmail(email, finalUser.name).catch(() => {});
      }

      toast.success('Account created. Complete your profile to start using Filmons.');
      navigate('/onboarding', { replace: true });

    } catch (e: any) {
      console.error('[OAuthCallback]', e);
      setError(e?.message || 'Sign-in failed. Please try again.');
    }
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-5 bg-gray-950 px-6">
        <FilmonsLogo iconSize={32} theme="dark"/>
        <p className="text-white/60 text-sm text-center max-w-xs">{error}</p>
        <button onClick={() => navigate('/login')}
          className="text-white text-sm font-semibold underline underline-offset-2">
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-5 bg-gray-950">
      <FilmonsLogo iconSize={32} theme="dark"/>
      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"/>
      <p className="text-white/40 text-sm">Signing you in…</p>
    </div>
  );
}
