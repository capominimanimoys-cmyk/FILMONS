interface FilmonsLogoProps {
  iconSize?: number;
  theme?: 'dark' | 'light';
  className?: string;
}

export function FilmonsLogo({ iconSize = 28, theme = 'light', className = '' }: FilmonsLogoProps) {
  const isDark = theme === 'dark';
  const uid = `fl-${Math.round(iconSize)}`;
  const rx = Math.round(32 * 0.28);

  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      {/* Icon — SVG so gradients render crisply at any size */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            {isDark ? (
              <>
                <stop stopColor="#F1F5F9" />
                <stop offset="1" stopColor="#CBD5E1" />
              </>
            ) : (
              <>
                <stop stopColor="#0F172A" />
                <stop offset="1" stopColor="#1E3A8A" />
              </>
            )}
          </linearGradient>
          <linearGradient id={`${uid}-f`} x1="8" y1="6" x2="22" y2="26" gradientUnits="userSpaceOnUse">
            <stop stopColor={isDark ? '#0F172A' : 'rgba(255,255,255,1)'} />
            <stop offset="1" stopColor={isDark ? '#334155' : 'rgba(255,255,255,0.85)'} />
          </linearGradient>
        </defs>

        {/* Badge background */}
        <rect width="32" height="32" rx={rx} fill={`url(#${uid}-bg)`} />

        {/* Film-strip sprocket holes */}
        <rect x="2"  y="5"  width="2.5" height="4" rx="0.6" fill={isDark ? '#94A3B8' : 'white'} opacity="0.22" />
        <rect x="2"  y="14" width="2.5" height="4" rx="0.6" fill={isDark ? '#94A3B8' : 'white'} opacity="0.22" />
        <rect x="2"  y="23" width="2.5" height="4" rx="0.6" fill={isDark ? '#94A3B8' : 'white'} opacity="0.22" />
        <rect x="27.5" y="5"  width="2.5" height="4" rx="0.6" fill={isDark ? '#94A3B8' : 'white'} opacity="0.22" />
        <rect x="27.5" y="14" width="2.5" height="4" rx="0.6" fill={isDark ? '#94A3B8' : 'white'} opacity="0.22" />
        <rect x="27.5" y="23" width="2.5" height="4" rx="0.6" fill={isDark ? '#94A3B8' : 'white'} opacity="0.22" />

        {/* Geometric "F" — path-drawn so no font dependency */}
        <path
          d="M8 6H22V10H12V15H20V19H12V26H8V6Z"
          fill={`url(#${uid}-f)`}
        />
      </svg>

      {/* Wordmark */}
      <span
        style={{
          fontFamily: 'var(--font-logo)',
          fontWeight: 800,
          fontSize: Math.round(iconSize * 0.64),
          letterSpacing: '-0.04em',
          color: isDark ? '#F8FAFC' : '#0F172A',
          lineHeight: 1,
        }}
      >
        FILMONS
      </span>
    </div>
  );
}
