"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/layout/PageHeader";
import { ADMIN_FEEDBACK, type FeedbackItem } from "@/lib/admin-mock";

type StatusFilter = "all" | FeedbackItem["status"];

const STATUS_TONE: Record<
  FeedbackItem["status"],
  "warning" | "brand" | "success" | "neutral"
> = {
  new: "warning",
  in_review: "brand",
  resolved: "success",
  closed: "neutral",
};

const CATEGORY_TONE: Record<
  FeedbackItem["category"],
  "danger" | "brand" | "neutral"
> = {
  bug: "danger",
  feature: "brand",
  feedback: "neutral",
};

export default function AdminFeedbackPage() {
  const [list, setList] = useState<FeedbackItem[]>(ADMIN_FEEDBACK);
  const [filter, setFilter] = useState<StatusFilter>("new");
  const [replyTarget, setReplyTarget] = useState<FeedbackItem | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const filtered = list.filter((f) =>
    filter === "all" ? true : f.status === filter,
  );

  const setStatus = (id: string, status: FeedbackItem["status"]) => {
    setList((arr) => arr.map((f) => (f.id === id ? { ...f, status } : f)));
  };

  const sendReply = () => {
    if (!replyTarget || replyBody.trim().length < 5) return;
    setStatus(replyTarget.id, "resolved");
    setReplyTarget(null);
    setReplyBody("");
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="피드백 관리"
        description="사용자의 버그·기능 요청·일반 피드백을 응대한다."
        action={
          <Tabs
            size="sm"
            value={filter}
            onChange={(v) => setFilter(v as StatusFilter)}
            items={[
              { value: "new", label: "신규" },
              { value: "in_review", label: "검토중" },
              { value: "resolved", label: "해결" },
              { value: "closed", label: "종료" },
              { value: "all", label: "전체" },
            ]}
          />
        }
      />

      <div className="space-y-3">
        {filtered.map((f) => (
          <Card key={f.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge tone={CATEGORY_TONE[f.category]}>{f.category}</Badge>
                  <Badge tone={STATUS_TONE[f.status]}>{f.status}</Badge>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-ink-900">
                  {f.title}
                </h3>
                <p className="mt-1 text-xs text-ink-600">{f.body}</p>
                <div className="mt-2 text-[10px] text-ink-400">
                  {f.userEmail} · {f.createdAt}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                {f.status !== "in_review" && f.status !== "resolved" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStatus(f.id, "in_review")}
                  >
                    검토 시작
                  </Button>
                )}
                {f.status !== "resolved" && f.status !== "closed" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setReplyTarget(f);
                      setReplyBody("");
                    }}
                  >
                    답변·해결
                  </Button>
                )}
                {f.status !== "closed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStatus(f.id, "closed")}
                  >
                    종료
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card>
            <p className="py-8 text-center text-xs text-ink-400">
              해당 상태의 피드백이 없다.
            </p>
          </Card>
        )}
      </div>

      <Modal
        open={!!replyTarget}
        onClose={() => setReplyTarget(null)}
        title="사용자 답변"
        description="입력 내용은 사용자의 이메일로 자동 발송된다."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReplyTarget(null)}
            >
              취소
            </Button>
            <Button
              size="sm"
              disabled={replyBody.trim().length < 5}
              onClick={sendReply}
            >
              발송 + 해결 처리
            </Button>
          </div>
        }
      >
        <p className="mb-2 text-xs text-ink-500">
          원본: {replyTarget?.title}
        </p>
        <Textarea
          label="답변 본문"
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          rows={6}
          placeholder="안녕하세요. 알려주신 이슈는…"
        />
      </Modal>
    </div>
  );
}
