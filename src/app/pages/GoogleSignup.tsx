/**
 * GoogleSignup — complete a Filmons account for a user who authenticated
 * with Google but does not yet have a Filmons profile.
 *
 * Entry:  /google-signup  (redirected from OAuthCallback)
 * Guard:  must have an active Supabase auth session; if not, redirect to /login
 *
 * What this page does NOT do:
 *   - Ask the user to sign in with Google again
 *   - Ask for a password
 *   - Send an email verification code (Google already verified the email)
 *   - Create the account automatically (only on explicit "Create Account" click)
 */
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { ArrowLeft, Check, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { ProfessionPicker } from '../components/ProfessionPicker';
import { FilmonsLogo } from '../components/FilmonsLogo';
import { User } from '../types';
import { toast } from 'sonner';

// ── Constants ─────────────────────────────────────────────────────────────────

const CANADIAN_PROVINCES = [
  'Alberta','British Columbia','Manitoba','New Brunswick',
  'Newfoundland and Labrador','Northwest Territories','Nova Scotia',
  'Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon',
];

const ACCOUNT_TYPES: { id: string; label: string; description: string }[] = [
  { id: 'creator', label: 'Creator',        description: 'Film, offer services, rent gear' },
  { id: 'renter',  label: 'Client',          description: 'Hire creatives, book services'   },
  { id: 'both',    label: 'Both',            description: 'Create and hire on Filmons'       },
];

// ── Background ────────────────────────────────────────────────────────────────

function CinematicBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950"/>
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")',
        backgroundSize: '256px 256px',
      }}/>
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

// ── Main component ────────────────────────────────────────────────────────────

