import { useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Lock, Check, ChevronRight, Star, Building2, Zap, CreditCard } from 'lucide-react';

const ACCOUNT_INFO = {
  wallet: {
    Icon: CreditCard,
    label: 'Creator+ Required',
    gradient: 'from-emerald-600 to-teal-700',
    accent: 'bg-emerald-500',
    glow: 'shadow-emerald-700/50',
    textAccent: 'text-emerald-200',
    lockNote: 'Wallet, payouts, and payment tools require a free Creator+ account with verified identity and payout setup.',
    requiresLabel: 'Upgrade to Creator+ — It\'s Free',
    tagline: 'Verified payout & payment account',
    audience: [
      'Creators ready to earn on Filmons',
      'Hosts who want to receive payouts',
      'Freelancers accepting payments for services',
      'Anyone withdrawing earnings from the marketplace',
    ],
    extras: [
      { label: 'Wallet & balance dashboard',   sub: 'View your CAD and FP balances in real-time' },
      { label: 'Payout & withdrawal system',   sub: 'Withdraw earnings directly to your bank account' },
      { label: 'Transaction history',          sub: 'Full record of all payments, bookings, and credits' },
      { label: 'Filmons Points (FP)',          sub: 'Earn and spend FP across the marketplace' },
      { label: 'Invoice & receipt tools',      sub: 'Generate invoices for clients and track income' },
      { label: 'Secure payout verification',  sub: 'Identity-backed payouts for your protection' },
    ],
    requires: 'ID verification · Selfie verification · Payout verification',
  },
  listings: {
    Icon: Zap,
    label: 'Creator+ Required',
    gradient: 'from-blue-600 to-indigo-700',
    accent: 'bg-blue-500',
    glow: 'shadow-blue-700/50',
    textAccent: 'text-blue-200',
    lockNote: 'Hosting gear rentals, studios, and creative services requires a free Creator+ account with verified identity.',
    requiresLabel: 'Upgrade to Creator+ — It\'s Free',
    tagline: 'Verified marketplace participant',
    audience: [
      'Creators who want to host gear rentals',
      'Filmmakers listing studios or equipment',
      'Freelancers offering creative services',
      'Anyone earning on the Filmons marketplace',
    ],
    extras: [
      { label: 'Host gear & studio rentals',       sub: 'List your equipment for other creators to rent' },
      { label: 'List creative services',            sub: 'Offer your skills — editing, directing, photography' },
      { label: 'Booking & payout system',           sub: 'Accept bookings and receive direct payments' },
      { label: 'Marketplace analytics',             sub: 'Track views, bookings, and earnings' },
      { label: 'Verified Creator+ badge',           sub: 'Build trust with renters and clients' },
      { label: 'Invoices & transaction tools',      sub: 'Manage your rental and service income' },
    ],
    requires: 'ID verification · Selfie verification · Payout verification',
  },
  professional: {
    Icon: Star,
    label: 'Professional Account',
    gradient: 'from-violet-600 to-purple-700',
    accent: 'bg-violet-500',
    glow: 'shadow-violet-700/50',
    textAccent: 'text-violet-200',
    lockNote: 'Professional accounts require an active Creator+ subscription with verified identity and marketplace history.',
    requiresLabel: 'Upgrade to Creator+ first',
    tagline: 'Industry-recognized verified creator',
    audience: [
      'Established filmmakers & cinematographers',
      'Creative agencies & production professionals',
      'Experienced editors, photographers, directors',
      'Creators with a verified professional track record',
    ],
    extras: [
      { label: 'Verified Professional badge',   sub: 'Publicly recognized professional status' },
      { label: 'Verified Portfolio',            sub: 'Professionally endorsed creative work' },
      { label: 'Priority discovery',            sub: 'Higher ranking in creator & service search' },
      { label: 'Instant booking eligibility',   sub: 'Skip approval queues for trusted clients' },
      { label: 'Lower platform fees',           sub: 'Better margins on every booking' },
      { label: 'Featured placement',            sub: 'Homepage spotlights and curated sections' },
      { label: 'Advanced analytics',            sub: 'Audience insights, booking conversion, engagement' },
      { label: 'Priority dispute support',      sub: 'Faster resolution for professional users' },
    ],
    requires: 'Active Creator+ account · Professional portfolio review · Reliability score ≥ 50',
  },
  business: {
    Icon: Building2,
    label: 'Business Account',
    gradient: 'from-amber-500 to-orange-600',
    accent: 'bg-amber-400',
    glow: 'shadow-amber-600/50',
    textAccent: 'text-amber-100',
    lockNote: 'Business accounts require an active Professional account with business registration documents and company validation.',
    requiresLabel: 'Upgrade to Professional first',
    tagline: 'Enterprise & commercial operations',
    audience: [
      'Production studios and rental houses',
      'Creative agencies with multiple staff',
      'Companies managing large gear inventories',
      'Organizations operating commercially at scale',
    ],
    extras: [
      { label: 'Verified Business badge',         sub: 'Publicly confirmed company identity' },
      { label: 'Team management (up to 10)',       sub: 'Add members with assigned roles & permissions' },
      { label: 'Branded company storefront',       sub: 'Company profile with business presentation' },
      { label: 'Large inventory hosting',          sub: 'Warehouses, studios, gear catalogs at scale' },
      { label: 'Enterprise booking system',        sub: 'Scheduling, automation, availability management' },
      { label: 'Business invoices & tax export',   sub: 'Accounting tools for commercial operations' },
      { label: 'Revenue analytics',               sub: 'Operational metrics, customer analytics, ROI' },
      { label: 'API access (coming soon)',         sub: 'Integrations with CRM and enterprise tools' },
    ],
    requires: 'Active Professional account · Business registration documents · Company validation',
  },
};

