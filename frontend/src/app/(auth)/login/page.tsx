"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password, needTotp ? totpCode : undefined);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.code === "totp_required") {
        setNeedTotp(true);
        setError(t("auth.totpRequired"));
      } else {
        setError(
          err instanceof Error ? err.message : t("auth.loginFailed"),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-ink-200 bg-surface p-6 shadow-sm">
      <h1 className="text-base font-semibold text-ink-900">{t("auth.loginTitle")}</h1>
      <p className="mt-1 text-xs text-ink-500">{t("auth.loginLead")}</p>

      <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
        <Input
          id="email"
          type="email"
          label={t("auth.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Input
          id="password"
          type="password"
          label={t("auth.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {needTotp && (
          <Input
            id="totp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            label={t("auth.totp")}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            required
          />
        )}
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <Button type="submit" loading={loading} fullWidth>
          {t("auth.loginSubmit")}
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-[10px] text-ink-500">
        <span className="h-px flex-1 bg-ink-200" />
        {t("common.or")}
        <span className="h-px flex-1 bg-ink-200" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {["Google", "Apple", "GitHub"].map((p) => (
          <button
            key={p}
            type="button"
            disabled
            className="rounded-lg border border-ink-200 bg-surface py-2 text-xs font-medium text-ink-500 disabled:cursor-not-allowed disabled:opacity-60"
            title={t("auth.oauthSoon", { provider: p })}
          >
            {p}
          </button>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-ink-500">
        {t("auth.noAccount")}{" "}
        <Link href="/signup" className="font-medium text-brand-700 hover:underline">
          {t("auth.signupLink")}
        </Link>
      </p>
      <p className="mt-3 text-center text-[11px] text-ink-500">
        {t("auth.demoAccount")}{" "}
        <span className="font-medium text-ink-700">demo@designgenerator.io</span>
        {" / "}
        <span className="font-medium text-ink-700">demo1234</span>
      </p>
    </div>
  );
}
