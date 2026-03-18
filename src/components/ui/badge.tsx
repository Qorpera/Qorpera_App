"use client";

type BadgeVariant = "default" | "purple" | "green" | "amber" | "red" | "blue";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-[#222] text-[#b0b0b0] border-[#333]",
  purple: "bg-purple-500/15 text-purple-300 border-purple-500/25",
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  red: "bg-red-500/15 text-red-300 border-red-500/25",
  blue: "bg-blue-500/15 text-blue-300 border-blue-500/25",
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
