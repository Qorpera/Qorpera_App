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
        <rect x="90" y="90" width="40" height="40" rx="5" stroke={color} strokeWidth="3" fill="none" opacity="0.9" />
        <rect x="101" y="101" width="18" height="18" rx="2" fill={color} />

        {/* Top T-fork */}
        <path d="M110 90 L110 55 L85 41" stroke={color} strokeWidth="3" opacity="0.9" strokeLinecap="round" fill="none" />
        <path d="M110 90 L110 55 L135 41" stroke={color} strokeWidth="3" opacity="0.85" strokeLinecap="round" fill="none" />
        <circle cx="85" cy="41" r="5" fill={color} opacity="0.9" />
        <circle cx="135" cy="41" r="5" fill={color} opacity="0.85" />

        {/* Right T-fork */}
        <path d="M130 110 L165 110 L180 88" stroke={color} strokeWidth="3" opacity="0.9" strokeLinecap="round" fill="none" />
        <path d="M130 110 L165 110 L180 132" stroke={color} strokeWidth="3" opacity="0.85" strokeLinecap="round" fill="none" />
        <circle cx="180" cy="88" r="5" fill={color} opacity="0.9" />
        <circle cx="180" cy="132" r="5" fill={color} opacity="0.85" />

        {/* Bottom T-fork */}
        <path d="M110 130 L110 165 L85 179" stroke={color} strokeWidth="3" opacity="0.9" strokeLinecap="round" fill="none" />
        <path d="M110 130 L110 165 L135 179" stroke={color} strokeWidth="3" opacity="0.85" strokeLinecap="round" fill="none" />
        <circle cx="85" cy="179" r="5" fill={color} opacity="0.9" />
        <circle cx="135" cy="179" r="5" fill={color} opacity="0.85" />

        {/* Left T-fork */}
        <path d="M90 110 L55 110 L40 88" stroke={color} strokeWidth="3" opacity="0.9" strokeLinecap="round" fill="none" />
        <path d="M90 110 L55 110 L40 132" stroke={color} strokeWidth="3" opacity="0.85" strokeLinecap="round" fill="none" />
        <circle cx="40" cy="88" r="5" fill={color} opacity="0.9" />
        <circle cx="40" cy="132" r="5" fill={color} opacity="0.85" />
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
      <rect x="90" y="90" width="40" height="40" rx="5" stroke={color} strokeWidth="2" fill="none" />
      <rect x="101" y="101" width="18" height="18" rx="2" fill={color} />

      {/* Top T-fork */}
      <path d="M110 90 L110 55 L85 41" stroke={color} strokeWidth="2.5" opacity="0.9" strokeLinecap="round" fill="none" />
      <path d="M110 90 L110 55 L135 41" stroke={color} strokeWidth="2.2" opacity="0.85" strokeLinecap="round" fill="none" />
      <rect x="65" y="27" width="20" height="16" rx="5" fill="none" stroke={color} strokeWidth="2.2" opacity="0.9" />
      <rect x="135" y="27" width="20" height="16" rx="5" fill="none" stroke={color} strokeWidth="2.2" opacity="0.85" />
      <circle cx="110" cy="55" r="2.5" fill={color} opacity="0.85" />

      {/* Right T-fork */}
      <path d="M130 110 L165 110 L180 88" stroke={color} strokeWidth="2.5" opacity="0.9" strokeLinecap="round" fill="none" />
      <path d="M130 110 L165 110 L180 132" stroke={color} strokeWidth="2.2" opacity="0.85" strokeLinecap="round" fill="none" />
      <rect x="177" y="72" width="16" height="16" rx="5" fill="none" stroke={color} strokeWidth="2.2" opacity="0.9" />
      <rect x="177" y="132" width="16" height="16" rx="5" fill="none" stroke={color} strokeWidth="2.2" opacity="0.85" />
      <circle cx="165" cy="110" r="2.5" fill={color} opacity="0.85" />

      {/* Bottom T-fork */}
      <path d="M110 130 L110 165 L85 179" stroke={color} strokeWidth="2.5" opacity="0.9" strokeLinecap="round" fill="none" />
      <path d="M110 130 L110 165 L135 179" stroke={color} strokeWidth="2.2" opacity="0.85" strokeLinecap="round" fill="none" />
      <rect x="65" y="177" width="20" height="16" rx="5" fill="none" stroke={color} strokeWidth="2.2" opacity="0.9" />
      <rect x="135" y="177" width="20" height="16" rx="5" fill="none" stroke={color} strokeWidth="2.2" opacity="0.85" />
      <circle cx="110" cy="165" r="2.5" fill={color} opacity="0.85" />

      {/* Left T-fork */}
      <path d="M90 110 L55 110 L40 88" stroke={color} strokeWidth="2.5" opacity="0.9" strokeLinecap="round" fill="none" />
      <path d="M90 110 L55 110 L40 132" stroke={color} strokeWidth="2.2" opacity="0.85" strokeLinecap="round" fill="none" />
      <rect x="27" y="72" width="16" height="16" rx="5" fill="none" stroke={color} strokeWidth="2.2" opacity="0.9" />
      <rect x="27" y="132" width="16" height="16" rx="5" fill="none" stroke={color} strokeWidth="2.2" opacity="0.85" />
      <circle cx="55" cy="110" r="2.5" fill={color} opacity="0.85" />
    </svg>
  );
}
