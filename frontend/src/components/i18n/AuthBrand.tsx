"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import { LocaleSwitch } from "@/components/i18n/LocaleSwitch";

export function AuthBrand() {
  const { t } = useI18n();
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
          DG
        </div>
        <div>
          <div className="text-base font-semibold text-ink-900">
            {t("brand.fullName")}
          </div>
          <div className="text-xs text-ink-500">{t("brand.authTagline")}</div>
        </div>
      </div>
      <LocaleSwitch />
    </div>
  );
}