export function GoogleSignup() {
  const navigate          = useNavigate();
  const { completeLogin } = useAuth();

  // ── Google session data (read-only, from Supabase auth) ───────────────────
  const [authId,      setAuthId]      = useState('');
  const [googleEmail, setGoogleEmail] = useState('');
  const [googleName,  setGoogleName]  = useState('');
  const [googleAvatar,setGoogleAvatar]= useState('');
  const [sessionOk,   setSessionOk]   = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setSessionOk(false);
        return;
      }
      const u = session.user;
      setAuthId(u.id);
      setGoogleEmail(u.email?.toLowerCase() ?? '');
      setGoogleName(u.user_metadata?.full_name || u.user_metadata?.name || '');
      setGoogleAvatar(u.user_metadata?.avatar_url || u.user_metadata?.picture || '');
      setSessionOk(true);
    });
  }, []);

  // Redirect to login if no active Supabase session
  useEffect(() => {
    if (sessionOk === false) navigate('/login', { replace: true });
  }, [sessionOk, navigate]);

  // ── Required fields ────────────────────────────────────────────────────────
  const [username,       setUsername]       = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle'|'checking'|'ok'|'taken'>('idle');
  const [accountType,    setAccountType]    = useState('');   // 'creator'|'renter'|'both'
  const [country,        setCountry]        = useState('Canada');
  const [province,       setProvince]       = useState('');
  const [city,           setCity]           = useState('');
  const [primaryRole,    setPrimaryRole]    = useState('');
  const [secondaryRoles, setSecondaryRoles] = useState<string[]>([]);

  // ── Optional fields ────────────────────────────────────────────────────────
  const [showOptional, setShowOptional] = useState(false);
  const [bio,          setBio]          = useState('');
  const [website,      setWebsite]      = useState('');
  const [instagram,    setInstagram]    = useState('');
  const [youtube,      setYoutube]      = useState('');
  const [tiktok,       setTiktok]       = useState('');
  const [linkedin,     setLinkedin]     = useState('');

  const [loading, setLoading] = useState(false);

  // ── Username availability check ───────────────────────────────────────────
  useEffect(() => {
    if (username.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    const t = setTimeout(async () => {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('username', username);
      setUsernameStatus(count === 0 ? 'ok' : 'taken');
    }, 600);
    return () => clearTimeout(t);
  }, [username]);

  // ── Validation ────────────────────────────────────────────────────────────
  const canSubmit =
    usernameStatus === 'ok' &&
    accountType !== '' &&
    country.trim() !== '' &&
    province.trim() !== '' &&
    city.trim() !== '' &&
    primaryRole !== '' &&
    !loading;

  // ── Submit: create profile ────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const dbAccountType = accountType === 'both' ? 'creator' : accountType as 'creator' | 'renter';
      const locationStr   = `${city}, ${province}`;

      const profileRow: Record<string, any> = {
        id:                  authId,
        email:               googleEmail,
        name:                googleName,
        username,
        avatar_url:          googleAvatar || null,
        avatar:              googleAvatar || null,
        account_type:        dbAccountType,
        account_mode:        dbAccountType,
        primary_role:        primaryRole,
        secondary_roles:     secondaryRoles,
        bio:                 bio.trim()       || null,
        location:            locationStr,
        city,
        province,
        country,
        website:             website.trim()   || null,
        instagram:           instagram.trim() || null,
        youtube:             youtube.trim()   || null,
        tiktok:              tiktok.trim()    || null,
        linkedin:            linkedin.trim()  || null,
        is_verified:         false,
        email_verified:      true,            // Google already verified
        verification_status: 'not_started',
        profile_setup_percentage: 30,
        profile_meta: {
          provider:   'google',
          googleId:   authId,
          providers:  ['google'],
          marketplaceIntents: accountType === 'both' ? ['Offer Services','Hire Creatives'] : [],
        },
        created_at:  new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      };

      // Insert profile
      const { data: created, error: insertErr } = await supabase
        .from('profiles')
        .insert(profileRow)
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);

      // Create reputation & verification records
      await Promise.allSettled([
        supabase.from('reputation_scores').upsert(
          { user_id: authId, reliability_score: 0, reliability_level: 'new_user' },
          { onConflict: 'user_id' }
        ),
        supabase.from('account_verifications').upsert(
          { user_id: authId, identity_verified: false, payment_verified: false, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        ),
      ]);

      // Build the client User object
      const newUser: User = {
        id:                 authId,
        email:              googleEmail,
        name:               googleName,
        username,
        avatar:             googleAvatar || undefined,
        accountType:        dbAccountType as any,
        accountMode:        dbAccountType as any,
        isVerified:         false,
        verificationStatus: 'not_started',
        following:          [],
        followers:          [],
        bio:                bio.trim() || undefined,
        location:           locationStr,
        ...(created || {}),
      };

      await completeLogin(undefined, undefined, undefined, newUser);
      toast.success('Account created! Welcome to Filmons.');
      navigate('/onboarding', { replace: true });

    } catch (e: any) {
      console.error('[GoogleSignup]', e);
      toast.error(
        e?.message?.includes('unique')
          ? 'That username is already taken. Please choose another.'
          : 'Something went wrong. Please try again.'
      );
    }
    setLoading(false);
  };

  // ── Shared input style ────────────────────────────────────────────────────
  const iCls = 'w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all';

  // ── Loading / guard ───────────────────────────────────────────────────────
  if (sessionOk === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-950">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"/>
      </div>
    );
  }
  if (sessionOk === false) return null; // redirecting

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <CinematicBg/>

      {/* Header */}
      <div className="relative z-10 flex items-center px-4 pt-14 pb-4">
        <Link
          to="/login"
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4"/> Cancel
        </Link>
        <div className="flex-1 flex justify-center">
          <FilmonsLogo iconSize={26} theme="dark"/>
        </div>
        <div className="w-16"/> {/* spacer */}
      </div>

      {/* Scrollable body */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-12">

        {/* Google branding badge */}
        <div className="flex items-center justify-center gap-2.5 mb-6 mt-1">
          <div className="flex items-center gap-2 bg-white/8 border border-white/15 rounded-full px-4 py-2">
            <GoogleLogo size={16}/>
            <span className="text-white/70 text-xs font-semibold">Signing up with Google</span>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black text-white">Complete your profile</h1>
          <p className="text-white/50 text-sm mt-1">A few more details to get you started</p>
        </div>

        {/* ── Pre-filled Google data (read-only) ─────────────────────────── */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 space-y-3">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">From your Google account</p>

          <div className="flex items-center gap-3">
            {/* Avatar */}
            {googleAvatar ? (
              <img src={googleAvatar} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-white/20 shrink-0"/>
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center border-2 border-white/20 shrink-0">
                <span className="text-white text-xl font-black">{googleName?.[0]?.toUpperCase() || 'G'}</span>
              </div>
            )}
            {/* Name + Email */}
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm truncate">{googleName || 'Google User'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-white/50 text-xs truncate">{googleEmail}</p>
                <span className="shrink-0 flex items-center gap-0.5 bg-green-500/20 border border-green-500/40 rounded-full px-1.5 py-0.5">
                  <Check className="w-2.5 h-2.5 text-green-400"/>
                  <span className="text-[9px] text-green-400 font-bold">Verified</span>
                </span>
              </div>
            </div>
            <div className="shrink-0">
              <GoogleLogo size={18}/>
            </div>
          </div>

          <p className="text-[11px] text-white/25 leading-relaxed">
            Your name, email, and profile photo are provided by Google and cannot be changed here. You can update them in your profile settings later.
          </p>
        </div>

        {/* ── Required fields ────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Username */}
          <div>
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">
              Username <span className="text-red-400">*</span>
            </p>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-sm font-bold select-none">@</span>
              <input
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                placeholder="yourname"
                autoComplete="username"
                className={`${iCls} pl-8 pr-20`}
              />
              <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold transition-colors ${
                usernameStatus === 'ok'       ? 'text-green-400' :
                usernameStatus === 'taken'    ? 'text-red-400'   :
                usernameStatus === 'checking' ? 'text-white/30'  : 'text-transparent'
              }`}>
                {usernameStatus === 'ok'       ? '✓ available'  :
                 usernameStatus === 'taken'    ? '✗ taken'      :
                 usernameStatus === 'checking' ? 'checking…'    : ''}
              </span>
            </div>
            {usernameStatus === 'taken' && (
              <p className="text-red-400 text-xs mt-1.5 px-1">
                That username is taken. Try adding numbers or underscores.
              </p>
            )}
            {/* Suggestions */}
            {googleName && usernameStatus !== 'ok' && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[
                  googleName.toLowerCase().replace(/\s+/g, ''),
                  googleName.toLowerCase().split(' ')[0] + '.films',
                  googleName.toLowerCase().replace(/\s+/g, '_'),
                ].map(s => s.replace(/[^a-z0-9_.]/g, '')).filter(s => s.length >= 3).map(s => (
                  <button
                    key={s}
                    onClick={() => setUsername(s)}
                    className="text-xs bg-white/8 text-white/50 hover:text-white hover:bg-white/15 px-2.5 py-1 rounded-full border border-white/10 transition-all"
                  >
                    @{s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Account Type */}
          <div>
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">
              Account Type <span className="text-red-400">*</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ACCOUNT_TYPES.map(at => {
                const on = accountType === at.id;
                return (
                  <button
                    key={at.id}
                    onClick={() => setAccountType(at.id)}
                    className={`flex flex-col items-center gap-1 px-2 py-3 rounded-2xl border-2 text-center transition-all active:scale-95 ${
                      on ? 'bg-blue-600/20 border-blue-500' : 'bg-white/5 border-white/10 hover:border-white/25'
                    }`}
                  >
                    <span className={`text-xs font-black ${on ? 'text-white' : 'text-white/60'}`}>{at.label}</span>
                    <span className="text-[9px] text-white/30 leading-tight">{at.description}</span>
                    {on && <Check className="w-3 h-3 text-blue-400 mt-0.5"/>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location */}
          <div>
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">
              Location <span className="text-red-400">*</span>
            </p>
            <div className="space-y-2.5">
              {/* Country */}
              <input
                value={country}
                onChange={e => setCountry(e.target.value)}
                placeholder="Country"
                className={iCls}
              />
              {/* Province / State */}
              <div className="relative">
                <select
                  value={province}
                  onChange={e => setProvince(e.target.value)}
                  className={`${iCls} appearance-none pr-10 ${!province ? 'text-white/40' : ''}`}
                >
                  <option value="" className="bg-gray-900 text-white/40">Province / State</option>
                  {CANADIAN_PROVINCES.map(p => (
                    <option key={p} value={p} className="bg-gray-900 text-white">{p}</option>
                  ))}
                  <option disabled className="bg-gray-900 text-white/20">──────────</option>
                  <option value="Other" className="bg-gray-900 text-white">Other / Not Listed</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none"/>
              </div>
              {/* City */}
              <input
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="City"
                className={iCls}
              />
            </div>
          </div>

          {/* Primary Role (+ Secondary) */}
          <div>
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">
              Primary Role <span className="text-red-400">*</span>
            </p>
            <ProfessionPicker
              primaryRole={primaryRole}
              onPrimaryChange={setPrimaryRole}
              secondaryRoles={secondaryRoles}
              onSecondaryChange={setSecondaryRoles}
              variant="dark"
            />
          </div>

          {/* ── Optional fields (collapsible) ──────────────────────────── */}
          <button
            onClick={() => setShowOptional(v => !v)}
            className="w-full flex items-center justify-between py-3 border border-white/10 rounded-2xl px-4 text-white/50 hover:text-white/80 hover:border-white/20 transition-all text-sm font-semibold"
          >
            <span>Optional details — bio, social links</span>
            {showOptional ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
          </button>

          {showOptional && (
            <div className="space-y-3 -mt-2 pt-1">
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value.slice(0, 300))}
                rows={3}
                placeholder="Short bio — shown on your public profile"
                className={`${iCls} resize-none`}
              />
              <div className="flex justify-end">
                <span className="text-[10px] text-white/25">{bio.length}/300</span>
              </div>
              {[
                { label: '🌐 Website',   value: website,   set: setWebsite,   ph: 'https://yoursite.com'    },
                { label: '📸 Instagram', value: instagram, set: setInstagram, ph: '@handle or URL'          },
                { label: '▶️ YouTube',   value: youtube,   set: setYoutube,   ph: 'Channel URL or @handle'  },
                { label: '🎵 TikTok',    value: tiktok,    set: setTiktok,    ph: '@handle'                 },
                { label: '💼 LinkedIn',  value: linkedin,  set: setLinkedin,  ph: 'linkedin.com/in/...'     },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-[10px] font-black text-white/25 uppercase tracking-widest mb-1.5">{f.label}</p>
                  <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph} className={iCls}/>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Required field legend ─────────────────────────────────────── */}
        <p className="text-[10px] text-white/20 mt-4 px-1">
          <span className="text-red-400">*</span> Required field
        </p>

        {/* ── Validation summary ────────────────────────────────────────── */}
        {!canSubmit && (username || accountType || province || city || primaryRole) && (
          <div className="mt-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-[11px] font-bold text-white/50">Still needed:</p>
            {usernameStatus !== 'ok' && (
              <div className="flex items-center gap-2 text-[11px] text-white/40">
                <X className="w-3 h-3 text-red-400 shrink-0"/>
                {usernameStatus === 'taken' ? 'Choose a different username' : 'Enter a valid username (3+ characters)'}
              </div>
            )}
            {!accountType && <div className="flex items-center gap-2 text-[11px] text-white/40"><X className="w-3 h-3 text-red-400 shrink-0"/>Select an account type</div>}
            {!province    && <div className="flex items-center gap-2 text-[11px] text-white/40"><X className="w-3 h-3 text-red-400 shrink-0"/>Select a province or state</div>}
            {!city        && <div className="flex items-center gap-2 text-[11px] text-white/40"><X className="w-3 h-3 text-red-400 shrink-0"/>Enter your city</div>}
            {!primaryRole && <div className="flex items-center gap-2 text-[11px] text-white/40"><X className="w-3 h-3 text-red-400 shrink-0"/>Select a primary role</div>}
          </div>
        )}

        {/* ── Create Account button ─────────────────────────────────────── */}
        <button
          onClick={handleCreate}
          disabled={!canSubmit}
          className="mt-5 w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 transition-all active:scale-[0.98] shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin"/> Creating account…</>
            : 'Create Account'
          }
        </button>

        {/* Cancel */}
        <p className="text-center text-xs text-white/25 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-400 font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
