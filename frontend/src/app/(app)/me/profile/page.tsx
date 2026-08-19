"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { applyTheme } from "@/components/layout/ThemeProvider";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/store/auth-store";
import { useI18n } from "@/components/i18n/I18nProvider";

export default function ProfilePage() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [name, setName] = useState("");
  const [language, setLanguage] = useState<"ko" | "en">("ko");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setLanguage(user.language);
    setTheme(user.theme);
  }, [user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await updateProfile({ name, language, theme });
      setMessage(t("me.savedProfile"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("me.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return <div className="text-sm text-ink-500">{t("me.loading")}</div>;
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <Card>
        <CardHeader
          title={t("me.profileTitle")}
          description={t("me.profileDesc")}
        />

        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold text-white">
            {user.name.slice(0, 1)}
          </div>
          <div className="text-xs text-ink-500">
            {t("me.avatarSoon")}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <Input
            id="name"
            label={t("me.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
          />
          <div>
            <Input
              id="email"
              label={t("auth.email")}
              value={user.email}
              readOnly
              disabled
              hint={t("me.emailHint")}
              onChange={() => undefined}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-700">{t("me.language")}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { v: "ko", l: t("common.localeKo") },
                  { v: "en", l: "English" },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setLanguage(o.v)}
                  className={cn(
                    "rounded-lg border py-2 text-xs font-medium",
                    language === o.v
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50",
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-ink-500">
              {t("me.langSoon")}
            </p>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-700">{t("me.theme")}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { v: "light", l: "Light" },
                  { v: "dark", l: "Dark" },
                  { v: "system", l: "System" },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => {
                    setTheme(o.v);
                    // 저장 전에 바로 보여 준다 — 고르고 나서 결과를 봐야 고를 수 있다.
                    applyTheme(o.v);
                  }}
                  className={cn(
                    "rounded-lg border py-2 text-xs font-medium",
                    theme === o.v
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50",
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 text-xs">
          <div>
            <dt className="text-ink-500">{t("me.currentPlan")}</dt>
            <dd className="mt-0.5 font-medium text-ink-900">{user.plan}</dd>
          </div>
          <div>
            <dt className="text-ink-500">{t("me.joined")}</dt>
            <dd className="mt-0.5 font-medium text-ink-900">
              {new Date(user.createdAt).toLocaleDateString("ko-KR")}
            </dd>
          </div>
        </dl>
      </Card>

      {(message || error) && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-xs",
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          {error ?? message}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          {t("me.saveChanges")}
        </Button>
      </div>
    </form>
  );
}
