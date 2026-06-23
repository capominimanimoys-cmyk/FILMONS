/**
 * Filmons Smart Animate
 * ---------------------
 * Works like Framer Motion's layoutId system:
 *  - Shared elements (same `data-animate-id`) FLIP between routes
 *  - New elements fade + slide in
 *  - Leaving elements fade out instantly (no janky lingering)
 *
 * Usage:
 *   <div data-animate-id="profile-avatar">...</div>
 *   <motion.div id="page-root">...</motion.div>
 *
 * Call `captureSnapshot()` before navigation, `playTransition()` after.
 */

interface SnapshotRect {
  top: number; left: number; width: number; height: number;
  borderRadius: string; opacity: number;
}

const snapshots = new Map<string, SnapshotRect>();

/** Call this before navigating to capture current positions */
export function captureSnapshot() {
  snapshots.clear();
  document.querySelectorAll<HTMLElement>('[data-animate-id]').forEach(el => {
    const id   = el.dataset.animateId!;
    const rect = el.getBoundingClientRect();
    const cs   = getComputedStyle(el);
    snapshots.set(id, {
      top:          rect.top,
      left:         rect.left,
      width:        rect.width,
      height:       rect.height,
      borderRadius: cs.borderRadius,
      opacity:      parseFloat(cs.opacity) || 1,
    });
  });
}

/** Call this after the new route renders to play the transition */
export function playTransition() {
  if (snapshots.size === 0) return;

  // Wait one frame for new DOM to paint
  requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>('[data-animate-id]').forEach(el => {
      const id   = el.dataset.animateId!;
      const from = snapshots.get(id);
      if (!from) return; // new element — will be handled by page-enter

      const to = el.getBoundingClientRect();
      if (!to.width || !to.height) return;

      const dx = from.left - to.left;
      const dy = from.top  - to.top;
      const sx = from.width  / to.width;
      const sy = from.height / to.height;

      // Only animate if there's a meaningful difference
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;

      el.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, transformOrigin: 'top left', easing: 'cubic-bezier(0.37,0,0.63,1)' },
        { transform: 'translate(0,0) scale(1,1)', transformOrigin: 'top left' },
      ], { duration: 320, fill: 'none' });
    });

    snapshots.clear();
  });
}