"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/layout/PageHeader";
import { ADMIN_TEMPLATE_REVIEWS, type TemplateReview } from "@/lib/admin-mock";

type Filter = "all" | TemplateReview["status"];

const TONE: Record<
  TemplateReview["status"],
  "warning" | "success" | "danger" | "neutral"
> = {
  Pending: "warning",
  Approved: "success",
  Rejected: "danger",
  RequestChanges: "neutral",
};

export default function AdminTemplatesPage() {
  const [list, setList] = useState<TemplateReview[]>(ADMIN_TEMPLATE_REVIEWS);
  const [filter, setFilter] = useState<Filter>("Pending");
  const [rejectTarget, setRejectTarget] = useState<TemplateReview | null>(null);
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<"Rejected" | "RequestChanges">(
    "Rejected",
  );

  const filtered = list.filter((r) =>
    filter === "all" ? true : r.status === filter,
  );

  const approve = (id: string) =>
    setList((arr) =>
      arr.map((r) => (r.id === id ? { ...r, status: "Approved" } : r)),
    );

  const submitReject = () => {
    if (!rejectTarget || reason.trim().length < 5) return;
    setList((arr) =>
      arr.map((r) =>
        r.id === rejectTarget.id ? { ...r, status: action } : r,
      ),
    );
    setRejectTarget(null);
    setReason("");
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="템플릿 심사"
        description="마켓에 등록 요청된 템플릿을 심사한다. Pending → Approved / Rejected / RequestChanges."
        action={
          <Tabs
            size="sm"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            items={[
              { value: "Pending", label: "대기" },
              { value: "Approved", label: "승인" },
              { value: "Rejected", label: "거부" },
              { value: "RequestChanges", label: "수정 요청" },
              { value: "all", label: "전체" },
            ]}
          />
        }
      />

      <div className="space-y-3">
        {filtered.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge tone={TONE[r.status]}>{r.status}</Badge>
                  <Badge tone="neutral">{r.category}</Badge>
                  <span className="text-xs font-semibold text-ink-900">
                    {r.price === 0 ? "무료" : `$${r.price}`}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-ink-900">
                  {r.templateName}
                </h3>
                <div className="mt-1 text-[11px] text-ink-500">
                  by {r.authorEmail} · 제출 {r.submittedAt}
                </div>
              </div>
              {r.status === "Pending" && (
                <div className="flex shrink-0 flex-col gap-1.5">
                  <Button size="sm" onClick={() => approve(r.id)}>
                    승인
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRejectTarget(r);
                      setAction("RequestChanges");
                    }}
                  >
                    수정 요청
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setRejectTarget(r);
                      setAction("Rejected");
                    }}
                  >
                    거부
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card>
            <p className="py-8 text-center text-xs text-ink-400">
              해당 상태의 템플릿이 없다.
            </p>
          </Card>
        )}
      </div>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={action === "Rejected" ? "템플릿 거부" : "수정 요청"}
        description="작성자에게 자동 통지된다."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejectTarget(null)}
            >
              취소
            </Button>
            <Button
              variant={action === "Rejected" ? "danger" : "primary"}
              size="sm"
              disabled={reason.trim().length < 5}
              onClick={submitReject}
            >
              발송
            </Button>
          </div>
        }
      >
        <Textarea
          label="사유 (5자 이상)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
        />
      </Modal>
    </div>
  );
}
