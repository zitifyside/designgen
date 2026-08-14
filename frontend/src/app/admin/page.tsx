"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, type AdminKpi, type AdminStats, type AuditLogRecord } from "@/lib/api";

export default function AdminDashboardPage() {
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
          setError(e instanceof Error ? e.message : "지표를 불러오지 못했다.");
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
        title="Admin 대시보드"
        description="서비스 핵심 지표를 모니터링한다. 모든 수치는 DB 실측이다."
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="전체 사용자" value={kpi?.totalUsers ?? 0} />
        <Kpi label="활성 사용자" value={kpi?.activeUsers ?? 0} />
        <Kpi label="프로젝트" value={kpi?.totalProjects ?? 0} />
        <Kpi label="누적 생성" value={kpi?.generationsTotal ?? 0} />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="정지 계정" value={kpi?.suspendedUsers ?? 0} tone="warning" />
        <Kpi label="환불 대기" value={kpi?.pendingRefunds ?? 0} tone="warning" />
        <Kpi label="미처리 피드백" value={kpi?.openFeedback ?? 0} tone="warning" />
        <Kpi
          label="에러율 (30일)"
          value={`${((stats?.errorRate ?? 0) * 100).toFixed(1)}%`}
          tone={(stats?.errorRate ?? 0) > 0.05 ? "danger" : "default"}
        />
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="일별 생성 (30일)" />
          <div className="flex h-32 items-end gap-[2px]">
            {daily.map((d) => (
              <div
                key={d.date}
                title={`${d.date} · 생성 ${d.generations} · 실패 ${d.failures}`}
                className="flex-1 rounded-t bg-amber-500/80"
                style={{
                  height: `${(d.generations / max) * 100}%`,
                  minHeight: 2,
                }}
              />
            ))}
          </div>
          <div className="mt-2 text-[11px] text-ink-500">
            30일 합계 {daily.reduce((s, d) => s + d.generations, 0)}회 · 실패{" "}
            {daily.reduce((s, d) => s + d.failures, 0)}회
          </div>
        </Card>

        <Card>
          <CardHeader title="등급 분포" />
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
                      {n}명 · {pct}%
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
          title="최근 감사 로그"
          action={
            <Link
              href="/admin/audit-logs"
              className="text-xs text-brand-600 hover:underline"
            >
              전체 보기 →
            </Link>
          }
        />
        {logs.length === 0 ? (
          <p className="py-3 text-xs text-ink-500">기록이 없다.</p>
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
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="text-[11px] text-ink-500">{label}</div>
      <div
        className={
          tone === "danger"
            ? "mt-1 text-2xl font-semibold text-red-600"
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
