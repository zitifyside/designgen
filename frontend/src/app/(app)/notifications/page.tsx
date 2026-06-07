"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { useNotificationStore } from "@/store/notification-store";
import type { Notification } from "@/lib/types";

const CATEGORY_LABEL: Record<Notification["category"], string> = {
  generation: "생성",
  billing: "결제",
  system: "시스템",
  marketing: "마케팅",
};

const CATEGORY_TONE: Record<
  Notification["category"],
  "brand" | "success" | "warning" | "neutral"
> = {
  generation: "brand",
  billing: "success",
  system: "warning",
  marketing: "neutral",
};

export default function NotificationsPage() {
  const load = useNotificationStore((s) => s.load);
  const notifications = useNotificationStore((s) => s.notifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const remove = useNotificationStore((s) => s.remove);

  useEffect(() => {
    load();
  }, [load]);

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader
        title="알림 센터"
        description={
          unread > 0
            ? `읽지 않은 알림 ${unread}건이 있다. 30일 경과 시 자동 삭제된다.`
            : "모든 알림을 확인했다."
        }
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={markAllRead}>
              전체 읽음
            </Button>
            <Link href="/me/notifications">
              <Button variant="ghost" size="sm">
                알림 설정 →
              </Button>
            </Link>
          </div>
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          title="알림이 없다"
          description="시안 생성·결제·공지 등 중요한 이벤트가 여기에 표시된다."
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`flex gap-3 rounded-xl border p-4 transition ${
                n.read
                  ? "border-ink-200 bg-white"
                  : "border-brand-200 bg-brand-50/40"
              }`}
            >
              <div className="mt-1 flex h-2 w-2 shrink-0 items-center justify-center">
                {!n.read && (
                  <span className="h-2 w-2 rounded-full bg-brand-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge tone={CATEGORY_TONE[n.category]}>
                    {CATEGORY_LABEL[n.category]}
                  </Badge>
                  <span className="text-sm font-semibold text-ink-900">
                    {n.title}
                  </span>
                  <span className="ml-auto text-[10px] text-ink-400">
                    {new Date(n.createdAt).toLocaleString("ko-KR")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-600">{n.body}</p>
                <div className="mt-2 flex items-center gap-3 text-[11px]">
                  {n.href && (
                    <Link
                      href={n.href}
                      onClick={() => markRead(n.id)}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      관련 페이지로
                    </Link>
                  )}
                  {!n.read && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="text-ink-500 hover:text-ink-800"
                    >
                      읽음 처리
                    </button>
                  )}
                  <button
                    onClick={() => remove(n.id)}
                    className="text-ink-400 hover:text-red-600"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
