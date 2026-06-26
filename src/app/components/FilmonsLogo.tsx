interface FilmonsLogoProps {
  iconSize?: number;
  theme?: 'dark' | 'light';
  className?: string;
}

export function FilmonsLogo({ iconSize = 28, theme = 'light', className = '' }: FilmonsLogoProps) {
  const isDark = theme === 'dark';

  return (
    <div className={`flex items-center select-none ${className}`}>
      <span
        style={{
          fontSize:      Math.round(iconSize * 0.62),
          fontWeight:    900,
          letterSpacing: '0.04em',
          lineHeight:    1,
          color:         isDark ? '#F1F5F9' : '#0F172A',
          fontFamily:    '"Inter", "Helvetica Neue", Arial, sans-serif',
        }}
      >
        FILMONS
      </span>
    </div>
  );
}
