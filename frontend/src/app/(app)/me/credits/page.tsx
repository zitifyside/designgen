"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useAuthStore } from "@/store/auth-store";

const PACKAGES = [
  { qty: 10, unitPrice: 0.5, total: 5 },
  { qty: 50, unitPrice: 0.5, total: 25 },
  { qty: 100, unitPrice: 0.45, total: 45 },
  { qty: 500, unitPrice: 0.4, total: 200, popular: true },
];

const HISTORY = [
  {
    date: "2026-06-06T15:20",
    label: "PNG Export ×3",
    delta: -3,
    balance: 78,
  },
  {
    date: "2026-06-05T08:00",
    label: "구독 갱신 보너스",
    delta: +5,
    balance: 81,
  },
  { date: "2026-06-04T11:05", label: ".fig Export", delta: -2, balance: 76 },
  { date: "2026-05-30T16:14", label: "프로젝트 생성", delta: -3, balance: 78 },
  { date: "2026-05-28T10:00", label: "크레딧 충전 50", delta: +50, balance: 81 },
];

export default function CreditsPage() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [selected, setSelected] = useState(50);

  if (!user) return null;

  const handleCharge = () => {
    updateProfile({ credits: user.credits + selected });
    alert(`크레딧 ${selected}회가 충전되었다 (Mock).`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="크레딧 잔액" />
        <div className="flex items-end gap-2">
          <span className="text-4xl font-semibold text-ink-900">
            {user.credits}
          </span>
          <span className="pb-1.5 text-sm text-ink-500">회 사용 가능</span>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          1 시안 생성 = 1 크레딧 차감. Pro 미만은 충전 크레딧이 1년 후 만료된다.
        </p>
      </Card>

      <Card>
        <CardHeader title="충전 패키지" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PACKAGES.map((p) => (
            <button
              key={p.qty}
              onClick={() => setSelected(p.qty)}
              className={`relative rounded-xl border p-4 text-left transition ${
                selected === p.qty
                  ? "border-brand-500 bg-brand-50"
                  : "border-ink-200 bg-white hover:bg-ink-50"
              }`}
            >
              {p.popular && (
                <span className="absolute right-2 top-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  인기
                </span>
              )}
              <div className="text-2xl font-semibold text-ink-900">
                {p.qty}
                <span className="text-xs font-normal text-ink-500"> 회</span>
              </div>
              <div className="mt-2 text-xs font-medium text-ink-700">
                ${p.total}
              </div>
              <div className="text-[10px] text-ink-500">
                ${p.unitPrice.toFixed(2)} / 회
              </div>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-end">
          <Button onClick={handleCharge}>{selected}회 충전</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="크레딧 이력" />
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink-100 text-left text-ink-500">
              <th className="py-2 font-medium">일시</th>
              <th className="py-2 font-medium">내역</th>
              <th className="py-2 font-medium text-right">증감</th>
              <th className="py-2 font-medium text-right">잔액</th>
            </tr>
          </thead>
          <tbody>
            {HISTORY.map((h, i) => (
              <tr key={i} className="border-b border-ink-50">
                <td className="py-2 text-ink-500">
                  {new Date(h.date).toLocaleString("ko-KR")}
                </td>
                <td className="py-2">{h.label}</td>
                <td
                  className={`py-2 text-right font-mono ${
                    h.delta > 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {h.delta > 0 ? "+" : ""}
                  {h.delta}
                </td>
                <td className="py-2 text-right font-mono text-ink-600">
                  {h.balance}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
