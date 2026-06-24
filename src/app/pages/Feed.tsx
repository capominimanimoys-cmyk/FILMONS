/**
 * Filmons Feed — Coming Soon (V2)
 * Placeholder shown while the community feed is in development.
 */
import { useNavigate } from 'react-router';
import { Video, Camera, Gamepad2, Mic, Palette, Film, Music2, PenLine, Rocket, Users, MessageCircle } from 'lucide-react';

type LucideIcon = React.ComponentType<{ className?: string }>;
const ICONS: LucideIcon[] = [Video, Camera, Gamepad2, Mic, Palette, Film, Music2, PenLine];

export function Feed() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top bar */}
      <div
        className="sticky top-0 z-10 px-4 pt-12 pb-3 flex items-center gap-3"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #f3f4f6' }}
      >
        <Film className="w-5 h-5 text-gray-800"/>
        <p className="text-base font-black text-gray-900">Filmons Feed</p>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center gap-8">

        {/* Floating icons */}
        <div className="grid grid-cols-4 gap-3 mb-2">
          {ICONS.map((Icon, i) => (
            <div
              key={i}
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg,#f0f4ff,#e8eeff)',
                border: '1px solid #e0e7ff',
                animation: `float ${2.5 + i * 0.3}s ease-in-out ${i * 0.2}s infinite alternate`,
              }}
            >
              <Icon className="w-7 h-7 text-indigo-500"/>
            </div>
          ))}
        </div>

        <style>{`
          @keyframes float {
            from { transform: translateY(0px); }
            to   { transform: translateY(-8px); }
          }
        `}</style>

        {/* Heading */}
        <div className="space-y-2 max-w-xs">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black mb-2"
            style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}
          >
            <Rocket className="w-3 h-3"/> Coming Soon
          </div>
          <h1 className="text-2xl font-black text-gray-900 leading-tight">Community Feed</h1>
          <p className="text-[15px] text-gray-500 leading-relaxed">
            A creative space where filmmakers, photographers, gamers, musicians, and designers connect.
          </p>
        </div>

        {/* Feature list */}
        <div className="w-full max-w-xs space-y-2.5 text-left">
          {([
            { Icon: Film,          text: 'Share projects & behind-the-scenes' },
            { Icon: Music2,        text: 'Publish audio postcards' },
            { Icon: Users,         text: 'Discover creators & build your audience' },
            { Icon: MessageCircle, text: 'Connect with the Filmons community' },
          ] as { Icon: LucideIcon; text: string }[]).map(({ Icon, text }) => (
            <div key={text} className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
              <Icon className="w-5 h-5 text-indigo-500 shrink-0"/>
              <p className="text-sm text-gray-700 font-medium">{text}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="w-full max-w-xs space-y-3">
          <button
            onClick={() => navigate('/marketplace')}
            className="w-full py-4 rounded-2xl font-black text-white text-[15px] transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }}
          >
            Explore Marketplace
          </button>
          <button
            onClick={() => {
              const email = prompt('Enter your email to get notified:');
              if (email) alert(`✅ You're on the list! We'll notify ${email} when the feed launches.`);
            }}
            className="w-full py-3.5 rounded-2xl font-semibold text-gray-600 text-sm bg-gray-100 transition-all active:scale-[0.98]"
          >
            Get Notified When It Launches
          </button>
        </div>
      </div>

      <div className="h-24" />
    </div>
  );
}
