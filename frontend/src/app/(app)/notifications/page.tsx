"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useNotificationStore } from "@/store/notification-store";
import type { Notification } from "@/lib/types";

const CATEGORY_KEY: Record<Notification["category"], string> = {
  generation: "inbox.generation",
  billing: "inbox.billing",
  system: "inbox.system",
  marketing: "inbox.marketing",
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
  const { t, locale } = useI18n();
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
        title={t("inbox.title")}
        description={
          unread > 0
            ? t("inbox.unreadDesc", { count: unread })
            : t("inbox.allReadDesc")
        }
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={markAllRead}>
              {t("inbox.markAll")}
            </Button>
            <Link href="/me/notifications">
              <Button variant="ghost" size="sm">
                {t("inbox.settings")}
              </Button>
            </Link>
          </div>
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          title={t("inbox.emptyTitle")}
          description={t("inbox.emptyDesc")}
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`flex gap-3 rounded-xl border p-4 transition ${
                n.read
                  ? "border-ink-200 bg-surface"
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
                    {t(CATEGORY_KEY[n.category])}
                  </Badge>
                  <span className="text-sm font-semibold text-ink-900">
                    {n.title}
                  </span>
                  <span className="ml-auto text-[10px] text-ink-500">
                    {new Date(n.createdAt).toLocaleString(locale === "en" ? "en-US" : "ko-KR")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-600">{n.body}</p>
                <div className="mt-2 flex items-center gap-3 text-[11px]">
                  {n.href && (
                    <Link
                      href={n.href}
                      onClick={() => markRead(n.id)}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {t("inbox.openRelated")}
                    </Link>
                  )}
                  {!n.read && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="text-ink-500 hover:text-ink-800"
                    >
                      {t("inbox.markRead")}
                    </button>
                  )}
                  <button
                    onClick={() => remove(n.id)}
                    className="text-ink-500 hover:text-red-700"
                  >
                    {t("common.delete")}
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
