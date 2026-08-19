"use client";

import { ChangeEvent } from "react";
import { contrastRatio, isHex } from "@/lib/token-utils";
import { useI18n } from "@/components/i18n/I18nProvider";

export function ColorSwatch({
  label,
  value,
  onChange,
  contrastAgainst,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  contrastAgainst?: string;
}) {
  const { t } = useI18n();
  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (e.target.type === "color") onChange(v);
    else if (isHex(v)) onChange(v);
  };

  const ratio = contrastAgainst ? contrastRatio(value, contrastAgainst) : null;
  const ratioOk = ratio !== null && ratio >= 4.5;

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={handle}
        className="h-9 w-9 cursor-pointer rounded-lg border border-ink-200 bg-surface"
        aria-label={label}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-ink-700">
            {label}
          </span>
          {ratio !== null && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono ${
                ratioOk ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
              }`}
              title={ratioOk ? t("common.wcagPass") : t("common.wcagFail")}
            >
              {ratio.toFixed(2)}:1
            </span>
          )}
        </div>
        <input
          type="text"
          value={value}
          onChange={handle}
          className="mt-1 block w-full rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] uppercase text-ink-800 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>
    </div>
  );
}
