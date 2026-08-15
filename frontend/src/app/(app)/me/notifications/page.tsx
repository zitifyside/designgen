"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { api, type NotificationPrefs } from "@/lib/api";

/** 카테고리 표시 정의 — 키는 서버 기본값과 1:1 이다. */
const CATEGORIES: Array<{ key: string; label: string; description: string }> = [
  {
    key: "generation_done",
    label: "생성 완료",
    description: "AI Pipeline 시안 생성이 완료되면 알린다.",
  },
  {
    key: "generation_failed",
    label: "생성 실패",
    description: "Fallback 적용·재시도 결과를 즉시 알린다.",
  },
  {
    key: "billing",
    label: "결제",
    description: "구독 갱신·결제 실패·환불 처리.",
  },
  {
    key: "security",
    label: "계정 보안",
    description: "신규 기기 로그인·비밀번호 변경 등.",
  },
  {
    key: "announcement",
    label: "공지사항",
    description: "신규 기능·점검·업데이트 안내.",
  },
  {
    key: "marketing",
    label: "마케팅",
    description: "이벤트·할인·뉴스레터.",
  },
];

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.users.notificationPrefs();
      setPrefs(res.prefs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림 설정을 불러오지 못했다.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (key: string, channel: "inApp" | "email") => {
    if (!prefs) return;
    const current = prefs[key] ?? { inApp: true, email: true };
    setPrefs({ ...prefs, [key]: { ...current, [channel]: !current[channel] } });
    setDirty(true);
    setNotice(null);
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.users.updateNotificationPrefs(prefs);
      setPrefs(res.prefs);
      setDirty(false);
      setNotice("알림 설정을 저장했다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="알림 설정"
          description="카테고리별로 인앱·이메일 수신을 켜고 끈다. 계정 보안 알림은 끌 수 없다."
        />

        <div className="overflow-hidden rounded-lg border border-ink-200">
          <div className="grid grid-cols-[1fr_72px_72px] items-center gap-2 border-b border-ink-200 bg-ink-50 px-3 py-2 text-[11px] font-medium text-ink-500">
            <span>카테고리</span>
            <span className="text-center">인앱</span>
            <span className="text-center">이메일</span>
          </div>

          {CATEGORIES.map((c) => {
            const value = prefs?.[c.key] ?? { inApp: true, email: true };
            // 보안 알림은 계정 탈취 탐지 경로라 사용자가 끄지 못하게 한다.
            const locked = c.key === "security";
            return (
              <div
                key={c.key}
                className="grid grid-cols-[1fr_72px_72px] items-center gap-2 border-b border-ink-100 px-3 py-2.5 last:border-b-0"
              >
                <div>
                  <div className="text-xs font-medium text-ink-900">{c.label}</div>
                  <div className="mt-0.5 text-[11px] text-ink-500">
                    {c.description}
                  </div>
                </div>
                <Toggle
                  checked={value.inApp}
                  disabled={locked || !prefs}
                  onChange={() => toggle(c.key, "inApp")}
                />
                <Toggle
                  checked={value.email}
                  disabled={locked || !prefs}
                  onChange={() => toggle(c.key, "email")}
                />
              </div>
            );
          })}
        </div>

        {(notice || error) && (
          <div
            className={cn(
              "mt-3 rounded-lg border px-3 py-2 text-xs",
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700",
            )}
          >
            {error ?? notice}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] text-ink-500">
            이메일 알림에는 수신 거부 링크가 포함된다.
          </p>
          <Button size="sm" loading={saving} disabled={!dirty} onClick={save}>
            저장
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "mx-auto flex h-5 w-9 items-center rounded-full px-0.5 transition",
        checked ? "bg-brand-600" : "bg-ink-200",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-full bg-surface shadow-sm transition",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}
