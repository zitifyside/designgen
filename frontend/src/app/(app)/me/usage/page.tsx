"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { cn } from "@/lib/cn";
import { api, type UsageSummary } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import type { ExportRecord } from "@/lib/types";
import { useI18n } from "@/components/i18n/I18nProvider";

type Granularity = "day" | "week" | "month";

/** 단위별 기본 구간 수 — 화면에 적당히 차는 길이로 잡는다. */
const PERIODS: Record<Granularity, number> = { day: 30, week: 12, month: 6 };
const UNIT_LABEL: Record<Granularity, string> = {
  day: "me.byDay",
  week: "me.byWeek",
  month: "me.byMonth",
};

/** Export 형식별 막대 색 — 형식을 눈으로 구분하려는 용도다. */
const FORMAT_TONE: Record<string, string> = {
  png: "bg-brand-500",
  json: "bg-emerald-500",
  css: "bg-amber-500",
  fig: "bg-red-500",
};

/**
 * 사용량 대시보드 (기능정의서 v0.2.0 §3.1).
 *
 * 집계는 서버가 한다. 예전에는 프로젝트를 전부 불러 각각의 생성 이력을 다시 부른 뒤
 * 화면에서 합산했는데, 프로젝트가 늘수록 요청이 그만큼 늘고 합계도 매번 다시 셌다.
 */
