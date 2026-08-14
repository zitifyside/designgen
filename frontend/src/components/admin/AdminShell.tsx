"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/cn";

const NAV = [
  {
    section: "개요",
    items: [
      { href: "/admin", label: "대시보드", icon: "📊", exact: true },
    ],
  },
  {
    section: "사용자",
    items: [
      { href: "/admin/users", label: "사용자 관리", icon: "👥" },
    ],
  },
  {
    section: "통계",
    items: [
      { href: "/admin/stats", label: "매출·AI·에러", icon: "📈" },
    ],
  },
  {
    section: "운영",
    items: [
      { href: "/admin/refunds", label: "환불 처리", icon: "💳" },
      { href: "/admin/announcements", label: "공지사항", icon: "📢" },
      { href: "/admin/feedback", label: "피드백", icon: "💬" },
      { href: "/admin/templates", label: "템플릿 심사", icon: "🧩" },
      { href: "/admin/audit-logs", label: "감사 로그", icon: "🔍" },
    ],
  },
  {
    section: "시스템",
    items: [
      { href: "/admin/health", label: "헬스 체크", icon: "❤️" },
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

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  if (!hydrated || !user) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-ink-400">
        세션 확인 중…
      </div>
    );
  }

  // Admin 권한 가드. 서버(RBAC)가 최종 판정하며, 여기서는 화면 접근만 막는다.
  if (user.plan !== "Admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-900 p-6">
        <div className="w-full max-w-md rounded-2xl border border-ink-800 bg-ink-950 p-6 text-center text-white">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 text-2xl">
            🛡
          </div>
          <h1 className="mt-4 text-base font-semibold">관리자 전용 영역</h1>
          <p className="mt-2 text-xs text-ink-400">
            본 영역은 <Badge tone="ink">Admin</Badge> 등급에서만 접근 가능하다.
            현재 등급은 <Badge tone="warning">{user.plan}</Badge>.
          </p>
          <p className="mt-2 text-[11px] text-ink-500">
            등급 변경은 서버에서만 가능하다 — Admin 계정으로 로그인하거나 관리자에게
            권한 부여를 요청한다.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                대시보드로 돌아가기
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950 text-ink-100">
      <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900">
        <div className="flex h-14 items-center justify-between border-b border-ink-800 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-xs font-bold text-ink-900">
              A
            </div>
            <div>
              <div className="text-sm font-semibold leading-none">
                Admin Console
              </div>
              <div className="mt-0.5 text-[10px] text-ink-500">
                Design Generator
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          {NAV.map((sec) => (
            <div key={sec.section} className="mb-4">
              <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                {sec.section}
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
                        <span>{it.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-800 p-3">
          <div className="mb-2 text-[10px] text-ink-500">로그인:</div>
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
              로그아웃
            </button>
          </div>
          <Link
            href="/dashboard"
            className="mt-2 block rounded-lg border border-ink-700 px-2.5 py-1.5 text-center text-[10px] text-ink-300 hover:bg-ink-800"
          >
            ← 사용자 화면으로
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-ink-50 text-ink-900 scrollbar-thin">
        {children}
      </main>
    </div>
  );
}
