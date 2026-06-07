"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { useState } from "react";
import { useAuthStore } from "@/store/auth-store";

const DAILY = [3, 5, 2, 6, 4, 7, 3, 5, 6, 8, 4, 5, 9, 6, 7, 4, 5, 3, 6, 8, 5, 7, 4, 6, 5, 8, 3, 4, 6, 5];
const EXPORT_DIST = [
  { format: "png", count: 42, color: "#6366f1" },
  { format: "fig", count: 18, color: "#10b981" },
  { format: "json", count: 9, color: "#f59e0b" },
  { format: "css", count: 6, color: "#ef4444" },
];

export default function UsagePage() {
  const user = useAuthStore((s) => s.user);
  const [range, setRange] = useState<"day" | "week" | "month">("day");
  if (!user) return null;

  const totalExports = EXPORT_DIST.reduce((s, e) => s + e.count, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="이번 달 요약" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric
            label="생성"
            value={user.monthlyGenerations.used}
            sub={`/${user.monthlyGenerations.limit} 회`}
          />
          <Metric label="Export" value={totalExports} sub="회" />
          <Metric
            label="크레딧 사용"
            value={32}
            sub="회 (전월 대비 +12%)"
          />
          <Metric label="MCP 호출" value={184} sub="회 (전월 대비 +44%)" />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="생성 추이"
          description="기간 단위를 전환하여 사용 패턴을 분석한다."
          action={
            <Tabs
              size="sm"
              value={range}
              onChange={(v) => setRange(v as "day" | "week" | "month")}
              items={[
                { value: "day", label: "일별" },
                { value: "week", label: "주별" },
                { value: "month", label: "월별" },
              ]}
            />
          }
        />
        <div className="flex h-40 items-end gap-1">
          {DAILY.map((v, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-sm bg-brand-500/80 transition-all hover:bg-brand-600"
                style={{ height: `${(v / 10) * 100}%` }}
                title={`${i + 1}일: ${v}회`}
              />
              {(i + 1) % 5 === 0 && (
                <span className="text-[9px] text-ink-400">{i + 1}</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Export 형식 분포" />
        <div className="space-y-2.5">
          {EXPORT_DIST.map((e) => {
            const pct = Math.round((e.count / totalExports) * 100);
            return (
              <div key={e.format}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-medium text-ink-800">
                    .{e.format}
                  </span>
                  <span className="text-ink-500">
                    {e.count}회 · {pct}%
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full"
                    style={{ width: `${pct}%`, background: e.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-ink-100 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-ink-900">{value}</span>
        {sub && <span className="text-[10px] text-ink-500">{sub}</span>}
      </div>
    </div>
  );
}
