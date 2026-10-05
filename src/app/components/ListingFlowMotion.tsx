// Motion for the Create Listing / Post an Opportunity flows:
//  - the whole page slides in from the right when opened,
//  - each step slides in from the right (forward) or left (back),
//  - the blocks inside a step pop out (scale + fade overshoot), staggered.
// Plain CSS animations with fill-mode `backwards` (NOT forwards/both): a
// lingering transform would become the containing block for the pages'
// position:fixed bottom nav bars and break them.
import { useEffect, useRef, type ReactNode } from 'react';

const CSS = `
  @keyframes cfPageIn   { from { transform: translateX(100%); } to { transform: none; } }
  @keyframes cfStepFwd  { from { opacity: 0; transform: translateX(36px); } to { opacity: 1; transform: none; } }
  @keyframes cfStepBack { from { opacity: 0; transform: translateX(-36px); } to { opacity: 1; transform: none; } }
  @keyframes cfPop {
    0%   { opacity: 0; transform: scale(0.88); }
    60%  { opacity: 1; transform: scale(1.03); }
    100% { opacity: 1; transform: none; }
  }
  .cf-page      { animation: cfPageIn 380ms cubic-bezier(0.32, 0.72, 0, 1) backwards; }
  .cf-step-fwd  { animation: cfStepFwd 320ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }
  .cf-step-back { animation: cfStepBack 320ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }
  .cf-pop > * > * { animation: cfPop 420ms cubic-bezier(0.22, 1, 0.36, 1) 220ms backwards; }
  .cf-pop > * > *:nth-child(1) { animation-delay: 80ms; }
  .cf-pop > * > *:nth-child(2) { animation-delay: 130ms; }
  .cf-pop > * > *:nth-child(3) { animation-delay: 180ms; }
  .cf-pop > * > *:nth-child(4) { animation-delay: 230ms; }
  .cf-pop > * > *:nth-child(5) { animation-delay: 280ms; }
  .cf-pop > * > *:nth-child(6) { animation-delay: 330ms; }
  .cf-pop > * > *:nth-child(7) { animation-delay: 380ms; }
  .cf-pop > * > *:nth-child(n+8) { animation-delay: 420ms; }
  @media (prefers-reduced-motion: reduce) {
    .cf-page, .cf-step-fwd, .cf-step-back, .cf-pop > * > * { animation: none; }
  }
`;

export function ListingFlowStyles() {
  return <style>{CSS}</style>;
}

/** Re-mounts on every step change so the slide + pop replay. */
export function StepTransition({ step, children }: { step: number; children: ReactNode }) {
  const prev = useRef(step);
  const forward = step >= prev.current;
  useEffect(() => { prev.current = step; }, [step]);
  return (
    <div key={step} className={`cf-pop ${forward ? 'cf-step-fwd' : 'cf-step-back'}`}>
      <div>{children}</div>
    </div>
  );
}
