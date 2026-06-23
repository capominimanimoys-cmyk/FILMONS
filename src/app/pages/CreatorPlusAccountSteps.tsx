import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Check, Shield, CreditCard, ChevronRight,
  Zap, Upload, Camera, SkipForward, Fingerprint,
  Briefcase, BarChart3, Wallet, Star, FileText, User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { reliabilityApi, scoreColor, getCompositeTier } from '../lib/reliabilityApi';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

const ROLE_CATEGORIES = [
  { label: 'Film & Video',  roles: ['Director','Cinematographer','Camera Operator','Gaffer','Grip','Producer','Video Editor','Colorist','VFX Artist','Sound Designer'] },
  { label: 'Photography',   roles: ['Photographer','Fashion Photographer','Retoucher','Studio Manager','Drone Photographer'] },
  { label: 'Music & Audio', roles: ['Music Producer','Beatmaker','Mixing Engineer','DJ','Composer'] },
  { label: 'Social Media',  roles: ['Content Creator','UGC Creator','YouTuber','Streamer','Podcast Producer'] },
  { label: 'Design',        roles: ['Graphic Designer','UI Designer','Motion Designer','Creative Director'] },
  { label: 'Animation/3D',  roles: ['3D Animator','Unreal Engine Artist','Blender Artist','Technical Artist'] },
  { label: 'Writing',       roles: ['Screenwriter','Copywriter','Story Editor','Narrative Designer'] },
  { label: 'Performing',    roles: ['Actor','Voice Actor','Dancer','Choreographer'] },
  { label: 'Emerging',      roles: ['AI Artist','Prompt Engineer','XR Designer','Virtual Production Artist'] },
];

const ID_TYPES = [
  { id: 'ca_passport', label: 'Canadian Passport',                               flag: '🇨🇦', needsCountry: false },
  { id: 'fr_passport', label: 'Foreign Passport',                                flag: '🌍', needsCountry: true  },
  { id: 'ca_drivers',  label: 'Canadian Driver\'s License',                      flag: '🪪', needsCountry: false },
  { id: 'ca_photo_id', label: 'Provincial / Territorial Photo ID',               flag: '🪪', needsCountry: false },
  { id: 'ca_pr',       label: 'Permanent Resident (PR) Card',                    flag: '🇨🇦', needsCountry: false },
  { id: 'ca_work',     label: 'Canadian Work Permit',                            flag: '📄', needsCountry: false },
  { id: 'ca_study',    label: 'Canadian Study Permit',                           flag: '📄', needsCountry: false },
];

const STEPS = [
  { id: 1, label: 'Welcome',    sub: 'Creator+ overview',           Icon: Zap,         skippable: false },
  { id: 2, label: 'ID Upload',  sub: 'Government ID document',      Icon: FileText,     skippable: false },
  { id: 3, label: 'Selfie',     sub: 'Liveness check',              Icon: Camera,       skippable: false },
  { id: 4, label: 'Your Role',  sub: 'Professional role',           Icon: Briefcase,    skippable: true  },
  { id: 5, label: 'Portfolio',  sub: 'Experience & work',           Icon: Star,         skippable: true  },
  { id: 6, label: 'Trust',      sub: 'Reliability overview',        Icon: BarChart3,    skippable: false },
  { id: 7, label: 'Wallet',     sub: 'Payments & payouts',          Icon: Wallet,       skippable: true  },
];

