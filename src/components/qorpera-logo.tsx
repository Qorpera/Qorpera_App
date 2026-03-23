"use client";

import { useTheme } from "./theme-provider";

interface QorperaLogoProps {
  width?: number;
  className?: string;
}

export function QorperaLogo({
  width = 24,
  className,
}: QorperaLogoProps) {
  const { theme } = useTheme();
  // Original image is 400x300 (4:3) — maintain aspect ratio
  const height = Math.round(width * (300 / 400));

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-mark.png"
      alt="Qorpera"
      width={width}
      height={height}
      style={theme === "dark" ? { filter: "brightness(0) invert(1)" } : undefined}
      className={className}
    />
  );
}
