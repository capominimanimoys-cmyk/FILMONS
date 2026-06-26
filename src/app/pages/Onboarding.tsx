/**
 * Onboarding — 9-step profile setup for new users (OAuth + phone + email).
 * When navigated with state.showReminder=true (from Root guard), shows a
 * "Finish setting up your account" screen before jumping to the first incomplete step.
 * Steps 1–8 collect data; step 9 saves everything and navigates to /.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  ArrowLeft, Check, Loader2, AtSign, Camera,
  CheckCircle, Upload, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { FilmonsLogo } from '../components/FilmonsLogo';
import { SmartAddressInput } from '../components/SmartAddressInput';
import { ProfessionPicker } from '../components/ProfessionPicker';

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type AccType = 'creator' | 'professional' | 'creator_plus';

const ACCOUNT_TYPES: { value: AccType; label: string; description: string }[] = [
  { value: 'creator',      label: 'Creator', description: 'Share your work and build an audience' },
  { value: 'professional', label: 'Client',  description: 'Hire talent and manage projects' },
  { value: 'creator_plus', label: 'Both',    description: 'Create content, hire, and collaborate' },
];

const TOOLS = [
  'Cinema Camera', 'DSLR / Mirrorless', 'Drone', 'Gimbal / Steadicam',
  'Lighting Rig', 'Audio Equipment', 'Recording Studio', 'Green Screen',
  'Editing Suite', 'Color Grading Suite', '3D Workstation', 'VR / AR Equipment',
  'Teleprompter', 'AI Tools',
];

const COUNTRY_OPTIONS = [
  { label: '🇨🇦 Canada',        code: 'CA' as const },
  { label: '🇺🇸 United States', code: 'US' as const },
];

// Province codes that belong to Canada (used to detect country from stored province)
const CA_PROVINCE_CODES = new Set(['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT']);

const TOTAL_STEPS = 8;

function calcProgress(u: ReturnType<typeof useAuth>['user']): number {
  if (!u) return 0;
  let pct = 0;
  if (u.username)     pct += 20;
  if (u.city)         pct += 20;
  if (u.primaryRole)  pct += 20;
  if (u.bio)          pct += 20;
  if (u.avatar)       pct += 20;
  return pct;
}

function firstIncompleteStep(u: ReturnType<typeof useAuth>['user']): Step {
  if (!u?.username)    return 1;
  if (!u?.city)        return 2;
  if (!u?.primaryRole) return 3;
  return 4;
}

export function CompleteProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, updateUser, isAuthenticated, logout } = useAuth();

  // Show reminder screen when redirected from Root guard
  const [showReminder, setShowReminder] = useState(
    !!(location.state as any)?.showReminder
  );

  const [step, setStep]       = useState<Step>(1);
  const [mounted, setMounted] = useState(false);

  // Step 1 — Account Type + Username
  const [accountType, setAccountType]             = useState<AccType>('creator');
  const [username, setUsername]                   = useState('');
  const [usernameChecking, setUsernameChecking]   = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  // Step 2 — Location
  const [countryCode, setCountryCode] = useState<'CA' | 'US' | ''>('');
  const [city, setCity]               = useState('');
  const [province, setProvince]       = useState('');

  // Step 3+4 — Roles (via ProfessionPicker)
  const [primaryRole, setPrimaryRole]       = useState('');
  const [secondaryRoles, setSecondaryRoles] = useState<string[]>([]);

  // Step 5 — Tools
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  // Step 6 — Profile Photo
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  // Step 7 — Bio
  const [bio, setBio] = useState('');

  // Step 8 — Links
  const [instagram, setInstagram] = useState('');
  const [tiktok,    setTiktok]    = useState('');
  const [youtube,   setYoutube]   = useState('');
  const [vimeo,     setVimeo]     = useState('');
  const [linkedin,  setLinkedin]  = useState('');
  const [website,   setWebsite]   = useState('');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login', { replace: true }); return; }
    if (user) {
      // Pre-fill username: use existing or generate suggestion from name
      if (user.username) {
        setUsername(user.username);
      } else if (user.name) {
        const suggested = user.name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._]/g, '');
        setUsername(suggested.slice(0, 24));
      }
      if (user.avatar)      setPhotoPreview(user.avatar);
      if (user.bio)         setBio(user.bio);
      if (user.primaryRole) setPrimaryRole(user.primaryRole);
      // Pre-fill location if returning user
      if (user.city)     setCity(user.city);
      if (user.province) {
        setProvince(user.province);
        setCountryCode(CA_PROVINCE_CODES.has(user.province.toUpperCase()) ? 'CA' : 'US');
      }
    }
    setTimeout(() => setMounted(true), 80);
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced username availability check
  useEffect(() => {
    if (username.length < 3) { setUsernameAvailable(null); return; }
    setUsernameChecking(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username.toLowerCase())
        .maybeSingle();
      setUsernameAvailable(!data || data.id === user?.id);
      setUsernameChecking(false);
    }, 400);
    return () => clearTimeout(t);
  }, [username, user?.id]);

  const usernameError =
    username.length > 0 && username.length < 3 ? 'At least 3 characters' :
    username.length > 0 && !/^[a-z0-9_.]+$/i.test(username) ? 'Letters, numbers, _ and . only' :
    usernameAvailable === false ? 'Username taken' : null;

  const canStep1 = username.length >= 3 && usernameAvailable === true && !usernameError;
  const canStep2 = countryCode.length > 0 && city.length >= 2;
  const canStep3 = primaryRole.length > 0;

  function toggleTool(t: string) {
    setSelectedTools(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return; }
    setNewPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  const next = () => setStep(s => Math.min(9, s + 1) as Step);
  const back = () => setStep(s => Math.max(1, s - 1) as Step);

  async function handleComplete() {
    if (!user) return;
    setSaving(true);
    try {
      let finalAvatarUrl = user.avatar || null;

      if (newPhotoFile) {
        const ext = (newPhotoFile.name.split('.').pop() || 'jpg').toLowerCase();
        const filePath = `avatars/${user.id}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(filePath, newPhotoFile, { upsert: true });
        if (!uploadErr) {
          const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
          finalAvatarUrl = data.publicUrl;
        }
      }

      const { data: existingProfile } = await supabase
        .from('profiles').select('profile_meta').eq('id', user.id).maybeSingle();
      const existingMeta: Record<string, unknown> = existingProfile?.profile_meta
        ? (typeof existingProfile.profile_meta === 'string'
          ? JSON.parse(existingProfile.profile_meta)
          : existingProfile.profile_meta)
        : {};

      const mergedMeta = {
        ...existingMeta,
        tools: selectedTools,
        links: { instagram, tiktok, youtube, vimeo, linkedin, website },
        onboarding_completed: true,
      };

      const { projectId, publicAnonKey } = await import('/utils/supabase/info');
      const restUrl = `https://${projectId}.supabase.co/rest/v1/profiles?id=eq.${user.id}`;

      const payload: Record<string, unknown> = {
        username:                 username.toLowerCase(),
        account_type:             accountType,
        account_mode:             accountType,
        location:                 [city, province, countryCode === 'CA' ? 'Canada' : 'United States'].filter(Boolean).join(', '),
        city:                     city || null,
        province:                 province || null,
        primary_role:             primaryRole || null,
        secondary_roles:          secondaryRoles,
        bio:                      bio || null,
        profile_setup_percentage: 100,
        profile_meta:             mergedMeta,
        updated_at:               new Date().toISOString(),
      };
      if (finalAvatarUrl) {
        payload.avatar_url = finalAvatarUrl;
        payload.avatar     = finalAvatarUrl;
      }

      const res = await fetch(restUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        publicAnonKey,
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || 'Failed to save profile');
      }

      await updateUser({
        username:             username.toLowerCase(),
        accountType:          accountType as any,
        city:                 city || undefined,
        province:             province || undefined,
        primaryRole:          primaryRole || undefined,
        profileSetupCompleted: true,
        ...(finalAvatarUrl ? { avatar: finalAvatarUrl } : {}),
        bio:                  bio || undefined,
        location:             [city, province, countryCode === 'CA' ? 'Canada' : 'United States'].filter(Boolean).join(', ') || undefined,
      } as any);

      navigate('/', { replace: true });
    } catch (e: any) {
      toast.error(e?.message || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  const pct = step < 9 ? ((step - 1) / (TOTAL_STEPS - 1)) * 100 : 100;

  // ── Reminder screen (shown when Root guard redirects here) ─────────────────
  if (showReminder) {
    const progress = calcProgress(user);
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-gray-950">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950"/>
          <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-amber-500 opacity-8 blur-[120px]"/>
          <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full bg-blue-600 opacity-10 blur-[80px]"/>
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-5 text-center">
          <FilmonsLogo iconSize={36} theme="dark" className="mb-8"/>

          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-6">
            <AlertCircle className="w-7 h-7 text-amber-400"/>
          </div>

          <h1 className="text-2xl font-black text-white mb-3 leading-tight max-w-xs">
            Finish setting up your Filmons account
          </h1>
          <p className="text-white/45 text-sm leading-relaxed mb-8 max-w-xs">
            You're almost there. Complete your profile to start connecting with the Filmons creative community.
          </p>

          {/* Progress bar */}
          <div className="w-full max-w-xs mb-8 space-y-2">
            <div className="flex justify-between text-xs text-white/40">
              <span>Profile setup</span>
              <span>{progress}% complete</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => {
              setShowReminder(false);
              setStep(firstIncompleteStep(user));
            }}
            className="w-full max-w-xs py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl mb-4 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30"
          >
            Continue setup →
          </button>
          <button
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
            className="text-white/35 text-sm hover:text-white/60 transition-colors py-2"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-gray-950">
      {/* Ambient gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950"/>
        <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-blue-600 opacity-10 blur-[100px]"/>
        <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full bg-violet-500 opacity-10 blur-[80px]"/>
      </div>

      {/* Header: back + progress bar (hidden on step 9) */}
      {step < 9 && (
        <div className={`relative z-10 flex items-center gap-3 px-4 pt-14 pb-3 transition-opacity duration-400 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <button
            onClick={() => step === 1 ? navigate(-1) : back()}
            className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4"/>
          </button>
          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}/>
          </div>
          <span className="text-[11px] text-white/25 tabular-nums shrink-0">{step}/{TOTAL_STEPS}</span>
        </div>
      )}

      {/* Scrollable content */}
      <div className={`relative z-10 flex-1 overflow-y-auto px-5 pb-12 transition-all duration-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

        {/* ══ STEP 1: Account Type + Username ═══════════════════════════════════ */}
        {step === 1 && (
          <div className="pt-4 space-y-6">
            <div className="flex justify-center pt-2 pb-1">
              <FilmonsLogo iconSize={36} theme="dark"/>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Welcome to Filmons</h2>
              <p className="text-white/40 text-sm mt-1">Let's set up your profile</p>
            </div>

            {/* Account type selector */}
            <div className="space-y-2.5">
              <p className="text-white/60 text-sm font-medium">I am a…</p>
              <div className="space-y-2">
                {ACCOUNT_TYPES.map(({ value, label, description }) => (
                  <button key={value} onClick={() => setAccountType(value)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                      accountType === value
                        ? 'bg-white/10 border-white/40'
                        : 'bg-white/4 border-white/10 hover:bg-white/7'}`}>
                    <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                      accountType === value ? 'border-white bg-white' : 'border-white/30'}`}>
                      {accountType === value && <Check className="w-3 h-3 text-gray-900 stroke-[3]"/>}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{label}</p>
                      <p className="text-xs text-white/40 mt-0.5">{description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Username */}
            <div className="space-y-2">
              <p className="text-white/60 text-sm font-medium">Choose a username</p>
              <div className="relative">
                <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"/>
                <input
                  value={username}
                  onChange={e => {
                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''));
                    setUsernameAvailable(null);
                  }}
                  placeholder="yourname"
                  maxLength={30}
                  className="w-full bg-white/8 border border-white/12 text-white placeholder-white/25 rounded-2xl pl-9 pr-10 py-3.5 text-sm outline-none focus:border-blue-400/60 transition-colors"
                />
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  {usernameChecking && <Loader2 className="w-4 h-4 text-white/30 animate-spin"/>}
                  {!usernameChecking && usernameAvailable === true  && <CheckCircle className="w-4 h-4 text-emerald-400"/>}
                  {!usernameChecking && usernameAvailable === false && <span className="text-red-400 text-sm font-bold">✕</span>}
                </div>
              </div>
              {usernameError && <p className="text-red-400 text-xs">{usernameError}</p>}
              {!usernameError && usernameAvailable === true && <p className="text-emerald-400 text-xs">Available</p>}
            </div>

            <button onClick={next} disabled={!canStep1}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              Continue →
            </button>
          </div>
        )}

        {/* ══ STEP 2: Location ══════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="pt-8 space-y-6">
            <div>
              <h2 className="text-2xl font-black text-white">Where are you based?</h2>
              <p className="text-white/40 text-sm mt-1">Helps clients and collaborators find you</p>
            </div>

            <div className="space-y-2">
              <p className="text-white/60 text-sm font-medium">Country</p>
              <div className="grid grid-cols-2 gap-2">
                {COUNTRY_OPTIONS.map(({ label, code }) => (
                  <button key={code}
                    onClick={() => { setCountryCode(code); setCity(''); setProvince(''); }}
                    className={`py-3 px-4 rounded-2xl border text-sm font-semibold transition-all active:scale-[0.98] ${countryCode === code ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/8 border-white/12 text-white/60 hover:border-white/30'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {countryCode && (
              <div className="space-y-2">
                <p className="text-white/60 text-sm font-medium">City</p>
                <SmartAddressInput
                  value={city}
                  onInputChange={setCity}
                  onAddressSelect={(_, parts) => {
                    if (parts?.city) setCity(parts.city);
                    if (parts?.province) setProvince(parts.province);
                  }}
                  mode="city"
                  countryCode={countryCode}
                  placeholder={countryCode === 'CA' ? 'Toronto, Vancouver…' : 'New York, Los Angeles…'}
                  className="w-full bg-white/8 border border-white/12 text-white placeholder-white/25 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400/60 transition-colors"
                />
              </div>
            )}

            <button onClick={next} disabled={!canStep2}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              Continue →
            </button>
          </div>
        )}

        {/* ══ STEP 3: Primary + Secondary Roles (ProfessionPicker) ═════════════ */}
        {step === 3 && (
          <div className="pt-8 space-y-6 pb-4">
            <div>
              <h2 className="text-2xl font-black text-white">What's your main role?</h2>
              <p className="text-white/40 text-sm mt-1">Search or pick the one that best describes you</p>
            </div>
            <ProfessionPicker
              primaryRole={primaryRole}
              onPrimaryChange={setPrimaryRole}
              secondaryRoles={secondaryRoles}
              onSecondaryChange={setSecondaryRoles}
              variant="dark"
            />
            <button onClick={next} disabled={!canStep3}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              Continue →
            </button>
          </div>
        )}

        {/* ══ STEP 4: Tools & Equipment ═════════════════════════════════════════ */}
        {step === 4 && (
          <div className="pt-8 space-y-6">
            <div>
              <h2 className="text-2xl font-black text-white">Tools & Equipment</h2>
              <p className="text-white/40 text-sm mt-1">What do you work with?</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {TOOLS.map(t => (
                <button key={t} onClick={() => toggleTool(t)}
                  className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all active:scale-[0.95] ${
                    selectedTools.includes(t)
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/40'
                      : 'bg-white/8 text-white/60 hover:bg-white/12 border border-white/8'}`}>
                  {t}
                </button>
              ))}
            </div>
            {selectedTools.length > 0 && (
              <p className="text-xs text-white/40">{selectedTools.length} selected</p>
            )}
            <button onClick={next}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              Continue →
            </button>
          </div>
        )}

        {/* ══ STEP 5: Profile Photo ═════════════════════════════════════════════ */}
        {step === 5 && (
          <div className="pt-8 space-y-6">
            <div>
              <h2 className="text-2xl font-black text-white">Profile photo</h2>
              <p className="text-white/40 text-sm mt-1">Add a face to your name</p>
            </div>
            <div className="flex flex-col items-center gap-5 py-4">
              <button onClick={() => fileInputRef.current?.click()} className="relative group">
                <div className="w-28 h-28 rounded-3xl overflow-hidden bg-white/10 border-2 border-white/20">
                  {photoPreview
                    ? <img src={photoPreview} alt="" className="w-full h-full object-cover"/>
                    : <div className="w-full h-full flex items-center justify-center">
                        <Camera className="w-8 h-8 text-white/30"/>
                      </div>
                  }
                </div>
                <div className="absolute inset-0 rounded-3xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Upload className="w-6 h-6 text-white"/>
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect}/>
              <button onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-semibold hover:bg-white/15 transition-colors">
                {photoPreview ? 'Change photo' : 'Upload photo'}
              </button>
            </div>
            <button onClick={next}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              {photoPreview ? 'Looks good →' : 'Continue →'}
            </button>
          </div>
        )}

        {/* ══ STEP 6: Bio ═══════════════════════════════════════════════════════ */}
        {step === 6 && (
          <div className="pt-8 space-y-6">
            <div>
              <h2 className="text-2xl font-black text-white">About you</h2>
              <p className="text-white/40 text-sm mt-1">Tell people what you do and what makes you unique</p>
            </div>
            <div className="space-y-2">
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value.slice(0, 280))}
                placeholder="Toronto-based cinematographer specializing in music videos and short films…"
                rows={5}
                className="w-full bg-white/8 border border-white/12 text-white placeholder-white/20 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400/60 transition-colors resize-none"
              />
              <p className="text-xs text-white/25 text-right">{bio.length}/280</p>
            </div>
            <button onClick={next}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              Continue →
            </button>
          </div>
        )}

        {/* ══ STEP 7: External Links ════════════════════════════════════════════ */}
        {step === 7 && (
          <div className="pt-8 space-y-6">
            <div>
              <h2 className="text-2xl font-black text-white">Connect your socials</h2>
              <p className="text-white/40 text-sm mt-1">Optional — add links to your work</p>
            </div>
            <div className="space-y-3">
              {([
                { label: 'Instagram',  placeholder: 'instagram.com/yourhandle',  value: instagram, set: setInstagram },
                { label: 'TikTok',     placeholder: 'tiktok.com/@yourhandle',    value: tiktok,    set: setTiktok    },
                { label: 'YouTube',    placeholder: 'youtube.com/@channel',      value: youtube,   set: setYoutube   },
                { label: 'Vimeo',      placeholder: 'vimeo.com/yourname',        value: vimeo,     set: setVimeo     },
                { label: 'LinkedIn',   placeholder: 'linkedin.com/in/yourname',  value: linkedin,  set: setLinkedin  },
                { label: 'Website',    placeholder: 'https://yourportfolio.com', value: website,   set: setWebsite   },
              ] as const).map(({ label, placeholder, value, set }) => (
                <div key={label} className="space-y-1">
                  <p className="text-xs font-bold text-white/35 uppercase tracking-wide">{label}</p>
                  <input
                    value={value}
                    onChange={e => set(e.target.value)}
                    placeholder={placeholder}
                    inputMode="url"
                    className="w-full bg-white/8 border border-white/12 text-white placeholder-white/18 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-400/60 transition-colors"
                  />
                </div>
              ))}
            </div>
            <button onClick={() => setStep(8)}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              Continue →
            </button>
          </div>
        )}

        {/* ══ STEP 8: Preview summary before save ══════════════════════════════ */}
        {step === 8 && (
          <div className="pt-8 space-y-6">
            <div>
              <h2 className="text-2xl font-black text-white">Review your profile</h2>
              <p className="text-white/40 text-sm mt-1">Everything looks good? Let's go.</p>
            </div>
            <div className="bg-white/6 border border-white/10 rounded-2xl p-4 space-y-3">
              {([
                `@${username}`,
                ACCOUNT_TYPES.find(a => a.value === accountType)?.label || null,
                primaryRole || null,
                [city, countryCode === 'CA' ? 'Canada' : countryCode === 'US' ? 'United States' : ''].filter(Boolean).join(', ') || null,
                bio ? `Bio added` : null,
              ] as (string | null)[]).filter(Boolean).map((val, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0"/>
                  <span className="text-sm text-white/70">{val}</span>
                </div>
              ))}
            </div>
            <button
              onClick={handleComplete}
              disabled={saving}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-black text-sm rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 disabled:opacity-60">
              {saving && <Loader2 className="w-4 h-4 animate-spin"/>}
              {saving ? 'Setting up your profile…' : 'Go to Filmons →'}
            </button>
          </div>
        )}

        {/* ══ STEP 9: Complete (legacy — kept in case of direct navigation) ════ */}
        {step === 9 && (
          <div className="pt-20 flex flex-col items-center gap-8 text-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-2xl shadow-blue-900/40">
              <CheckCircle className="w-12 h-12 text-white"/>
            </div>
            <div>
              <h2 className="text-3xl font-black text-white">Profile Complete</h2>
              <p className="text-white/50 text-sm mt-2 max-w-xs mx-auto">
                You're all set. Welcome to the Filmons creative community.
              </p>
            </div>
            <button
              onClick={handleComplete}
              disabled={saving}
              className="w-full max-w-xs py-4 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-black text-sm rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 disabled:opacity-60">
              {saving && <Loader2 className="w-4 h-4 animate-spin"/>}
              {saving ? 'Setting up your profile…' : 'Go to Filmons →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
