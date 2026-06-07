"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/layout/PageHeader";
import { ADMIN_REFUNDS, type RefundRequest } from "@/lib/admin-mock";

type Filter = "all" | "Pending" | "Approved" | "Rejected";

const TONE: Record<RefundRequest["status"], "warning" | "success" | "danger"> = {
  Pending: "warning",
  Approved: "success",
  Rejected: "danger",
};

export default function AdminRefundsPage() {
  const [list, setList] = useState<RefundRequest[]>(ADMIN_REFUNDS);
  const [filter, setFilter] = useState<Filter>("Pending");
  const [rejectTarget, setRejectTarget] = useState<RefundRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const filtered = list.filter((r) =>
    filter === "all" ? true : r.status === filter,
  );

  const approve = (id: string) => {
    if (!confirm("Stripe Refund API 를 호출하여 환불을 즉시 처리한다. 계속?"))
      return;
    setList((arr) =>
      arr.map((r) => (r.id === id ? { ...r, status: "Approved" } : r)),
    );
  };

  const reject = () => {
    if (!rejectTarget || rejectReason.trim().length < 5) return;
    setList((arr) =>
      arr.map((r) =>
        r.id === rejectTarget.id ? { ...r, status: "Rejected" } : r,
      ),
    );
    setRejectTarget(null);
    setRejectReason("");
  };

  const pending = list.filter((r) => r.status === "Pending").length;
  const totalPending = list
    .filter((r) => r.status === "Pending")
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="환불 처리"
        description={`대기 중 ${pending}건 · 합계 ₩${totalPending.toLocaleString()}`}
        action={
          <Tabs
            size="sm"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            items={[
              { value: "Pending", label: "대기" },
              { value: "Approved", label: "승인" },
              { value: "Rejected", label: "거부" },
              { value: "all", label: "전체" },
            ]}
          />
        }
      />

      <Card>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink-100 text-left text-ink-500">
              <th className="py-2 font-medium">사용자</th>
              <th className="py-2 font-medium">금액</th>
              <th className="py-2 font-medium">사유</th>
              <th className="py-2 font-medium">요청 일시</th>
              <th className="py-2 font-medium">상태</th>
              <th className="py-2 font-medium text-right">액션</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-ink-50">
                <td className="py-2.5 font-medium">{r.userEmail}</td>
                <td className="py-2.5 font-mono">
                  ₩{r.amount.toLocaleString()}
                </td>
                <td className="py-2.5 text-ink-700">{r.reason}</td>
                <td className="py-2.5 text-ink-500">{r.requestedAt}</td>
                <td className="py-2.5">
                  <Badge tone={TONE[r.status]}>{r.status}</Badge>
                </td>
                <td className="py-2.5 text-right">
                  {r.status === "Pending" ? (
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => approve(r.id)}
                        className="text-emerald-600 hover:underline"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => setRejectTarget(r)}
                        className="text-red-600 hover:underline"
                      >
                        거부
                      </button>
                    </div>
                  ) : (
                    <span className="text-ink-400">처리됨</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-ink-400">
                  해당 상태의 요청이 없다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={!!rejectTarget}
        onClose={() => {
          setRejectTarget(null);
          setRejectReason("");
        }}
        title="환불 거부"
        description="사유는 사용자에게 자동 통지된다."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
            >
              취소
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={rejectReason.trim().length < 5}
              onClick={reject}
            >
              거부
            </Button>
          </div>
        }
      >
        <Textarea
          label="거부 사유 (5자 이상)"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          placeholder="환불 정책 §3.2 에 따라 결제 후 14일 경과로 거부…"
        />
      </Modal>
    </div>
  );
}
