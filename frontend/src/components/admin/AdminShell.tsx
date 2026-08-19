"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/auth-store";
import { useI18n } from "@/components/i18n/I18nProvider";
import { LocaleSwitch } from "@/components/i18n/LocaleSwitch";
import { cn } from "@/lib/cn";

const NAV = [
  {
    sectionKey: "admin.sectionOverview",
    items: [
      { href: "/admin", labelKey: "admin.dashboard", icon: "📊", exact: true },
    ],
  },
  {
    sectionKey: "admin.sectionUsers",
    items: [
      { href: "/admin/users", labelKey: "admin.users", icon: "👥" },
    ],
  },
  {
    sectionKey: "admin.sectionStats",
    items: [
      { href: "/admin/stats", labelKey: "admin.stats", icon: "📈" },
    ],
  },
  {
    sectionKey: "admin.sectionOps",
    items: [
      { href: "/admin/refunds", labelKey: "admin.refunds", icon: "💳" },
      { href: "/admin/announcements", labelKey: "admin.announcements", icon: "📢" },
      { href: "/admin/feedback", labelKey: "admin.feedback", icon: "💬" },
      { href: "/admin/templates", labelKey: "admin.templates", icon: "🧩" },
      { href: "/admin/audit-logs", labelKey: "admin.auditLogs", icon: "🔍" },
    ],
  },
  {
    sectionKey: "admin.sectionSystem",
    items: [
      { href: "/admin/logs", labelKey: "admin.logs", icon: "🧾" },
      { href: "/admin/health", labelKey: "admin.health", icon: "❤️" },
    ],
  },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { t } = useI18n();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  if (!hydrated || !user) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-ink-500">
        {t("common.loadingSession")}
      </div>
    );
  }

  // Admin 권한 가드. 서버(RBAC)가 최종 판정하며, 여기서는 화면 접근만 막는다.
  if (user.plan !== "Admin") {
    return (
      <div className="palette-fixed-light flex min-h-screen items-center justify-center bg-ink-900 p-6">
        <div className="w-full max-w-md rounded-2xl border border-ink-800 bg-ink-950 p-6 text-center text-white">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 text-2xl">
            🛡
          </div>
          <h1 className="mt-4 text-base font-semibold">{t("admin.restrictedTitle")}</h1>
          <p className="mt-2 text-xs text-ink-500">
            {t("admin.restrictedBody", { plan: user.plan })}
          </p>
          <p className="mt-2 text-[11px] text-ink-500">
            {t("admin.restrictedHint")}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                {t("admin.backDashboard")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="palette-fixed-light flex h-screen overflow-hidden bg-ink-950 text-ink-100">
      <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900">
        <div className="flex h-14 items-center justify-between border-b border-ink-800 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-xs font-bold text-ink-900">
              A
            </div>
            <div>
              <div className="text-sm font-semibold leading-none">
                {t("admin.console")}
              </div>
              <div className="mt-0.5 text-[10px] text-ink-500">
                {t("brand.name")}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          {NAV.map((sec) => (
            <div key={sec.sectionKey} className="mb-4">
              <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                {t(sec.sectionKey)}
              </div>
              <ul className="space-y-0.5">
                {sec.items.map((it) => {
                  const active =
                    "exact" in it && it.exact
                      ? pathname === it.href
                      : pathname?.startsWith(it.href);
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                          active
                            ? "bg-amber-500 text-ink-950"
                            : "text-ink-300 hover:bg-ink-800",
                        )}
                      >
                        <span className="text-base">{it.icon}</span>
                        <span>{t(it.labelKey)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-800 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[10px] text-ink-500">{t("admin.signedIn")}</div>
            <LocaleSwitch />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-ink-100">
                {user.name}
              </div>
              <div className="truncate text-[10px] text-ink-500">
                {user.email}
              </div>
            </div>
            <button
              onClick={() => {
                void logout();
                router.push("/login");
              }}
              className="rounded-lg border border-ink-700 px-2 py-1 text-[10px] text-ink-300 hover:bg-ink-800"
            >
              {t("admin.logout")}
            </button>
          </div>
          <Link
            href="/dashboard"
            className="mt-2 block rounded-lg border border-ink-700 px-2.5 py-1.5 text-center text-[10px] text-ink-300 hover:bg-ink-800"
          >
            {t("admin.backToApp")}
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-ink-50 text-ink-900 scrollbar-thin">
        {children}
      </main>
    </div>
  );
}
