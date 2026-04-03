interface QorperaLogoProps {
  width?: number;
  className?: string;
}

export function QorperaLogo({
  width = 24,
  className,
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
      className={className}
    />
  );
}
