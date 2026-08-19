"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, type AdminKpi, type AdminStats, type AuditLogRecord } from "@/lib/api";
import { useI18n } from "@/components/i18n/I18nProvider";

export default function AdminDashboardPage() {
  const { t } = useI18n();
  const [kpi, setKpi] = useState<AdminKpi | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [k, s, l] = await Promise.all([
          api.admin.dashboard(),
          api.admin.stats(30),
          api.admin.auditLogs(),
        ]);
        if (cancelled) return;
        setKpi(k);
        setStats(s);
        setLogs(l.slice(0, 8));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t("admin.kpiFailed"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const daily = stats?.daily ?? [];
  const max = Math.max(1, ...daily.map((d) => d.generations));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title={t("admin.homeTitle")}
        description={t("admin.homeDesc")}
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("admin.kpiUsers")} value={kpi?.totalUsers ?? 0} />
        <Kpi label={t("admin.kpiActive")} value={kpi?.activeUsers ?? 0} />
        <Kpi label={t("admin.kpiProjects")} value={kpi?.totalProjects ?? 0} />
        <Kpi label={t("admin.kpiGens")} value={kpi?.generationsTotal ?? 0} />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("admin.kpiSuspended")} value={kpi?.suspendedUsers ?? 0} tone="warning" />
        <Kpi label={t("admin.kpiRefunds")} value={kpi?.pendingRefunds ?? 0} tone="warning" />
        <Kpi label={t("admin.kpiFeedback")} value={kpi?.openFeedback ?? 0} tone="warning" />
        <Kpi
          label={t("admin.kpiError30")}
          value={`${((stats?.errorRate ?? 0) * 100).toFixed(1)}%`}
          tone={(stats?.errorRate ?? 0) > 0.05 ? "danger" : "default"}
        />
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("admin.daily30")} />
          <div className="flex h-32 items-end gap-[2px]">
            {daily.map((d) => (
              <div
                key={d.date}
                title={t("admin.dailyBar", { date: d.date, gens: d.generations, fails: d.failures })}
                className="flex-1 rounded-t bg-amber-500/80"
                style={{
                  height: `${(d.generations / max) * 100}%`,
                  minHeight: 2,
                }}
              />
            ))}
          </div>
          <div className="mt-2 text-[11px] text-ink-500">
            {t("admin.sum30", {
              gens: daily.reduce((s, d) => s + d.generations, 0),
              fails: daily.reduce((s, d) => s + d.failures, 0),
            })}
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
      </div>

      <Card className="mt-4">
        <CardHeader
          title={t("admin.recentLogs")}
          action={
            <Link
              href="/admin/audit-logs"
              className="text-xs text-brand-700 hover:underline"
            >
              {t("admin.viewAll")}
            </Link>
          }
        />
        {logs.length === 0 ? (
          <p className="py-3 text-xs text-ink-500">{t("admin.noRecords")}</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-ink-50">
                  <td className="py-2 text-ink-500">
                    {new Date(l.at).toLocaleString("ko-KR")}
                  </td>
                  <td className="py-2 font-medium text-ink-800">{l.actor}</td>
                  <td className="py-2">{l.action}</td>
                  <td className="py-2 text-ink-500">{l.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-surface p-4">
      <div className="text-[11px] text-ink-500">{label}</div>
      <div
        className={
          tone === "danger"
            ? "mt-1 text-2xl font-semibold text-red-700"
            : tone === "warning"
              ? "mt-1 text-2xl font-semibold text-amber-600"
              : "mt-1 text-2xl font-semibold text-ink-900"
        }
      >
        {value}
      </div>
    </div>
  );
}
