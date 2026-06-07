"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  ADMIN_REVENUE_30D,
  ADMIN_AI_COST_30D,
  ADMIN_ERROR_RATE_30D,
  ADMIN_KPI,
} from "@/lib/admin-mock";

export default function AdminStatsPage() {
  const [range, setRange] = useState<"7" | "30" | "90">("30");

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title="통계 대시보드"
        description="매출·AI 비용·에러율 추이를 모니터링한다."
        action={
          <Tabs
            size="sm"
            value={range}
            onChange={(v) => setRange(v as "7" | "30" | "90")}
            items={[
              { value: "7", label: "7일" },
              { value: "30", label: "30일" },
              { value: "90", label: "90일" },
            ]}
          />
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiBox
          label="MRR"
          value={`₩${(ADMIN_KPI.mrr / 10_000).toFixed(0)}만`}
          sub="월 반복 매출"
        />
        <KpiBox
          label="유료 전환율"
          value={`${(ADMIN_KPI.paidRatio * 100).toFixed(1)}%`}
          sub="Free → Pro/Team"
        />
        <KpiBox
          label="ARPU"
          value="₩24,200"
          sub="유료 사용자당 평균"
        />
        <KpiBox
          label="Churn (월)"
          value="3.2%"
          sub="구독 해지율"
        />
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="매출"
            description="단위: 백만원"
          />
          <BarChart data={ADMIN_REVENUE_30D} color="#6366f1" />
        </Card>
        <Card>
          <CardHeader title="AI 비용" description="단위: 만원" />
          <BarChart data={ADMIN_AI_COST_30D} color="#ef4444" />
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠ 일일 임계값 ₩500,000 초과 임박 — 06/07 ₩468,200 기록.
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="에러율" description="단위: %" />
          <BarChart data={ADMIN_ERROR_RATE_30D} color="#f59e0b" />
        </Card>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="플랜 분포" />
          {[
            { label: "Free", v: 78, color: "#94a3b8" },
            { label: "Pro", v: 18, color: "#6366f1" },
            { label: "Team", v: 4, color: "#10b981" },
          ].map((p) => (
            <div key={p.label} className="mb-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{p.label}</span>
                <span className="text-ink-500">{p.v}%</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full"
                  style={{ width: `${p.v}%`, background: p.color }}
                />
              </div>
            </div>
          ))}
        </Card>

        <Card>
          <CardHeader title="환불 통계" />
          <dl className="space-y-2 text-xs">
            {[
              { l: "환불 요청 (월)", v: "8건" },
              { l: "환불률", v: "1.4%" },
              { l: "평균 처리 시간", v: "1.2일" },
              { l: "환불 금액 (월)", v: "₩232,000" },
            ].map((r) => (
              <div
                key={r.l}
                className="flex items-center justify-between border-b border-ink-50 py-1.5"
              >
                <dt className="text-ink-500">{r.l}</dt>
                <dd className="font-mono font-medium">{r.v}</dd>
              </div>
            ))}
          </dl>
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
    <div className="rounded-xl border border-ink-200 bg-white p-3.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold text-ink-900">{value}</div>
      <div className="mt-1 text-[10px] text-ink-500">{sub}</div>
    </div>
  );
}

function BarChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  return (
    <div className="flex h-32 items-end gap-1">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition hover:opacity-80"
          style={{
            height: `${(v / max) * 100}%`,
            background: color,
            opacity: 0.85,
          }}
          title={`${i + 1}일: ${v}`}
        />
      ))}
    </div>
  );
}
