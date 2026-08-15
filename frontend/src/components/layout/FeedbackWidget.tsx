"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";

type Category = "feedback" | "bug" | "feature";

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: "feedback", label: "의견" },
  { value: "bug", label: "버그" },
  { value: "feature", label: "기능 요청" },
];

/**
 * 전역 피드백 버튼 (기능정의서 v0.2.0 §6 '피드백·버그 리포트').
 *
 * 사용자 동의를 전제로 환경 정보(브라우저·화면·현재 경로)를 함께 보낸다 —
 * 재현 조건 없이 올라온 버그 리포트는 대응할 수 없기 때문이다.
 */
export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("feedback");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [includeContext, setIncludeContext] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const context = includeContext
        ? [
            "",
            "---",
            `경로: ${pathname ?? "-"}`,
            `브라우저: ${navigator.userAgent}`,
            `화면: ${window.innerWidth}x${window.innerHeight}`,
          ].join("\n")
        : "";
      await api.system.feedback({
        category,
        title: title.trim(),
        body: `${body.trim()}${context}`,
      });
      setDone(true);
      setTitle("");
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송에 실패했다.");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setOpen(false);
    setDone(false);
    setError(null);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-30 flex items-center gap-1.5 rounded-full border border-ink-200",
          "bg-surface px-3.5 py-2 text-xs font-medium text-ink-700 shadow-lg",
          "transition hover:border-ink-300 hover:bg-ink-50",
        )}
        aria-label="피드백 보내기"
      >
        <span aria-hidden>💬</span>
        피드백
      </button>

      <Modal
        open={open}
        onClose={close}
        title={done ? "보내주셔서 감사하다" : "피드백 보내기"}
        description={
          done
            ? "확인 후 필요한 경우 가입 이메일로 답변한다."
            : "버그·불편·바라는 기능을 알려주면 운영에 반영한다."
        }
        size="sm"
        footer={
          done ? (
            <div className="flex justify-end">
              <Button size="sm" onClick={close}>
                닫기
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={close}>
                취소
              </Button>
              <Button
                size="sm"
                loading={busy}
                disabled={!title.trim()}
                onClick={submit}
              >
                보내기
              </Button>
            </div>
          )
        }
      >
        {done ? (
          <p className="text-xs text-ink-600">
            접수됐다. 같은 내용을 다시 보낼 필요는 없다.
          </p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    "rounded-lg border py-2 text-xs font-medium transition",
                    category === c.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <Input
              label="제목"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="한 줄로 요약"
            />
            <div className="mt-3">
              <Textarea
                label="내용"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                countMax={2000}
                maxLength={2000}
                placeholder={
                  category === "bug"
                    ? "무엇을 하다가, 무엇을 기대했고, 실제로는 무엇이 일어났는지"
                    : "자유롭게 적는다"
                }
              />
            </div>

            <label className="mt-3 flex items-start gap-2 text-[11px] text-ink-600">
              <input
                type="checkbox"
                checked={includeContext}
                onChange={(e) => setIncludeContext(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                현재 화면 경로·브라우저·화면 크기를 함께 보낸다 (재현에 도움이 된다)
              </span>
            </label>

            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
