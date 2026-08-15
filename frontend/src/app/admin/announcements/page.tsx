"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, type AnnouncementRecord } from "@/lib/api";

const AUDIENCES = ["all", "free", "pro", "team"] as const;
const PRIORITIES = ["low", "normal", "high"] as const;

const PRIORITY_TONE: Record<string, "neutral" | "brand" | "danger"> = {
  low: "neutral",
  normal: "brand",
  high: "danger",
};

const EMPTY: Partial<AnnouncementRecord> = {
  title: "",
  body: "",
  audience: ["all"],
  priority: "normal",
  status: "Draft",
};

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<AnnouncementRecord[]>([]);
  const [form, setForm] = useState<Partial<AnnouncementRecord>>(EMPTY);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api.admin.announcements());
    } catch (e) {
      setError(e instanceof Error ? e.message : "공지를 불러오지 못했다.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form.title?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (form.id) await api.admin.updateAnnouncement(form.id, form);
      else await api.admin.createAnnouncement(form);
      setOpen(false);
      setForm(EMPTY);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했다.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api.admin.deleteAnnouncement(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했다.");
    }
  };

  const toggleAudience = (a: string) => {
    const cur = form.audience ?? [];
    setForm({
      ...form,
      audience: cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a],
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="공지사항"
        description="등록한 공지는 대시보드 배너와 인앱 알림(high)으로 노출된다."
        action={
          <Button
            size="sm"
            onClick={() => {
              setForm(EMPTY);
              setOpen(true);
            }}
          >
            새 공지
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {items.map((a) => (
          <Card key={a.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink-900">
                    {a.title}
                  </span>
                  <Badge tone={PRIORITY_TONE[a.priority] ?? "neutral"}>
                    {a.priority}
                  </Badge>
                  <Badge tone="neutral">{a.status}</Badge>
                  <span className="text-[10px] text-ink-500">
                    대상 {a.audience.join(", ")}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs text-ink-600">
                  {a.body}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setForm(a);
                    setOpen(true);
                  }}
                >
                  수정
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void remove(a.id)}
                >
                  삭제
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {items.length === 0 && (
          <Card>
            <p className="py-6 text-center text-xs text-ink-500">
              등록된 공지가 없다.
            </p>
          </Card>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? "공지 수정" : "새 공지"}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button size="sm" loading={busy} onClick={() => void save()}>
              저장
            </Button>
          </div>
        }
      >
        <Input
          label="제목"
          value={form.title ?? ""}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          maxLength={200}
        />
        <div className="mt-3">
          <Textarea
            label="본문 (Markdown)"
            value={form.body ?? ""}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={5}
            countMax={10000}
            maxLength={10000}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-700">
              노출 대상
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {AUDIENCES.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAudience(a)}
                  className={`rounded-lg border py-2 text-[11px] font-medium ${
                    (form.audience ?? []).includes(a)
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-700">
              우선순위
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm({ ...form, priority: p })}
                  className={`rounded-lg border py-2 text-[11px] font-medium ${
                    form.priority === p
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            label="노출 시작 (선택)"
            type="datetime-local"
            value={(form.startsAt ?? "").slice(0, 16)}
            onChange={(e) =>
              setForm({
                ...form,
                startsAt: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
          />
          <Input
            label="노출 종료 (선택)"
            type="datetime-local"
            value={(form.endsAt ?? "").slice(0, 16)}
            onChange={(e) =>
              setForm({
                ...form,
                endsAt: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
          />
        </div>
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-medium text-ink-700">상태</div>
          <div className="grid grid-cols-2 gap-1.5">
            {["Draft", "Published"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm({ ...form, status: s })}
                className={`rounded-lg border py-2 text-[11px] font-medium ${
                  form.status === s
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
