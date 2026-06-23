import { useState } from 'react';
import { useNavigate } from 'react-router';
import { captureSnapshot } from '../lib/smartAnimate';
import {
  ArrowLeft, ShieldCheck, Briefcase, Building2,
  CheckCircle, Clock, XCircle, ChevronRight, ChevronDown,
  Lock, Check, User, FileText, Shield, CreditCard,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isCreatorPlus, isProfessional, isBusiness, reliabilityApi, ReputationScore, getCompositeTier, scoreColor } from '../lib/reliabilityApi';
import { reputationSettingsApi } from '../lib/settingsApi';
import { ReliabilityCard } from '../components/ReliabilityScore';
import { useEffect } from 'react';
import { toast } from 'sonner';

type VStatus = 'verified' | 'pending' | 'under_review' | 'not_started' | 'rejected';

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: VStatus }) {
  const map: Record<VStatus, { label: string; color: string; icon: React.ReactNode }> = {
    verified:     { label: '✓ Verified',   color: 'text-green-700 bg-green-50 border-green-200',  icon: <CheckCircle className="w-3 h-3"/> },
    pending:      { label: 'Pending',       color: 'text-amber-700 bg-amber-50 border-amber-200',  icon: <Clock className="w-3 h-3"/> },
    under_review: { label: 'Under Review',  color: 'text-blue-700 bg-blue-50 border-blue-200',     icon: <Clock className="w-3 h-3"/> },
    not_started:  { label: 'Not Started',   color: 'text-gray-500 bg-gray-100 border-gray-200',    icon: <XCircle className="w-3 h-3"/> },
    rejected:     { label: 'Rejected',      color: 'text-red-600 bg-red-50 border-red-200',        icon: <XCircle className="w-3 h-3"/> },
  };
  const s = map[status];
  return (
    <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.color}`}>
      {s.icon}{s.label}
    </span>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on ? 'bg-blue-600' : 'bg-gray-200'}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${on ? 'left-5.5' : 'left-0.5'}`}/>
    </button>
  );
}

