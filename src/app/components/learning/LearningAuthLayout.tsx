// Shared shell for FILMONS Learning's sign-in and sign-up pages (see
// pages/LearningLogin.tsx / LearningSignup.tsx). Rendered outside
// LearningLayout (no product header), on the same light palette the rest
// of Learning uses: desktop gets a learning-focused showcase panel beside
// the form card, mobile collapses to just the logo lockup + the card.
import type { ReactNode } from 'react';
import { BookOpen, GraduationCap, PlayCircle, TrendingUp } from 'lucide-react';
import { AuthScreenLayout } from '../AuthScreenLayout';
import { FilmonsLogo } from '../FilmonsLogo';

const HIGHLIGHTS = [
  { icon: PlayCircle, title: 'Learn from working creatives', body: 'Courses taught by filmmakers, photographers and producers on FILMONS.' },
  { icon: TrendingUp, title: 'Learn at your own pace',       body: 'Pick up any lesson where you left off, on any device.' },
  { icon: BookOpen,   title: 'One FILMONS account',          body: 'Your courses, purchases and progress stay with the account you use on FILMONS.' },
];

export function LearningLogoLockup({ size = 34 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <FilmonsLogo iconSize={size} />
      <span className="flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
        <GraduationCap className="w-3 h-3" strokeWidth={2.5} />
        Learning
      </span>
    </div>
  );
}

export function LearningAuthLayout({ children }: { children: ReactNode }) {
  return (
    <AuthScreenLayout className="bg-gray-50">
      <div className="flex-1 flex">
        {/* Desktop showcase */}
        <aside className="hidden lg:flex relative w-[46%] max-w-[640px] flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-800 px-14 xl:px-20 py-14 text-white">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl" />

          <div className="relative flex items-center gap-2.5">
            <FilmonsLogo iconSize={34} theme="dark" />
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
              <GraduationCap className="w-3 h-3" strokeWidth={2.5} />
              Learning
            </span>
          </div>

          <div className="relative">
            <p className="text-4xl xl:text-[44px] font-black leading-[1.08] tracking-tight">
              Build the skills behind your next project.
            </p>
            <ul className="mt-10 space-y-6">
              {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{title}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-white/70">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-xs text-white/50">FILMONS Learning is part of FILMONS.</p>
        </aside>

        {/* Form column */}
        <main className="flex-1 flex flex-col items-center overflow-y-auto px-4 sm:px-6"
          style={{ paddingTop: 'max(28px, env(safe-area-inset-top))', paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}>
          <div className="w-full max-w-[420px] my-auto">
            <div className="lg:hidden flex justify-center mb-7">
              <LearningLogoLockup />
            </div>
            <div className="auth-pop-main rounded-3xl bg-white border border-gray-100 shadow-xl shadow-gray-200/60 px-6 py-8 sm:px-9 sm:py-10">
              {children}
            </div>
          </div>
        </main>
      </div>
    </AuthScreenLayout>
  );
}

export function GoogleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
