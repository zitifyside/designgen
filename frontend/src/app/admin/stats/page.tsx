"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, type AdminStats } from "@/lib/api";
import { useI18n } from "@/components/i18n/I18nProvider";

type Range = "7" | "30" | "90";

export default function AdminStatsPage() {
  const { t } = useI18n();
  const [range, setRange] = useState<Range>("30");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.admin
      .stats(Number(range))
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t("admin.statsFailed"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const daily = stats?.daily ?? [];
  const maxGen = Math.max(1, ...daily.map((d) => d.generations));
  const maxCost = Math.max(1, ...daily.map((d) => d.aiCostCents));
  const noPayments = (stats?.paymentsRecorded ?? 0) === 0;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title={t("admin.statsTitle")}
        description={t("admin.statsDesc")}
        action={
          <Tabs
            size="sm"
            value={range}
            onChange={(v) => setRange(v as Range)}
            items={[
              { value: "7", label: t("admin.d7") },
              { value: "30", label: t("admin.d30") },
              { value: "90", label: t("admin.d90") },
            ]}
          />
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {noPayments && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t("admin.noPay")}
        </div>
      )}

      <section className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiBox
          label="DAU"
          value={(stats?.dau ?? 0).toLocaleString()}
          sub={t("admin.last24")}
        />
        <KpiBox
          label="MAU"
          value={(stats?.mau ?? 0).toLocaleString()}
          sub={t("admin.last30")}
        />
        <KpiBox
          label={t("admin.signups")}
          value={(stats?.daily.reduce((n, d) => n + d.signups, 0) ?? 0).toLocaleString()}
          sub={t("admin.lastNDays", { n: stats?.rangeDays ?? 0 })}
        />
        <KpiBox
          label={t("admin.gens")}
          value={(stats?.daily.reduce((n, d) => n + d.generations, 0) ?? 0).toLocaleString()}
          sub={t("admin.lastNDays", { n: stats?.rangeDays ?? 0 })}
        />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiBox
          label="MRR"
          value={`$${((stats?.mrrCents ?? 0) / 100).toLocaleString()}`}
          sub={t("admin.mrrHint")}
        />
        <KpiBox
          label={t("admin.paidRatio")}
          value={`${((stats?.paidRatio ?? 0) * 100).toFixed(1)}%`}
          sub={t("admin.paidHint")}
        />
        <KpiBox
          label="ARPU"
          value={`$${((stats?.arpuCents ?? 0) / 100).toFixed(2)}`}
          sub={t("admin.arpuHint")}
        />
        <KpiBox
          label={t("admin.errorRate")}
          value={`${((stats?.errorRate ?? 0) * 100).toFixed(1)}%`}
          sub={t("admin.errorHint")}
        />
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("admin.dailyGens")} description={t("admin.dailyGensDesc")} />
          <div className="flex h-36 items-end gap-[2px]">
            {daily.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col justify-end">
                <div
                  title={t("admin.failTitle", { date: d.date, n: d.failures })}
                  className="w-full rounded-t bg-red-400"
                  style={{
                    height: `${(d.failures / maxGen) * 100}%`,
                  }}
                />
                <div
                  title={t("admin.genTitle", { date: d.date, n: d.generations })}
                  className="w-full bg-brand-500"
                  style={{
                    height: `${((d.generations - d.failures) / maxGen) * 100}%`,
                    minHeight: 1,
                  }}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t("admin.dailyAi")}
            description={t("admin.dailyAiDesc")}
          />
          <div className="flex h-36 items-end gap-[2px]">
            {daily.map((d) => (
              <div
                key={d.date}
                title={`${d.date} · $${(d.aiCostCents / 100).toFixed(2)}`}
                className="flex-1 rounded-t bg-amber-500/80"
                style={{
                  height: `${(d.aiCostCents / maxCost) * 100}%`,
                  minHeight: 1,
                }}
              />
            ))}
          </div>
          <div className="mt-2 text-[11px] text-ink-500">
            {t("admin.rangeSum", { n: ((stats?.aiCostTotalCents ?? 0) / 100).toFixed(2) })}
          </div>
        </Card>

        <Card>
          <CardHeader title={t("admin.planDist")} />
          <div className="space-y-2">
            {Object.entries(stats?.planDistribution ?? {}).map(([plan, n]) => {
              const total = Object.values(stats?.planDistribution ?? {}).reduce(
                (s, v) => s + v,
                0,
              );
              const pct = total ? Math.round((n / total) * 100) : 0;
              return (
                <div key={plan}>
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-700">{plan}</span>
                    <span className="text-ink-500">
                      {t("admin.peoplePct", { n, pct })}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full bg-brand-600"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title={t("admin.signups")} />
          <div className="flex h-36 items-end gap-[2px]">
            {daily.map((d) => (
              <div
                key={d.date}
                title={t("admin.signupBar", { date: d.date, n: d.signups })}
                className="flex-1 rounded-t bg-emerald-500/80"
                style={{
                  height: `${
                    (d.signups / Math.max(1, ...daily.map((x) => x.signups))) *
                    100
                  }%`,
                  minHeight: 1,
                }}
              />
            ))}
          </div>
          <div className="mt-2 text-[11px] text-ink-500">
            {t("admin.rangePeople", { n: daily.reduce((s, d) => s + d.signups, 0) })}
          </div>
        </Card>
      </section>
    </div>
  );
}

function KpiBox({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-surface p-4">
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink-900">{value}</div>
      <div className="mt-1 text-[10px] text-ink-500">{sub}</div>
    </div>
  );
}
