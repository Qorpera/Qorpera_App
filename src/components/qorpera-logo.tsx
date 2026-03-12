interface QorperaLogoProps {
  width?: number;
  height?: number;
  className?: string;
  color?: string;
  /** Use simplified version for small sizes (favicon-like) */
  simplified?: boolean;
}

export function QorperaLogo({
  width = 24,
  height = 24,
  className,
  color = "currentColor",
  simplified = false,
}: QorperaLogoProps) {
  if (simplified) {
    return (
      <svg
        viewBox="0 0 220 220"
        width={width}
        height={height}
        className={className}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Core filled square */}
        <rect x="96" y="96" width="28" height="28" rx="6" fill={color} />

        {/* Top-left path */}
        <path d="M97 96 L97 58 L52 58" stroke={color} strokeWidth="3" opacity="0.7" strokeLinecap="round" fill="none" />
        <circle cx="52" cy="58" r="5" fill={color} opacity="0.7" />

        {/* Top-right path */}
        <path d="M123 96 L123 44 L165 44" stroke={color} strokeWidth="3" opacity="0.7" strokeLinecap="round" fill="none" />
        <circle cx="165" cy="44" r="5" fill={color} opacity="0.7" />

        {/* Bottom-right path */}
        <path d="M118 124 L118 170 L152 170" stroke={color} strokeWidth="3" opacity="0.7" strokeLinecap="round" fill="none" />
        <circle cx="152" cy="170" r="5" fill={color} opacity="0.7" />

        {/* Left path */}
        <path d="M96 105 L58 105 L58 78" stroke={color} strokeWidth="3" opacity="0.7" strokeLinecap="round" fill="none" />
        <circle cx="58" cy="78" r="5" fill={color} opacity="0.7" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 220 220"
      width={width}
      height={height}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Core: outer stroke ring + inner filled square */}
      <rect x="93" y="93" width="34" height="34" rx="7" stroke={color} strokeWidth="2" fill="none" />
      <rect x="101" y="101" width="18" height="18" rx="4" fill={color} />

      {/* Circuit paths — angular bends */}
      {/* Top-left: up then left */}
      <path d="M97 93 L97 58 L52 58" stroke={color} strokeWidth="2.2" opacity="0.7" strokeLinecap="round" fill="none" />
      <rect x="34" y="50" width="18" height="16" rx="4" fill="none" stroke={color} strokeWidth="1.8" opacity="0.7" />

      {/* Top-right: up then right */}
      <path d="M123 93 L123 44 L165 44" stroke={color} strokeWidth="2.2" opacity="0.7" strokeLinecap="round" fill="none" />
      <rect x="165" y="36" width="20" height="16" rx="4" fill="none" stroke={color} strokeWidth="1.8" opacity="0.7" />

      {/* Right: right then up */}
      <path d="M132 115 L168 115 L168 98" stroke={color} strokeWidth="2.2" opacity="0.65" strokeLinecap="round" fill="none" />
      <rect x="160" y="80" width="16" height="18" rx="4" fill="none" stroke={color} strokeWidth="1.8" opacity="0.7" />

      {/* Bottom-right: down then right */}
      <path d="M118 132 L118 170 L152 170" stroke={color} strokeWidth="2.2" opacity="0.7" strokeLinecap="round" fill="none" />
      <rect x="152" y="162" width="22" height="16" rx="4" fill="none" stroke={color} strokeWidth="1.8" opacity="0.7" />

      {/* Bottom-left: down then left */}
      <path d="M97 132 L97 156 L56 156" stroke={color} strokeWidth="2.2" opacity="0.65" strokeLinecap="round" fill="none" />
      <rect x="36" y="148" width="20" height="16" rx="4" fill="none" stroke={color} strokeWidth="1.8" opacity="0.7" />

      {/* Left: left then up */}
      <path d="M88 105 L58 105 L58 78" stroke={color} strokeWidth="2.2" opacity="0.65" strokeLinecap="round" fill="none" />
      <rect x="50" y="60" width="16" height="18" rx="4" fill="none" stroke={color} strokeWidth="1.8" opacity="0.7" />

      {/* Junction dots at bends */}
      <circle cx="97" cy="58" r="2" fill={color} opacity="0.65" />
      <circle cx="123" cy="44" r="2" fill={color} opacity="0.65" />
      <circle cx="168" cy="115" r="2" fill={color} opacity="0.65" />
      <circle cx="118" cy="170" r="2" fill={color} opacity="0.65" />
      <circle cx="97" cy="156" r="2" fill={color} opacity="0.65" />
      <circle cx="58" cy="105" r="2" fill={color} opacity="0.65" />
    </svg>
  );
}
