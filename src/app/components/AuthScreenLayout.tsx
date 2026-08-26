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
export function AuthScreenLayout({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative min-h-[100dvh] flex flex-col overflow-hidden ${className}`}>
      {children}
    </div>
  );
}
