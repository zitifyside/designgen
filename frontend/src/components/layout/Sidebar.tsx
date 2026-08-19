"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: "📊" },
  {
    href: "/projects/new",
    labelKey: "nav.newProject",
    icon: "✨",
    tour: "new-project",
  },
  {
    href: "/templates",
    labelKey: "nav.templates",
    icon: "🧩",
    tour: "templates",
  },
  { href: "/notifications", labelKey: "nav.notificationCenter", icon: "🔔" },
  { href: "/help", labelKey: "nav.help", icon: "❓", tour: "help" },
] as const;

const ME_NAV = [
  { href: "/me/profile", labelKey: "nav.profile" },
  { href: "/me/subscription", labelKey: "nav.subscription" },
  { href: "/me/credits", labelKey: "nav.credits" },
  { href: "/me/usage", labelKey: "nav.usage" },
  { href: "/me/security", labelKey: "nav.security" },
  { href: "/me/notifications", labelKey: "nav.notificationSettings" },
  { href: "/me/api-keys", labelKey: "nav.apiKeys" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <aside className="hidden h-screen w-60 shrink-0 border-r border-ink-200 bg-surface md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-ink-100 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
          DG
        </div>
        <div>
          <div className="text-sm font-semibold leading-none text-ink-900">
            {t("brand.name")}
          </div>
          <div className="mt-0.5 text-[10px] text-ink-500">
            {t("brand.tagline")}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          {t("nav.work")}
        </div>
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-tour={"tour" in item ? item.tour : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                    active
                      ? "bg-ink-900 text-ink-50"
                      : "text-ink-700 hover:bg-ink-100",
                  )}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mb-1 mt-5 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          {t("nav.me")}
        </div>
        <ul className="space-y-0.5">
          {ME_NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "block rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-ink-100 text-ink-900"
                      : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                  )}
                >
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-ink-100 p-3">
        <Link
          href="/me/subscription"
          className="block rounded-lg bg-brand-50 px-3 py-2.5 text-xs"
        >
          <div className="font-semibold text-brand-700">
            {t("upgrade.title")}
          </div>
          <div className="mt-0.5 text-brand-700">{t("upgrade.body")}</div>
        </Link>
      </div>
    </aside>
  );
}