export function CreatorPlusRequired() {
  const navigate    = useNavigate();
  const [params]    = useSearchParams();
  const type        = (params.get('type') ?? 'professional') as 'wallet' | 'listings' | 'professional' | 'business';
  const info        = ACCOUNT_INFO[type] ?? ACCOUNT_INFO.professional;

  return (
    <div className="min-h-screen bg-gray-950">

      {/* ── Top bar ── */}
      <div className="sticky top-14 z-20 bg-gray-950/90 backdrop-blur-sm border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <ArrowLeft className="w-4 h-4 text-white"/>
        </button>
        <h1 className="text-base font-black text-white">{info.label}</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 pb-32 space-y-4">

        {/* ── Hero card ── */}
        <div className={`rounded-2xl overflow-hidden bg-gradient-to-br ${info.gradient} shadow-2xl ${info.glow}`}>
          <div className="px-5 pt-6 pb-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                <info.Icon className="w-7 h-7 text-white"/>
              </div>
              <div>
                <p className="text-xl font-black text-white">{info.label}</p>
                <p className={`text-sm ${info.textAccent}`}>{info.tagline}</p>
              </div>
            </div>

            {/* Audience chips */}
            <div className="flex flex-wrap gap-1.5">
              {info.audience.map(a => (
                <span key={a} className="text-[10px] font-semibold bg-white/15 text-white px-2.5 py-1 rounded-full">
                  {a}
                </span>
              ))}
            </div>
          </div>

          {/* Lock banner */}
          <div className="mx-3 mb-3 bg-black/30 backdrop-blur-sm rounded-xl px-4 py-3 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-400/20 flex items-center justify-center shrink-0 mt-0.5">
              <Lock className="w-4 h-4 text-amber-300"/>
            </div>
            <div>
              <p className="text-xs font-black text-white mb-0.5">
                {type === 'professional' || type === 'business' ? 'Professional required' : 'Creator+ required'}
              </p>
              <p className={`text-[11px] leading-relaxed ${info.textAccent} opacity-80`}>
                {info.lockNote}
              </p>
            </div>
          </div>
        </div>

        {/* ── What you get ── */}
        <div className="rounded-2xl border border-white/5 bg-gray-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">What {info.label} adds</p>
          </div>
          <div className="p-4 space-y-3">
            {info.extras.map(f => (
              <div key={f.label} className="flex items-start gap-3">
                <div className={`w-6 h-6 rounded-full ${info.accent} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Check className="w-3.5 h-3.5 text-white"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/80">{f.label}</p>
                  <p className="text-xs text-white/30">{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Requirements ── */}
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <p className="text-[10px] font-black text-amber-400/60 uppercase tracking-widest mb-1.5">Requirements</p>
          <div className="flex flex-wrap gap-1.5">
            {info.requires.split(' · ').map(r => (
              <span key={r} className="text-[11px] font-semibold text-amber-300/70 bg-amber-400/10 border border-amber-400/15 px-2.5 py-1 rounded-full">
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* ── CTAs ── */}
        <div className="space-y-2 pt-2">
          <button
            onClick={() => navigate(type === 'listings' || type === 'wallet' ? '/creator-plus-steps' : '/account/upgrade')}
            className={`w-full py-4 text-white font-black text-sm rounded-2xl shadow-xl active:scale-[0.98] transition-all bg-gradient-to-r ${info.gradient}`}>
            {info.requiresLabel} →
          </button>
          <button
            onClick={() => navigate('/account/upgrade')}
            className="w-full py-3 bg-white/5 border border-white/10 text-white/60 font-semibold text-sm rounded-2xl hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
            View all account tiers
            <ChevronRight className="w-4 h-4 text-white/30"/>
          </button>
        </div>

      </div>
    </div>
  );
}
