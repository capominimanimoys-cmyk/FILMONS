/**
 * Filmons icon system.
 * All production icons live here. To swap in Figma exports, replace the SVG
 * paths inside each case — no call-sites need to change.
 *
 * Usage:  <Icon name="marketplace" size={24} className="text-blue-500" />
 */

export type IconName =
  // ── Bottom navigation ─────────────────────────────────────────────────────
  | 'feed' | 'marketplace' | 'create' | 'inbox' | 'profile'
  // ── Header / global actions ───────────────────────────────────────────────
  | 'home' | 'menu' | 'search' | 'notifications' | 'back' | 'close' | 'more'
  | 'moon' | 'sun'
  // ── Content actions ───────────────────────────────────────────────────────
  | 'like' | 'like-filled' | 'comment' | 'share' | 'bookmark' | 'bookmark-filled'
  | 'send' | 'repost'
  // ── Listing / marketplace ─────────────────────────────────────────────────
  | 'camera' | 'film' | 'microphone' | 'music' | 'drone' | 'studio'
  | 'location' | 'calendar' | 'clock' | 'price' | 'star' | 'star-filled'
  | 'filter' | 'grid' | 'list'
  // ── Profile tabs ──────────────────────────────────────────────────────────
  | 'posts' | 'reels' | 'gear' | 'about' | 'portfolio'
  // ── Settings ──────────────────────────────────────────────────────────────
  | 'account' | 'privacy' | 'security' | 'payment' | 'language'
  | 'help' | 'logout' | 'delete' | 'shield' | 'bell'
  | 'discovery' | 'creator' | 'dashboard' | 'layers'
  // ── Media / upload ────────────────────────────────────────────────────────
  | 'image' | 'video' | 'audio' | 'document' | 'link' | 'upload'
  // ── Utility ───────────────────────────────────────────────────────────────
  | 'check' | 'check-circle' | 'error' | 'warning' | 'info'
  | 'chevron-right' | 'chevron-left' | 'chevron-down' | 'chevron-up'
  | 'plus' | 'minus' | 'edit' | 'trash' | 'copy' | 'eye' | 'eye-off'
  | 'verified' | 'user' | 'users' | 'phone' | 'email' | 'globe'
  | 'arrow-right' | 'arrow-left' | 'external' | 'lock' | 'unlock'
  | 'map-pin' | 'navigation' | 'loader';

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  'aria-label'?: string;
  'aria-hidden'?: boolean;
}

