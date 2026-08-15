"use client";

import { useEffect } from "react";
import { THEME_KEY } from "@/lib/theme-init";
import { useAuthStore } from "@/store/auth-store";

export type ThemeChoice = "light" | "dark" | "system";

/** `<html>` 에 `.dark` 를 붙이거나 뗀다. 팔레트 변수는 globals.css 가 갖고 있다. */
export function applyTheme(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const dark =
    choice === "dark" ||
    (choice === "system" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* 저장 실패는 무시한다 — 이번 세션에만 적용된다 */
  }
}

export function storedTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* 접근 불가 시 기본값 */
  }
  return "system";
}

/**
 * 테마 적용기 (기능정의서 v0.2.0 §6 'UI 테마 설정').
 *
 * 계정 설정(`user.theme`)이 진원이고, 로컬 저장은 로그인 전·새로고침 직후의
 * 깜빡임을 줄이는 보조 수단이다. 설정만 저장되고 화면은 그대로였던 상태를 고친다.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAuthStore((s) => s.user?.theme);

  // 로그인 전에는 마지막 선택을, 로그인 후에는 계정 설정을 따른다.
  useEffect(() => {
    applyTheme(theme ?? storedTheme());
  }, [theme]);

  // system 을 고른 사용자는 OS 설정을 바꿨을 때 즉시 따라가야 한다.
  useEffect(() => {
    const choice = theme ?? storedTheme();
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return <>{children}</>;
}
