"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/layout/PageHeader";
import { ADMIN_ANNOUNCEMENTS, type Announcement } from "@/lib/admin-mock";

type Audience = "all" | "free" | "pro" | "team";
type Priority = "low" | "normal" | "high";

const PRIORITY_TONE: Record<Priority, "neutral" | "brand" | "danger"> = {
  low: "neutral",
  normal: "brand",
  high: "danger",
};

const STATUS_TONE: Record<
  Announcement["status"],
  "neutral" | "warning" | "success" | "ink"
> = {
  Draft: "neutral",
  Scheduled: "warning",
  Published: "success",
  Archived: "ink",
};

export default function AdminAnnouncementsPage() {
  const [list, setList] = useState<Announcement[]>(ADMIN_ANNOUNCEMENTS);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    body: "",
    audience: ["all"] as Audience[],
    priority: "normal" as Priority,
    startsAt: "",
  });

  const create = () => {
    if (!draft.title.trim() || !draft.body.trim()) return;
    const next: Announcement = {
      id: `an_${Date.now()}`,
      title: draft.title.trim(),
      body: draft.body.trim(),
      audience: draft.audience,
      priority: draft.priority,
      startsAt: draft.startsAt || new Date().toISOString(),
      status: "Published",
    };
    setList((arr) => [next, ...arr]);
    setOpen(false);
    setDraft({
      title: "",
      body: "",
      audience: ["all"],
      priority: "normal",
      startsAt: "",
    });
  };

  const archive = (id: string) => {
    setList((arr) =>
      arr.map((a) => (a.id === id ? { ...a, status: "Archived" } : a)),
    );
  };

  const toggleAudience = (a: Audience) => {
    setDraft((d) => {
      const set = new Set(d.audience);
      if (set.has(a)) set.delete(a);
      else set.add(a);
      return { ...d, audience: Array.from(set) };
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="공지사항"
        description="대시보드 상단 배너 + 인앱 알림(우선순위 high)으로 노출된다."
        action={<Button onClick={() => setOpen(true)}>+ 새 공지</Button>}
      />

      <div className="space-y-3">
        {list.map((a) => (
          <Card key={a.id}>
            <CardHeader
              title={a.title}
              description={a.body}
              action={
                <div className="flex items-center gap-2">
                  <Badge tone={PRIORITY_TONE[a.priority]}>
                    {a.priority.toUpperCase()}
                  </Badge>
                  <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                </div>
              }
            />
            <div className="flex items-center justify-between border-t border-ink-100 pt-3 text-[11px] text-ink-500">
              <div>
                대상: {a.audience.join(", ").toUpperCase()} · 시작{" "}
                {a.startsAt.replace("T", " ")}
                {a.endsAt && ` · 종료 ${a.endsAt.replace("T", " ")}`}
              </div>
              {a.status === "Published" && (
                <button
                  onClick={() => archive(a.id)}
                  className="text-ink-500 hover:text-red-600"
                >
                  보관 처리
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="새 공지 등록"
        description="등록 즉시 대상 사용자에게 노출된다."
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button
              size="sm"
              disabled={!draft.title.trim() || !draft.body.trim()}
              onClick={create}
            >
              발행
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="제목"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            maxLength={200}
          />
          <Textarea
            label="본문 (Markdown 지원)"
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={5}
            countMax={10000}
            maxLength={10000}
          />
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-700">
              노출 대상
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(["all", "free", "pro", "team"] as Audience[]).map((a) => {
                const active = draft.audience.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAudience(a)}
                    className={`rounded-lg border py-2 text-xs font-medium ${
                      active
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                    }`}
                  >
                    {a.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-700">
              우선순위
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(["low", "normal", "high"] as Priority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDraft({ ...draft, priority: p })}
                  className={`rounded-lg border py-2 text-xs font-medium ${
                    draft.priority === p
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                  }`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
