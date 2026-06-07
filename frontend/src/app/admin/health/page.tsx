"use client";

import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { ADMIN_HEALTH } from "@/lib/admin-mock";

const STATUS_BG = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
};

const STATUS_TONE = {
  healthy: "success",
  degraded: "warning",
  down: "danger",
} as const;

export default function AdminHealthPage() {
  const downOrDegraded = ADMIN_HEALTH.filter(
    (h) => h.status !== "healthy",
  ).length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="헬스 체크"
        description={
          downOrDegraded > 0
            ? `${downOrDegraded}개 서비스에 이상이 감지된다. 즉시 확인이 필요하다.`
            : "모든 서비스가 정상 동작 중이다."
        }
      />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {ADMIN_HEALTH.map((h) => (
          <Card key={h.service}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`relative inline-block h-2 w-2 rounded-full ${STATUS_BG[h.status]}`}
                  >
                    {h.status === "healthy" && (
                      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />
                    )}
                  </span>
                  <span className="text-sm font-semibold text-ink-900">
                    {h.service}
                  </span>
                </div>
                <div className="mt-2 text-2xl font-semibold font-mono text-ink-900">
                  {h.latencyMs}
                  <span className="text-xs text-ink-500"> ms</span>
                </div>
                <div className="mt-1 text-[10px] text-ink-400">
                  마지막 확인 {h.lastChecked}
                </div>
              </div>
              <Badge tone={STATUS_TONE[h.status]}>
                {h.status.toUpperCase()}
              </Badge>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-5">
        <CardHeader
          title="알림 정책"
          description="장애 감지 시 자동 발송 채널"
        />
        <ul className="space-y-1.5 text-xs text-ink-600">
          <li>· Slack #ops-alerts — 모든 degraded/down 즉시</li>
          <li>· Email oncall@designgenerator.io — critical 만</li>
          <li>· PagerDuty — v2.0 도입 예정</li>
          <li>
            · AI 비용 임계값 (₩500,000/일) 초과 시 Slack + 이메일 동시 발송
          </li>
        </ul>
      </Card>
    </div>
  );
}
