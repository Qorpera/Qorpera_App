"use client";

type BadgeVariant = "default" | "purple" | "green" | "amber" | "red" | "blue";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-surface text-muted border-border",
  purple: "bg-accent-light text-accent border-[color-mix(in_srgb,var(--accent)_25%,transparent)]",
  green: "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok border-[color-mix(in_srgb,var(--ok)_25%,transparent)]",
  amber: "bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn border-[color-mix(in_srgb,var(--warn)_25%,transparent)]",
  red: "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger border-[color-mix(in_srgb,var(--danger)_25%,transparent)]",
  blue: "bg-[color-mix(in_srgb,var(--info)_12%,transparent)] text-info border-[color-mix(in_srgb,var(--info)_25%,transparent)]",
};

export function Badge({
  children,
  variant = "default",
  className = "",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
