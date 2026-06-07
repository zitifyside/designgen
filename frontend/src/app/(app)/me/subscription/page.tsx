"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useAuthStore } from "@/store/auth-store";

const PLANS = [
  {
    key: "Free",
    price: 0,
    description: "혼자 시작하는 디자이너·기획자",
    features: ["월 3회 생성", "컨셉 1종·시안 3종", "PNG Export (워터마크)"],
  },
  {
    key: "Pro",
    price: 19,
    description: "전문 디자이너·개발자",
    features: [
      "월 30회 생성",
      "DS 컨트롤러 전체 Token",
      ".fig·.json·.css Export",
      "MCP Server 연동",
      "API Key 발급",
    ],
    recommended: true,
  },
  {
    key: "Team",
    price: 49,
    description: "10명 이하 스타트업·에이전시",
    features: [
      "무제한 생성",
      "팀 프로젝트 공유",
      "우선 처리 큐",
      "팀 공용 API Key",
    ],
  },
];

const HISTORY = [
  { date: "2026-06-05", item: "Pro 월간 결제", amount: 26000, status: "완료" },
  { date: "2026-05-05", item: "Pro 월간 결제", amount: 26000, status: "완료" },
  { date: "2026-04-05", item: "Pro 월간 결제", amount: 26000, status: "완료" },
];

export default function SubscriptionPage() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="현재 구독"
          description="다음 결제일까지 본 플랜의 모든 권한이 유지된다."
        />
        <div className="flex items-center justify-between rounded-lg bg-brand-50 p-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-700">
              {user.plan} · ${user.plan === "Pro" ? 19 : user.plan === "Team" ? 49 : 0}/월
            </div>
            <div className="mt-1 text-xs text-brand-600">
              다음 결제일 2026-07-05 · Visa •••• 4242
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              결제 수단 변경
            </Button>
            <Button variant="outline" size="sm">
              구독 취소
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="플랜 변경" />
        <div className="grid gap-3 lg:grid-cols-3">
          {PLANS.map((p) => {
            const current = p.key === user.plan;
            return (
              <div
                key={p.key}
                className={`relative rounded-xl border p-4 ${
                  p.recommended
                    ? "border-brand-500 bg-brand-50/40"
                    : "border-ink-200 bg-white"
                }`}
              >
                {p.recommended && (
                  <div className="absolute right-3 top-3">
                    <Badge tone="brand">추천</Badge>
                  </div>
                )}
                <div className="text-sm font-semibold text-ink-900">{p.key}</div>
                <div className="mt-1 text-[11px] text-ink-500">
                  {p.description}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-2xl font-semibold text-ink-900">
                    ${p.price}
                  </span>
                  <span className="text-xs text-ink-400">/월</span>
                </div>
                <ul className="mt-3 space-y-1 text-xs text-ink-600">
                  {p.features.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
                <Button
                  fullWidth
                  variant={current ? "outline" : "primary"}
                  size="sm"
                  className="mt-4"
                  disabled={current}
                >
                  {current ? "사용 중" : "변경"}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="결제 이력"
          description="영수증은 PDF 로 다운로드 가능하다."
        />
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink-100 text-left text-ink-500">
              <th className="py-2 font-medium">일자</th>
              <th className="py-2 font-medium">항목</th>
              <th className="py-2 font-medium">금액</th>
              <th className="py-2 font-medium">상태</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {HISTORY.map((h, i) => (
              <tr key={i} className="border-b border-ink-50">
                <td className="py-2 text-ink-600">{h.date}</td>
                <td className="py-2">{h.item}</td>
                <td className="py-2 font-mono">
                  ₩{h.amount.toLocaleString()}
                </td>
                <td className="py-2">
                  <Badge tone="success">{h.status}</Badge>
                </td>
                <td className="py-2 text-right">
                  <button className="text-brand-600 hover:underline">
                    영수증
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
