"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import type { PlanInfo, Subscription } from "@/lib/types";
import { useI18n } from "@/components/i18n/I18nProvider";

const PLAN_FEATURES: Record<string, string[]> = {
  Free: [
    "me.freeF1",
    "me.freeF2",
    "me.freeF3",
  ],
  Pro: [
    "me.proF1",
    "me.proF2",
    "me.proExport",
    "me.proF3",
    "me.proF4",
  ],
  Team: [
    "me.teamF1",
    "me.teamF2",
    "me.teamF3",
    "me.teamF4",
  ],
};

export default function SubscriptionPage() {
  const { t, locale } = useI18n();
  const user = useAuthStore((s) => s.user);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [planList, sub] = await Promise.all([
        api.billing.plans(),
        api.billing.subscription().catch(() => null),
      ]);
      setPlans(planList);
      setSubscription(sub);
    } catch {
      /* 조회 실패는 화면을 막지 않는다. */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCheckout = async (code: string) => {
    setBusy(code);
    setNotice(null);
    try {
      const res = await api.billing.checkout(code, interval);
      setNotice(res.detail);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("me.payFailed"));
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    setBusy("cancel");
    setNotice(null);
    try {
      const res = await api.billing.cancelSubscription();
      setNotice(res.detail);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("me.cancelSubFailed"));
    } finally {
      setBusy(null);
    }
  };

  const price = (p: PlanInfo) =>
    interval === "monthly" ? p.monthlyPriceCents : p.annualPriceCents;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t("me.currentSub")} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold text-ink-900">
                {user?.plan ?? "Free"}
              </span>
              <Badge tone={subscription?.status === "active" ? "success" : "neutral"}>
                {subscription?.status ?? "active"}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-ink-500">
              {subscription?.currentPeriodEnd
                ? t("me.nextBill", {
                    date: new Date(subscription.currentPeriodEnd).toLocaleDateString(
                      locale === "en" ? "en-US" : "ko-KR",
                    ),
                  })
                : t("me.noCycle")}
              {subscription?.cancelAtPeriodEnd && t("me.cancelScheduled")}
            </div>
          </div>
          {user?.plan !== "Free" && (
            <Button
              variant="outline"
              size="sm"
              loading={busy === "cancel"}
              onClick={handleCancel}
            >
              {t("me.cancelSub")}
            </Button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 text-xs">
          <div>
            <div className="text-ink-500">{t("me.genThisMonth")}</div>
            <div className="mt-0.5 font-medium text-ink-900">
              {user?.monthlyGenerations.used ?? 0}
              {user?.monthlyGenerations.limit === -1
                ? t("me.unlimited")
                : ` / ${user?.monthlyGenerations.limit ?? 0}`}
            </div>
          </div>
          <div>
            <div className="text-ink-500">{t("me.creditsLabel")}</div>
            <div className="mt-0.5 font-medium text-ink-900">
              {t("me.timesN", { n: user?.credits ?? 0 })}
            </div>
          </div>
        </div>
      </Card>

      {notice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {notice}
        </div>
      )}

      <Card>
        <CardHeader
          title={t("me.plans")}
          description={t("me.plansDesc")}
          action={
            <Tabs
              size="sm"
              value={interval}
              onChange={(v) => setInterval(v as "monthly" | "annual")}
              items={[
                { value: "monthly", label: t("me.monthly") },
                { value: "annual", label: t("me.annual") },
              ]}
            />
          }
        />
        <div className="grid gap-3 md:grid-cols-3">
          {plans.map((p) => {
            const current = p.code === user?.plan;
            return (
              <div
                key={p.code}
                className={cn(
                  "rounded-xl border p-4",
                  current ? "border-brand-500 bg-brand-50" : "border-ink-200",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-ink-900">
                    {p.name}
                  </div>
                  {current && <Badge tone="brand">{t("me.currentBadge")}</Badge>}
                </div>
                <div className="mt-2 text-2xl font-semibold text-ink-900">
                  ${(price(p) / 100).toFixed(0)}
                  <span className="text-xs font-normal text-ink-500">
                    {interval === "monthly" ? t("me.perMonth") : t("me.perYear")}
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5 text-[11px] text-ink-600">
                  {(PLAN_FEATURES[p.code] ?? []).map((f) => (
                    <li key={f}>· {t(f)}</li>
                  ))}
                </ul>
                <Button
                  className="mt-4"
                  fullWidth
                  size="sm"
                  variant={current ? "outline" : "primary"}
                  disabled={current || p.code === "Free"}
                  loading={busy === p.code}
                  onClick={() => handleCheckout(p.code)}
                >
                  {current ? t("me.inUse") : t("me.startPlan", { name: p.name })}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
