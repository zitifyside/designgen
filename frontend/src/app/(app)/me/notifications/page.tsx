"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { api, type NotificationPrefs } from "@/lib/api";
import { useI18n } from "@/components/i18n/I18nProvider";

/** 카테고리 표시 정의 — 키는 서버 기본값과 1:1 이다. */
const CATEGORIES: Array<{ key: string; label: string; description: string }> = [
  {
    key: "generation_done",
    label: "me.catDone",
    description: "me.catDoneDesc",
  },
  {
    key: "generation_failed",
    label: "me.catFail",
    description: "me.catFailDesc",
  },
  {
    key: "billing",
    label: "me.catPay",
    description: "me.catPayDesc",
  },
  {
    key: "security",
    label: "me.catSec",
    description: "me.catSecDesc",
  },
  {
    key: "announcement",
    label: "me.catAnn",
    description: "me.catAnnDesc",
  },
  {
    key: "marketing",
    label: "me.catMkt",
    description: "me.catMktDesc",
  },
];

export default function NotificationSettingsPage() {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.users.notificationPrefs();
      setPrefs(res.prefs);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("me.notifLoadFailed"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (key: string, channel: "inApp" | "email") => {
    if (!prefs) return;
    const current = prefs[key] ?? { inApp: true, email: true };
    setPrefs({ ...prefs, [key]: { ...current, [channel]: !current[channel] } });
    setDirty(true);
    setNotice(null);
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.users.updateNotificationPrefs(prefs);
      setPrefs(res.prefs);
      setDirty(false);
      setNotice(t("me.notifSaved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("me.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t("me.notifTitle")}
          description={t("me.notifDesc")}
        />

        <div className="overflow-hidden rounded-lg border border-ink-200">
          <div className="grid grid-cols-[1fr_72px_72px] items-center gap-2 border-b border-ink-200 bg-ink-50 px-3 py-2 text-[11px] font-medium text-ink-500">
            <span>{t("me.colCategory")}</span>
            <span className="text-center">{t("me.inApp")}</span>
            <span className="text-center">{t("me.emailCh")}</span>
          </div>

          {CATEGORIES.map((c) => {
            const value = prefs?.[c.key] ?? { inApp: true, email: true };
            // 보안 알림은 계정 탈취 탐지 경로라 사용자가 끄지 못하게 한다.
            const locked = c.key === "security";
            return (
              <div
                key={c.key}
                className="grid grid-cols-[1fr_72px_72px] items-center gap-2 border-b border-ink-100 px-3 py-2.5 last:border-b-0"
              >
                <div>
                  <div className="text-xs font-medium text-ink-900">{t(c.label)}</div>
                  <div className="mt-0.5 text-[11px] text-ink-500">
                    {t(c.description)}
                  </div>
                </div>
                <Toggle
                  checked={value.inApp}
                  disabled={locked || !prefs}
                  onChange={() => toggle(c.key, "inApp")}
                />
                <Toggle
                  checked={value.email}
                  disabled={locked || !prefs}
                  onChange={() => toggle(c.key, "email")}
                />
              </div>
            );
          })}
        </div>

        {(notice || error) && (
          <div
            className={cn(
              "mt-3 rounded-lg border px-3 py-2 text-xs",
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700",
            )}
          >
            {error ?? notice}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] text-ink-500">
            {t("me.unsubNote")}
          </p>
          <Button size="sm" loading={saving} disabled={!dirty} onClick={save}>
            {t("common.save")}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "mx-auto flex h-5 w-9 items-center rounded-full px-0.5 transition",
        checked ? "bg-brand-600" : "bg-ink-200",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-full bg-surface shadow-sm transition",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}
