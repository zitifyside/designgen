"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-2xl bg-white shadow-2xl",
          size === "sm" && "max-w-md",
          size === "md" && "max-w-xl",
          size === "lg" && "max-w-3xl",
        )}
      >
        <div className="border-b border-ink-100 px-6 py-4">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          {description && (
            <p className="mt-1 text-xs text-ink-500">{description}</p>
          )}
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto scrollbar-thin">
          {children}
        </div>
        {footer && (
          <div className="border-t border-ink-100 bg-ink-50 px-6 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
