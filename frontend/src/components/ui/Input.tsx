"use client";

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  return (
    <label htmlFor={id} className="block">
      {label && (
        <span className="mb-1.5 block text-xs font-medium text-ink-700">
          {label}
        </span>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          "block w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100",
          error && "border-red-400 focus:border-red-500 focus:ring-red-100",
          className,
        )}
        {...rest}
      />
      {(hint || error) && (
        <span
          className={cn(
            "mt-1 block text-xs",
            error ? "text-red-600" : "text-ink-500",
          )}
        >
          {error ?? hint}
        </span>
      )}
    </label>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  countMax?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, hint, error, countMax, className, id, value, ...rest },
    ref,
  ) {
    const length = typeof value === "string" ? value.length : 0;
    return (
      <label htmlFor={id} className="block">
        {label && (
          <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-ink-700">
            <span>{label}</span>
            {countMax && (
              <span className="text-ink-400">
                {length.toLocaleString()} / {countMax.toLocaleString()}
              </span>
            )}
          </span>
        )}
        <textarea
          ref={ref}
          id={id}
          value={value}
          className={cn(
            "block min-h-[120px] w-full resize-y rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100",
            error && "border-red-400 focus:border-red-500 focus:ring-red-100",
            className,
          )}
          {...rest}
        />
        {(hint || error) && (
          <span
            className={cn(
              "mt-1 block text-xs",
              error ? "text-red-600" : "text-ink-500",
            )}
          >
            {error ?? hint}
          </span>
        )}
      </label>
    );
  },
);
