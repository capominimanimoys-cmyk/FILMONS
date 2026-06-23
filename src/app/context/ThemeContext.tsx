/**
 * ThemeContext — the ONLY correct dark mode implementation.
 *
 * Root cause of previous failures:
 *  1. ThemeProvider was never mounted in App.tsx
 *  2. Root.tsx had hardcoded bg-white on the wrapper div
 *  3. Tailwind @variant dark needs .dark class on <html>
 *
 * This file fixes #1 and #3. Root.tsx fix is separate.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../../lib/supabase';

export type Theme = 'light' | 'dark';
interface Ctx { theme: Theme; setTheme: (t: Theme) => void; }
const ThemeCtx = createContext<Ctx>({ theme: 'light', setTheme: () => {} });

/* ─── The dark-mode stylesheet ────────────────────────────────────────────────
   Injected as a <style> tag LAST in <head> so it wins the cascade.
   Uses three selectors per rule for maximum specificity:
     html.dark  →  beats everything Tailwind generates
─────────────────────────────────────────────────────────────────────────────*/
const DARK_CSS = `
/* FILMONS DARK MODE */
html.dark, html.dark body, html.dark #root {
  background-color: #000000 !important;
  color: #ededed !important;
  color-scheme: dark !important;
}

/* Surfaces */
html.dark .bg-white        { background-color: #111111 !important; }
html.dark .bg-gray-50      { background-color: #0d0d0d !important; }
html.dark .bg-gray-100     { background-color: #1a1a1a !important; }
html.dark .bg-gray-200     { background-color: #242424 !important; }
html.dark .bg-gray-300     { background-color: #2e2e2e !important; }

/* Text */
html.dark .text-gray-900   { color: #f0f0f0 !important; }
html.dark .text-gray-800   { color: #d4d4d4 !important; }
html.dark .text-gray-700   { color: #b0b0b0 !important; }
html.dark .text-gray-600   { color: #909090 !important; }
html.dark .text-gray-500   { color: #707070 !important; }
html.dark .text-gray-400   { color: #555555 !important; }
html.dark .text-gray-300   { color: #404040 !important; }
html.dark .text-black      { color: #f0f0f0 !important; }

/* Borders */
html.dark .border-gray-50  { border-color: #1a1a1a !important; }
html.dark .border-gray-100 { border-color: #222222 !important; }
html.dark .border-gray-200 { border-color: #2e2e2e !important; }
html.dark .border-gray-300 { border-color: #3a3a3a !important; }
html.dark .border          { border-color: #2e2e2e !important; }

/* Dividers */
html.dark .divide-gray-100 > * + * { border-color: #222 !important; }
html.dark .divide-gray-50  > * + * { border-color: #1a1a1a !important; }

/* Inputs */
html.dark input:not([type="range"]),
html.dark textarea,
html.dark select {
  background-color: #1a1a1a !important;
  color: #f0f0f0 !important;
  border-color: #333333 !important;
}
html.dark input::placeholder,
html.dark textarea::placeholder { color: #555555 !important; }

/* Navigation */
html.dark header {
  background-color: rgba(0,0,0,0.97) !important;
  border-color: #1e1e1e !important;
}
html.dark .sticky {
  background-color: rgba(8,8,8,0.97) !important;
}
html.dark nav {
  background-color: #080808 !important;
  border-color: #1e1e1e !important;
}

/* Keep blue accents */
html.dark .bg-blue-600     { background-color: #2563eb !important; }
html.dark .bg-blue-700     { background-color: #1d4ed8 !important; }
html.dark .bg-blue-50      { background-color: rgba(59,130,246,0.08) !important; }
html.dark .bg-blue-100     { background-color: rgba(59,130,246,0.12) !important; }
html.dark .text-blue-600   { color: #60a5fa !important; }
html.dark .text-blue-500   { color: #93c5fd !important; }
html.dark .border-blue-200 { border-color: rgba(59,130,246,0.3) !important; }

/* White text always stays white */
html.dark .text-white      { color: #ffffff !important; }

/* Hover states */
html.dark .hover\:bg-gray-50:hover  { background-color: #161616 !important; }
html.dark .hover\:bg-gray-100:hover { background-color: #1e1e1e !important; }
html.dark .hover\:bg-gray-200:hover { background-color: #2a2a2a !important; }

/* Shadows */
html.dark .shadow-sm  { box-shadow: 0 1px 6px rgba(0,0,0,0.8) !important; }
html.dark .shadow-md  { box-shadow: 0 4px 20px rgba(0,0,0,0.9) !important; }
html.dark .shadow-lg  { box-shadow: 0 8px 30px rgba(0,0,0,0.9) !important; }
html.dark .shadow-xl  { box-shadow: 0 8px 40px rgba(0,0,0,0.95) !important; }
html.dark .shadow-2xl { box-shadow: 0 16px 60px rgba(0,0,0,1) !important; }

/* Colours */
html.dark .bg-green-100   { background-color: rgba(34,197,94,0.08) !important; }
html.dark .text-green-700 { color: #4ade80 !important; }
html.dark .text-green-600 { color: #4ade80 !important; }
html.dark .bg-purple-100  { background-color: rgba(139,92,246,0.1) !important; }
html.dark .text-purple-700{ color: #a78bfa !important; }
html.dark .bg-red-50      { background-color: rgba(239,68,68,0.06) !important; }
html.dark .bg-red-100     { background-color: rgba(239,68,68,0.1) !important; }
html.dark .text-red-500   { color: #f87171 !important; }
html.dark .bg-amber-50    { background-color: rgba(245,158,11,0.06) !important; }
html.dark .text-amber-700 { color: #fbbf24 !important; }
html.dark .bg-yellow-50   { background-color: rgba(234,179,8,0.06) !important; }
html.dark .text-yellow-400{ color: #fde047 !important; }

/* Images */
html.dark img:not([src^="data:"])  { filter: brightness(0.88); }
html.dark img[src*="avatar"]       { filter: none; }
html.dark img[src*="logo"]         { filter: none; }

/* Smooth transition on switch */
*, *::before, *::after {
  transition-property: background-color, border-color, color, box-shadow;
  transition-duration: 0.18s;
  transition-timing-function: ease;
}
img, video, svg { transition: none !important; }
`;

