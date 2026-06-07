"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { useNotificationStore } from "@/store/notification-store";

export function Header() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const load = useNotificationStore((s) => s.load);
  const notifications = useNotificationStore((s) => s.notifications);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-ink-200 bg-white/80 px-5 backdrop-blur">
      <div className="flex-1">
        <input
          type="search"
          placeholder="프로젝트 검색…"
          className="block w-full max-w-sm rounded-lg border border-ink-200 bg-ink-50 px-3 py-1.5 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <Link
        href="/notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100"
        aria-label="알림"
      >
        <span className="text-base">🔔</span>
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </Link>

      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-ink-100"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {user?.name?.slice(0, 1) ?? "U"}
          </span>
          <div className="hidden text-left sm:block">
            <div className="text-xs font-semibold leading-none text-ink-900">
              {user?.name ?? "Guest"}
            </div>
            <div className="mt-0.5 text-[10px] text-ink-500">
              {user?.plan} · {user?.credits} 크레딧
            </div>
          </div>
        </button>

        {menuOpen && (
          <div
            onMouseLeave={() => setMenuOpen(false)}
            className="absolute right-0 top-full z-40 mt-1 w-52 rounded-xl border border-ink-200 bg-white py-1.5 shadow-lg"
          >
            <Link
              href="/me/profile"
              className="block px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-50"
              onClick={() => setMenuOpen(false)}
            >
              프로필 설정
            </Link>
            <Link
              href="/me/subscription"
              className="block px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-50"
              onClick={() => setMenuOpen(false)}
            >
              구독 관리
            </Link>
            <Link
              href="/me/api-keys"
              className="block px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-50"
              onClick={() => setMenuOpen(false)}
            >
              API Key
            </Link>
            <div className="my-1 border-t border-ink-100" />
            <button
              onClick={() => {
                logout();
                setMenuOpen(false);
                router.push("/login");
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
            >
              로그아웃
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
