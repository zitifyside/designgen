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

const PLAN_FEATURES: Record<string, string[]> = {
  Free: [
    "월 3회 생성 (컨셉 1종 × 시안 3종)",
    "Color Token 수정",
    "PNG Export (워터마크)",
  ],
  Pro: [
    "월 30회 생성 (컨셉 1~3종 × 시안 3/5종)",
    "전체 Token 수정 · 단일 DS 통일",
    ".fig·.json·.css Export",
    "API Key · MCP Server 연동",
    "템플릿 등록·판매",
  ],
  Team: [
    "무제한 생성",
    "팀 워크스페이스 (기본 5시드)",
    "공유 DS 라이브러리",
    "우선 처리 큐",
  ],
};

export default function SubscriptionPage() {
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
      setNotice(e instanceof Error ? e.message : "결제를 시작하지 못했다.");
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
      setNotice(e instanceof Error ? e.message : "구독 취소에 실패했다.");
    } finally {
      setBusy(null);
    }
  };

  const price = (p: PlanInfo) =>
    interval === "monthly" ? p.monthlyPriceCents : p.annualPriceCents;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="현재 구독" />
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
                ? `다음 결제일 ${new Date(
                    subscription.currentPeriodEnd,
                  ).toLocaleDateString("ko-KR")}`
                : "결제 주기 정보 없음"}
              {subscription?.cancelAtPeriodEnd && " · 기간 만료 시 해지 예정"}
            </div>
          </div>
          {user?.plan !== "Free" && (
            <Button
              variant="outline"
              size="sm"
              loading={busy === "cancel"}
              onClick={handleCancel}
            >
              구독 취소
            </Button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 text-xs">
          <div>
            <div className="text-ink-500">이번 달 생성</div>
            <div className="mt-0.5 font-medium text-ink-900">
              {user?.monthlyGenerations.used ?? 0}
              {user?.monthlyGenerations.limit === -1
                ? " / 무제한"
                : ` / ${user?.monthlyGenerations.limit ?? 0}`}
            </div>
          </div>
          <div>
            <div className="text-ink-500">크레딧</div>
            <div className="mt-0.5 font-medium text-ink-900">
              {user?.credits ?? 0}회
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
          title="플랜"
          description="서비스정책서 기준 요금이다."
          action={
            <Tabs
              size="sm"
              value={interval}
              onChange={(v) => setInterval(v as "monthly" | "annual")}
              items={[
                { value: "monthly", label: "월간" },
                { value: "annual", label: "연간" },
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
                  {current && <Badge tone="brand">현재</Badge>}
                </div>
                <div className="mt-2 text-2xl font-semibold text-ink-900">
                  ${(price(p) / 100).toFixed(0)}
                  <span className="text-xs font-normal text-ink-500">
                    {interval === "monthly" ? "/월" : "/년"}
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5 text-[11px] text-ink-600">
                  {(PLAN_FEATURES[p.code] ?? []).map((f) => (
                    <li key={f}>· {f}</li>
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
                  {current ? "이용 중" : `${p.name} 시작`}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
