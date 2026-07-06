/**
 * EmailAlreadyExists — shown when a signup attempt hits a duplicate email.
 *
 * Entry: /email-already-exists?email=user@example.com[&provider=google|apple]
 *
 * Does not reveal whether an email exists outside the context of a signup
 * attempt — the user has just tried to register with this address.
 */
import { useSearchParams, useNavigate, Link } from 'react-router';
import { ArrowLeft, Mail, RefreshCw } from 'lucide-react';
import { FilmonsLogo } from '../components/FilmonsLogo';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

function Bg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-blue-950"/>
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
        backgroundSize: '256px 256px',
      }}/>
      <div className="absolute top-1/4 left-1/3 w-80 h-80 rounded-full bg-blue-600 opacity-[0.08] blur-[120px]"/>
      <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full bg-indigo-500 opacity-[0.07] blur-[90px]"/>
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

function AppleLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.39-1.32 2.76-2.53 3.99zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  );
}

export function EmailAlreadyExists() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();

  const email    = params.get('email') ?? '';
  const provider = (params.get('provider') ?? '') as 'google' | 'apple' | '';

  const handleOAuth = async (p: 'google' | 'apple') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: p,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(error.message);
  };

  const goToSignIn = () => {
    const q = email ? `?email=${encodeURIComponent(email)}` : '';
    navigate(`/login${q}`);
  };

  const goToReset = () => {
    const q = email ? `?email=${encodeURIComponent(email)}` : '';
    navigate(`/forgot-password${q}`);
  };

  const goToSignUp = () => {
    // Return to signup with name pre-filled if available, but never password
    navigate('/create-account', { state: { clearEmail: true } });
  };

  const hasProvider = provider === 'google' || provider === 'apple';
  const providerLabel = provider === 'google' ? 'Google' : provider === 'apple' ? 'Apple' : '';

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <Bg/>

      {/* Header */}
      <div className="relative z-10 pt-14 px-5 flex items-center justify-between">
        <button
          onClick={() => navigate('/create-account')}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm min-h-[44px] min-w-[44px]"
          aria-label="Back to sign up"
        >
          <ArrowLeft className="w-4 h-4"/> Back
        </button>
        <FilmonsLogo iconSize={20} theme="dark"/>
        <div className="w-16"/>
      </div>

      {/* Body */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-12">
        <div className="pt-8 max-w-sm mx-auto space-y-6">

          {/* Illustration */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
                <Mail className="w-9 h-9 text-amber-400" strokeWidth={1.5}/>
              </div>
              {/* Small badge */}
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-blue-600 border-2 border-gray-950 flex items-center justify-center">
                <span className="text-white text-[11px] font-black leading-none">!</span>
              </div>
            </div>
          </div>

          {/* Title + message */}
          <div className="text-center space-y-3">
            <h1 className="text-2xl font-black text-white leading-snug">
              {hasProvider
                ? 'You already have a Filmons account'
                : 'This email is already connected to a Filmons account'}
            </h1>

            <p className="text-white/55 text-sm leading-relaxed">
              {email
                ? <><span className="text-white/80 font-semibold select-text">{email}</span> is connected to an existing Filmons account.</>
                : 'An account already exists for this email address.'
              }
              {' '}
              {hasProvider
                ? <>Continue with {providerLabel} to sign in.</>
                : <>Sign in to continue, or reset your password if you cannot remember it.</>
              }
            </p>

            <p className="text-white/30 text-xs">
              You may have previously signed up with email, Google, or Apple.
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">

            {/* Primary: provider-specific or generic Sign In */}
            {hasProvider ? (
              <button
                onClick={() => handleOAuth(provider as 'google' | 'apple')}
                className="w-full min-h-[52px] flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-bold text-sm rounded-2xl transition-all active:scale-[0.98] shadow-lg"
                aria-label={`Continue with ${providerLabel}`}
              >
                {provider === 'google' ? <GoogleLogo size={18}/> : <AppleLogo size={18}/>}
                Continue with {providerLabel}
              </button>
            ) : (
              <button
                onClick={goToSignIn}
                className="w-full min-h-[52px] py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-900/30"
                aria-label="Sign in"
              >
                Sign In
              </button>
            )}

            {/* Secondary: Reset password */}
            <button
              onClick={goToReset}
              className="w-full min-h-[52px] py-4 bg-white/8 hover:bg-white/12 border border-white/15 text-white font-semibold text-sm rounded-2xl transition-all active:scale-[0.98]"
              aria-label="Reset password"
            >
              Reset Password
            </button>

            {/* If provider, also offer generic sign-in */}
            {hasProvider && (
              <button
                onClick={goToSignIn}
                className="w-full min-h-[52px] py-4 bg-white/5 hover:bg-white/8 border border-white/10 text-white/60 hover:text-white font-semibold text-sm rounded-2xl transition-all active:scale-[0.98]"
                aria-label="Sign in another way"
              >
                Sign in another way
              </button>
            )}

            {/* Tertiary: Use a different email — text link style */}
            <div className="pt-1 text-center">
              <button
                onClick={goToSignUp}
                className="text-sm text-white/40 hover:text-white/70 transition-colors underline underline-offset-4 decoration-white/20 hover:decoration-white/50 min-h-[44px] px-2"
                aria-label="Use a different email"
              >
                Use a Different Email
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10"/>
            <span className="text-white/20 text-xs">or</span>
            <div className="flex-1 h-px bg-white/10"/>
          </div>

          {/* Sign in with other providers */}
          <div className="space-y-2.5">
            {!hasProvider && (
              <button
                onClick={() => handleOAuth('google')}
                className="w-full min-h-[48px] flex items-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-semibold text-sm rounded-2xl px-4 py-3 transition-all active:scale-[0.98] shadow-sm"
                aria-label="Continue with Google"
              >
                <GoogleLogo size={18}/>
                <span className="flex-1 text-left">Continue with Google</span>
              </button>
            )}
            {!hasProvider && (
              <button
                onClick={() => handleOAuth('apple')}
                className="w-full min-h-[48px] flex items-center gap-3 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm rounded-2xl px-4 py-3 transition-all active:scale-[0.98]"
                aria-label="Continue with Apple"
              >
                <AppleLogo size={18}/>
                <span className="flex-1 text-left">Continue with Apple</span>
              </button>
            )}
          </div>

          <p className="text-center text-[11px] text-white/20 leading-relaxed px-4">
            If you believe this is a mistake or need help accessing your account,{' '}
            <Link to="/help" className="text-blue-400/70 hover:text-blue-400 underline">contact support</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