function applyDark(on: boolean): void {
  const html = document.documentElement;

  // Step 1: toggle .dark class on <html> (Tailwind @variant dark reads this)
  if (on) html.classList.add('dark');
  else    html.classList.remove('dark');

  // Step 2: inject / clear the override stylesheet
  let styleEl = document.getElementById('__filmons_dark__') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = '__filmons_dark__';
    document.head.appendChild(styleEl);  // appended LAST → wins cascade
  }
  styleEl.textContent = on ? DARK_CSS : '';

  // Step 3: inline styles as final fallback (can't be overridden by any stylesheet)
  html.style.backgroundColor = on ? '#000000' : '';
  html.style.color            = on ? '#ededed' : '';
  html.style.colorScheme      = on ? 'dark'    : '';
  document.body.style.backgroundColor = on ? '#000000' : '';
  document.body.style.color           = on ? '#ededed' : '';
}

export function ThemeProvider({ children, userId }: { children: ReactNode; userId?: string }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try { return (localStorage.getItem('filmons_theme') as Theme) || 'light'; } catch { return 'light'; }
  });

  // Apply immediately on mount (before first paint)
  useEffect(() => {
    const saved = (localStorage.getItem('filmons_theme') as Theme) || 'light';
    setThemeState(saved);
    applyDark(saved === 'dark');
  }, []);

  // Re-apply whenever theme state changes
  useEffect(() => { applyDark(theme === 'dark'); }, [theme]);

  // Sync from DB (only when no local pref set)
  useEffect(() => {
    if (!userId || localStorage.getItem('filmons_theme')) return;
    supabase.from('user_preferences').select('theme').eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        const t = (data?.theme || 'light') as Theme;
        localStorage.setItem('filmons_theme', t);
        setThemeState(t);
        applyDark(t === 'dark');
      }).catch(() => {});
  }, [userId]);

  const setTheme = (t: Theme) => {
    localStorage.setItem('filmons_theme', t);
    setThemeState(t);
    applyDark(t === 'dark');
    if (userId)
      supabase.from('user_preferences')
        .upsert({ user_id: userId, theme: t, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .catch(() => {});
  };

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() { return useContext(ThemeCtx); }