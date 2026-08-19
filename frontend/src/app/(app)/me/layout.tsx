"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useI18n } from "@/components/i18n/I18nProvider";


const ITEMS = [
  { href: "/me/profile", labelKey: "me.navProfile", descKey: "me.navProfileDesc" },
  { href: "/me/subscription", labelKey: "me.navSub", descKey: "me.navSubDesc" },
  { href: "/me/credits", labelKey: "me.navCredits", descKey: "me.navCreditsDesc" },
  { href: "/me/usage", labelKey: "me.navUsage", descKey: "me.navUsageDesc" },
  { href: "/me/api-keys", labelKey: "me.navKeys", descKey: "me.navKeysDesc" },
  { href: "/me/team", labelKey: "me.navTeam", descKey: "me.navTeamDesc" },
  { href: "/me/security", labelKey: "me.navSecurity", descKey: "me.navSecurityDesc" },
  { href: "/me/notifications", labelKey: "me.navNotif", descKey: "me.navNotifDesc" },
];

export default function MeLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900">{t("me.title")}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {t("me.lead")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-1">
          {ITEMS.map((it) => {
            const active = pathname === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  "block rounded-lg px-3 py-2 transition",
                  active
                    ? "bg-ink-900 text-ink-50"
                    : "text-ink-700 hover:bg-ink-100",
                )}
              >
                <div className="text-xs font-semibold">{t(it.labelKey)}</div>
                <div
                  className={cn(
                    "mt-0.5 text-[10px]",
                    active ? "text-ink-200" : "text-ink-500",
                  )}
                >
                  {t(it.descKey)}
                </div>
              </Link>
            );
          })}
        </nav>
        <div>{children}</div>
      </div>
    </div>
  );
}
