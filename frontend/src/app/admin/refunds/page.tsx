"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, type AdminRefund } from "@/lib/api";

const TONE: Record<string, "neutral" | "success" | "danger" | "warning"> = {
  Pending: "warning",
  Approved: "success",
  Rejected: "danger",
};

export default function AdminRefundsPage() {
  const [refunds, setRefunds] = useState<AdminRefund[]>([]);
  const [target, setTarget] = useState<AdminRefund | null>(null);
  const [approve, setApprove] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRefunds(await api.admin.refunds());
    } catch (e) {
      setError(e instanceof Error ? e.message : "환불 요청을 불러오지 못했다.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.admin.resolveRefund(target.id, approve, note);
      setTarget(null);
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리에 실패했다.");
    } finally {
      setBusy(false);
    }
  };

  const pending = refunds.filter((r) => r.status === "Pending");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="환불 처리"
        description={`대기 ${pending.length}건 · 승인 시 Stripe Refund API 호출은 결제 연동 후 활성화된다.`}
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <Card padded={false}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-500">
              <th className="px-4 py-3 font-medium">요청자</th>
              <th className="px-4 py-3 font-medium">금액</th>
              <th className="px-4 py-3 font-medium">사유</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">요청일</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id} className="border-b border-ink-100">
                <td className="px-4 py-3 font-mono text-ink-700">
                  {r.userId ?? "—"}
                </td>
                <td className="px-4 py-3 font-medium text-ink-900">
                  ${(r.amountCents / 100).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-ink-600">{r.reason || "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                </td>
                <td className="px-4 py-3 text-ink-500">
                  {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.status === "Pending" && (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setTarget(r);
                          setApprove(true);
                        }}
                      >
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTarget(r);
                          setApprove(false);
                        }}
                      >
                        거부
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {refunds.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-400">
                  환불 요청이 없다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={approve ? "환불 승인" : "환불 거부"}
        description={
          approve
            ? "승인 시 감사 로그에 기록되고 요청자에게 통지된다."
            : "거부 사유는 요청자에게 전달된다."
        }
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
              취소
            </Button>
            <Button size="sm" loading={busy} onClick={() => void resolve()}>
              확인
            </Button>
          </div>
        }
      >
        <div className="mb-3 text-xs text-ink-600">
          금액 <b>${((target?.amountCents ?? 0) / 100).toFixed(2)}</b>
        </div>
        <Textarea
          label="메모"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          countMax={500}
          maxLength={500}
        />
      </Modal>
    </div>
  );
}
