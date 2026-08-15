"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/me/profile", label: "프로필", desc: "이름·이메일·아바타·언어·테마" },
  { href: "/me/subscription", label: "구독", desc: "플랜·결제 수단·이력" },
  { href: "/me/credits", label: "크레딧", desc: "잔액·충전·소비 이력" },
  { href: "/me/usage", label: "사용량", desc: "월간 생성·Export 추이" },
  { href: "/me/api-keys", label: "API Key", desc: "Public API·MCP 인증 (Pro+)" },
  { href: "/me/team", label: "팀", desc: "멤버·역할·정원 (Team+)" },
  { href: "/me/security", label: "보안", desc: "2FA·세션·계정 삭제" },
  { href: "/me/notifications", label: "알림 설정", desc: "인앱·이메일 채널" },
];

export default function MeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900">마이페이지</h1>
        <p className="mt-1 text-sm text-ink-500">
          계정·구독·API·보안을 관리한다.
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
                <div className="text-xs font-semibold">{it.label}</div>
                <div
                  className={cn(
                    "mt-0.5 text-[10px]",
                    active ? "text-ink-200" : "text-ink-500",
                  )}
                >
                  {it.desc}
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
