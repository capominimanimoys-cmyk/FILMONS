// FILMONS Learning pop-in appearance (styles: src/styles/learning-pop.css).
// Watches every [data-pop] element -- including ones rendered later, after
// data loads or a route change -- and marks it [data-lp-in] each time it
// enters the viewport. Once it has fully left the viewport the mark is
// cleared, so scrolling back to it pops it in again. An attribute, not a class: React rewrites
// className on re-render, which would hide a popped element again.
// Elements that become visible in the same frame are staggered
// top-to-bottom, left-to-right, so a grid or rail cascades in.
import { useEffect } from 'react';

const STAGGER_MS = 55;
const MAX_STAGGER_STEPS = 8;

export function usePopIn() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') return;
    const html = document.documentElement;

    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const el = entry.target as HTMLElement;
        // Never hide something the person is using (a focused field, an
        // open sheet or menu rendered inside it).
        if (!entry.isIntersecting && el.hasAttribute('data-lp-in')
            && !el.contains(document.activeElement) && !el.querySelector('[role="dialog"],[aria-modal="true"]')) {
          el.removeAttribute('data-lp-in');
        }
      });
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => (a.boundingClientRect.top - b.boundingClientRect.top) || (a.boundingClientRect.left - b.boundingClientRect.left));
      visible.forEach((entry, i) => {
        const el = entry.target as HTMLElement;
        if (el.hasAttribute('data-lp-in')) return;
        el.style.setProperty('--lp-delay', `${Math.min(i, MAX_STAGGER_STEPS) * STAGGER_MS}ms`);
        el.setAttribute('data-lp-in', '');
      });
    }, { threshold: 0 }); // any visible sliver -- a half-scrolled rail card must never sit blank

    const watched = new WeakSet<Element>();
    let frame = 0;
    const scanNow = () => {
      frame = 0;
      document.querySelectorAll('[data-pop]').forEach(el => {
        if (watched.has(el)) return;
        watched.add(el);
        io.observe(el);
      });
    };
    // Batched to one scan per frame however many nodes React just added.
    const scan = () => { if (!frame) frame = requestAnimationFrame(scanNow); };

    scanNow();
    html.classList.add('lp-ready');
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
      html.classList.remove('lp-ready');
    };
  }, []);
}