function TrustMeter({ score, level }: { score: number; level: string }) {
  const [displayed, setDisplayed] = useState(0);
  const raf = useRef<number>();
  useEffect(() => {
    const start = Date.now(); const dur = 1200;
    const tick = () => {
      const p = Math.min((Date.now() - start) / dur, 1);
      setDisplayed(Math.round((1 - Math.pow(2, -10 * p)) * score));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [score]);
  const color = scoreColor(score);
  const tier  = getCompositeTier(level, true);
  const r = 54, cx = 64, cy = 64, circ = 2 * Math.PI * r;
  const dash = (displayed / 100) * circ;
  return (
    <div className="flex flex-col items-center py-2">
      <svg width="128" height="128" style={{ overflow: 'visible' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="10"/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter: `drop-shadow(0 0 8px ${color}55)` }}/>
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="28" fontWeight="900" fill={color}>{displayed}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">/100</text>
      </svg>
      <p className="text-base font-black mt-2" style={{ color }}>{(tier as any).emoji} {(tier as any).label}</p>
      <p className="text-xs text-gray-500 mt-1 text-center leading-snug max-w-[200px]">{(tier as any).description}</p>
    </div>
  );
}

export function CreatorPlusAccountSteps() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth() as any;
  const [step, setStep]                     = useState(1);
  const [selectedIdType, setSelectedIdType] = useState('');
  const [issuedCountry, setIssuedCountry]   = useState('');
  const [selectedRoles, setSelectedRoles]   = useState<string[]>([]);
  const [portfolioUrl, setPortfolioUrl]     = useState('');
  const [payoutMethod, setPayoutMethod]     = useState('');
  const [rep, setRep]                       = useState<any>(null);
  const [submitting, setSubmitting]         = useState(false);
  const [idUploaded, setIdUploaded]         = useState(false);
  const [selfieUploaded, setSelfieUploaded] = useState(false);
  const [idVerified, setIdVerified]         = useState(false);

  useEffect(() => {
    if (user?.id) reliabilityApi.getScore(user.id).then(setRep).catch(() => {});
  }, [user?.id]);

  const skip = () => setStep(s => s + 1);

  const activate = async () => {
    if (!user?.id) return;
    setSubmitting(true);
    try {
      await supabase.from('profiles').update({
        account_type: 'creator_plus', account_mode: 'creator_plus',
        verification_status: 'verified', is_verified: true,
        occupation: selectedRoles[0] || null,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
      await supabase.from('account_verifications').upsert({
        user_id: user.id, identity_verified: true,
        identity_verified_at: new Date().toISOString(),
        payment_verified: !!payoutMethod,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (typeof updateUser === 'function') updateUser({ accountType: 'creator_plus' });
      toast.success('Creator+ activated! Welcome to the marketplace ⚡');
      captureSnapshot(); navigate('/profile');
    } catch { toast.error('Activation failed — contact support'); }
    setSubmitting(false);
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;
  const currentStep = STEPS[step - 1];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="sticky top-14 z-20 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => { captureSnapshot(); navigate(-1); }}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4 text-gray-700"/>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center shrink-0">
              <Zap className="w-3 h-3 text-white"/>
            </div>
            <h1 className="text-sm font-black text-gray-900 truncate">Creator+ Verification</h1>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{currentStep.label} · Step {step} of {STEPS.length}</p>
        </div>
        {currentStep.skippable && (
          <button onClick={skip} className="shrink-0 flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors">
            Skip <SkipForward className="w-3 h-3"/>
          </button>
        )}
      </div>

      {/* ── Progress bar ── */}
      <div className="h-0.5 bg-gray-100">
        <div className="h-full bg-blue-600 transition-all duration-500 ease-out" style={{ width: `${progress}%` }}/>
      </div>

      {/* ── Step pill indicators ── */}
      <div className="bg-white border-b border-gray-50 px-4 py-3 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-1 min-w-max mx-auto w-fit">
          {STEPS.map((s, i) => {
            const done    = s.id < step;
            const current = s.id === step;
            return (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  onClick={() => s.id < step && setStep(s.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                    current ? 'bg-blue-600 text-white shadow-sm shadow-blue-200' :
                    done    ? 'bg-green-50 text-green-600 cursor-pointer' :
                              'bg-gray-100 text-gray-400 cursor-default'
                  }`}>
                  {done
                    ? <Check className="w-3 h-3 shrink-0"/>
                    : <s.Icon className="w-3 h-3 shrink-0"/>
                  }
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.id}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`w-3 h-0.5 rounded-full ${s.id < step ? 'bg-green-300' : 'bg-gray-200'}`}/>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">

        {/* ══ STEP 1: Welcome ══════════════════════════════════════════ */}
        {step === 1 && (
          <>
            {/* Hero */}
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 shadow-xl shadow-blue-200">
              {/* Dot grid texture */}
              <div className="absolute inset-0 opacity-[0.08]"
                style={{ backgroundImage: 'radial-gradient(circle, white 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }}/>
              <div className="relative px-6 pt-7 pb-6">
                {/* Badge */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-inner border border-white/20">
                    <Zap className="w-8 h-8 text-white"/>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-2xl font-black text-white tracking-tight">Creator+</p>
                      <span className="text-[10px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">Free</span>
                    </div>
                    <p className="text-sm text-blue-200 font-medium">Verified Marketplace Professional</p>
                  </div>
                </div>
                <p className="text-lg font-black text-white leading-snug mb-1.5">
                  Build trust.<br/>Unlock your earning potential.
                </p>
                <p className="text-sm text-blue-100/80 leading-relaxed">
                  Join thousands of verified creators hosting gear, offering services, and earning on Filmons.
                </p>
              </div>
              {/* Bottom accent */}
              <div className="relative px-6 pb-6 grid grid-cols-2 gap-2">
                {[
                  { icon: Shield,    label: 'Verified identity badge'  },
                  { icon: Wallet,    label: 'Payouts & withdrawals'    },
                  { icon: Briefcase, label: 'Host gear & services'     },
                  { icon: BarChart3, label: 'Marketplace analytics'    },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2.5 border border-white/10">
                    <Icon className="w-4 h-4 text-blue-200 shrink-0"/>
                    <p className="text-xs font-semibold text-white/90">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* What's in this process */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">7-step verification process</p>
              <div className="space-y-2.5">
                {[
                  { icon: FileText,    label: 'Upload Government ID',     sub: 'Passport, driver\'s license, or photo ID',  required: true  },
                  { icon: Camera,      label: 'Take a Selfie',            sub: 'Liveness check and face match',              required: true  },
                  { icon: Briefcase,   label: 'Select Your Role',         sub: 'Tell us your creative speciality',           required: false },
                  { icon: Star,        label: 'Share Your Portfolio',     sub: 'Optional — builds marketplace credibility',  required: false },
                  { icon: BarChart3,   label: 'Review Trust Score',       sub: 'Understand how reliability works',           required: false },
                  { icon: Wallet,      label: 'Setup Wallet & Payouts',   sub: 'Connect bank for withdrawals',               required: false },
                ].map(({ icon: Icon, label, sub, required }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-blue-500"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-gray-900">{label}</p>
                        {!required && <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Optional</span>}
                      </div>
                      <p className="text-[11px] text-gray-400">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ══ STEP 2: ID Upload ════════════════════════════════════════ */}
        {step === 2 && (
          <>
            {/* Step hero */}
            <div className="bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl px-5 py-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                <FileText className="w-7 h-7 text-white"/>
              </div>
              <div>
                <p className="text-base font-black text-white">Government ID</p>
                <p className="text-xs text-slate-300 leading-snug mt-0.5">Required to verify your identity and activate Creator+</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Select your ID type</p>
                <div className="space-y-1.5">
                  {ID_TYPES.map(id => (
                    <button key={id.id} onClick={() => setSelectedIdType(id.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all ${
                        selectedIdType === id.id
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-gray-100 bg-gray-50 hover:bg-gray-100 hover:border-gray-200'
                      }`}>
                      <span className="text-lg shrink-0">{id.flag}</span>
                      <p className={`text-sm font-semibold flex-1 ${selectedIdType === id.id ? 'text-blue-700' : 'text-gray-700'}`}>{id.label}</p>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        selectedIdType === id.id ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                        {selectedIdType === id.id && <Check className="w-2.5 h-2.5 text-white"/>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedIdType === 'fr_passport' && (
                <div className="px-4 pb-3">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide block mb-1.5">Issuing Country</label>
                  <input value={issuedCountry} onChange={e => setIssuedCountry(e.target.value)}
                    placeholder="e.g. France, United States…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors"/>
                </div>
              )}

              {selectedIdType && (
                <div className="px-4 pb-4 pt-2 border-t border-gray-50">
                  {idUploaded ? (
                    <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3.5">
                      <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                        <Check className="w-5 h-5 text-green-600"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-green-700">ID document uploaded</p>
                        <p className="text-xs text-green-500 mt-0.5">{ID_TYPES.find(t => t.id === selectedIdType)?.label}</p>
                      </div>
                      <button onClick={() => setIdUploaded(false)}
                        className="text-[11px] text-gray-400 hover:text-red-400 font-semibold shrink-0 transition-colors">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { toast.info('Document upload coming soon'); setIdUploaded(true); }}
                      className="w-full border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-xl py-8 flex flex-col items-center gap-2.5 transition-colors group">
                      <div className="w-12 h-12 rounded-2xl bg-gray-100 group-hover:bg-blue-50 flex items-center justify-center transition-colors">
                        <Upload className="w-6 h-6 text-gray-400 group-hover:text-blue-500 transition-colors"/>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gray-600 group-hover:text-blue-600 transition-colors">Upload ID document</p>
                        <p className="text-xs text-gray-400 mt-0.5">{ID_TYPES.find(t => t.id === selectedIdType)?.label}</p>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ STEP 3: Selfie ═══════════════════════════════════════════ */}
        {step === 3 && (
          <>
            <div className="bg-gradient-to-br from-violet-600 to-purple-800 rounded-2xl px-5 py-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                <Fingerprint className="w-7 h-7 text-white"/>
              </div>
              <div>
                <p className="text-base font-black text-white">Selfie & Liveness</p>
                <p className="text-xs text-purple-200 leading-snug mt-0.5">We match your face to your ID document in real time</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* How it works */}
              <div className="px-4 pt-4 pb-3 border-b border-gray-50">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">How it works</p>
                <div className="space-y-2.5">
                  {[
                    { icon: Camera,      label: 'Look at the camera',      sub: 'Position your face in the frame'             },
                    { icon: User,        label: 'Blink or turn your head',  sub: 'Liveness detection prevents spoofing'       },
                    { icon: Shield,      label: 'Face match',               sub: 'We compare your selfie to your uploaded ID' },
                  ].map(({ icon: Icon, label, sub }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-violet-500"/>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-900">{label}</p>
                        <p className="text-[11px] text-gray-400">{sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-4 pb-4 pt-3">
                {selfieUploaded ? (
                  <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3.5">
                    <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                      <Check className="w-5 h-5 text-green-600"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-green-700">Selfie captured</p>
                      <p className="text-xs text-green-500 mt-0.5">Liveness check complete · Face matched</p>
                    </div>
                    <button onClick={() => setSelfieUploaded(false)}
                      className="text-[11px] text-gray-400 hover:text-red-400 font-semibold shrink-0 transition-colors">
                      Redo
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { toast.info('Selfie capture coming soon'); setSelfieUploaded(true); }}
                    className="w-full border-2 border-dashed border-gray-200 hover:border-violet-300 rounded-xl py-8 flex flex-col items-center gap-2.5 transition-colors group">
                    <div className="w-16 h-16 rounded-full bg-gray-100 group-hover:bg-violet-50 flex items-center justify-center transition-colors border-2 border-dashed border-gray-200 group-hover:border-violet-200">
                      <Camera className="w-7 h-7 text-gray-400 group-hover:text-violet-500 transition-colors"/>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-600 group-hover:text-violet-600 transition-colors">Take your selfie</p>
                      <p className="text-xs text-gray-400 mt-0.5">Ensure good lighting and look directly at the camera</p>
                    </div>
                  </button>
                )}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"/>
              <p className="text-xs text-amber-700 leading-relaxed">
                <span className="font-bold">Privacy protected.</span> Your selfie is used only for identity verification and is never shared or stored publicly.
              </p>
            </div>
          </>
        )}

        {/* ══ STEP 4: Professional Role ════════════════════════════════ */}
        {step === 4 && (
          <>
            <div className="bg-gradient-to-br from-indigo-500 to-blue-700 rounded-2xl px-5 py-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                <Briefcase className="w-7 h-7 text-white"/>
              </div>
              <div>
                <p className="text-base font-black text-white">Your Creative Role</p>
                <p className="text-xs text-blue-200 leading-snug mt-0.5">Helps renters and clients find you — up to 3 roles</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
              {selectedRoles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-3 border-b border-gray-50">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest w-full mb-1">Selected ({selectedRoles.length}/3)</p>
                  {selectedRoles.map(r => (
                    <button key={r} onClick={() => setSelectedRoles(prev => prev.filter(x => x !== r))}
                      className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2.5 py-1 rounded-full font-semibold">
                      {r} <span className="opacity-70 ml-0.5">×</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-1">
                {ROLE_CATEGORIES.map(cat => (
                  <div key={cat.label}>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{cat.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.roles.map(role => {
                        const sel = selectedRoles.includes(role);
                        return (
                          <button key={role} onClick={() => setSelectedRoles(prev =>
                            sel ? prev.filter(r => r !== role) : [...prev, role].slice(0, 3)
                          )}
                            className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${
                              sel ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}>
                            {role}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ══ STEP 5: Portfolio ════════════════════════════════════════ */}
        {step === 5 && (
          <>
            <div className="bg-gradient-to-br from-rose-500 to-pink-700 rounded-2xl px-5 py-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                <Star className="w-7 h-7 text-white"/>
              </div>
              <div>
                <p className="text-base font-black text-white">Portfolio & Experience</p>
                <p className="text-xs text-rose-200 leading-snug mt-0.5">Optional — builds credibility with renters and clients</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide block mb-1.5">Portfolio / Reel URL</label>
                <input value={portfolioUrl} onChange={e => setPortfolioUrl(e.target.value)}
                  placeholder="filmons.com/@you · vimeo.com/… · behance.net/…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors"/>
              </div>
              <button onClick={() => toast.info('File upload coming soon')}
                className="w-full border-2 border-dashed border-gray-200 hover:border-rose-300 rounded-xl py-7 flex flex-col items-center gap-2.5 transition-colors group">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 group-hover:bg-rose-50 flex items-center justify-center transition-colors">
                  <Upload className="w-6 h-6 text-gray-400 group-hover:text-rose-500 transition-colors"/>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-600 group-hover:text-rose-600 transition-colors">Upload work samples</p>
                  <p className="text-xs text-gray-400 mt-0.5">Images, PDFs, or video links (optional)</p>
                </div>
              </button>
            </div>
          </>
        )}

        {/* ══ STEP 6: Trust Score ══════════════════════════════════════ */}
        {step === 6 && (
          <>
            <div className="bg-gradient-to-br from-teal-500 to-cyan-700 rounded-2xl px-5 py-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                <BarChart3 className="w-7 h-7 text-white"/>
              </div>
              <div>
                <p className="text-base font-black text-white">Your Trust Score</p>
                <p className="text-xs text-teal-200 leading-snug mt-0.5">Grows with every verified activity on Filmons</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              {rep ? (
                <TrustMeter score={rep.reliability_score} level={rep.reliability_level}/>
              ) : (
                <div className="h-32 bg-gray-50 rounded-2xl animate-pulse"/>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">What affects your score</p>
              <div className="space-y-3">
                {[
                  { icon: '⚡', label: 'Response Rate',          sub: 'How quickly you reply to messages'      },
                  { icon: '✅', label: 'Completed Orders',       sub: 'Successful rentals and service bookings' },
                  { icon: '🛡️', label: 'Identity Verified',     sub: 'Government ID + selfie confirmed'       },
                  { icon: '💳', label: 'Payment Reliability',    sub: 'On-time, successful payments'           },
                  { icon: '📦', label: 'Rental Behaviour',       sub: 'Returns on time, no damage claims'     },
                  { icon: '⏱️', label: 'Account Age',            sub: 'Time building trust on the platform'   },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-3">
                    <span className="text-base shrink-0 w-6 text-center">{f.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900">{f.label}</p>
                      <p className="text-[11px] text-gray-400">{f.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ══ STEP 7: Wallet & Payouts ═════════════════════════════════ */}
        {step === 7 && (
          <>
            <div className="bg-gradient-to-br from-emerald-500 to-green-700 rounded-2xl px-5 py-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                <Wallet className="w-7 h-7 text-white"/>
              </div>
              <div>
                <p className="text-base font-black text-white">Wallet & Payouts</p>
                <p className="text-xs text-green-200 leading-snug mt-0.5">Connect your bank to start earning from the marketplace</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 pt-4 pb-2 border-b border-gray-50">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Wallet features unlocked</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: Zap,        label: 'Filmons Points (FP)'    },
                    { icon: CreditCard, label: 'Marketplace payouts'     },
                    { icon: Wallet,     label: 'Withdrawal to bank'      },
                    { icon: BarChart3,  label: 'Earnings analytics'      },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-2 bg-green-50 rounded-xl px-3 py-2.5">
                      <Icon className="w-3.5 h-3.5 text-green-600 shrink-0"/>
                      <p className="text-xs font-semibold text-green-900">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-4 py-3 space-y-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Setup payouts</p>
                {[
                  { icon: CreditCard, label: 'Connect bank account for withdrawals' },
                  { icon: Zap,        label: 'Add payment method to buy FP'         },
                  { icon: FileText,   label: 'Acknowledge tax & legal terms'        },
                ].map(({ icon: Icon, label }, i) => (
                  <button key={i} onClick={() => toast.info('Coming soon')}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-100 hover:bg-gray-50 text-left transition-colors">
                    <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-gray-400"/>
                    </div>
                    <p className="text-xs font-semibold text-gray-700 flex-1">{label}</p>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
                  </button>
                ))}
                <p className="text-[11px] text-gray-400 leading-relaxed pt-1">
                  You can complete payout setup later in Settings. Creator+ is activated once you continue.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ── Nav buttons ── */}
        <div className="flex gap-3 pt-1 pb-28">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex-1 py-4 border border-gray-200 text-gray-700 font-bold text-sm rounded-2xl hover:bg-gray-50 transition-colors">
              Back
            </button>
          )}
          {step < STEPS.length ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={
                (step === 2 && !selectedIdType) ||
                (step === 2 && selectedIdType && !idUploaded) ||
                (step === 3 && !selfieUploaded)
              }
              className="flex-1 py-4 bg-blue-600 text-white font-black text-sm rounded-2xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm shadow-blue-200">
              {step === 1 ? 'Start Verification →' : 'Continue'}
            </button>
          ) : (
            <button onClick={activate} disabled={submitting}
              className="flex-1 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-sm rounded-2xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 transition-all shadow-md shadow-blue-200">
              {submitting ? 'Activating…' : 'Activate Creator+ ⚡'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
