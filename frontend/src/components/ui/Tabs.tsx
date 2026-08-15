"use client";

import { cn } from "@/lib/cn";

interface TabItem {
  value: string;
  label: string;
  hint?: string;
}

export function Tabs({
  items,
  value,
  onChange,
  size = "md",
}: {
  items: TabItem[];
  value: string;
  onChange: (v: string) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "inline-flex gap-1 rounded-xl bg-ink-100 p-1",
        size === "sm" ? "text-xs" : "text-sm",
      )}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            onClick={() => onChange(it.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 font-medium transition",
              active
                ? "bg-surface text-ink-900 shadow-sm"
                : "text-ink-500 hover:text-ink-800",
            )}
          >
            {it.label}
            {it.hint && (
              <span className="ml-1.5 text-[10px] text-ink-500">{it.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
