"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { api, type AnnouncementRecord } from "@/lib/api";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useAuthStore } from "@/store/auth-store";

/** 닫은 공지 ID 보관 키. 공지는 계정이 아니라 이 브라우저 기준으로 닫는다. */
const DISMISS_KEY = "adg.dismissed-announcements";

const TONE = {
  high: {
    wrap: "border-amber-300 bg-amber-50",
    label: "bg-amber-500 text-white",
    title: "text-amber-900",
    body: "text-amber-800",
    close: "text-amber-700 hover:bg-amber-100",
  },
  normal: {
    wrap: "border-brand-200 bg-brand-50",
    label: "bg-brand-600 text-white",
    title: "text-brand-800",
    body: "text-brand-700",
    close: "text-brand-700 hover:bg-brand-100",
  },
} as const;

/**
 * 대시보드 상단 공지 배너 (기능정의서 v0.2.0 §6 '공지사항 노출').
 *
 * 노출 기간은 서버가 거르고, 여기서는 **대상 등급**과 **닫음 여부**만 본다.
 * 우선순위 high 는 닫아도 다시 뜬다 — 점검·장애 공지를 한 번 닫았다고 못 보게
 * 되면 곤란하기 때문이다.
 */
export function AnnouncementBanner() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<AnnouncementRecord[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    try {
      setDismissed(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]"));
    } catch {
      setDismissed([]);
    }
  }, []);

  useEffect(() => {
    api.system
      .announcements()
      .then(setItems)
      .catch(() => setItems([])); // 공지를 못 불러왔다고 대시보드를 막을 이유는 없다
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = [...prev, id];
      try {
        localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-50)));
      } catch {
        /* 저장 실패는 무시한다 — 이번 세션에서만 닫힌다 */
      }
      return next;
    });
  }, []);

  const visible = items.filter((a) => {
    const audience = a.audience ?? ["all"];
    const targeted =
      audience.includes("all") || (!!user && audience.includes(user.plan));
    if (!targeted) return false;
    return a.priority === "high" || !dismissed.includes(a.id);
  });

  if (visible.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {visible.map((a) => {
        const tone = a.priority === "high" ? TONE.high : TONE.normal;
        return (
          <div
            key={a.id}
            className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", tone.wrap)}
          >
            <span
              className={cn(
                "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                tone.label,
              )}
            >
              {a.priority === "high" ? t("dashboard.announcementHigh") : t("dashboard.announcementNormal")}
            </span>
            <div className="min-w-0 flex-1">
              <div className={cn("text-xs font-semibold", tone.title)}>
                {a.title}
              </div>
              {a.body && (
                <p className={cn("mt-0.5 whitespace-pre-line text-[11px] leading-relaxed", tone.body)}>
                  {a.body}
                </p>
              )}
            </div>
            {a.priority !== "high" && (
              <button
                onClick={() => dismiss(a.id)}
                aria-label={t("dashboard.dismissAnnouncement")}
                className={cn("shrink-0 rounded px-1.5 text-xs transition", tone.close)}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
