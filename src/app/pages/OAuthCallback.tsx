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
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { getOAuthRedirectUrl } from '../lib/appUrl';
import { consumePendingReturnUrl } from '../lib/authReturnUrl';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { Lock, Link2, X } from 'lucide-react';

const EXPECTED_EMAIL_KEY = 'fm_expected_login_email';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(3, local.length - 1))}@${domain}`;
}

interface LinkPrompt {
  existingProfile: any;
  googleUserId: string;
  email: string;
  provider: string;
}

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
  const [wrongAccount, setWrongAccount] = useState<{ expected: string; got: string } | null>(null);

  // Existing email/password account + a Google identity that isn't linked
  // to it yet — never auto-link on Google's word alone; require the
  // account's actual Filmons password before touching it.
  const [linkPrompt, setLinkPrompt] = useState<LinkPrompt | null>(null);
  const [linkStep,   setLinkStep]   = useState<'prompt' | 'password' | 'success'>('prompt');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkError,    setLinkError]    = useState('');
  const [linking,      setLinking]      = useState(false);

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

      // If this flow started from a specific known account (the "this
      // account uses Google" screen on Login), the returned identity
      // MUST match it. Without this check, Google silently reusing a
      // different already-signed-in Google account in the same browser
      // would resolve to — and log the user into — a completely
      // different Filmons account with no warning at all.
      const expectedEmail = sessionStorage.getItem(EXPECTED_EMAIL_KEY);
      sessionStorage.removeItem(EXPECTED_EMAIL_KEY);
      if (expectedEmail && email !== expectedEmail) {
        await supabase.auth.signOut(); // never leave the wrong session active
        setWrongAccount({ expected: expectedEmail, got: email || '' });
        return;
      }

      // 1. Existing profile by Supabase auth ID (returning user)
      const { data: byId } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (byId) {
        const u = rowToUser(byId);
        await completeLogin(undefined, undefined, undefined, u, provider);
        toast.success('Welcome back.');
        // For an existing, complete profile this is a real sign-in, not a
        // fresh signup -- honor a pending return URL from a guest-gated
        // action (see SearchOverlay's handleGuestSeeMore) the same way
        // Login.tsx does. A profile still going through /onboarding isn't
        // done signing up yet, so the pending URL stays put in
        // sessionStorage until Onboarding's own completion navigates.
        navigate(isComplete(u) ? consumePendingReturnUrl() : '/onboarding', { replace: true });
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

          if (alreadyLinked) {
            const u = rowToUser(byEmail);
            await completeLogin(undefined, undefined, undefined, u, provider);
            toast.success('Welcome back.');
            navigate(isComplete(u) ? consumePendingReturnUrl() : '/onboarding', { replace: true });
            return;
          }

          // Google (or Apple) is reporting an email that already owns a
          // Filmons account, but this specific provider identity has never
          // been linked to it. Google having verified the email isn't
          // treated as sufficient proof of ownership on its own -- sign
          // this brand-new OAuth identity back out and require the
          // account's real password before linking anything, so a
          // Google account that merely shares an email can't silently
          // take over an existing Filmons account.
          await supabase.auth.signOut();
          setLinkPrompt({ existingProfile: byEmail, googleUserId: user.id, email, provider });
          setLinkStep('prompt');
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

  const retryWithSelectAccount = async (expectedEmail: string) => {
    sessionStorage.setItem(EXPECTED_EMAIL_KEY, expectedEmail);
    handled.current = false;
    setWrongAccount(null);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getOAuthRedirectUrl(), queryParams: { prompt: 'select_account' } },
    });
  };

  // ── Google-link confirmation flow ────────────────────────────────────────
  const cancelLinkPrompt = () => {
    setLinkPrompt(null);
    navigate('/login', { replace: true });
  };

  const useAnotherGoogleAccount = async () => {
    setLinkPrompt(null);
    handled.current = false;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getOAuthRedirectUrl(), queryParams: { prompt: 'select_account' } },
    });
  };

  const confirmAndConnect = async () => {
    if (!linkPrompt || !linkPassword || linking) return;
    setLinking(true);
    setLinkError('');
    try {
      // The real proof of ownership: does this person know the existing
      // account's actual password? This establishes a genuine session
      // under the EXISTING profile's own auth id (a separate auth.users
      // row from the one Google just created for the same email — this
      // app links accounts at the profiles/profile_meta layer, not via
      // Supabase's native identity merging).
      const { error: pwError } = await supabase.auth.signInWithPassword({
        email: linkPrompt.email, password: linkPassword,
      });
      if (pwError) {
        setLinkError('Incorrect password. Please try again.');
        setLinking(false);
        return;
      }

      const existingMeta: Record<string, any> =
        typeof linkPrompt.existingProfile.profile_meta === 'string'
          ? JSON.parse(linkPrompt.existingProfile.profile_meta || '{}')
          : (linkPrompt.existingProfile.profile_meta || {});
      const updatedMeta = {
        ...existingMeta,
        providers: [...new Set([...(existingMeta.providers || ['email']), linkPrompt.provider])],
        [`${linkPrompt.provider}Id`]: linkPrompt.googleUserId,
      };

      // Written through the service-role server, not a direct client
      // update -- profiles writes have repeatedly turned out to silently
      // no-op under this table's RLS policy depending on session state,
      // so this path never depends on that working correctly.
      await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/users/${linkPrompt.existingProfile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ profileMeta: updatedMeta }),
      }).catch(() => {});

      const u = rowToUser({ ...linkPrompt.existingProfile, profile_meta: updatedMeta });
      await completeLogin(undefined, undefined, undefined, u, linkPrompt.provider);
      setLinkStep('success');
    } catch (e: any) {
      setLinkError(e?.message || 'Could not connect your Google account. Please try again.');
    } finally {
      setLinking(false);
    }
  };

  const continueAfterLink = () => {
    if (!linkPrompt) return;
    const u = rowToUser(linkPrompt.existingProfile);
    navigate(isComplete(u) ? consumePendingReturnUrl() : '/onboarding', { replace: true });
  };

  // ── Existing email/password account, unlinked Google identity ────────────
  if (linkPrompt) {
    const providerLabel = linkPrompt.provider === 'google' ? 'Google' : 'Apple';
    return (
      <AuthScreenLayout>
        <CinematicBg/>
        <div
          className="fixed inset-0 z-[95] bg-black/60 flex items-end md:items-center justify-center"
          style={{ backdropFilter: 'blur(4px)' }}
        >
          <div className="relative z-10 w-full md:max-w-sm bg-gray-900 rounded-t-3xl md:rounded-3xl px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-6 shadow-2xl">
            {linkStep !== 'password' && (
              <button
                onClick={cancelLinkPrompt}
                aria-label="Close"
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              >
                <X className="w-4 h-4"/>
              </button>
            )}

            {linkStep === 'prompt' && (
              <div className="space-y-5">
                <div className="flex justify-center pt-2">
                  <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                    <Link2 className="w-7 h-7 text-blue-400" strokeWidth={1.5}/>
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-black text-white">This email is already connected to a Filmons account</h2>
                  <p className="text-white/55 text-sm leading-relaxed">
                    You already have a Filmons account using this email.
                  </p>
                  <p className="text-white/55 text-sm leading-relaxed">
                    Connect your {providerLabel} account to your existing Filmons account so you can use Continue with {providerLabel} next time.
                  </p>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() => setLinkStep('password')}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-900/30"
                  >
                    Connect {providerLabel} Account
                  </button>
                  <button
                    onClick={cancelLinkPrompt}
                    className="w-full py-3.5 bg-white/8 hover:bg-white/12 border border-white/15 text-white font-semibold text-sm rounded-2xl transition-all active:scale-[0.98]"
                  >
                    Sign in another way
                  </button>
                  <button
                    onClick={useAnotherGoogleAccount}
                    className="w-full py-2 text-white/40 hover:text-white/70 text-xs font-semibold transition-colors"
                  >
                    Use another {providerLabel} account
                  </button>
                </div>
              </div>
            )}

            {linkStep === 'password' && (
              <div className="space-y-5">
                <div className="flex justify-center pt-2">
                  <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                    <Lock className="w-7 h-7 text-blue-400" strokeWidth={1.5}/>
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <h2 className="text-xl font-black text-white">Confirm your Filmons password</h2>
                  <p className="text-white/50 text-sm">{linkPrompt.email}</p>
                </div>
                <div className="space-y-2">
                  <input
                    type="password" autoFocus value={linkPassword}
                    onChange={e => { setLinkPassword(e.target.value); setLinkError(''); }}
                    onKeyDown={e => e.key === 'Enter' && confirmAndConnect()}
                    placeholder="Password"
                    className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all"
                  />
                  {linkError && <p className="text-red-400 text-xs text-center">{linkError}</p>}
                </div>
                <div className="space-y-3">
                  <button
                    onClick={confirmAndConnect} disabled={!linkPassword || linking}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 transition-all active:scale-[0.98] shadow-lg shadow-blue-900/30"
                  >
                    {linking ? 'Connecting…' : `Confirm & Connect ${providerLabel}`}
                  </button>
                  <button
                    onClick={() => { setLinkStep('prompt'); setLinkPassword(''); setLinkError(''); }}
                    className="w-full py-2 text-white/40 hover:text-white/70 text-xs font-semibold transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {linkStep === 'success' && (
              <div className="space-y-5">
                <div className="flex justify-center pt-2">
                  <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                    <Link2 className="w-7 h-7 text-green-400" strokeWidth={1.5}/>
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-black text-white">{providerLabel} account connected</h2>
                  <p className="text-white/55 text-sm leading-relaxed">
                    You can now sign in to Filmons using your email/password or {providerLabel}.
                  </p>
                </div>
                <button
                  onClick={continueAfterLink}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-900/30"
                >
                  Continue to Filmons
                </button>
              </div>
            )}
          </div>
        </div>
      </AuthScreenLayout>
    );
  }

  // ── Wrong Google account selected ────────────────────────────────────────
  if (wrongAccount) {
    return (
      <AuthScreenLayout>
        <CinematicBg/>
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 gap-5 px-6 text-center">
          <FilmonsLogo iconSize={32} theme="dark"/>
          <div className="space-y-2 max-w-xs">
            <p className="text-white font-bold text-base">You selected a different Google account</p>
            <p className="text-white/60 text-sm leading-relaxed">
              Please continue with the Google account associated with{' '}
              <span className="text-white/85 font-semibold">{maskEmail(wrongAccount.expected)}</span>.
            </p>
          </div>
          <button
            onClick={() => retryWithSelectAccount(wrongAccount.expected)}
            className="w-full max-w-xs py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl transition-all active:scale-[0.98]"
          >
            Choose Another Google Account
          </button>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="text-white/40 hover:text-white/70 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </AuthScreenLayout>
    );
  }

  // ── Error screen ─────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <AuthScreenLayout>
        <CinematicBg/>
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 gap-5 px-6">
          <FilmonsLogo iconSize={32} theme="dark"/>
          <p className="text-white/60 text-sm text-center max-w-xs">{loadError}</p>
          <button
            onClick={() => navigate('/login')}
            className="text-blue-400 text-sm font-semibold hover:underline"
          >
            Back to sign in
          </button>
        </div>
      </AuthScreenLayout>
    );
  }

  // ── Loading screen ────────────────────────────────────────────────────────
  return (
    <AuthScreenLayout className="items-center justify-center gap-5 bg-gray-950">
      <FilmonsLogo iconSize={32} theme="dark"/>
      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"/>
      <p className="text-white/40 text-sm">Signing you in…</p>
    </AuthScreenLayout>
  );
}
