"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/locale-init";

const OPTIONS: Locale[] = ["ko", "en"];

export function LocaleSwitch() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5"
      role="group"
      aria-label={t("common.language")}
    >
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          className={cn(
            "rounded-md px-2 py-0.5 text-[10px] font-semibold",
            locale === option
              ? "bg-surface text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-800",
          )}
        >
          {option === "ko" ? "KO" : "EN"}
        </button>
      ))}
    </div>
  );
}
