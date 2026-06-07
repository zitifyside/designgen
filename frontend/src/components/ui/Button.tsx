"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT_CLS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-ink-300 disabled:text-white",
  secondary:
    "bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-300",
  ghost:
    "text-ink-700 hover:bg-ink-100 disabled:text-ink-400",
  danger:
    "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  outline:
    "border border-ink-200 bg-white text-ink-800 hover:bg-ink-50 disabled:text-ink-400",
};

const SIZE_CLS: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    className,
    disabled,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-1 disabled:cursor-not-allowed",
        VARIANT_CLS[variant],
        SIZE_CLS[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading && (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" />
      )}
      {children}
    </button>
  );
});