// ── Expandable verification card ──────────────────────────────────────────────
function VerifCard({
  icon, title, sub, status, required, badge,
  children, onStart,
}: {
  icon: React.ReactNode; title: string; sub: string; status: VStatus;
  required?: boolean; badge?: string; children?: React.ReactNode; onStart: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-50 last:border-0">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition-colors text-left">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
          status === 'verified' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
        }`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            {required && <span className="text-[9px] font-black bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">REQUIRED</span>}
            {badge    && <span className="text-[9px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{badge}</span>}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={status}/>
          {open ? <ChevronDown className="w-4 h-4 text-gray-300"/> : <ChevronRight className="w-4 h-4 text-gray-300"/>}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-50">
          {children}
          {status === 'not_started' && (
            <button onClick={onStart}
              className="mt-3 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors">
              Start Verification →
            </button>
          )}
          {status === 'rejected' && (
            <button onClick={onStart}
              className="mt-3 w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors">
              Resubmit Verification →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function VerificationSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const plus = isCreatorPlus(user?.accountType);
  const [rep, setRep] = useState<ReputationScore | null>(null);
  useEffect(() => { if (user?.id) reliabilityApi.getScore(user.id).then(setRep).catch(()=>{}); }, [user?.id]);

  // Badge visibility
  const [showRentalBadge,  setShowRentalBadge]  = useState(true);
  const [showCreatorBadge, setShowCreatorBadge] = useState(true);
  const [badgesLoading,    setBadgesLoading]    = useState(true);

  // Load badge visibility prefs from DB
  useEffect(() => {
    if (!user?.id) return;
    reputationSettingsApi.load(user.id).then((s: any) => {
      setShowRentalBadge(s.show_rental_badge  ?? true);
      setShowCreatorBadge(s.show_identity_badge ?? true);
      setBadgesLoading(false);
    }).catch(() => setBadgesLoading(false));
  }, [user?.id]);

  // Save badge pref to DB whenever toggle changes
  const saveBadgePref = async (key: string, value: boolean) => {
    if (!user?.id) return;
    await reputationSettingsApi.save(user.id, { [key]: value });
    // Write to localStorage so Profile.tsx reads it instantly
    const cache = JSON.parse(localStorage.getItem('fm_badge_prefs') || '{}');
    localStorage.setItem('fm_badge_prefs', JSON.stringify({ ...cache, [key]: value }));
  };

  const [idStatus, setIdStatus] = useState<VStatus>(() => {
    if (plus) return 'verified';
    const vs = (user as any)?.verificationStatus;
    if (vs === 'verified') return 'verified';
    if (vs === 'pending') return 'pending';
    return 'not_started';
  });

  const handle = (type: string) => {
    toast.info(`${type} — coming soon`);
  };

  // ── Creator account (NOT Creator+) ─────────────────────────────────────────
  if (!plus) {
    return (
      <div className="min-h-screen bg-gray-50">

        {/* Header — same as Creator+ */}
        <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => { captureSnapshot(); navigate(-1); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-700"/>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-gray-900">Account Verification, Trust & Plan</h1>
            <p className="text-[11px] text-gray-500 font-semibold">Creator</p>
          </div>
        </div>

        <div className="max-w-lg mx-auto py-4 space-y-4">

          {/* ─── Trust level — always at top ─── */}
          <div className="mx-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">MY TRUST LEVEL</p>
            <ReliabilityCard userId={user!.id} accountType={user!.accountType} repData={rep ?? undefined}/>
          </div>

          {/* ─── 1. Upgrade to Creator+ — mirrors Creator+ identity card structure ─── */}
          <div className="mx-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1">IDENTITY VERIFICATION</p>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Header row — same bg treatment as Creator+ verified identity */}
              <div className="bg-blue-50 border-b border-blue-100 px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-6 h-6 text-blue-600"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black text-gray-900">Upgrade to Creator+</p>
                      <span className="text-[9px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-full">with ID verification</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                      Unlock identity verification, rental hosting, service listings, and direct payouts.
                    </p>
                  </div>
                </div>
              </div>
              {/* Includes — same structure as Creator+ identity card */}
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Includes</p>
                <div className="space-y-1.5">
                  {[
                    { icon: <User className="w-3.5 h-3.5 text-blue-500"/>,      label: 'Government ID verification' },
                    { icon: <Shield className="w-3.5 h-3.5 text-purple-500"/>,  label: 'Selfie / liveness verification' },
                    { icon: <CreditCard className="w-3.5 h-3.5 text-green-500"/>,label: 'Payout account verification' },
                    { icon: <FileText className="w-3.5 h-3.5 text-teal-500"/>,  label: 'Anti-fraud validation' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                        {item.icon}
                      </div>
                      <p className="text-xs text-gray-700 font-medium">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Action buttons — same as Creator+ */}
              <div className="px-4 py-3 flex gap-2">
                <button onClick={() => { captureSnapshot(); navigate('/creator-plus-steps'); }}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors">
                  Upgrade to Creator+
                </button>
                <button onClick={() => toast.info('Email: support@filmons.ca')}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors">
                  Contact Support
                </button>
              </div>
            </div>
          </div>

          {/* ─── 2. Professional Account — same structure as Creator+ section ─── */}
          <div className="mx-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1">ACCOUNT UPGRADES</p>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-4 border-b border-gray-50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center shrink-0">
                    <Briefcase className="w-6 h-6 text-purple-600"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-900">Professional Account</p>
                    <p className="text-xs text-gray-400 mt-0.5">Industry-recognized creator status</p>
                  </div>
                </div>
                <div className="space-y-1.5 mb-4">
                  {[
                    'Professional badge on your profile',
                    'Portfolio review by our team',
                    'Priority creator & service discovery',
                    'Lower platform fees & instant booking',
                  ].map(f => (
                    <div key={f} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-purple-400 shrink-0"/>
                      <p className="text-xs text-gray-600">{f}</p>
                    </div>
                  ))}
                </div>
                <button disabled
                  className="w-full py-2.5 bg-purple-200 text-purple-400 text-xs font-bold rounded-xl cursor-not-allowed">
                  Requires Creator+ first
                </button>
              </div>

              {/* ─── 3. Business Account — inside same card as Professional ─── */}
              <div className="px-4 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
                    <Building2 className="w-6 h-6 text-amber-600"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-900">Business Account</p>
                    <p className="text-xs text-gray-400 mt-0.5">Studios, agencies & companies</p>
                  </div>
                </div>
                <div className="space-y-1.5 mb-4">
                  {[
                    'Business badge on your profile',
                    'Company & business verification',
                    'Team management & multi-user access',
                    'Enterprise booking & revenue analytics',
                  ].map(f => (
                    <div key={f} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-amber-500 shrink-0"/>
                      <p className="text-xs text-gray-600">{f}</p>
                    </div>
                  ))}
                </div>
                <button disabled
                  className="w-full py-2.5 bg-amber-200 text-amber-400 text-xs font-bold rounded-xl cursor-not-allowed">
                  Requires Creator+ first
                </button>
              </div>
            </div>
          </div>

          {/* ─── 4. Badge Visibility — same as Creator+ (single toggle) ─── */}
          <div className="mx-4 pb-24">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1">BADGE VISIBILITY</p>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm font-semibold text-gray-900">Show Rental Trust Badge</p>
                  <p className="text-xs text-gray-400 mt-0.5">Display your rental trust level on your public profile</p>
                </div>
                <Toggle on={showRentalBadge} onChange={() => {
                  const next = !showRentalBadge;
                  setShowRentalBadge(next);
                  saveBadgePref('show_rental_badge', next);
                }}/>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ── Creator+ account ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => { captureSnapshot(); navigate(-1); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700"/>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-black text-gray-900">Account Verification, Trust & Plan</h1>
          <p className="text-[11px] text-blue-600 font-semibold">Creator+</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto py-4 space-y-4">

        {/* ─── Trust level — always at top ─── */}
        <div className="mx-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">MY TRUST LEVEL</p>
          <ReliabilityCard userId={user!.id} accountType={user!.accountType} repData={rep ?? undefined}/>
        </div>

        {/* ─── 1. Verified Identity Status Card ─── */}
        <div className="mx-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1">IDENTITY VERIFICATION</p>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className={`px-4 py-4 ${idStatus === 'verified' ? 'bg-green-50 border-b border-green-100' : 'bg-blue-50 border-b border-blue-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${idStatus === 'verified' ? 'bg-green-100' : 'bg-blue-100'}`}>
                  <ShieldCheck className={`w-6 h-6 ${idStatus === 'verified' ? 'text-green-600' : 'text-blue-600'}`}/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-black text-gray-900">Verified Identity</p>
                    <StatusPill status={idStatus}/>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                    Your identity is verified through a secure, government-backed process to build trust across the platform.
                  </p>
                </div>
              </div>
            </div>

            {/* Includes */}
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Includes</p>
              <div className="space-y-1.5">
                {[
                  { icon: <User className="w-3.5 h-3.5 text-blue-500"/>,    label: 'Government ID verification' },
                  { icon: <Shield className="w-3.5 h-3.5 text-purple-500"/>, label: 'Selfie / liveness verification' },
                  { icon: <FileText className="w-3.5 h-3.5 text-green-500"/>,label: 'Anti-fraud checks' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                      {item.icon}
                    </div>
                    <p className="text-xs text-gray-700 font-medium">{item.label}</p>
                    <CheckCircle className="w-3.5 h-3.5 text-green-400 ml-auto shrink-0"/>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ─── 2. Professional Account CTA ─── */}
        <div className="mx-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1">ACCOUNT UPGRADES</p>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-4 border-b border-gray-50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center shrink-0">
                  <Briefcase className="w-6 h-6 text-purple-600"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-gray-900">Professional Account</p>
                  <p className="text-xs text-gray-400 mt-0.5">Industry-recognized creator status</p>
                </div>
              </div>
              <div className="space-y-1.5 mb-4">
                {[
                  'Professional badge on your profile',
                  'Portfolio review by our team',
                  'Verified Professional status',
                  'Advanced creator credibility',
                ].map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-purple-500 shrink-0"/>
                    <p className="text-xs text-gray-600">{f}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { captureSnapshot(); navigate('/professional-account-steps'); }}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-colors">
                Apply for Professional Account →
              </button>
            </div>
          </div>
        </div>

        {/* ─── 3. Business Account CTA ─── */}
        <div className="mx-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 text-amber-600"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-gray-900">Business Account</p>
                  <p className="text-xs text-gray-400 mt-0.5">Studios, agencies & companies</p>
                </div>
              </div>
              <div className="space-y-1.5 mb-4">
                {[
                  'Business badge on your profile',
                  'Company verification',
                  'Business documents support',
                  'Team & company features',
                ].map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-500 shrink-0"/>
                    <p className="text-xs text-gray-600">{f}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { captureSnapshot(); navigate('/business-account-steps'); }}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors">
                Apply for Business Account →
              </button>
            </div>
          </div>
        </div>

        {/* ─── 4. Badge Visibility ─── */}
        <div className="mx-4 pb-24">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1">BADGE VISIBILITY</p>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-sm font-semibold text-gray-900">Show Rental Trust Badge</p>
                <p className="text-xs text-gray-400 mt-0.5">Display your rental trust level on your public profile</p>
              </div>
              <Toggle on={showRentalBadge} onChange={() => {
                  const next = !showRentalBadge;
                  setShowRentalBadge(next);
                  saveBadgePref('show_rental_badge', next);
                }}/>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-sm font-semibold text-gray-900">Show Verified Creator+ Badge</p>
                <p className="text-xs text-gray-400 mt-0.5">Display your Creator+ verified status on your profile</p>
              </div>
              <Toggle on={showCreatorBadge} onChange={() => {
                  const next = !showCreatorBadge;
                  setShowCreatorBadge(next);
                  saveBadgePref('show_identity_badge', next);
                }}/>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}