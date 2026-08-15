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

// 비활성 상태는 어느 변형이든 같은 모양으로 모은다 — 변형마다 다른 회색을 쓰면
// 어떤 조합은 글자가 배경에 묻힌다(흰 글자 + 연회색 = 1.5:1 이었다).
const DISABLED = "disabled:bg-ink-200 disabled:text-ink-600 disabled:border-ink-200";

const VARIANT_CLS: Record<Variant, string> = {
  primary: `bg-brand-600 text-white hover:bg-brand-500 ${DISABLED}`,
  secondary: `bg-ink-900 text-ink-50 hover:bg-ink-800 ${DISABLED}`,
  ghost: "text-ink-700 hover:bg-ink-100 disabled:text-ink-500",
  // 위험 동작의 hover 는 색 단계를 바꾸지 않고 밝기만 낮춘다. red-700 은 다크에서
  // '어두운 면 위 글자' 역할이라 밝아지므로, 배경으로 쓰면 흰 글자가 묻힌다.
  danger: `bg-red-600 text-white hover:brightness-90 ${DISABLED}`,
  outline: `border border-ink-200 bg-surface text-ink-800 hover:bg-ink-50 ${DISABLED}`,
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
