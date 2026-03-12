interface QorperaLogoProps {
  width?: number;
  height?: number;
  className?: string;
  color?: string;
  /** Use simplified version for small sizes */
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
        {/* Core */}
        <rect x="96" y="96" width="28" height="28" rx="3" fill={color} />

        {/* Top T-fork */}
        <path d="M110 96 L110 55 L75 35" stroke={color} strokeWidth="3" opacity="0.7" strokeLinecap="round" fill="none" />
        <path d="M110 96 L110 55 L145 35" stroke={color} strokeWidth="3" opacity="0.7" strokeLinecap="round" fill="none" />
        <circle cx="75" cy="35" r="5" fill={color} opacity="0.7" />
        <circle cx="145" cy="35" r="5" fill={color} opacity="0.7" />

        {/* Right T-fork */}
        <path d="M124 110 L165 110 L185 80" stroke={color} strokeWidth="3" opacity="0.7" strokeLinecap="round" fill="none" />
        <path d="M124 110 L165 110 L185 140" stroke={color} strokeWidth="3" opacity="0.7" strokeLinecap="round" fill="none" />
        <circle cx="185" cy="80" r="5" fill={color} opacity="0.7" />
        <circle cx="185" cy="140" r="5" fill={color} opacity="0.7" />

        {/* Bottom T-fork */}
        <path d="M110 124 L110 165 L75 185" stroke={color} strokeWidth="3" opacity="0.7" strokeLinecap="round" fill="none" />
        <path d="M110 124 L110 165 L145 185" stroke={color} strokeWidth="3" opacity="0.7" strokeLinecap="round" fill="none" />
        <circle cx="75" cy="185" r="5" fill={color} opacity="0.7" />
        <circle cx="145" cy="185" r="5" fill={color} opacity="0.7" />

        {/* Left T-fork */}
        <path d="M96 110 L55 110 L35 80" stroke={color} strokeWidth="3" opacity="0.7" strokeLinecap="round" fill="none" />
        <path d="M96 110 L55 110 L35 140" stroke={color} strokeWidth="3" opacity="0.7" strokeLinecap="round" fill="none" />
        <circle cx="35" cy="80" r="5" fill={color} opacity="0.7" />
        <circle cx="35" cy="140" r="5" fill={color} opacity="0.7" />
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
      <rect x="93" y="93" width="34" height="34" rx="3" stroke={color} strokeWidth="2" fill="none" />
      <rect x="101" y="101" width="18" height="18" rx="2" fill={color} />

      {/* Top T-fork */}
      <path d="M110 93 L110 55 L75 35" stroke={color} strokeWidth="2.2" opacity="0.7" strokeLinecap="round" fill="none" />
      <path d="M110 93 L110 55 L145 35" stroke={color} strokeWidth="1.8" opacity="0.65" strokeLinecap="round" fill="none" />
      <rect x="65" y="27" width="20" height="16" rx="5" fill="none" stroke={color} strokeWidth="1.8" opacity="0.7" />
      <rect x="135" y="27" width="20" height="16" rx="5" fill="none" stroke={color} strokeWidth="1.8" opacity="0.65" />
      <circle cx="110" cy="55" r="2" fill={color} opacity="0.65" />

      {/* Right T-fork */}
      <path d="M127 110 L165 110 L185 80" stroke={color} strokeWidth="2.2" opacity="0.7" strokeLinecap="round" fill="none" />
      <path d="M127 110 L165 110 L185 140" stroke={color} strokeWidth="1.8" opacity="0.65" strokeLinecap="round" fill="none" />
      <rect x="177" y="72" width="16" height="16" rx="5" fill="none" stroke={color} strokeWidth="1.8" opacity="0.7" />
      <rect x="177" y="132" width="16" height="16" rx="5" fill="none" stroke={color} strokeWidth="1.8" opacity="0.65" />
      <circle cx="165" cy="110" r="2" fill={color} opacity="0.65" />

      {/* Bottom T-fork */}
      <path d="M110 127 L110 165 L75 185" stroke={color} strokeWidth="2.2" opacity="0.7" strokeLinecap="round" fill="none" />
      <path d="M110 127 L110 165 L145 185" stroke={color} strokeWidth="1.8" opacity="0.65" strokeLinecap="round" fill="none" />
      <rect x="65" y="177" width="20" height="16" rx="5" fill="none" stroke={color} strokeWidth="1.8" opacity="0.7" />
      <rect x="135" y="177" width="20" height="16" rx="5" fill="none" stroke={color} strokeWidth="1.8" opacity="0.65" />
      <circle cx="110" cy="165" r="2" fill={color} opacity="0.65" />

      {/* Left T-fork */}
      <path d="M93 110 L55 110 L35 80" stroke={color} strokeWidth="2.2" opacity="0.7" strokeLinecap="round" fill="none" />
      <path d="M93 110 L55 110 L35 140" stroke={color} strokeWidth="1.8" opacity="0.65" strokeLinecap="round" fill="none" />
      <rect x="27" y="72" width="16" height="16" rx="5" fill="none" stroke={color} strokeWidth="1.8" opacity="0.7" />
      <rect x="27" y="132" width="16" height="16" rx="5" fill="none" stroke={color} strokeWidth="1.8" opacity="0.65" />
      <circle cx="55" cy="110" r="2" fill={color} opacity="0.65" />
    </svg>
  );
}