export function Icon({
  name,
  size = 24,
  className = '',
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden = !ariaLabel,
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
    >
      {paths(name)}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG paths
// Replace individual cases with Figma exports when available.
// Keep strokeWidth, strokeLinecap, strokeLinejoin on the <svg> above so every
// icon inherits the same stroke style automatically.
// ─────────────────────────────────────────────────────────────────────────────
function paths(name: IconName) {
  switch (name) {

    // ── Bottom nav ────────────────────────────────────────────────────────────
    case 'feed':
      return <>
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </>;
    case 'marketplace':
      return <>
        <path d="M3 9l1.5-6h15L21 9"/>
        <path d="M3 9c0 1.1.9 2 2 2s2-.9 2-2m0 0c0 1.1.9 2 2 2s2-.9 2-2m0 0c0 1.1.9 2 2 2s2-.9 2-2m0 0c0 1.1.9 2 2 2s2-.9 2-2"/>
        <path d="M5 11v8a1 1 0 001 1h12a1 1 0 001-1v-8"/>
        <path d="M9 21v-5a2 2 0 014 0v5"/>
      </>;
    case 'create':
      return <>
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 8v8M8 12h8"/>
      </>;
    case 'inbox':
      return <>
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </>;
    case 'profile':
      return <>
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </>;

    // ── Header / global ───────────────────────────────────────────────────────
    case 'menu':
      return <>
        <path d="M3 12h18M3 6h18M3 18h18"/>
      </>;
    case 'search':
      return <>
        <circle cx="11" cy="11" r="7"/>
        <path d="M21 21l-4.35-4.35"/>
      </>;
    case 'notifications':
      return <>
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 01-3.46 0"/>
      </>;
    case 'back':
      return <path d="M19 12H5M12 5l-7 7 7 7"/>;
    case 'close':
      return <path d="M18 6L6 18M6 6l12 12"/>;
    case 'more':
      return <>
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/>
      </>;

    // ── Content actions ───────────────────────────────────────────────────────
    case 'like':
      return <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>;
    case 'like-filled':
      return <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" fill="currentColor" stroke="none"/>;
    case 'comment':
      return <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>;
    case 'share':
      return <>
        <circle cx="18" cy="5" r="3"/>
        <circle cx="6" cy="12" r="3"/>
        <circle cx="18" cy="19" r="3"/>
        <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
      </>;
    case 'bookmark':
      return <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>;
    case 'bookmark-filled':
      return <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" fill="currentColor" stroke="none"/>;
    case 'send':
      return <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>;
    case 'repost':
      return <>
        <path d="M17 1l4 4-4 4"/>
        <path d="M3 11V9a4 4 0 014-4h14"/>
        <path d="M7 23l-4-4 4-4"/>
        <path d="M21 13v2a4 4 0 01-4 4H3"/>
      </>;

    // ── Listing / marketplace ─────────────────────────────────────────────────
    case 'camera':
      return <>
        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </>;
    case 'film':
      return <>
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
        <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>
      </>;
    case 'microphone':
      return <>
        <path d="M12 2a3 3 0 013 3v7a3 3 0 01-6 0V5a3 3 0 013-3z"/>
        <path d="M19 10v2a7 7 0 01-14 0v-2"/>
        <path d="M12 19v3M8 22h8"/>
      </>;
    case 'music':
      return <>
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </>;
    case 'drone':
      return <>
        <path d="M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0"/>
        <path d="M4.5 4.5l3.5 3.5M19.5 4.5l-3.5 3.5M4.5 19.5l3.5-3.5M19.5 19.5l-3.5-3.5"/>
        <circle cx="3" cy="3" r="2"/><circle cx="21" cy="3" r="2"/>
        <circle cx="3" cy="21" r="2"/><circle cx="21" cy="21" r="2"/>
      </>;
    case 'studio':
      return <>
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </>;
    case 'location':
    case 'map-pin':
      return <>
        <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </>;
    case 'calendar':
      return <>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <path d="M16 2v4M8 2v4M3 10h18"/>
      </>;
    case 'clock':
      return <>
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
      </>;
    case 'price':
      return <>
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
      </>;
    case 'star':
      return <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>;
    case 'star-filled':
      return <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" stroke="none"/>;
    case 'filter':
      return <>
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
      </>;
    case 'grid':
      return <>
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
      </>;
    case 'list':
      return <>
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
      </>;

    // ── Profile tabs ──────────────────────────────────────────────────────────
    case 'posts':
    case 'image':
      return <>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </>;
    case 'reels':
    case 'video':
      return <>
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </>;
    case 'gear':
      return <>
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
      </>;
    case 'about':
      return <>
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4M12 8h.01"/>
      </>;
    case 'portfolio':
      return <>
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      </>;

    // ── Settings ──────────────────────────────────────────────────────────────
    case 'account':
    case 'user':
      return <>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </>;
    case 'privacy':
    case 'lock':
      return <>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0110 0v4"/>
      </>;
    case 'unlock':
      return <>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 019.9-1"/>
      </>;
    case 'security':
    case 'shield':
      return <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>;
    case 'payment':
      return <>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <path d="M1 10h22"/>
      </>;
    case 'language':
    case 'globe':
      return <>
        <circle cx="12" cy="12" r="10"/>
        <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
      </>;
    case 'help':
      return <>
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </>;
    case 'logout':
      return <>
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </>;
    case 'delete':
    case 'trash':
      return <>
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
        <path d="M10 11v6M14 11v6"/>
        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
      </>;
    case 'bell':
      return <>
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 01-3.46 0"/>
      </>;
    case 'discovery':
      return <>
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
        <path d="M11 8v6M8 11h6"/>
      </>;
    case 'creator':
    case 'users':
      return <>
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
        <path d="M16 3.13a4 4 0 010 7.75"/>
      </>;
    case 'dashboard':
      return <>
        <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>
      </>;
    case 'layers':
      return <>
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </>;

    // ── Media / upload ────────────────────────────────────────────────────────
    case 'audio':
      return <>
        <path d="M12 2a3 3 0 013 3v7a3 3 0 01-6 0V5a3 3 0 013-3z"/>
        <path d="M19 10v2a7 7 0 01-14 0v-2"/>
        <path d="M12 19v3M8 22h8"/>
      </>;
    case 'document':
      return <>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </>;
    case 'link':
      return <>
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
      </>;
    case 'upload':
      return <>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </>;

    // ── Utility ───────────────────────────────────────────────────────────────
    case 'check':
      return <polyline points="20 6 9 17 4 12"/>;
    case 'check-circle':
      return <>
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </>;
    case 'error':
      return <>
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </>;
    case 'warning':
      return <>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </>;
    case 'info':
      return <>
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </>;
    case 'chevron-right':
      return <polyline points="9 18 15 12 9 6"/>;
    case 'chevron-left':
      return <polyline points="15 18 9 12 15 6"/>;
    case 'chevron-down':
      return <polyline points="6 9 12 15 18 9"/>;
    case 'chevron-up':
      return <polyline points="18 15 12 9 6 15"/>;
    case 'plus':
      return <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>;
    case 'minus':
      return <line x1="5" y1="12" x2="19" y2="12"/>;
    case 'edit':
      return <>
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </>;
    case 'copy':
      return <>
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
      </>;
    case 'eye':
      return <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </>;
    case 'eye-off':
      return <>
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </>;
    case 'verified':
      return <>
        <path d="M12 2l2.4 4.8L20 8l-3.6 3.6.84 5.4L12 14.4l-5.24 2.6.84-5.4L4 8l5.6-1.2L12 2z" fill="currentColor" stroke="none"/>
        <polyline points="9 12 11 14 15 10" stroke="white" strokeWidth="1.5" fill="none"/>
      </>;
    case 'phone':
      return <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.18 1.17 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.56-.56a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>;
    case 'email':
      return <>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22 6 12 13 2 6"/>
      </>;
    case 'arrow-right':
      return <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>;
    case 'arrow-left':
      return <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>;
    case 'external':
      return <>
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </>;
    case 'navigation':
      return <polygon points="3 11 22 2 13 21 11 13 3 11"/>;
    case 'loader':
      return <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>;

    default:
      return <rect x="3" y="3" width="18" height="18" rx="2" opacity="0.3"/>;
  }
}
