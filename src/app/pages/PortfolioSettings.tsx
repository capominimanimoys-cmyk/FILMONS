import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Globe, Lock, Users, Upload,
  Grid3X3, Layers, Play, Maximize2, BookOpen,
  CheckCircle, Sparkles, Camera, Image as ImageIcon,
  BarChart2, MessageSquare, Briefcase, ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

function readBool(key: string, def = true): boolean {
  const v = localStorage.getItem(key);
  return v === null ? def : v === 'true';
}
function saveBool(key: string, v: boolean) {
  localStorage.setItem(key, String(v));
}

type Visibility = 'public' | 'private' | 'unlisted';
type Theme = 'matte-black' | 'filmic' | 'cyberpunk' | 'editorial' | 'minimal' | 'neon';
type Layout = 'grid' | 'masonry' | 'reel-first' | 'fullscreen' | 'magazine';

const THEMES: { id: Theme; label: string; colors: string[] }[] = [
  { id: 'matte-black', label: 'Matte Black',  colors: ['#0a0a0a','#1a1a1a','#333'] },
  { id: 'filmic',      label: 'Filmic',        colors: ['#1a1209','#c8a87a','#f5e6c8'] },
  { id: 'cyberpunk',   label: 'Cyberpunk',     colors: ['#000','#00ffff','#ff00ff'] },
  { id: 'editorial',   label: 'Editorial',     colors: ['#fafafa','#1a1a1a','#888'] },
  { id: 'minimal',     label: 'Minimal',       colors: ['#fff','#f0f0f0','#222'] },
  { id: 'neon',        label: 'Neon',          colors: ['#050510','#7c3aed','#06b6d4'] },
];

const LAYOUTS: { id: Layout; label: string; icon: React.ReactNode }[] = [
  { id: 'grid',       label: 'Grid',        icon: <Grid3X3 className="w-5 h-5"/> },
  { id: 'masonry',    label: 'Masonry',     icon: <Layers className="w-5 h-5"/> },
  { id: 'reel-first', label: 'Reel-first',  icon: <Play className="w-5 h-5"/> },
  { id: 'fullscreen', label: 'Fullscreen',  icon: <Maximize2 className="w-5 h-5"/> },
  { id: 'magazine',   label: 'Magazine',    icon: <BookOpen className="w-5 h-5"/> },
];

