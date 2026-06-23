import { useNavigate, Link } from 'react-router';
import { captureSnapshot } from '../lib/smartAnimate';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { themeSettingsApi } from '../lib/settingsApi';
import { useT } from '../lib/i18n';
import {
  User, BarChart2, ShoppingBag, CreditCard, Package, MessageCircle,
  Bell, Shield, Lock, FileText, HelpCircle, ChevronRight, ArrowLeft,
  Smartphone, LogOut, Trash2, Globe, Star, Eye,
  CheckCircle, Zap, Palette, Sparkles, Search,
  MapPin, Info, Layers,
} from 'lucide-react';
import { normalizeTier, getTierLabel, getTierBadge } from '../lib/reliabilityApi';
import { toast } from 'sonner';

export function Settings() {
  const { user, isAuthenticated } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const T = useT();

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Link to="/login" className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold text-sm">Sign In</Link>
      </div>
    );
  }

  // Navigate with slide-right animation
  const go = (path: string) => {
    navigate(path);
  };

  const groups = [
    {
      title: T('settings.profile_section'),
      items: [
        {
          icon: User, label: 'Account',
          sub: `${user.name} · ${user.email}`,
          action: () => navigate('/profile?tab=about'),
        },
        { icon: BarChart2, label: 'Professional Dashboard', sub: 'Analytics, performance, earnings', action: () => go('/dashboard') },
        { icon: Layers,    label: 'Portfolio',              sub: 'Showcase, visibility, themes',     action: () => go('/settings/portfolio') },
      ],
    },
    {
      title: T('settings.marketplace'),
      items: [
        { icon: Package,     label: 'Rentals & Orders',  sub: 'Active rentals, history',       action: () => go('/my-orders')   },
        { icon: ShoppingBag, label: 'My Listings',       sub: 'Manage your gear and services',
          action: () => {
            if (normalizeTier(user?.accountType) === 'creator') { go('/creator-plus-required?type=listings'); }
            else { go('/my-listings'); }
          }
        },
        { icon: CreditCard,  label: 'Wallet & Payments', sub: 'Balance, payouts, transactions',
          action: () => {
            if (normalizeTier(user?.accountType) === 'creator') { go('/creator-plus-required?type=wallet'); }
            else { go('/wallet'); }
          }
        },
      ],
    },
    {
      title: 'Creator',
      items: [
        { icon: Search,      label: 'Search & Discovery', sub: 'Who can find you, recommendations', action: () => go('/settings/discovery') },
        { icon: MapPin,      label: 'Creator Preferences', sub: 'Availability, booking, work style', action: () => go('/settings/creator-preferences') },
      ],
    },
    {
      title: T('settings.communication'),
      items: [
        { icon: MessageCircle, label: T('settings.messages'),      sub: 'DMs, collaboration, safety controls',   action: () => go('/settings/messages') },
        { icon: Bell,          label: T('settings.notifications'), sub: 'Push, email, collaboration, analytics', action: () => go('/settings/notifications') },
      ],
    },
    {
      title: T('settings.trust'),
      items: [
        { icon: Eye,  label: T('settings.privacy'), sub: 'Profile, portfolio, discoverability', action: () => go('/settings/privacy') },
        { icon: Lock, label: 'Security',            sub: 'Password, 2FA, login activity',       action: () => go('/settings/security') },
        { icon: Star, label: T('settings.reviews'), sub: 'Ratings, reliability score, badges',  action: () => go('/settings/reviews') },
      ],
    },
    {
      title: T('settings.actions'),
      items: [
        { icon: Smartphone, label: T('settings.devices'), sub: 'Active sessions, apps, security', action: () => go('/settings/devices') },
        { icon: LogOut,     label: 'Log Out',        action: () => navigate('/login'), danger: true },
        { icon: Trash2,     label: 'Delete Account', sub: 'Permanently remove account', action: () => toast.error('Contact support to delete your account'), danger: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => { captureSnapshot(); navigate(-1); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <h1 className="text-base font-black text-gray-900">Settings</h1>
      </div>

      {/* User card — tappable → goes to About in profile */}
      <button onClick={() => { captureSnapshot(); navigate('/profile?tab=about'); }}
        className="bg-white mx-4 mt-4 rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 w-[calc(100%-32px)] text-left hover:bg-gray-50 transition-colors active:scale-[0.99]">
        <div className="w-12 h-12 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
          {user.avatar
            ? <img src={user.avatar} alt="" className="w-full h-full object-cover"/>
            : <span className="text-lg font-black text-gray-500">{user.name?.[0]?.toUpperCase()}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 truncate">{user.name}</p>
          <p className="text-xs text-gray-400 truncate">{user.email}</p>
        </div>
        <div className="flex items-center gap-1 text-xs text-blue-600 font-semibold shrink-0">
          Edit <ChevronRight className="w-3.5 h-3.5"/>
        </div>
      </button>

      {/* ── Upgrade Plan banner ── */}
      {(() => {
        const tier = normalizeTier(user?.accountType);
        const badge = getTierBadge(tier);
        const isTop = tier === 'business';
        const gradients: Record<string, string> = {
          creator:      'from-gray-800 to-gray-900',
          creator_plus: 'from-blue-600 to-indigo-700',
          professional: 'from-violet-600 to-purple-700',
          business:     'from-amber-500 to-orange-600',
        };
        const nextLabel: Record<string, string> = {
          creator:      'Upgrade to Creator+',
          creator_plus: 'Upgrade to Professional',
          professional: 'Upgrade to Business',
          business:     '',
        };
        const nextSub: Record<string, string> = {
          creator:      'Free with ID verification',
          creator_plus: '$49/month · portfolio review',
          professional: '$149/month · business tools',
          business:     '',
        };
        return (
          <div className="mx-4 mt-4">
            <div className={`rounded-2xl overflow-hidden bg-gradient-to-br ${gradients[tier]} shadow-lg`}>
              <div className="px-4 py-4">
                {/* Current plan row */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-white"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black text-white">{getTierLabel(tier)}</p>
                      {badge && (
                        <span className="text-[9px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full">
                          {badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/60 mt-0.5">Current plan</p>
                  </div>
                  <button
                    onClick={() => go('/account/upgrade')}
                    className="shrink-0 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-[11px] font-bold px-3 py-1.5 rounded-full transition-colors">
                    <Sparkles className="w-3 h-3"/>
                    {isTop ? 'View Plans' : 'Upgrade'}
                  </button>
                </div>

                {/* Next tier CTA */}
                {!isTop && (
                  <button
                    onClick={() => go('/account/upgrade')}
                    className="w-full bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl px-3 py-2.5 flex items-center justify-between transition-colors">
                    <div className="text-left">
                      <p className="text-xs font-black text-white">{nextLabel[tier]}</p>
                      <p className="text-[10px] text-white/50 mt-0.5">{nextSub[tier]}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/40 shrink-0"/>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Appearance */}
      <div className="mx-4 mt-5">
        <p className="text-[10px] font-black text-gray-400 tracking-widest mb-2 px-1">APPEARANCE</p>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-4 h-4 text-gray-600"/>
              <p className="font-bold text-gray-900 text-sm">Theme</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {([
                { id: 'light', label: T('settings.light'), icon: '☀️', desc: T('settings.light_desc') },
                { id: 'dark',  label: T('settings.dark'),  icon: '🌑', desc: T('settings.dark_desc')   },
              ] as const).map(preset => (
                <button key={preset.id} onClick={async () => {
                    setTheme(preset.id);
                    toast.success(preset.id === 'dark' ? '🌑 Dark mode on' : '☀️ Light mode on');
                    if (user?.id) {
                      try {
                        await themeSettingsApi.save(user.id, preset.id, localStorage.getItem('filmons_language') || 'en-CA');
                      } catch (e) {
                        console.warn('[Settings] theme save failed:', e);
                      }
                    }
                  }}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all active:scale-95 ${
                    theme === preset.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'
                  }`}>
                  <div className={`w-full h-12 rounded-xl border ${preset.id === 'dark' ? 'bg-black border-gray-700' : 'bg-white border-gray-200'}`}>
                    <div className={`h-3 rounded-t-xl ${preset.id === 'dark' ? 'bg-gray-900' : 'bg-gray-100'}`}/>
                  </div>
                  <div className="text-center">
                    <span className="text-lg">{preset.icon}</span>
                    <p className={`text-xs font-bold mt-0.5 ${theme === preset.id ? 'text-blue-600' : 'text-gray-700'}`}>{preset.label}</p>
                    <p className="text-[10px] text-gray-400">{preset.desc}</p>
                  </div>
                  {theme === preset.id && (
                    <div className="absolute top-2 right-2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-[8px] font-black">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Language — tappable row */}
          <button onClick={() => go('/settings/language')}
            className="border-t border-gray-50 px-4 py-3 flex items-center gap-3 w-full hover:bg-gray-50 transition-colors">
            <Globe className="w-4 h-4 text-gray-500 shrink-0"/>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-gray-900">Language & Region</p>
              <p className="text-xs text-gray-400">{localStorage.getItem('filmons_language') === 'fr-CA' ? 'Français (Canada)' : 'English (Canada)'}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300"/>
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-[11px] text-amber-700 leading-relaxed">
          <span className="font-bold">About Filmons:</span> Filmons facilitates connections between creators. Users are responsible for their own equipment and agreements.
        </p>
      </div>

      {/* ── Account Verification, Trust & Plan — always visible ── */}
      <div className="mx-4 mt-5">
        <p className="text-[10px] font-black text-gray-400 tracking-widest mb-2 px-1">VERIFICATION & TRUST</p>
        <button
          onClick={() => go('/settings/verification')}
          className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 flex items-center gap-3 text-left hover:bg-gray-50 active:scale-[0.99] transition-all">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${user.isVerified ? 'bg-green-50' : 'bg-amber-50'}`}>
            <CheckCircle className={`w-5 h-5 ${user.isVerified ? 'text-green-600' : 'text-amber-500'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">Account Verification, Trust & Plan</p>
            <p className="text-xs text-gray-400 mt-0.5">ID verification · trust levels · account tier</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${user.isVerified ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {user.isVerified ? 'Verified' : 'Pending'}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-300"/>
          </div>
        </button>
      </div>

      {/* Settings groups */}
      <div className="px-4 py-4 space-y-5">
        {groups.map(group => (
          <div key={group.title}>
            <p className="text-[10px] font-black text-gray-400 tracking-widest mb-2 px-1">{group.title}</p>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
              {group.items.map(({ icon: Icon, label, sub, badge, badgeColor, danger, action }: any) => (
                <button key={label} onClick={action}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${danger ? 'hover:bg-red-50' : 'hover:bg-gray-50'}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${danger ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <Icon className={`w-4 h-4 ${danger ? 'text-red-500' : 'text-gray-600'}`}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${danger ? 'text-red-500' : 'text-gray-900'}`}>{label}</p>
                    {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
                  </div>
                  {badge && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badgeColor}`}>{badge}</span>}
                  {!danger && <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Help & Support */}
      <div id="help" className="mx-4 mb-4">
        <p className="text-[10px] font-black text-gray-400 tracking-widest mb-2 px-1">HELP & SUPPORT</p>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
          {[
            { icon: HelpCircle, label: 'Help Center',        action: () => go('/help') },
            { icon: FileText,   label: 'Terms & Conditions', action: () => navigate('/terms-conditions') },
            { icon: Shield,     label: 'Privacy Policy',     action: () => navigate('/privacy-policy') },
            { icon: BarChart2,  label: 'Report a Problem',   action: () => toast.info('Email: support@filmons.ca') },
          ].map(({ icon: Icon, label, action }: any) => (
            <button key={label} onClick={action}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-gray-600"/>
              </div>
              <p className="flex-1 text-sm font-semibold text-gray-900">{label}</p>
              <ChevronRight className="w-4 h-4 text-gray-300"/>
            </button>
          ))}
        </div>
      </div>

      {/* About Filmons */}
      <div className="mx-4 mb-5">
        <p className="text-[10px] font-black text-gray-400 tracking-widest mb-2 px-1">ABOUT FILMONS</p>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
          <button
            onClick={() => toast.info('Filmons v1.0.0 — Made for creators in Canada')}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
            <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
              <Info className="w-4 h-4 text-gray-600"/>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">About Filmons</p>
              <p className="text-[11px] text-gray-400">Version 1.0.0</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300"/>
          </button>
          <button
            onClick={() => toast.info('Open source licenses coming soon')}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
            <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-gray-600"/>
            </div>
            <p className="flex-1 text-sm font-semibold text-gray-900">Open Source Licenses</p>
            <ChevronRight className="w-4 h-4 text-gray-300"/>
          </button>
        </div>
      </div>

      <div className="text-center py-4 pb-24">
        <p className="text-[10px] text-gray-300 font-medium">Filmons v1.0 · Made for creators in Canada</p>
      </div>
    </div>
  );
}