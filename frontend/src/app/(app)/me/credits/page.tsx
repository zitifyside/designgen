"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import type { CreditTransaction, PlanInfo } from "@/lib/types";

/** 충전 패키지 (기능정의서 v0.2.0 §3.1 '크레딧 충전'). */
const PACKAGES = [10, 50, 100, 500];

export default function CreditsPage() {
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [selected, setSelected] = useState(50);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    // 한쪽 실패가 다른 쪽 표시를 막지 않도록 따로 가져온다.
    const [tx, planList] = await Promise.all([
      api.billing.creditTransactions().catch(() => [] as CreditTransaction[]),
      api.billing.plans().catch(() => [] as PlanInfo[]),
    ]);
    setTransactions(tx);
    setPlans(planList);
  }, []);

  useEffect(() => {
    void load();
    void refreshUser();
  }, [load, refreshUser]);

  const myPlan = plans.find((p) => p.code === user?.plan);
  const unitCents = myPlan?.creditUnitCents ?? 0;

  const handlePurchase = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await api.billing.purchaseCredits(selected);
      await refreshUser();
      await load();
      setNotice("크레딧을 충전했다.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "충전에 실패했다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="크레딧 잔액"
          description="월간 무료 제공량을 모두 쓴 뒤에는 크레딧이 차감된다."
        />
        <div className="flex items-end gap-2">
          <span className="text-3xl font-semibold text-ink-900">
            {user?.credits ?? 0}
          </span>
          <span className="pb-1 text-sm text-ink-500">회</span>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          이번 달 생성 {user?.monthlyGenerations.used ?? 0}
          {user?.monthlyGenerations.limit === -1
            ? " / 무제한"
            : ` / ${user?.monthlyGenerations.limit ?? 0}`}{" "}
          회 사용
        </p>
      </Card>

      <Card>
        <CardHeader
          title="크레딧 충전"
          description={
            unitCents > 0
              ? `현재 등급 단가 $${(unitCents / 100).toFixed(2)} / 회`
              : "유료 등급에서 크레딧 단가가 적용된다."
          }
        />
        <div className="grid grid-cols-4 gap-2">
          {PACKAGES.map((n) => (
            <button
              key={n}
              onClick={() => setSelected(n)}
              className={cn(
                "rounded-lg border py-3 text-center transition",
                selected === n
                  ? "border-brand-500 bg-brand-50"
                  : "border-ink-200 bg-surface hover:bg-ink-50",
              )}
            >
              <div className="text-sm font-semibold text-ink-900">{n}회</div>
              <div className="mt-0.5 text-[10px] text-ink-500">
                {unitCents > 0
                  ? `$${((unitCents * n) / 100).toFixed(2)}`
                  : "—"}
              </div>
            </button>
          ))}
        </div>

        {notice && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {notice}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] text-ink-500">
            결제는 Stripe Checkout 으로 처리된다.
          </p>
          <Button loading={busy} onClick={handlePurchase}>
            {selected}회 충전
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="크레딧 이력"
          description="충전·소비·환불 내역이다."
        />
        {transactions.length === 0 ? (
          <p className="py-3 text-xs text-ink-500">아직 이력이 없다.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-100 text-left text-ink-500">
                <th className="py-2 font-medium">유형</th>
                <th className="py-2 font-medium">변동</th>
                <th className="py-2 font-medium">잔액</th>
                <th className="py-2 font-medium">메모</th>
                <th className="py-2 font-medium">일시</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-ink-50">
                  <td className="py-2">{t.type}</td>
                  <td
                    className={cn(
                      "py-2 font-medium",
                      t.amount < 0 ? "text-red-700" : "text-emerald-600",
                    )}
                  >
                    {t.amount > 0 ? `+${t.amount}` : t.amount}
                  </td>
                  <td className="py-2 text-ink-500">{t.balanceAfter}</td>
                  <td className="py-2 text-ink-500">{t.note ?? "—"}</td>
                  <td className="py-2 text-ink-500">
                    {new Date(t.createdAt).toLocaleString("ko-KR")}
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
