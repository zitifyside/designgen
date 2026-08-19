"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useAuthStore } from "@/store/auth-store";

/**
 * 온보딩 투어 (기능정의서 v0.2.0 §6).
 *
 * 화면 위에 떠서 실제 요소를 가리킨다 — 글로만 설명하면 어디를 눌러야 하는지
 * 결국 다시 찾아야 하기 때문이다. 대상이 화면에 없으면(좁은 화면·다른 경로)
 * 그 단계는 가운데 카드로 조용히 대체한다. 안내가 빈 곳을 가리키는 것보다 낫다.
 *
 * 완료 여부는 서버에 저장한다(`onboardedAt`). 기기를 옮길 때마다 다시 뜨면
 * 이미 아는 내용을 또 보게 된다.
 */

interface Step {
  /** 하이라이트할 요소 선택자. 없으면 가운데 카드로 띄운다. */
  target?: string;
  title: string;
  body: string;
  /** 이 단계에서 눌러 볼 만한 곳. */
  link?: { href: string; label: string };
}

const STEP_DEFS: Array<Omit<Step, "title" | "body" | "link"> & {
  titleKey: string;
  bodyKey: string;
  link?: { href: string; labelKey: string };
}> = [
  { titleKey: "onboarding.s1Title", bodyKey: "onboarding.s1Body" },
  {
    target: '[data-tour="new-project"]',
    titleKey: "onboarding.s2Title",
    bodyKey: "onboarding.s2Body",
    link: { href: "/projects/new", labelKey: "onboarding.s2Link" },
  },
  { titleKey: "onboarding.s3Title", bodyKey: "onboarding.s3Body" },
  { titleKey: "onboarding.s4Title", bodyKey: "onboarding.s4Body" },
  {
    target: '[data-tour="templates"]',
    titleKey: "onboarding.s5Title",
    bodyKey: "onboarding.s5Body",
  },
  {
    target: '[data-tour="help"]',
    titleKey: "onboarding.s6Title",
    bodyKey: "onboarding.s6Body",
    link: { href: "/help", labelKey: "onboarding.s6Link" },
  },
];

type Rect = { top: number; left: number; width: number; height: number };

export function OnboardingTour() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // 아직 투어를 보지 않은 사용자에게만 띄운다.
  // `?tour=1` 은 이미 본 사람이 다시 보고 싶을 때 쓰는 통로다 (도움말에서 연결).
  useEffect(() => {
    if (!user) return;
    const forced =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("tour") === "1";
    if (forced || !user.onboardedAt) setOpen(true);
  }, [user]);

  const def = STEP_DEFS[index];
  const step = def
    ? {
        target: def.target,
        title: t(def.titleKey),
        body: t(def.bodyKey),
        link: def.link
          ? { href: def.link.href, label: t(def.link.labelKey) }
          : undefined,
      }
    : undefined;

  // 대상 위치는 스크롤·리사이즈로 바뀌므로 매번 다시 잰다.
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      if (!step?.target) return setRect(null);
      const el = document.querySelector(step.target);
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return setRect(null);
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step]);

  const finish = useCallback(async () => {
    setOpen(false);
    try {
      const updated = await api.users.completeOnboarding();
      setUser(updated);
    } catch {
      // 기록에 실패해도 이번 세션에서는 닫는다 — 안내 때문에 작업이 막히면 안 된다.
    }
  }, [setUser]);

  // Esc 로도 닫힌다. 안내가 사용자를 가두면 안내가 아니다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open || !step) return null;

  const last = index === STEP_DEFS.length - 1;
  const pad = 6;

  // 대상이 있으면 그 아래(공간이 없으면 위)에, 없으면 화면 가운데에 카드를 둔다.
  const cardStyle: React.CSSProperties = rect
    ? (() => {
        const below = rect.top + rect.height + 12;
        const fitsBelow = below + 200 < window.innerHeight;
        return {
          position: "fixed",
          top: fitsBelow ? below : Math.max(12, rect.top - 212),
          left: Math.min(Math.max(12, rect.left), window.innerWidth - 372),
          width: 360,
        };
      })()
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 380,
      };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {/* 대상이 있으면 구멍을 뚫어 강조한다 (거대한 box-shadow 로 바깥만 어둡게). */}
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-lg ring-2 ring-brand-400 transition-all"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.6)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-900/60" />
      )}

      <div
        style={cardStyle}
        className="rounded-xl border border-ink-200 bg-surface p-4 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex gap-1" aria-hidden>
            {STEP_DEFS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 rounded-full transition-all",
                  i === index ? "w-5 bg-brand-600" : "w-1.5 bg-ink-200",
                )}
              />
            ))}
          </div>
          <span className="text-[10px] text-ink-500">
            {index + 1} / {STEP_DEFS.length}
          </span>
        </div>

        <h3 className="mt-3 text-sm font-semibold text-ink-900">{step.title}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{step.body}</p>

        {step.link && (
          <Link
            href={step.link.href}
            onClick={() => void finish()}
            className="mt-2.5 inline-block text-[11px] font-medium text-brand-700 hover:underline"
          >
            {step.link.label} →
          </Link>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => void finish()}
            className="text-[11px] text-ink-500 hover:text-ink-700 hover:underline"
          >
            {t("onboarding.skip")}
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIndex((i) => i - 1)}
              >
                {t("common.prev")}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => (last ? void finish() : setIndex((i) => i + 1))}
            >
              {last ? t("onboarding.start") : t("common.next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
