"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useAuthStore } from "@/store/auth-store";

export default function SignupPage() {
  const router = useRouter();
  const signup = useAuthStore((s) => s.signup);
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!agree) {
      setError(t("auth.agreeRequired"));
      return;
    }
    if (password.length < 8) {
      setError(t("auth.passwordMin"));
      return;
    }
    setLoading(true);
    try {
      await signup(email, password, name, website);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("auth.signupFailed"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-ink-200 bg-surface p-6 shadow-sm">
      <h1 className="text-base font-semibold text-ink-900">{t("auth.signupTitle")}</h1>
      <p className="mt-1 text-xs text-ink-500">{t("auth.signupLead")}</p>

      <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
        <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
          <label htmlFor="website">{t("auth.website")}</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <Input
          id="name"
          label={t("auth.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder={t("auth.namePlaceholder")}
        />
        <Input
          id="email"
          type="email"
          label={t("auth.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
        />
        <Input
          id="password"
          type="password"
          label={t("auth.password")}
          hint={t("auth.passwordHint")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <label className="flex items-start gap-2 pt-1 text-xs text-ink-600">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-ink-900">{t("auth.terms")}</span>{" "}
            {t("auth.and")}{" "}
            <span className="font-medium text-ink-900">{t("auth.privacy")}</span>
            {t("auth.agreeSuffix")}
          </span>
        </label>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <Button type="submit" loading={loading} fullWidth>
          {t("auth.signupSubmit")}
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-ink-500">
        {t("auth.hasAccount")}{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          {t("auth.loginTitle")}
        </Link>
      </p>
    </div>
  );
}
