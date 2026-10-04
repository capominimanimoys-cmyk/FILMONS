// FILMONS Learning Home hero, with its own motion design (all motion is in
// src/styles/learning-hero.css): drifting light orbs, a projector-beam
// sweep and floating film-tool icons behind a choreographed entrance --
// headline words rise from masks, "creators." shimmers with a drawn
// underline, then the paragraph, CTA and value props follow. Delays are
// passed per element as --d so the sequence reads in one place, here.
import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, Award, BookOpen, Camera, Clapperboard, Globe2, GraduationCap, Mic, Play } from 'lucide-react';

const d = (ms: number, extra?: Record<string, string>) => ({ '--d': `${ms}ms`, ...extra } as CSSProperties);

function Word({ delay, children }: { delay: number; children: ReactNode }) {
  return <span className="lh-word"><span style={d(delay)}>{children}</span></span>;
}

const PROPS = [
  { icon: Award, label: 'Industry experts' },
  { icon: BookOpen, label: 'Practical lessons' },
  { icon: GraduationCap, label: 'Certificates' },
  { icon: Globe2, label: 'Global community' },
];

// Decorative only (aria-hidden) -- position, size, tilt and entrance delay.
const FLOATERS = [
  { icon: Clapperboard, cls: 'top-[18%] right-[12%] w-16 h-16', size: 28, r: '-8deg', delay: 600 },
  { icon: Camera,       cls: 'top-[52%] right-[24%] w-14 h-14', size: 24, r: '6deg',  delay: 800 },
  { icon: Play,         cls: 'top-[30%] right-[34%] w-11 h-11', size: 18, r: '10deg', delay: 1000 },
  { icon: Mic,          cls: 'bottom-[16%] right-[8%] w-12 h-12', size: 20, r: '-5deg', delay: 1150 },
];

export function LearningHero({ onStart }: { onStart: () => void }) {
  return (
    <div className="lh">
      <div aria-hidden className="lh-orb lh-orb--blue" />
      <div aria-hidden className="lh-orb lh-orb--indigo" />
      <div aria-hidden className="lh-beam" />
      <div aria-hidden className="hidden lg:block">
        {FLOATERS.map(({ icon: Icon, cls, size, r, delay }) => (
          <span key={cls} className={`lh-float ${cls}`} style={d(delay, { '--r': r })}>
            <Icon width={size} height={size} strokeWidth={1.75} />
          </span>
        ))}
      </div>

      <div className="lg:max-w-5xl lg:mx-auto px-4 lg:px-0 py-10 lg:py-16">
        <p className="lh-eyebrow text-[11px] font-black tracking-[0.2em] text-blue-400 uppercase mb-3">Filmons Learning</p>

        <h1 className="text-3xl lg:text-5xl font-black text-white leading-[1.1] max-w-lg">
          <Word delay={250}>Real</Word> <Word delay={330}>skills</Word><br />
          <Word delay={430}>for</Word> <Word delay={510}>real</Word>{' '}
          <span className="lh-word">
            <span className="lh-accent" style={d(600)}>
              creators.
              <span aria-hidden className="lh-underline" style={d(1100)} />
            </span>
          </span>
        </h1>

        <p className="lh-fade-up text-sm lg:text-base text-gray-300 mt-4 max-w-md leading-relaxed" style={d(850)}>
          Learn from industry professionals. Practical skills. Real projects.
          A stronger future for creators.
        </p>

        <button onClick={onStart} style={d(1000)}
          className="lh-cta mt-6 flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 transition-colors">
          Start Learning <ArrowRight className="w-4 h-4" />
        </button>

        <div className="relative mt-8 pt-6">
          <span aria-hidden className="lh-rule absolute inset-x-0 top-0 h-px bg-white/10" style={d(1100)} />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {PROPS.map((v, i) => (
              <span key={v.label} className="lh-prop flex items-center gap-1.5 text-xs font-semibold text-gray-300" style={d(1200 + i * 90)}>
                <v.icon className="w-3.5 h-3.5 text-blue-400" /> {v.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