export default function UsagePage() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const [granularity, setGranularity] = useState<Granularity>("day");
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, history] = await Promise.all([
        api.users.usage(granularity, PERIODS[granularity]),
        api.exports.history().catch(() => [] as ExportRecord[]),
      ]);
      setUsage(summary);
      setExports(history);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("me.usageLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [granularity]);

  useEffect(() => {
    void load();
    void refreshUser();
  }, [load, refreshUser]);

  const max = Math.max(1, ...(usage?.buckets ?? []).map((b) => b.generations));
  const diff = (usage?.thisMonth ?? 0) - (usage?.lastMonth ?? 0);
  const formatMax = Math.max(1, ...(usage?.exportFormats ?? []).map((f) => f.count));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t("me.usageTitle")} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label={t("me.monthlyGen")}
            value={`${user?.monthlyGenerations.used ?? 0}${
              user?.monthlyGenerations.limit === -1
                ? " / ∞"
                : ` / ${user?.monthlyGenerations.limit ?? 0}`
            }`}
            note={
              usage
                ? diff === 0
                  ? t("me.sameAsLast")
                  : t("me.vsLast", { diff: `${diff > 0 ? "+" : ""}${diff}` })
                : undefined
            }
            tone={diff > 0 ? "up" : diff < 0 ? "down" : "flat"}
          />
          <Metric label={t("me.creditBalance")} value={t("me.timesUnit", { n: user?.credits ?? 0 })} />
          <Metric label={t("me.projects")} value={t("me.countUnit", { n: usage?.projectCount ?? 0 })} />
          <Metric label="Export" value={t("me.exportCount", { n: usage?.exportTotal ?? 0 })} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t("me.trendTitle", { unit: t(UNIT_LABEL[granularity]) })}
          description={t("me.trendDesc")}
          action={
            <Tabs
              size="sm"
              value={granularity}
              onChange={(v) => setGranularity(v as Granularity)}
              items={[
                { value: "day", label: t("me.byDay") },
                { value: "week", label: t("me.byWeek") },
                { value: "month", label: t("me.byMonth") },
              ]}
            />
          }
        />

        {error ? (
          <p className="py-6 text-center text-xs text-red-700">{error}</p>
        ) : loading && !usage ? (
          <p className="py-6 text-center text-xs text-ink-500">{t("common.loading")}</p>
        ) : (
          <>
            <div className="flex h-32 items-end gap-[3px]">
              {usage?.buckets.map((b) => (
                <div
                  key={b.label}
                  title={t("me.barTitle", { label: b.label, gens: b.generations, adds: b.screenAdds })}
                  className="flex flex-1 flex-col justify-end"
                  style={{ height: "100%" }}
                >
                  {/* 화면 추가분을 위에 얹어 구성비가 보이게 한다. */}
                  <div
                    className="w-full rounded-t bg-brand-400"
                    style={{ height: `${(b.screenAdds / max) * 100}%` }}
                  />
                  <div
                    className="w-full bg-brand-600"
                    style={{
                      height: `${((b.generations - b.screenAdds) / max) * 100}%`,
                      minHeight: b.generations > 0 ? 2 : 0,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-ink-500">
              <span>{usage?.buckets[0]?.label}</span>
              <span className="flex items-center gap-2">
                <Legend className="bg-brand-600">{t("me.legendAll")}</Legend>
                <Legend className="bg-brand-400">{t("me.legendAdds")}</Legend>
              </span>
              <span>{usage?.buckets[usage.buckets.length - 1]?.label}</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-ink-100 pt-3 text-xs">
              <Stat label={t("me.statPeriod")} value={t("me.timesUnit", { n: usage?.totalGenerations ?? 0 })} />
              <Stat label={t("me.statAdds")} value={t("me.timesUnit", { n: usage?.totalScreenAdds ?? 0 })} />
              <Stat
                label={t("me.statFail")}
                value={`${usage?.failures ?? 0} · ${usage?.warnings ?? 0}`}
              />
            </div>
          </>
        )}
      </Card>

      <Card>
        <CardHeader
          title={t("me.exportDist")}
          description={t("me.exportDistDesc")}
        />
        {(usage?.exportFormats.length ?? 0) === 0 ? (
          <p className="py-3 text-xs text-ink-500">{t("me.noExport")}</p>
        ) : (
          <div className="space-y-2">
            {usage?.exportFormats.map((f) => (
              <div key={f.format} className="flex items-center gap-3">
                <span className="w-12 shrink-0 font-mono text-[11px] text-ink-600">
                  .{f.format}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-ink-100">
                  <div
                    className={cn("h-full rounded", FORMAT_TONE[f.format] ?? "bg-ink-400")}
                    style={{ width: `${(f.count / formatMax) * 100}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-[11px] text-ink-600">
                  {t("me.exportCount", { n: f.count })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title={t("me.recentExport")} description={t("me.recentExportDesc")} />
        {exports.length === 0 ? (
          <p className="py-3 text-xs text-ink-500">{t("me.noExport")}</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-100 text-left text-ink-500">
                <th className="py-2 font-medium">{t("me.colProject")}</th>
                <th className="py-2 font-medium">{t("me.colFormat")}</th>
                <th className="py-2 font-medium">{t("me.colScope")}</th>
                <th className="py-2 font-medium">{t("me.colWhen")}</th>
              </tr>
            </thead>
            <tbody>
              {exports.slice(0, 10).map((e) => (
                <tr key={e.id} className="border-b border-ink-50">
                  <td className="py-2 text-ink-800">{e.projectName}</td>
                  <td className="py-2 font-mono">.{e.format}</td>
                  <td className="py-2 text-ink-500">{e.scope}</td>
                  <td className="py-2 text-ink-500">
                    {new Date(e.createdAt).toLocaleString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  tone = "flat",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "up" | "down" | "flat";
}) {
  return (
    <div className="rounded-lg border border-ink-200 p-3">
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-ink-900">{value}</div>
      {note && (
        <div
          className={cn(
            "mt-0.5 text-[10px]",
            tone === "up"
              ? "text-emerald-700"
              : tone === "down"
                ? "text-red-700"
                : "text-ink-500",
          )}
        >
          {note}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-ink-500">{label}</div>
      <div className="mt-0.5 font-medium text-ink-900">{value}</div>
    </div>
  );
}

function Legend({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("h-2 w-2 rounded-sm", className)} />
      {children}
    </span>
  );
}
