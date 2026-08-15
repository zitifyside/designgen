"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, type AdminStats } from "@/lib/api";

type Range = "7" | "30" | "90";

export default function AdminStatsPage() {
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
          setError(e instanceof Error ? e.message : "통계를 불러오지 못했다.");
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
        title="통계 대시보드"
        description="매출·AI 비용·에러율 추이. 결제 연동 전에는 매출 계열이 0 으로 표시된다."
        action={
          <Tabs
            size="sm"
            value={range}
            onChange={(v) => setRange(v as Range)}
            items={[
              { value: "7", label: "7일" },
              { value: "30", label: "30일" },
              { value: "90", label: "90일" },
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
          기간 내 결제 레코드가 없다. MRR·ARPU 는 활성 구독 × 플랜 단가로만
          계산되며, Stripe 연동 후 실결제 기준으로 대체된다.
        </div>
      )}

      <section className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiBox
          label="DAU"
          value={(stats?.dau ?? 0).toLocaleString()}
          sub="최근 24시간 접속"
        />
        <KpiBox
          label="MAU"
          value={(stats?.mau ?? 0).toLocaleString()}
          sub="최근 30일 접속"
        />
        <KpiBox
          label="신규 가입"
          value={(stats?.daily.reduce((n, d) => n + d.signups, 0) ?? 0).toLocaleString()}
          sub={`최근 ${stats?.rangeDays ?? 0}일`}
        />
        <KpiBox
          label="생성"
          value={(stats?.daily.reduce((n, d) => n + d.generations, 0) ?? 0).toLocaleString()}
          sub={`최근 ${stats?.rangeDays ?? 0}일`}
        />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiBox
          label="MRR"
          value={`$${((stats?.mrrCents ?? 0) / 100).toLocaleString()}`}
          sub="활성 구독 × 플랜 단가"
        />
        <KpiBox
          label="유료 비율"
          value={`${((stats?.paidRatio ?? 0) * 100).toFixed(1)}%`}
          sub="Pro·Team / 전체 사용자"
        />
        <KpiBox
          label="ARPU"
          value={`$${((stats?.arpuCents ?? 0) / 100).toFixed(2)}`}
          sub="유료 사용자당 월 평균"
        />
        <KpiBox
          label="에러율"
          value={`${((stats?.errorRate ?? 0) * 100).toFixed(1)}%`}
          sub="실패 생성 / 전체 생성"
        />
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="일별 생성" description="전체 생성 + 화면 추가 생성" />
          <div className="flex h-36 items-end gap-[2px]">
            {daily.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col justify-end">
                <div
                  title={`${d.date} · 실패 ${d.failures}`}
                  className="w-full rounded-t bg-red-400"
                  style={{
                    height: `${(d.failures / maxGen) * 100}%`,
                  }}
                />
                <div
                  title={`${d.date} · 생성 ${d.generations}`}
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
            title="일별 AI 비용"
            description="ai_generations 의 실측 비용 합계 (fake 파이프라인은 0)"
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
            기간 합계 ${((stats?.aiCostTotalCents ?? 0) / 100).toFixed(2)}
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

        <Card>
          <CardHeader title="신규 가입" />
          <div className="flex h-36 items-end gap-[2px]">
            {daily.map((d) => (
              <div
                key={d.date}
                title={`${d.date} · ${d.signups}명`}
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
            기간 합계 {daily.reduce((s, d) => s + d.signups, 0)}명
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
