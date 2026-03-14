interface QorperaLogoProps {
  width?: number;
  className?: string;
  /** Invert colors for dark backgrounds (default: true) */
  invert?: boolean;
}

export function QorperaLogo({
  width = 24,
  className,
  invert = true,
}: QorperaLogoProps) {
  // Original image is 400x300 (4:3) — maintain aspect ratio
  const height = Math.round(width * (300 / 400));

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-mark.png"
      alt="Qorpera"
      width={width}
      height={height}
      style={invert ? { filter: "brightness(0) invert(1)" } : undefined}
      className={className}
    />
  );
}
