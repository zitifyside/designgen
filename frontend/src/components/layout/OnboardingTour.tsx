"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
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

const STEPS: Step[] = [
  {
    title: "3분이면 첫 디자인 시스템이 나온다",
    body:
      "만들려는 서비스를 문장으로 적으면 색·타이포·간격이 잡힌 디자인 시스템과 대표 화면 시안이 함께 나온다. 화면을 고르거나 색을 지정할 필요는 없다.",
  },
  {
    target: '[data-tour="new-project"]',
    title: "여기서 시작한다",
    body:
      "요건을 적고 참고 자료를 첨부하면 된다. 입력 중에는 30초마다 자동 저장되므로 페이지를 벗어나도 이어서 쓸 수 있다.",
    link: { href: "/projects/new", label: "새 프로젝트 만들기" },
  },
  {
    title: "컨셉과 시안은 다른 축이다",
    body:
      "컨셉은 디자인 시스템의 방향이고, 시안은 같은 화면을 다르게 배치한 결과다. '컨셉 3 × 시안 5' 는 서로 다른 화면 15개가 아니라 방향 3가지 × 배치 5가지라는 뜻이다.",
  },
  {
    title: "컨셉을 확정하면 작업이 이어진다",
    body:
      "마음에 드는 컨셉 하나를 확정하면 그 시스템 위에서 토큰을 다듬고 다른 화면(로그인·설정 등)을 추가할 수 있다. 확정은 언제든 해제할 수 있다.",
  },
  {
    target: '[data-tour="templates"]',
    title: "빈 화면에서 시작하기 어렵다면",
    body:
      "템플릿 마켓의 검증된 프리셋을 현재 프로젝트에 바로 적용할 수 있다. 적용한 뒤 토큰을 고치면 된다.",
  },
  {
    target: '[data-tour="help"]',
    title: "막히면 도움말을 검색한다",
    body:
      "사용 가이드와 자주 묻는 질문을 단어로 찾을 수 있다. 답이 없으면 우하단 [피드백] 버튼으로 물어보면 된다.",
    link: { href: "/help", label: "도움말 열기" },
  },
];

type Rect = { top: number; left: number; width: number; height: number };

export function OnboardingTour() {
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

  const step = STEPS[index];

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

  const last = index === STEPS.length - 1;
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
            {STEPS.map((_, i) => (
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
            {index + 1} / {STEPS.length}
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
            건너뛰기
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIndex((i) => i - 1)}
              >
                이전
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => (last ? void finish() : setIndex((i) => i + 1))}
            >
              {last ? "시작하기" : "다음"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
