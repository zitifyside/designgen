"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import {
  ADMIN_KPI,
  ADMIN_REVENUE_30D,
  ADMIN_AI_COST_30D,
  ADMIN_ERROR_RATE_30D,
  ADMIN_AUDIT_LOGS,
  ADMIN_HEALTH,
} from "@/lib/admin-mock";

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title="관리자 대시보드"
        description={`MAU ${ADMIN_KPI.mau.toLocaleString()} · MRR ₩${(ADMIN_KPI.mrr / 10000).toFixed(0)}만 · 에러율 ${(ADMIN_KPI.errorRate * 100).toFixed(1)}%`}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="MAU" value={ADMIN_KPI.mau.toLocaleString()} delta="+12%" />
        <Kpi label="DAU" value={ADMIN_KPI.dau.toLocaleString()} delta="+3%" />
        <Kpi
          label="오늘 가입"
          value={ADMIN_KPI.signupsToday.toLocaleString()}
          delta="+18%"
        />
        <Kpi
          label="오늘 생성"
          value={ADMIN_KPI.generationsToday.toLocaleString()}
          delta="+22%"
        />
        <Kpi
          label="MRR"
          value={`₩${(ADMIN_KPI.mrr / 10000).toFixed(0)}만`}
          delta="+8%"
        />
        <Kpi
          label="유료 전환율"
          value={`${(ADMIN_KPI.paidRatio * 100).toFixed(1)}%`}
          delta="+0.4%p"
        />
        <Kpi
          label="MTD AI 비용"
          value={`₩${(ADMIN_KPI.aiCostMtd / 10000).toFixed(0)}만`}
          delta="+14%"
          deltaTone="danger"
        />
        <Kpi
          label="에러율 (24h)"
          value={`${(ADMIN_KPI.errorRate * 100).toFixed(1)}%`}
          delta="-0.2%p"
          deltaTone="success"
        />
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="매출 (백만원, 30일)" />
          <Spark data={ADMIN_REVENUE_30D} color="#6366f1" suffix="M" />
        </Card>
        <Card>
          <CardHeader title="AI 비용 (만원, 30일)" />
          <Spark data={ADMIN_AI_COST_30D} color="#ef4444" suffix="" />
        </Card>
        <Card>
          <CardHeader title="에러율 (%, 30일)" />
          <Spark data={ADMIN_ERROR_RATE_30D} color="#f59e0b" suffix="%" />
        </Card>
        <Card>
          <CardHeader
            title="헬스 체크"
            action={
              <Link
                href="/admin/health"
                className="text-[11px] text-brand-600 hover:underline"
              >
                상세 →
              </Link>
            }
          />
          <ul className="space-y-1.5">
            {ADMIN_HEALTH.slice(0, 5).map((h) => (
              <li
                key={h.service}
                className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      h.status === "healthy"
                        ? "bg-emerald-500"
                        : h.status === "degraded"
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                  />
                  <span className="font-medium">{h.service}</span>
                </div>
                <span className="font-mono text-ink-500">{h.latencyMs} ms</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="mt-5">
        <Card>
          <CardHeader
            title="최근 감사 로그"
            action={
              <Link
                href="/admin/audit-logs"
                className="text-[11px] text-brand-600 hover:underline"
              >
                전체 보기 →
              </Link>
            }
          />
          <ul className="divide-y divide-ink-100">
            {ADMIN_AUDIT_LOGS.slice(0, 5).map((l) => (
              <li
                key={l.id}
                className="grid grid-cols-[120px_1fr_140px] gap-3 py-2 text-xs"
              >
                <span className="font-mono text-ink-500">{l.at}</span>
                <span>
                  <Badge
                    tone={
                      l.severity === "critical"
                        ? "danger"
                        : l.severity === "warning"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {l.action}
                  </Badge>
                  <span className="ml-2 text-ink-700">{l.target}</span>
                </span>
                <span className="text-right text-ink-500">{l.actor}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  deltaTone = "success",
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "success" | "danger";
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold text-ink-900">{value}</div>
      {delta && (
        <div
          className={`mt-1 text-[10px] font-medium ${
            deltaTone === "danger" ? "text-red-600" : "text-emerald-600"
          }`}
        >
          {delta} 전월 대비
        </div>
      )}
    </div>
  );
}

function Spark({
  data,
  color,
  suffix,
}: {
  data: number[];
  color: string;
  suffix: string;
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 400;
      const y = 100 - ((v - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  const last = data[data.length - 1];
  return (
    <div>
      <svg viewBox="0 0 400 100" className="w-full" preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} />
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-ink-500">
        <span>
          최저 {min.toFixed(1)}
          {suffix}
        </span>
        <span className="font-medium text-ink-800">
          현재 {last.toFixed(1)}
          {suffix}
        </span>
        <span>
          최고 {max.toFixed(1)}
          {suffix}
        </span>
      </div>
    </div>
  );
}
