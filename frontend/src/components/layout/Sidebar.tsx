"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/dashboard", label: "대시보드", icon: "📊" },
  { href: "/projects/new", label: "새 프로젝트", icon: "✨" },
  { href: "/templates", label: "템플릿 마켓", icon: "🧩" },
  { href: "/notifications", label: "알림 센터", icon: "🔔" },
] as const;

const ME_NAV = [
  { href: "/me/profile", label: "프로필" },
  { href: "/me/subscription", label: "구독" },
  { href: "/me/credits", label: "크레딧" },
  { href: "/me/usage", label: "사용량" },
  { href: "/me/security", label: "보안" },
  { href: "/me/notifications", label: "알림 설정" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-60 shrink-0 border-r border-ink-200 bg-white md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-ink-100 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
          DG
        </div>
        <div>
          <div className="text-sm font-semibold leading-none text-ink-900">
            Design Generator
          </div>
          <div className="mt-0.5 text-[10px] text-ink-500">
            DS Infrastructure
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
          작업
        </div>
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                    active
                      ? "bg-ink-900 text-white"
                      : "text-ink-700 hover:bg-ink-100",
                  )}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mb-1 mt-5 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
          마이페이지
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
                  {item.label}
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
          <div className="font-semibold text-brand-700">Pro 업그레이드</div>
          <div className="mt-0.5 text-brand-600">
            월 30회 → 무제한 생성 + 전체 Export
          </div>
        </Link>
      </div>
    </aside>
  );
}
