/**
 * Filmons — Create Account Flow V2
 * 14-step signup: Auth → Creative Type → Personal Details → Bio → Professional →
 * Skills → Education → Gear → Location → Social Links → Collab → Portfolio →
 * Marketplace Intent → Finish
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router';
import { Eye, EyeOff, ArrowLeft, Check, SkipForward, Camera, Phone, Search, X, Plus, Loader2, Film, Video, User, Gamepad2, Star, Scissors, Music2, Palette, Building2, Package, Layers, Briefcase, Sparkles, ShoppingBag, Users, Wrench, ShoppingCart} from 'lucide-react';
import { SmartAddressInput } from '../components/SmartAddressInput';
import { ProfessionPicker } from '../components/ProfessionPicker';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { supabase } from '../../lib/supabase';
import { EMAILJS_CONFIG, sendEmail } from '../lib/emailjs-config';
import { authApi } from '../lib/api';
import { toast } from 'sonner';
import { FilmonsLogo } from '../components/FilmonsLogo';

type Step = 1|2|3|4|5|6|7|8|9|10|11|12|13|14;
const TOTAL = 14;

// ── Constants ─────────────────────────────────────────────────────────────────

type LucideIcon = React.ComponentType<{ className?: string }>;
const CREATIVE_TYPES: { icon: LucideIcon; label: string }[] = [
  { icon: Film,      label:'Filmmaker'              },
  { icon: Video,     label:'Videographer'           },
  { icon: Camera,    label:'Photographer'           },
  { icon: User,      label:'Model'                  },
  { icon: Gamepad2,  label:'Gamer / Streamer'       },
  { icon: Star,      label:'Actor'                  },
  { icon: Scissors,  label:'Editor'                 },
  { icon: Music2,    label:'Music / Audio Creator'  },
  { icon: Palette,   label:'Designer'               },
  { icon: Building2, label:'Production Company'     },
  { icon: Package,   label:'Equipment Owner'        },
  { icon: Layers,    label:'Studio Owner'           },
  { icon: Briefcase, label:'Client / Hirer'         },
  { icon: Sparkles,  label:'Other Creative'         },
];

const LANGUAGES = [
  'English','French','Spanish','Arabic','Mandarin','Cantonese',
  'Punjabi','Portuguese','Italian','German','Hindi','Tagalog',
  'Korean','Japanese','Russian','Swahili','Somali','Amharic',
];


const ALL_SKILLS = [
  'Adobe Premiere','Final Cut Pro','DaVinci Resolve','After Effects','Photoshop',
  'Lightroom','Logic Pro','Ableton','FL Studio','Pro Tools',
  'Blender','Unreal Engine','Cinema 4D','Figma','Canva',
  'Instagram Reels','TikTok Editing','YouTube Content','Drone FPV',
  'Color Grading','Live Streaming','Podcast Editing','Voice Acting',
  'Screenwriting','Storyboarding','Cinematography','Directing','Lighting',
  'Sound Design','Music Production','Video Editing','Photo Retouching',
  'Motion Graphics','3D Animation','Character Design','Brand Design',
];

const EXP_LEVELS = ['Beginner','Intermediate','Professional','Expert'];

const DEGREE_OPTIONS = [
  "Bachelor's Degree","Master's Degree","Diploma","Certificate",
  "Associate Degree","Honours Degree","Doctorate / PhD","Professional Certification",
  "Vocational Training","High School Diploma","Self-taught",
];

const SIGNUP_SCHOOLS = [
  'Vancouver Film School','Toronto Film School','Canadian Film Centre',
  'Ryerson University – Film','York University – Film','Concordia University – Cinema',
  'Capilano University – Film','Humber College – Film & Media',
  'OCAD University','Emily Carr University of Art + Design','NSCAD University',
  'Alberta University of the Arts','George Brown College – Design',
  'Royal Conservatory of Music','Schulich School of Music – McGill',
  'National Theatre School of Canada','Studio 58 – Langara College',
  'University of Toronto','University of British Columbia','McGill University',
  'University of Alberta','Simon Fraser University','York University',
  'Concordia University','Toronto Metropolitan University','University of Waterloo',
  'Queen\'s University','Western University','University of Ottawa','Carleton University',
  'University of Victoria','University of Calgary','University of Manitoba',
  'University of Saskatchewan','Dalhousie University','Memorial University',
  'Humber College','Seneca College','George Brown College','Sheridan College',
  'Algonquin College','Fanshawe College','Mohawk College','Durham College',
  'BCIT','Langara College','Capilano University','Vancouver Community College',
  'NAIT','SAIT','Red River College Polytechnic','Saskatchewan Polytechnic',
  'NSCC','Athabasca University','Royal Roads University',
];


const COLLAB_AVAILABILITY = [
  '💼 Available for Hire','🤝 Available for Collaborations','🔧 Available for Freelance',
  '⏰ Full-Time Opportunities','🌐 Remote Projects','✈️ Available for Travel',
];

const COLLAB_PROJECT_TYPES = [
  'Film','Commercial','Music Video','Gaming','Photography',
  'Modeling','Design','Content Creation','Podcast','Brand Work',
];

const MARKETPLACE_INTENTS: { icon: LucideIcon; label: string }[] = [
  { icon: ShoppingBag,  label:'Offer Services'      },
  { icon: Package,      label:'Rent Equipment'      },
  { icon: Building2,    label:'Rent Studio Space'   },
  { icon: Briefcase,    label:'Get Hired'           },
  { icon: Users,        label:'Hire Creatives'      },
  { icon: Search,       label:'Find Equipment'      },
  { icon: Wrench,       label:'Find Services'       },
  { icon: Star,         label:'Book Talent'         },
  { icon: ShoppingCart, label:'Explore Marketplace' },
];

const GEAR_SUGGESTIONS = [
  'Sony FX3','Sony FX6','Canon R5','Canon C70','Blackmagic Pocket 6K','DJI Mavic 3',
  'DJI Ronin-S','DJI RS3 Pro','Rhodes Wireless','Sennheiser MKH416',
  'Aputure 600d','Godox SL200','MacBook Pro','iPad Pro',
];

// ── Helper components ─────────────────────────────────────────────────────────

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


function CinematicBg() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950"/>
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage:'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")', backgroundSize:'256px 256px' }}/>
      <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-blue-600 opacity-10 blur-[100px]"/>
      <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full bg-purple-500 opacity-10 blur-[80px]"/>
      <style>{`@keyframes float { from { transform:translateY(0) } to { transform:translateY(-16px) } }`}</style>
    </div>
  );
}

function PwStrength({ pw }: { pw: string }) {
  const checks = [
    { label:'8+ characters',    ok: pw.length >= 8             },
    { label:'Uppercase letter', ok: /[A-Z]/.test(pw)          },
    { label:'Number',           ok: /[0-9]/.test(pw)          },
    { label:'Special char',     ok: /[^A-Za-z0-9]/.test(pw)  },
  ];
  if (!pw) return null;
  return (
    <div className="grid grid-cols-2 gap-1 mt-2">
      {checks.map(c => (
        <div key={c.label} className={`flex items-center gap-1.5 text-[11px] ${c.ok ? 'text-green-400' : 'text-white/30'}`}>
          <Check className={`w-3 h-3 shrink-0 ${c.ok ? 'opacity-100' : 'opacity-20'}`}/>{c.label}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CreateAccount() {
  const navigate = useNavigate();
  const { updateUser, completeLogin } = useAuth() as any;

  const [step, setStep]       = useState<Step>(1);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  // ── Step 1: Auth ──────────────────────────────────────────────────────────
  const [uid,      setUid]      = useState<string | null>(null);
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [agreed,   setAgreed]   = useState(false);
  const [showPw,   setShowPw]   = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  // ── Step 2: Creative Type ─────────────────────────────────────────────────
  const [creativeTypes, setCreativeTypes] = useState<string[]>([]);

  // ── Step 3: Personal Details ──────────────────────────────────────────────
  const [displayName, setDisplayName] = useState('');
  const [username,    setUsername]    = useState('');
  const [usernameOk,  setUsernameOk]  = useState<boolean | null>(null);
  const [avatar,      setAvatar]      = useState('');
  const [languages,   setLanguages]   = useState<string[]>([]);
  const [langLevels,  setLangLevels]  = useState<Record<string, string>>({});
  const PROFICIENCY = ['Native', 'Fluent', 'Professional', 'Conversational', 'Basic'];
  const toggleLang = (l: string) => {
    if (languages.includes(l)) {
      setLanguages(p => p.filter(x => x !== l));
      setLangLevels(p => { const n = { ...p }; delete n[l]; return n; });
    } else {
      setLanguages(p => [...p, l]);
      setLangLevels(p => ({ ...p, [l]: 'Conversational' }));
    }
  };

  useEffect(() => { if (name && !displayName) setDisplayName(name); }, [name]); // eslint-disable-line
  useEffect(() => {
    if (username.length < 3) { setUsernameOk(null); return; }
    const t = setTimeout(async () => {
      const { count } = await supabase.from('profiles').select('id', { count:'exact' }).eq('username', username);
      setUsernameOk(count === 0);
    }, 600);
    return () => clearTimeout(t);
  }, [username]);

  const handleAvatarChange = async (file: File) => {
    if (!uid) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      try {
        const url = await authApi.uploadPhoto(uid, 'avatar', dataUrl);
        setAvatar(url);
        await supabase.from('profiles').update({ avatar_url: url }).eq('id', uid);
        toast.success('Profile photo updated');
      } catch { toast.error('Photo upload failed'); }
    };
    reader.readAsDataURL(file);
  };

  // ── Step 4: Bio ───────────────────────────────────────────────────────────
  const [bio, setBio] = useState('');

  // ── Step 5: Professional Identity ────────────────────────────────────────
  const [primaryRole,    setPrimaryRole]    = useState('');
  const [secondaryRoles, setSecondaryRoles] = useState<string[]>([]);
  const [expLevel,       setExpLevel]       = useState('');
  const [yearsExp,       setYearsExp]       = useState('');

  // ── Step 6: Skills ────────────────────────────────────────────────────────
  const [skills, setSkills] = useState<string[]>([]);

  // ── Step 7: Education ─────────────────────────────────────────────────────
  interface EduRow { id:string; school:string; degree:string; field:string; startYear:string; endYear:string; current:boolean; }
  const [eduEntries,  setEduEntries]  = useState<EduRow[]>([]);
  const [addingEdu,   setAddingEdu]   = useState(false);
  const [newEdu,      setNewEdu]      = useState<EduRow>({ id:'', school:'', degree:'', field:'', startYear:'', endYear:'', current:false });
  const [schoolQ,     setSchoolQ]     = useState('');
  const [schoolSugg,  setSchoolSugg]  = useState<string[]>([]);
  const schoolWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (schoolWrapRef.current && !schoolWrapRef.current.contains(e.target as Node)) setSchoolSugg([]); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  const onSchoolInput = (v: string) => {
    setSchoolQ(v); setNewEdu(p => ({...p, school: v}));
    setSchoolSugg(v.length > 1 ? SIGNUP_SCHOOLS.filter(s => s.toLowerCase().includes(v.toLowerCase())).slice(0, 7) : []);
  };
  const pickSchool = (s: string) => { setSchoolQ(s); setNewEdu(p => ({...p, school:s})); setSchoolSugg([]); };
  const addEdu = () => {
    if (!newEdu.school.trim()) return;
    setEduEntries(p => [...p, { ...newEdu, id: Math.random().toString(36).slice(2) }]);
    setNewEdu({ id:'', school:'', degree:'', field:'', startYear:'', endYear:'', current:false });
    setSchoolQ(''); setAddingEdu(false);
  };

  // ── Step 8: Gear ──────────────────────────────────────────────────────────
  const [gear, setGear]           = useState<string[]>([]);
  const [gearInput, setGearInput] = useState('');
  const addGear = () => { const t = gearInput.trim(); if (t && !gear.includes(t)) { setGear(p => [...p, t]); setGearInput(''); } };

  // ── Step 9: Location ─────────────────────────────────────────────────────
  const [location,         setLocation]         = useState('');
  const [locationParts,    setLocationParts]    = useState({ city: '', province: '', postalCode: '', streetAddress: '', country: 'Canada' });
  const [availableTravel,  setAvailableTravel]  = useState(false);
  const [availableRemote,  setAvailableRemote]  = useState(false);

  // ── Step 10: Social Links ─────────────────────────────────────────────────
  const [website,   setWebsite]   = useState('');
  const [instagram, setInstagram] = useState('');
  const [youtube,   setYoutube]   = useState('');
  const [tiktok,    setTiktok]    = useState('');
  const [vimeo,     setVimeo]     = useState('');

  // ── Step 11: Collaboration ────────────────────────────────────────────────
  const [collab, setCollab] = useState<string[]>([]);

  // ── Step 13: Marketplace Intent ───────────────────────────────────────────
  const [marketplaceIntent, setMarketplaceIntent] = useState<string[]>([]);

  // ── OAuth (Google / Apple) ────────────────────────────────────────────────
  const handleOAuth = async (provider: 'google' | 'apple') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(error.message);
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const SKIPPABLE: Step[] = [7, 8, 10, 11, 12];
  const back = () => setStep(s => Math.max(1, s - 1) as Step);
  const next = () => setStep(s => Math.min(14, s + 1) as Step);
  const pct  = ((step - 1) / (TOTAL - 1)) * 100;

  // ── Validation ────────────────────────────────────────────────────────────
  const pwValid   = password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
  const step1Ok   = name.length >= 2 && email.includes('@') && pwValid && password === confirm && agreed;
  const step3Ok   = displayName.length >= 2 && username.length >= 3 && usernameOk === true;

  // ── Auth: create account ─────────────────────────────────────────────────
  const verifyAndCreate = async () => {
    setOtpLoading(true);
    try {
      let newUid: string | undefined;

      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email, password,
        options: { data: { name }, emailRedirectTo: window.location.origin },
      });

      if (authErr) {
        console.error('[signUp] error:', authErr);
        // If user already exists, sign them in and reuse their UID
        if (authErr.message.toLowerCase().includes('already registered') ||
            authErr.message.toLowerCase().includes('already exists') ||
            authErr.code === 'user_already_exists') {
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) throw new Error(signInErr.message);
          newUid = signInData.user?.id;
        } else {
          throw new Error(authErr.message);
        }
      } else {
        newUid = authData.user?.id;
        if (!authData.session) {
          // signUp returned no session — Supabase email confirmation is enabled.
          // Try signing in; if it fails the account needs email confirmation first.
          const { error: siErr } = await supabase.auth.signInWithPassword({ email, password });
          if (siErr) {
            // Create the profile row so it exists when they confirm and sign in.
            await supabase.from('profiles').upsert({
              id: newUid, email, name,
              account_type: 'creator', account_mode: 'creator',
              is_verified: false, verification_status: 'not_started',
              created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }, { onConflict: 'id' }).catch(() => {});
            toast.info(
              'Account created! Check your inbox for a confirmation email and click the link, then sign in to continue.',
              { duration: 12_000 }
            );
            navigate('/login', { replace: true });
            setOtpLoading(false);
            return;
          }
        }
      }

      if (!newUid) throw new Error('Account creation failed — no user ID returned');

      const profileResult = await supabase.from('profiles').upsert({
        id: newUid, email, name,
        account_type: 'creator', account_mode: 'creator',
        is_verified: false, verification_status: 'not_started',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (profileResult.error) console.error('[profiles upsert]', profileResult.error);

      const repResult = await supabase.from('reputation_scores').upsert(
        { user_id: newUid, reliability_score: 0, reliability_level: 'new_user' },
        { onConflict: 'user_id' }
      );
      if (repResult.error) console.error('[reputation_scores upsert]', repResult.error);

      const verResult = await supabase.from('account_verifications').upsert(
        { user_id: newUid, identity_verified: false, payment_verified: false, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      if (verResult.error) console.error('[account_verifications upsert]', verResult.error);

      setUid(newUid);
      // Send welcome email (fire-and-forget — don't block on result)
      sendEmail(EMAILJS_CONFIG.templates.welcome, {
        to_email: email,
        to_name:  name || email.split('@')[0],
        user_name: name || email.split('@')[0],
        user_email: email,
        site_url: window.location.origin,
      }).catch(() => {});
      await completeLogin(undefined, undefined, undefined, {
        id: newUid, email, name,
        accountType: 'creator', accountMode: 'creator',
        isVerified: false, verificationStatus: 'not_started',
        following: [], followers: [],
      });
      navigate('/onboarding', { replace: true });
    } catch (e: unknown) {
      console.error('[verifyAndCreate]', e);
      toast.error(e instanceof Error ? e.message : 'Account creation failed');
    }
    setOtpLoading(false);
  };

  // ── Final save ────────────────────────────────────────────────────────────
  const finish = async () => {
    if (!uid) { next(); return; }
    setLoading(true);
    try {
      await supabase.from('profiles').upsert({
        id:              uid,
        name:            displayName || name,
        username:        username   || null,
        bio:             bio        || null,
        location:        locationParts.city && locationParts.province
                           ? `${locationParts.city}, ${locationParts.province}`
                           : location || null,
        city:            locationParts.city     || null,
        province:        locationParts.province || null,
        postal_code:     locationParts.postalCode || null,
        website:         website    || null,
        instagram:       instagram  || null,
        youtube:         youtube    || null,
        tiktok:          tiktok     || null,
        vimeo:           vimeo      || null,
        primary_role:    primaryRole || null,
        secondary_roles: secondaryRoles,
        skills,
        gear,
        collab_prefs:    collab,
        years_exp:       yearsExp ? parseInt(yearsExp) : null,
        education:       { entries: eduEntries, training: [] },
        profile_meta: {
          creativeTypes,
          languages: languages.map(l => ({ lang: l, level: langLevels[l] || 'Conversational' })),
          expLevel,
          marketplaceIntent,
          availableTravel,
          availableRemote,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (typeof updateUser === 'function') {
        updateUser({ id: uid, email, name: displayName || name, username, accountType: 'creator' as any });
      }
      next(); // → step 14
    } catch(e: any) {
      toast.error(e?.message || 'Failed to save profile');
    }
    setLoading(false);
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const iCls = "w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all";
  const tagCls = (on: boolean) => `text-xs px-3 py-1.5 rounded-full border font-semibold transition-all active:scale-95 ${on ? 'bg-blue-600 text-white border-blue-500' : 'bg-white/5 text-white/60 border-white/10 hover:border-blue-400/60'}`;
  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <CinematicBg/>

      {/* Header — progress bar */}
      <div className="relative z-10 flex items-center gap-3 px-4 pt-14 pb-3">
        {step > 1 && step < 14 ? (
          <button onClick={back} className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white shrink-0">
            <ArrowLeft className="w-4 h-4"/>
          </button>
        ) : step === 1 ? (
          <button onClick={() => { captureSnapshot(); navigate('/login'); }}
            className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white shrink-0">
            <ArrowLeft className="w-4 h-4"/>
          </button>
        ) : <div className="w-8"/>}

        <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width:`${pct}%` }}/>
        </div>

        {SKIPPABLE.includes(step) ? (
          <button onClick={next} className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 shrink-0">
            Skip <SkipForward className="w-3 h-3"/>
          </button>
        ) : (
          <span className="text-xs text-white/30 shrink-0 w-12 text-right">{step}/{TOTAL}</span>
        )}
      </div>

      {/* Scrollable content */}
      <div className={`relative z-10 flex-1 overflow-y-auto px-5 pb-10 transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

        {/* ── STEP 1: Create Account ──────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col min-h-full justify-between py-4">
            <div className="space-y-6">
              <div className="text-center pt-6 pb-2">
                <div className="flex justify-center mb-5"><FilmonsLogo iconSize={40} theme="dark"/></div>
                <h1 className="text-2xl font-black text-white">Join Filmons</h1>
                <p className="text-white/50 text-sm mt-1">Create your creative account</p>
              </div>

              {/* OAuth */}
              <div className="space-y-2.5">
                <button onClick={() => handleOAuth('google')}
                  className="w-full flex items-center gap-3 bg-white hover:bg-gray-50 border border-white/80 text-gray-800 font-semibold text-sm rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-all">
                  <GoogleLogo size={18}/><span className="flex-1 text-left">Continue with Google</span>
                </button>
                <button onClick={() => { captureSnapshot(); navigate('/phone-signup'); }}
                  className="w-full flex items-center gap-3 bg-white/8 hover:bg-white/12 border border-white/15 text-white font-semibold text-sm rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-all">
                  <Phone className="w-4 h-4 text-white/60"/><span className="flex-1 text-left">Continue with Phone</span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10"/><span className="text-xs text-white/30">or email</span><div className="flex-1 h-px bg-white/10"/>
              </div>

              {/* Email form */}
              <div className="space-y-3">
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Full name" autoComplete="name" className={iCls}/>
                <input value={email} onChange={e => setEmail(e.target.value)}
                  type="email" placeholder="Email address" autoComplete="email" className={iCls}/>
                <div className="relative">
                  <input value={password} onChange={e => setPassword(e.target.value)}
                    type={showPw ? 'text':'password'} placeholder="Password" autoComplete="new-password"
                    className={iCls + ' pr-12'}/>
                  <button onClick={() => setShowPw(p => !p)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80">
                    {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                  </button>
                </div>
                <PwStrength pw={password}/>
                <input value={confirm} onChange={e => setConfirm(e.target.value)}
                  type="password" placeholder="Confirm password" autoComplete="new-password"
                  className={iCls + (confirm && confirm !== password ? ' border-red-400/60' : '')}/>
                {confirm && confirm !== password && <p className="text-red-400 text-xs px-1">Passwords don't match</p>}

                {/* Terms */}
                <label className="flex items-start gap-3 cursor-pointer pt-1">
                  <div onClick={() => setAgreed(p => !p)}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${agreed ? 'bg-blue-600 border-blue-600' : 'border-white/30'}`}>
                    {agreed && <Check className="w-3 h-3 text-white"/>}
                  </div>
                  <span className="text-xs text-white/50 leading-relaxed">
                    I agree to Filmons'{' '}
                    <button className="text-blue-400 hover:underline">Terms of Service</button>{' '}and{' '}
                    <button className="text-blue-400 hover:underline">Privacy Policy</button>.
                    <br/><span className="text-white/30">Email is used for login only and is never shown publicly.</span>
                  </span>
                </label>
              </div>

              <button onClick={verifyAndCreate} disabled={!step1Ok || otpLoading}
                className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
                {otpLoading
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>Creating account…</span>
                  : 'Create Account'}
              </button>
            </div>

            <p className="text-center text-xs text-white/30 pt-6">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-400 font-semibold">Sign in</Link>
            </p>
          </div>
        )}

        {/* ── STEP 2: Creative Type ───────────────────────────────────── */}
        {step === 2 && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-black text-white">What best describes you?</h2>
              <p className="text-white/50 text-sm mt-1">Select all that apply — you can update this anytime</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {CREATIVE_TYPES.map(t => {
                const on = creativeTypes.includes(t.label);
                return (
                  <button key={t.label} onClick={() => toggle(creativeTypes, t.label, setCreativeTypes)}
                    className={`flex items-center gap-2.5 px-3.5 py-3 rounded-2xl border-2 text-left transition-all active:scale-95 ${on ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30'}`}>
                    {(() => { const Icon = t.icon; return <Icon className="w-5 h-5 shrink-0"/>; })()}
                    <span className="text-xs font-semibold leading-tight">{t.label}</span>
                    {on && <Check className="w-3.5 h-3.5 text-blue-400 ml-auto shrink-0"/>}
                  </button>
                );
              })}
            </div>
            <button onClick={next} disabled={creativeTypes.length === 0}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/30">
              Continue{creativeTypes.length > 0 ? ` (${creativeTypes.length} selected)` : ''}
            </button>
          </div>
        )}

        {/* ── STEP 3: Personal Details ────────────────────────────────── */}
        {step === 3 && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-black text-white">Personal details</h2>
              <p className="text-white/50 text-sm mt-1">Your public creative identity</p>
            </div>

            {/* Avatar upload */}
            <div className="flex flex-col items-center gap-2">
              <label className="cursor-pointer">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-dashed border-white/20 bg-white/10 flex flex-col items-center justify-center gap-1 hover:border-blue-400 transition-colors relative">
                  {avatar
                    ? <img src={avatar} className="w-full h-full object-cover" alt=""/>
                    : <><Camera className="w-6 h-6 text-white/40"/><p className="text-[10px] text-white/40">Add photo</p></>
                  }
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleAvatarChange(e.target.files[0]); }}/>
              </label>
              <p className="text-[11px] text-white/30">Optional — add a profile photo</p>
            </div>

            <div className="space-y-3">
              <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Display name" autoComplete="name" className={iCls}/>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-sm font-bold select-none">@</span>
                <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g,''))}
                  placeholder="username" className={iCls + ' pl-8'} autoComplete="username"/>
                {username.length >= 3 && (
                  <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold ${usernameOk ? 'text-green-400' : usernameOk === false ? 'text-red-400' : 'text-white/30'}`}>
                    {usernameOk === null ? '…' : usernameOk ? '✓ available' : '✗ taken'}
                  </span>
                )}
              </div>
              {/* Smart username suggestions */}
              {displayName && (
                <div className="flex flex-wrap gap-1.5">
                  {[
                    displayName.toLowerCase().replace(/\s+/g,''),
                    displayName.toLowerCase().split(' ')[0] + '.films',
                    displayName.toLowerCase().replace(/\s+/g,'_') + '_creates',
                  ].map(s => s.replace(/[^a-z0-9_.]/g,'')).filter(s => s.length >= 3).map(s => (
                    <button key={s} onClick={() => setUsername(s)}
                      className="text-xs bg-white/10 text-white/60 hover:text-white hover:bg-white/20 px-2.5 py-1 rounded-full border border-white/10 transition-all">
                      @{s}
                    </button>
                  ))}
                </div>
              )}

              {/* Languages */}
              <div>
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Languages spoken</p>
                {/* Selected languages with proficiency picker */}
                {languages.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {languages.map(l => (
                      <div key={l} className="flex items-center gap-2 bg-blue-600/20 border border-blue-500/40 rounded-xl px-3 py-2">
                        <span className="text-sm text-white font-semibold flex-1">{l}</span>
                        <select
                          value={langLevels[l] || 'Conversational'}
                          onChange={e => setLangLevels(p => ({ ...p, [l]: e.target.value }))}
                          className="text-xs bg-white/10 border border-white/20 text-white rounded-lg px-2 py-1 outline-none"
                        >
                          {PROFICIENCY.map(lv => <option key={lv} value={lv} className="bg-gray-900">{lv}</option>)}
                        </select>
                        <button onClick={() => toggleLang(l)} className="text-white/40 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Language picker chips */}
                <div className="flex flex-wrap gap-1.5">
                  {LANGUAGES.filter(l => !languages.includes(l)).map(l => (
                    <button key={l} onClick={() => toggleLang(l)} className={tagCls(false)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={next} disabled={!step3Ok}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 hover:bg-blue-700 transition-all">
              Continue
            </button>
          </div>
        )}

        {/* ── STEP 4: Overview / Bio ──────────────────────────────────── */}
        {step === 4 && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-black text-white">Your creative story</h2>
              <p className="text-white/50 text-sm mt-1">Write a short bio that introduces your work</p>
            </div>
            <div className="space-y-2">
              <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 300))} rows={6}
                placeholder={'Videographer and editor based in Vancouver, specializing in music videos, events, and branded content.'}
                className={iCls + ' resize-none'}/>
              <div className="flex justify-between px-1">
                <p className="text-[11px] text-white/30">Shown publicly on your profile</p>
                <p className="text-[11px] text-white/30">{bio.length}/300</p>
              </div>
            </div>
            <button onClick={next}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl hover:bg-blue-700 transition-all">
              {bio.trim() ? 'Continue' : 'Skip for now'}
            </button>
          </div>
        )}

        {/* ── STEP 5: Professional Identity ──────────────────────────── */}
        {step === 5 && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-black text-white">Professional identity</h2>
              <p className="text-white/50 text-sm mt-1">Define your creative specialization</p>
            </div>

            <ProfessionPicker
              primaryRole={primaryRole}
              onPrimaryChange={setPrimaryRole}
              secondaryRoles={secondaryRoles}
              onSecondaryChange={setSecondaryRoles}
              variant="dark"
            />

            {/* Experience Level */}
            <div>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Experience Level</p>
              <div className="grid grid-cols-4 gap-2">
                {EXP_LEVELS.map(l => (
                  <button key={l} onClick={() => setExpLevel(p => p === l ? '' : l)}
                    className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${expLevel === l ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-white/50 hover:border-white/30'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Years of Experience */}
            <div>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Years of Experience</p>
              <input value={yearsExp} onChange={e => setYearsExp(e.target.value.replace(/\D/,'').slice(0,2))}
                type="tel" placeholder="e.g. 5" maxLength={2} className={iCls}/>
            </div>

            <button onClick={next} disabled={!primaryRole}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 hover:bg-blue-700 transition-all">
              Continue
            </button>
          </div>
        )}

        {/* ── STEP 6: Skills ─────────────────────────────────────────── */}
        {step === 6 && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-black text-white">Skills &amp; specialties</h2>
              <p className="text-white/50 text-sm mt-1">What are you best at?</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_SKILLS.map(s => (
                <button key={s} onClick={() => toggle(skills, s, setSkills)} className={tagCls(skills.includes(s))}>{s}</button>
              ))}
            </div>
            <button onClick={next}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl hover:bg-blue-700 transition-all">
              {skills.length > 0 ? `Continue (${skills.length} selected)` : 'Skip for now'}
            </button>
          </div>
        )}

        {/* ── STEP 7: Education & Training ───────────────────────────── */}
        {step === 7 && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-black text-white">Education &amp; Training</h2>
              <p className="text-white/50 text-sm mt-1">Optional — add your educational background</p>
            </div>

            {/* Saved entries */}
            <div className="space-y-2">
              {eduEntries.map(e => (
                <div key={e.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{e.school}</p>
                    {(e.degree || e.field) && <p className="text-xs text-blue-400 font-medium">{[e.degree, e.field].filter(Boolean).join(' · ')}</p>}
                    {(e.startYear || e.endYear || e.current) && (
                      <p className="text-[11px] text-white/30">{e.startYear}{e.startYear ? ' – ' : ''}{e.current ? 'Present' : e.endYear}</p>
                    )}
                  </div>
                  <button onClick={() => setEduEntries(p => p.filter(r => r.id !== e.id))}
                    className="shrink-0 text-white/20 hover:text-red-400 transition-colors">
                    <X className="w-4 h-4"/>
                  </button>
                </div>
              ))}
            </div>

            {/* Add form */}
            {addingEdu ? (
              <div className="bg-white/5 border border-white/15 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-black text-white/60 uppercase tracking-widest">Add Education</p>

                {/* School Finder */}
                <div ref={schoolWrapRef} className="relative">
                  <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 focus-within:border-blue-400 transition-all">
                    <Search className="w-4 h-4 text-white/40 shrink-0"/>
                    <input value={schoolQ} onChange={e => onSchoolInput(e.target.value)}
                      placeholder="Search school in Canada…"
                      className="flex-1 bg-transparent text-sm text-white placeholder-white/40 outline-none"/>
                    {schoolQ && <button onClick={() => { setSchoolQ(''); setNewEdu(p => ({...p, school:''})); setSchoolSugg([]); }}>
                      <X className="w-3.5 h-3.5 text-white/30 hover:text-white/60"/>
                    </button>}
                  </div>
                  {schoolSugg.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-gray-900 border border-white/15 rounded-xl shadow-2xl overflow-hidden">
                      {schoolSugg.map(s => (
                        <button key={s} type="button" onMouseDown={() => pickSchool(s)}
                          className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 flex items-center gap-2 border-b border-white/5 last:border-0">
                          🏫 {s}
                        </button>
                      ))}
                      <button type="button" onMouseDown={() => { setSchoolSugg([]); }}
                        className="w-full text-left px-4 py-2 text-xs text-blue-400 hover:bg-white/5 flex items-center gap-2 bg-white/3">
                        <Plus className="w-3.5 h-3.5"/> School not listed? Keep what you typed
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select value={newEdu.degree} onChange={e => setNewEdu(p => ({...p, degree: e.target.value}))}
                    className="bg-white/10 border border-white/20 text-white/80 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-blue-400">
                    <option value="">Degree…</option>
                    {DEGREE_OPTIONS.map(d => <option key={d} value={d} className="bg-gray-900">{d}</option>)}
                  </select>
                  <input value={newEdu.field} onChange={e => setNewEdu(p => ({...p, field: e.target.value}))}
                    placeholder="Field of study" className="bg-white/10 border border-white/20 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-blue-400 placeholder-white/40"/>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input value={newEdu.startYear} onChange={e => setNewEdu(p => ({...p, startYear: e.target.value.replace(/\D/,'').slice(0,4)}))}
                    type="tel" placeholder="Start year" maxLength={4}
                    className="bg-white/10 border border-white/20 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-blue-400 placeholder-white/40"/>
                  <input value={newEdu.endYear} onChange={e => setNewEdu(p => ({...p, endYear: e.target.value.replace(/\D/,'').slice(0,4)}))}
                    type="tel" placeholder="End year" maxLength={4} disabled={newEdu.current}
                    className="bg-white/10 border border-white/20 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-blue-400 placeholder-white/40 disabled:opacity-40"/>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <div onClick={() => setNewEdu(p => ({...p, current: !p.current, endYear: !p.current ? '' : p.endYear}))}
                    className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${newEdu.current ? 'bg-blue-600' : 'bg-white/20'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${newEdu.current ? 'translate-x-4' : ''}`}/>
                  </div>
                  <span className="text-xs text-white/60">Currently studying here</span>
                </label>

                <div className="flex gap-2 pt-1">
                  <button onClick={addEdu} disabled={!newEdu.school.trim()}
                    className="flex-1 py-2.5 bg-blue-600 disabled:opacity-40 text-white text-xs font-bold rounded-xl hover:bg-blue-700">
                    Add Entry
                  </button>
                  <button onClick={() => { setAddingEdu(false); setSchoolQ(''); setNewEdu({ id:'', school:'', degree:'', field:'', startYear:'', endYear:'', current:false }); }}
                    className="px-4 py-2.5 bg-white/10 text-white/60 text-xs font-bold rounded-xl hover:bg-white/15">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingEdu(true)}
                className="w-full py-3 border-2 border-dashed border-white/15 rounded-xl text-xs font-bold text-white/40 hover:border-blue-400/60 hover:text-blue-400 transition-colors flex items-center justify-center gap-2">
                <Plus className="w-3.5 h-3.5"/> Add Education
              </button>
            )}

            <button onClick={next}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl hover:bg-blue-700 transition-all">
              {eduEntries.length > 0 ? `Continue (${eduEntries.length} added)` : 'Skip for now'}
            </button>
          </div>
        )}

        {/* ── STEP 8: Gear & Tools ───────────────────────────────────── */}
        {step === 8 && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-black text-white">Gear &amp; Tools</h2>
              <p className="text-white/50 text-sm mt-1">Optional — cameras, software, audio equipment you use</p>
            </div>

            {/* Quick-add suggestions */}
            <div>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Suggestions</p>
              <div className="flex flex-wrap gap-1.5">
                {GEAR_SUGGESTIONS.filter(g => !gear.includes(g)).map(g => (
                  <button key={g} onClick={() => setGear(p => [...p, g])}
                    className="text-xs bg-white/5 text-white/50 border border-white/10 px-2.5 py-1 rounded-full hover:border-blue-400/60 hover:text-white/80 transition-all flex items-center gap-1">
                    <Plus className="w-2.5 h-2.5"/>{g}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom input */}
            <div className="flex gap-2">
              <input value={gearInput} onChange={e => setGearInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGear(); }}}
                placeholder="e.g. Sony FX3, DaVinci Resolve…" className={iCls + ' flex-1'}/>
              <button onClick={addGear} className="bg-blue-600 text-white text-xs font-bold px-4 rounded-2xl shrink-0 flex items-center gap-1 hover:bg-blue-700">
                <Plus className="w-3.5 h-3.5"/>Add
              </button>
            </div>

            {/* Added gear */}
            {gear.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {gear.map(g => (
                  <span key={g} className="flex items-center gap-1.5 text-xs bg-blue-600/20 border border-blue-500/30 text-blue-300 px-3 py-1.5 rounded-full">
                    {g}<button onClick={() => setGear(p => p.filter(x => x !== g))}><X className="w-2.5 h-2.5 hover:text-red-400"/></button>
                  </span>
                ))}
              </div>
            )}

            <button onClick={next}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl hover:bg-blue-700 transition-all">
              {gear.length > 0 ? `Continue (${gear.length} items)` : 'Skip for now'}
            </button>
          </div>
        )}

        {/* ── STEP 9: Location ───────────────────────────────────────── */}
        {step === 9 && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-black text-white">Where are you based?</h2>
              <p className="text-white/50 text-sm mt-1">Helps connect you with local opportunities</p>
            </div>

            <SmartAddressInput
              value={location}
              onInputChange={setLocation}
              onAddressSelect={(display, parts) => {
                setLocation(display);
                setLocationParts({
                  city:          parts.city,
                  province:      parts.province,
                  postalCode:    parts.postalCode,
                  streetAddress: parts.streetAddress,
                  country:       'Canada',
                });
              }}
              mode="city"
              placeholder="City, Province (e.g. Toronto, ON)"
              showGPS={true}
              canadaOnly={true}
              variant="dark"
            />

            <div className="space-y-3 pt-1">
              {[
                { label:'Available for Travel', sub:'You can travel for projects', state: availableTravel, set: setAvailableTravel },
                { label:'Available for Remote Work', sub:'Open to fully remote projects', state: availableRemote, set: setAvailableRemote },
              ].map(opt => (
                <label key={opt.label} className="flex items-center justify-between gap-4 bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 cursor-pointer select-none">
                  <div>
                    <p className="text-sm font-semibold text-white">{opt.label}</p>
                    <p className="text-xs text-white/40">{opt.sub}</p>
                  </div>
                  <div onClick={() => opt.set(v => !v)}
                    className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${opt.state ? 'bg-blue-600' : 'bg-white/20'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${opt.state ? 'translate-x-4' : ''}`}/>
                  </div>
                </label>
              ))}
            </div>

            <button onClick={next} disabled={!location.trim()}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 hover:bg-blue-700 transition-all">
              Continue
            </button>
          </div>
        )}

        {/* ── STEP 10: Social Links ──────────────────────────────────── */}
        {step === 10 && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-black text-white">Social &amp; External Links</h2>
              <p className="text-white/50 text-sm mt-1">Optional — only added links are shown publicly</p>
            </div>
            <div className="space-y-3">
              {[
                { label:'🌐 Website',   value: website,   set: setWebsite,   ph: 'https://yoursite.com'    },
                { label:'▶️ YouTube',   value: youtube,   set: setYoutube,   ph: 'channel URL or @handle'  },
                { label:'🎬 Vimeo',     value: vimeo,     set: setVimeo,     ph: 'vimeo.com/username'      },
                { label:'📸 Instagram', value: instagram, set: setInstagram, ph: '@handle'                 },
                { label:'🎵 TikTok',    value: tiktok,    set: setTiktok,    ph: '@handle'                 },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">{f.label}</p>
                  <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph} className={iCls}/>
                </div>
              ))}
            </div>
            <button onClick={next}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl hover:bg-blue-700 transition-all">
              Continue
            </button>
          </div>
        )}

        {/* ── STEP 11: Collaboration ─────────────────────────────────── */}
        {step === 11 && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-black text-white">Collaboration</h2>
              <p className="text-white/50 text-sm mt-1">Optional — let others know how to work with you</p>
            </div>

            <div>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Availability</p>
              <div className="flex flex-wrap gap-2">
                {COLLAB_AVAILABILITY.map(opt => (
                  <button key={opt} onClick={() => toggle(collab, opt, setCollab)} className={tagCls(collab.includes(opt))}>
                    {collab.includes(opt) && <Check className="w-3 h-3 mr-1"/>}{opt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Preferred Project Types</p>
              <div className="flex flex-wrap gap-2">
                {COLLAB_PROJECT_TYPES.map(opt => (
                  <button key={opt} onClick={() => toggle(collab, opt, setCollab)} className={tagCls(collab.includes(opt))}>
                    {collab.includes(opt) && <Check className="w-3 h-3 mr-1"/>}{opt}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={next}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl hover:bg-blue-700 transition-all">
              {collab.length > 0 ? `Continue (${collab.length} selected)` : 'Skip for now'}
            </button>
          </div>
        )}

        {/* ── STEP 12: Portfolio Setup ────────────────────────────────── */}
        {step === 12 && (
          <div className="pt-4 space-y-5 flex flex-col items-center text-center">
            <div className="text-6xl pt-6">🎬</div>
            <div>
              <h2 className="text-2xl font-black text-white">Portfolio</h2>
              <p className="text-white/50 text-sm mt-2 max-w-xs mx-auto">
                Upload photos, videos, audio samples, or link to your best projects.
              </p>
              <p className="text-white/30 text-xs mt-3 max-w-xs mx-auto">
                You can add portfolio items after your account is created — from your Profile page.
              </p>
            </div>
            <div className="w-full space-y-2.5 pt-2">
              <button onClick={next}
                className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl hover:bg-blue-700 transition-all">
                Continue — I'll add it later
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 13: Marketplace Intent ─────────────────────────────── */}
        {step === 13 && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-black text-white">What do you want to do on Filmons?</h2>
              <p className="text-white/50 text-sm mt-1">Select all that apply — helps us personalize your experience</p>
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              {MARKETPLACE_INTENTS.map(opt => {
                const on = marketplaceIntent.includes(opt.label);
                return (
                  <button key={opt.label} onClick={() => toggle(marketplaceIntent, opt.label, setMarketplaceIntent)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all active:scale-[0.99] ${on ? 'bg-blue-600/20 border-blue-500' : 'bg-white/5 border-white/10 hover:border-white/25'}`}>
                    {(() => { const Icon = opt.icon; return <Icon className="w-5 h-5 shrink-0"/>; })()}
                    <span className={`text-sm font-semibold flex-1 ${on ? 'text-white' : 'text-white/70'}`}>{opt.label}</span>
                    {on && <Check className="w-4 h-4 text-blue-400 shrink-0"/>}
                  </button>
                );
              })}
            </div>
            <button onClick={finish} disabled={loading || marketplaceIntent.length === 0}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/30">
              {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>Saving profile…</span> : 'Finish Setup 🎬'}
            </button>
          </div>
        )}

        {/* ── STEP 14: Finish ─────────────────────────────────────────── */}
        {step === 14 && (
          <div className="flex flex-col items-center justify-center min-h-full py-8 text-center space-y-6">
            <div className="text-6xl animate-bounce">🎬</div>
            <div>
              <h2 className="text-3xl font-black text-white">Your Filmons profile<br/>is ready.</h2>
              <p className="text-white/50 text-sm mt-2">Welcome to the creative marketplace.</p>
            </div>

            <div className="w-full space-y-3 pt-4">
              <button onClick={() => { captureSnapshot(); navigate('/'); }}
                className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/30">
                🏠 Go to Marketplace
              </button>
              <button onClick={() => { captureSnapshot(); navigate('/create-listing'); }}
                className="w-full py-3.5 bg-white/10 text-white font-bold text-sm rounded-2xl hover:bg-white/15 border border-white/15 transition-all">
                📦 Add a Listing
              </button>
              <button onClick={() => { captureSnapshot(); navigate('/profile?tab=portfolio'); }}
                className="w-full py-3.5 bg-white/10 text-white font-bold text-sm rounded-2xl hover:bg-white/15 border border-white/15 transition-all">
                🖼️ Upload Portfolio Work
              </button>
              <button onClick={() => { captureSnapshot(); navigate('/verification'); }}
                className="w-full py-3.5 bg-white/10 text-white font-bold text-sm rounded-2xl hover:bg-white/15 border border-white/15 transition-all">
                ✅ Complete Verification
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
