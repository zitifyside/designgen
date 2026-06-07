"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";

interface Setting {
  category: string;
  description: string;
  inApp: boolean;
  email: boolean;
}

const INITIAL: Setting[] = [
  {
    category: "생성 완료",
    description: "AI Pipeline 시안 생성이 완료되면 알린다.",
    inApp: true,
    email: true,
  },
  {
    category: "생성 실패",
    description: "Fallback 적용·재시도 결과를 즉시 알린다.",
    inApp: true,
    email: true,
  },
  {
    category: "결제",
    description: "구독 갱신·결제 실패·환불 처리.",
    inApp: true,
    email: true,
  },
  {
    category: "계정 보안",
    description: "신규 기기 로그인·비밀번호 변경 등.",
    inApp: true,
    email: true,
  },
  {
    category: "공지사항",
    description: "신규 기능·점검·업데이트 안내.",
    inApp: true,
    email: false,
  },
  {
    category: "마케팅",
    description: "이벤트·할인·뉴스레터.",
    inApp: false,
    email: false,
  },
];

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>(INITIAL);

  const toggle = (idx: number, key: "inApp" | "email") => {
    setSettings((arr) =>
      arr.map((s, i) => (i === idx ? { ...s, [key]: !s[key] } : s)),
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="알림 채널 설정"
          description="카테고리별 인앱·이메일 알림을 ON/OFF 한다. 마케팅은 기본 OFF."
        />
        <div className="divide-y divide-ink-100">
          {settings.map((s, i) => (
            <div
              key={s.category}
              className="grid grid-cols-[1fr_80px_80px] items-center gap-4 py-3"
            >
              <div>
                <div className="text-sm font-medium text-ink-900">
                  {s.category}
                </div>
                <div className="mt-0.5 text-xs text-ink-500">
                  {s.description}
                </div>
              </div>
              <ToggleSwitch
                label="인앱"
                value={s.inApp}
                onChange={() => toggle(i, "inApp")}
              />
              <ToggleSwitch
                label="이메일"
                value={s.email}
                onChange={() => toggle(i, "email")}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ToggleSwitch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-[10px] text-ink-500">{label}</span>
      <button
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
          value ? "bg-brand-600" : "bg-ink-200"
        }`}
        aria-checked={value}
        role="switch"
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ${
            value ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
