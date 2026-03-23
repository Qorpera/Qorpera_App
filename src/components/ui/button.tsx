"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "default" | "primary" | "success" | "danger" | "muted" | "ghost";

const variantClasses: Record<Variant, string> = {
  default: "wf-btn",
  primary: "wf-btn-primary",
  success: "wf-btn-success",
  danger: "wf-btn-danger",
  muted: "wf-btn-muted",
  ghost: "bg-transparent border border-transparent hover:bg-hover text-[var(--fg2)] hover:text-foreground",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-2.5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "md", className = "", children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${variantClasses[variant]} ${sizeClasses[size]} font-medium inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
