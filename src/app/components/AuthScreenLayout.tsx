import type { ReactNode } from 'react';

/**
 * Shared full-bleed shell for every pre-auth screen (sign in, sign up,
 * Google/phone auth, OTP/device verification, password recovery, email
 * verification). Two things every one of these screens got wrong
 * independently, now fixed in one place:
 *
 * 1. Never position:fixed. A fixed root on a freshly-routed-to page is a
 *    known source of dropped taps on iOS Safari (the whole reason these
 *    screens needed multiple taps to respond) -- normal document flow
 *    doesn't have that problem, same as every other page in the app.
 * 2. min-h-[100dvh], not h-screen (100vh). 100vh is a static number that
 *    doesn't track the browser's actual visible viewport, so the
 *    background falls short of the real bottom of the screen (or gets
 *    clipped) as mobile browser chrome / the on-screen keyboard show and
 *    hide. dvh is the dynamic viewport unit that keeps up automatically,
 *    including snapping back to full height when the keyboard closes.
 *
 * Direct children should use `flex-1` (not `h-full`) to fill the
 * remaining space, since the ancestor is a minimum height, not a fixed
 * one -- same convention Root.tsx's own shell already uses.
 */
// Pop-up appearance classes shared by auth screens that opt in (currently
// just Login.tsx) -- defined once here rather than per-page. Plain <style>
// (not Tailwind utilities) on purpose: this app's global `*` rule in
// theme.css sets transition-property to a fixed list that excludes
// transform, and per the CSS Cascade Layers spec an unlayered rule like
// that one always beats a Tailwind utility (which lives in `@layer
// utilities`) regardless of specificity -- so a `transition-transform`/
// `active:scale-*` utility silently never animates transform on this app.
// A raw CSS class selector here is unlayered too, so ordinary specificity
// applies instead and these rules actually take effect.
const AUTH_POP_CSS = `
  @keyframes authPopMain  { 0% { transform: scale(0.90); } 55% { transform: scale(1.03); } 100% { transform: scale(1); } }
  @keyframes authPopSmall { 0% { transform: scale(0.96); } 55% { transform: scale(1.02); } 100% { transform: scale(1); } }
  @keyframes authPopError { 0% { transform: scale(0.92); } 55% { transform: scale(1.02); } 100% { transform: scale(1); } }
  .auth-pop-main  { transform-origin: center; animation: authPopMain 300ms cubic-bezier(0.22,1,0.36,1) both; }
  .auth-pop-small { transform-origin: center; animation: authPopSmall 220ms cubic-bezier(0.22,1,0.36,1) both; }
  .auth-pop-error { transform-origin: center; animation: authPopError 220ms cubic-bezier(0.22,1,0.36,1) both; }
  .auth-input-fx  { transition: transform 120ms cubic-bezier(0.22,1,0.36,1); }
  .auth-input-fx:focus { transform: scale(1.01); }
  .auth-btn-fx    { transition: transform 100ms ease; }
  .auth-btn-fx:active { transform: scale(0.97); }
`;

export function AuthScreenLayout({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative min-h-[100dvh] flex flex-col overflow-hidden ${className}`}>
      <style>{AUTH_POP_CSS}</style>
      {children}
    </div>
  );
}
