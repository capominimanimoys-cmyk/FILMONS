import { useNavigate, useSearchParams } from 'react-router';
import { CheckCircle, Star, Building2, Zap, CreditCard } from 'lucide-react';

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-5">
        <div className={`w-20 h-20 bg-gradient-to-br ${info.gradient} rounded-3xl flex items-center justify-center mx-auto`}>
          <info.Icon className="w-10 h-10 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-900">{info.label}</h2>
          <p className="text-gray-500 text-sm mt-2 leading-relaxed">{info.lockNote}</p>
        </div>
        <div className="bg-blue-50 rounded-2xl p-4 space-y-2 text-sm text-left">
          {info.extras.slice(0, 4).map(f => (
            <div key={f.label} className="flex items-center gap-2 text-blue-800">
              <CheckCircle className="w-4 h-4 text-blue-500 shrink-0" />{f.label}
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate(type === 'listings' || type === 'wallet' ? '/verification' : '/account/upgrade')}
          className={`w-full bg-gradient-to-r ${info.gradient} text-white font-black rounded-2xl py-4 hover:opacity-90 transition-opacity`}>
          {info.requiresLabel} →
        </button>
        <button onClick={() => navigate(-1)} className="text-gray-400 text-sm hover:text-gray-600">Go back</button>
      </div>
    </div>
  );
}
