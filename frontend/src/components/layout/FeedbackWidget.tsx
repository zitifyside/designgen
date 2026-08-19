"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { useI18n } from "@/components/i18n/I18nProvider";
import { api } from "@/lib/api";

type Category = "feedback" | "bug" | "feature";

const CATEGORIES: Array<{ value: Category; labelKey: string }> = [
  { value: "feedback", labelKey: "feedback.opinion" },
  { value: "bug", labelKey: "feedback.bug" },
  { value: "feature", labelKey: "feedback.feature" },
];

/**
 * 전역 피드백 버튼 (기능정의서 v0.2.0 §6 '피드백·버그 리포트').
 *
 * 사용자 동의를 전제로 환경 정보(브라우저·화면·현재 경로)를 함께 보낸다 —
 * 재현 조건 없이 올라온 버그 리포트는 대응할 수 없기 때문이다.
 */
export function FeedbackWidget() {
  const { t } = useI18n();
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
            t("feedback.ctxPath", { path: pathname ?? "-" }),
            t("feedback.ctxBrowser", { ua: navigator.userAgent }),
            t("feedback.ctxScreen", { w: window.innerWidth, h: window.innerHeight }),
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
      setError(e instanceof Error ? e.message : t("feedback.sendFailed"));
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
        aria-label={t("feedback.aria")}
      >
        <span aria-hidden>💬</span>
        {t("feedback.button")}
      </button>

      <Modal
        open={open}
        onClose={close}
        title={done ? t("feedback.thanks") : t("feedback.title")}
        description={
          done
            ? t("feedback.thanksBody")
            : t("feedback.lead")
        }
        size="sm"
        footer={
          done ? (
            <div className="flex justify-end">
              <Button size="sm" onClick={close}>
                {t("common.close")}
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                loading={busy}
                disabled={!title.trim()}
                onClick={submit}
              >
                {t("common.submit")}
              </Button>
            </div>
          )
        }
      >
        {done ? (
          <p className="text-xs text-ink-600">
            {t("feedback.received")}
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
                  {t(c.labelKey)}
                </button>
              ))}
            </div>

            <Input
              label={t("feedback.titleLabel")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder={t("feedback.titlePh")}
            />
            <div className="mt-3">
              <Textarea
                label={t("feedback.bodyLabel")}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                countMax={2000}
                maxLength={2000}
                placeholder={
                  category === "bug"
                    ? t("feedback.bugPh")
                    : t("feedback.freePh")
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
                {t("feedback.includeContext")}
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