export function PortfolioSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<'home'|'create'|'theme'|'upload'|'visibility'>('home');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [theme,    setTheme]    = useState<Theme>('matte-black');
  const [layout,   setLayout]   = useState<Layout>('grid');
  const [hasPortfolio, setHasPortfolio] = useState(false);

  // Display toggles — stored in localStorage, read by Portfolio.tsx when isOwner
  const [showStats,   setShowStats]   = useState(() => readBool('filmons_portfolio_show_stats'));
  const [showHire,    setShowHire]    = useState(() => readBool('filmons_portfolio_show_hire'));
  const [showMessage, setShowMessage] = useState(() => readBool('filmons_portfolio_show_message'));

  const portfolioUrl = `filmons.com/@${user?.username || user?.name?.toLowerCase().replace(/\s/g,'') || 'you'}`;

  const BACK = (
    <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
      <button onClick={() => step === 'home' ? navigate('/settings') : setStep('home')}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
        <ArrowLeft className="w-4 h-4 text-gray-700" />
      </button>
      <h1 className="text-base font-black text-gray-900">
        {step === 'home' ? 'Portfolio' : step === 'create' ? 'Create Portfolio' : step === 'theme' ? 'Theme & Layout' : step === 'upload' ? 'Upload Work' : 'Visibility'}
      </h1>
    </div>
  );

  // Home screen
  if (step === 'home' && !hasPortfolio) return (
    <div className="min-h-screen bg-gray-50">
      {BACK}
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-purple-700 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <Sparkles className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Create Your Portfolio</h2>
        <p className="text-gray-500 text-sm leading-relaxed mb-8">
          Build a cinematic showcase for your creative work. Share your reel, projects, and services with the world.
        </p>
        <div className="space-y-3">
          <button onClick={() => setStep('create')}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-sm transition-colors shadow-md">
            ✨ Create Portfolio
          </button>
          <button onClick={() => setStep('theme')}
            className="w-full py-3.5 border-2 border-gray-200 text-gray-700 font-semibold rounded-2xl text-sm hover:border-gray-300 transition-colors">
            Choose Template
          </button>
          <button onClick={() => toast.info('Import coming soon')}
            className="w-full py-3.5 border-2 border-gray-200 text-gray-700 font-semibold rounded-2xl text-sm hover:border-gray-300 transition-colors">
            Import Projects
          </button>
          <button onClick={() => navigate('/settings')}
            className="w-full py-3 text-gray-400 text-sm">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );

  if (step === 'create') return (
    <div className="min-h-screen bg-gray-50">
      {BACK}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <p className="text-sm text-gray-500">Step 1 of 3 — Choose your theme and layout</p>

        {/* Themes */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-900 mb-3">Theme</p>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(t => (
              <button key={t.id} onClick={() => setTheme(t.id)}
                className={`relative rounded-xl overflow-hidden border-2 transition-all ${theme === t.id ? 'border-blue-500 shadow-md' : 'border-gray-100'}`}>
                <div className="h-16 flex">
                  {t.colors.map((c,i) => <div key={i} style={{background:c, flex:1}}/>)}
                </div>
                <p className={`text-[11px] font-bold py-1.5 text-center ${theme === t.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}>{t.label}</p>
                {theme === t.id && <div className="absolute top-1 right-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center"><CheckCircle className="w-3 h-3 text-white"/></div>}
              </button>
            ))}
          </div>
        </div>

        {/* Layouts */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-900 mb-3">Layout</p>
          <div className="grid grid-cols-2 gap-2">
            {LAYOUTS.map(l => (
              <button key={l.id} onClick={() => setLayout(l.id)}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${layout === l.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                <span className={layout === l.id ? 'text-blue-600' : 'text-gray-400'}>{l.icon}</span>
                <p className={`text-sm font-semibold ${layout === l.id ? 'text-blue-700' : 'text-gray-700'}`}>{l.label}</p>
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => setStep('upload')}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-sm transition-colors">
          Next: Upload Work →
        </button>
      </div>
    </div>
  );

  if (step === 'upload') return (
    <div className="min-h-screen bg-gray-50">
      {BACK}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <p className="text-sm text-gray-500">Step 2 of 3 — Add your work</p>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-blue-300 transition-colors cursor-pointer">
            <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3"/>
            <p className="font-bold text-gray-900 mb-1">Upload your work</p>
            <p className="text-xs text-gray-400 mb-4">Videos, photos, reels, projects</p>
            <button className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl">Choose Files</button>
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Or import from</p>
            {['Instagram','YouTube','Vimeo','Google Drive','Filmons Posts'].map(src => (
              <button key={src} onClick={() => toast.info(`${src} import coming soon`)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 text-left text-sm text-gray-700 font-medium">
                {src}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setStep('visibility')}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-sm">
          Next: Set Visibility →
        </button>
      </div>
    </div>
  );

  // Visibility / home when portfolio exists
  return (
    <div className="min-h-screen bg-gray-50">
      {BACK}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {step === 'upload' || step === 'visibility' ? <p className="text-sm text-gray-500">Step 3 of 3 — Visibility</p> : null}

        {/* View portfolio shortcut */}
        <button
          onClick={() => navigate(`/portfolio`)}
          className="w-full flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl px-5 py-4"
        >
          <div className="text-left">
            <p className="font-black text-sm">View My Portfolio</p>
            <p className="text-xs text-blue-200 mt-0.5">See how visitors see your work</p>
          </div>
          <ExternalLink className="w-4 h-4 shrink-0" />
        </button>

        {/* Profile media shortcuts */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-sm font-black text-gray-900">Profile Media</p>
            <p className="text-xs text-gray-400 mt-0.5">Edit via your profile page</p>
          </div>
          <div className="divide-y divide-gray-50">
            <button
              onClick={() => navigate('/profile')}
              className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">Profile Photo</p>
                <p className="text-xs text-gray-400 mt-0.5">Update your avatar</p>
              </div>
              <ArrowLeft className="w-4 h-4 text-gray-300 rotate-180 shrink-0" />
            </button>
            <button
              onClick={() => navigate('/profile')}
              className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <ImageIcon className="w-5 h-5 text-indigo-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">Cover Photo</p>
                <p className="text-xs text-gray-400 mt-0.5">Change your portfolio banner</p>
              </div>
              <ArrowLeft className="w-4 h-4 text-gray-300 rotate-180 shrink-0" />
            </button>
          </div>
        </div>

        {/* Display toggles */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-sm font-black text-gray-900">Display Options</p>
            <p className="text-xs text-gray-400 mt-0.5">Control what visitors see on your portfolio</p>
          </div>
          <div className="divide-y divide-gray-50">
            {([
              { key: 'stats',   icon: BarChart2,     label: 'Follower & View Stats', sub: 'Show counts on your portfolio header', val: showStats,   set: (v: boolean) => { setShowStats(v);   saveBool('filmons_portfolio_show_stats', v);   } },
              { key: 'hire',    icon: Briefcase,     label: 'Hire Button',           sub: 'Visitors can tap Hire to find your listings', val: showHire,    set: (v: boolean) => { setShowHire(v);    saveBool('filmons_portfolio_show_hire', v);    } },
              { key: 'message', icon: MessageSquare, label: 'Message Button',        sub: 'Visitors can message you from your portfolio', val: showMessage, set: (v: boolean) => { setShowMessage(v); saveBool('filmons_portfolio_show_message', v); } },
            ] as any[]).map(row => (
              <div key={row.key} className="flex items-center gap-4 px-4 py-4">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                  <row.icon className="w-5 h-5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{row.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{row.sub}</p>
                </div>
                <button
                  onClick={() => row.set(!row.val)}
                  className={`shrink-0 relative w-11 h-6 rounded-full transition-colors ${row.val ? 'bg-blue-500' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${row.val ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Portfolio URL preview */}
        {visibility === 'public' && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
            <p className="text-xs text-blue-600 font-bold mb-1">Your public portfolio URL</p>
            <p className="text-sm font-mono text-blue-800">{portfolioUrl}</p>
          </div>
        )}

        {/* Visibility options */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
          {([
            { id: 'public',   icon: <Globe className="w-5 h-5 text-green-500"/>,  label: 'Public',   sub: 'Anyone can view your portfolio' },
            { id: 'private',  icon: <Lock  className="w-5 h-5 text-gray-400"/>,   label: 'Private',  sub: 'Only you can see it' },
            { id: 'unlisted', icon: <Users className="w-5 h-5 text-blue-500"/>,   label: 'Unlisted', sub: 'Anyone with the link can view' },
          ] as { id: Visibility; icon: React.ReactNode; label: string; sub: string }[]).map(v => (
            <button key={v.id} onClick={() => setVisibility(v.id)}
              className={`w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors ${visibility === v.id ? 'bg-blue-50' : ''}`}>
              {v.icon}
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{v.label}</p>
                <p className="text-xs text-gray-400">{v.sub}</p>
              </div>
              {visibility === v.id && (
                <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-3.5 h-3.5 text-white"/>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Public share options */}
        {visibility === 'public' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <p className="text-sm font-bold text-gray-900">Share your portfolio</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Copy link',    icon: '🔗', action: () => { navigator.clipboard.writeText(portfolioUrl); toast.success('Link copied!'); } },
                { label: 'QR Code',      icon: '⬜', action: () => toast.info('QR Code generator coming soon') },
                { label: 'Instagram',    icon: '📸', action: () => toast.info('Share to Instagram coming soon') },
                { label: 'WhatsApp',     icon: '💬', action: () => window.open(`https://wa.me/?text=${encodeURIComponent(portfolioUrl)}`) },
              ].map(s => (
                <button key={s.label} onClick={s.action}
                  className="flex items-center gap-2 px-3 py-3 rounded-xl border border-gray-100 hover:bg-gray-50 text-sm font-medium text-gray-700">
                  <span>{s.icon}</span>{s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => { setHasPortfolio(true); toast.success('Portfolio saved!'); navigate('/settings'); }}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-sm transition-colors">
          Save Portfolio Settings
        </button>
      </div>
    </div>
  );
}