"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useProjectStore } from "@/store/project-store";

const STAGES = [
  {
    key: "InputAnalyzer",
    title: "Input Analyzer",
    description: "입력 텍스트·파일을 분석하여 컨텍스트를 추출한다",
    duration: 1800,
  },
  {
    key: "ConceptEngine",
    title: "Concept Engine",
    description: "3종 컨셉별 DS Token (W3C DTCG) 을 생성한다",
    duration: 2400,
  },
  {
    key: "LayoutEngine",
    title: "Layout Engine",
    description: "컨셉별 5종 레이아웃 변형을 설계한다",
    duration: 2600,
  },
  {
    key: "Renderer",
    title: "Renderer",
    description: "고해상도 시안과 썸네일을 렌더링한다",
    duration: 2200,
  },
] as const;

export default function GeneratingPage() {
  const params = useSearchParams();
  const router = useRouter();
  const setStatus = useProjectStore((s) => s.setStatus);
  const projectId = params.get("projectId");

  const [currentStage, setCurrentStage] = useState(0);
  const [stageProgress, setStageProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!projectId) {
      router.replace("/dashboard");
      return;
    }
    let cancelled = false;
    let cleanup: ReturnType<typeof setTimeout> | undefined;

    const runStage = (idx: number) => {
      if (cancelled) return;
      if (idx >= STAGES.length) {
        setDone(true);
        setStatus(projectId, "Completed");
        cleanup = setTimeout(() => {
          if (!cancelled) router.replace(`/projects/${projectId}`);
        }, 800);
        return;
      }
      setCurrentStage(idx);
      setStageProgress(0);
      const dur = STAGES[idx].duration;
      const start = performance.now();
      const tick = () => {
        if (cancelled) return;
        const elapsed = performance.now() - start;
        const pct = Math.min(100, (elapsed / dur) * 100);
        setStageProgress(pct);
        if (pct < 100) {
          requestAnimationFrame(tick);
        } else {
          runStage(idx + 1);
        }
      };
      requestAnimationFrame(tick);
    };

    runStage(0);
    return () => {
      cancelled = true;
      if (cleanup) clearTimeout(cleanup);
    };
  }, [projectId, router, setStatus]);

  const totalProgress = Math.round(
    ((currentStage + stageProgress / 100) / STAGES.length) * 100,
  );

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Card>
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
            {done ? "✓" : "✨"}
          </div>
          <h1 className="mt-3 text-base font-semibold text-ink-900">
            {done ? "생성이 완료되었다" : "AI 가 시안을 생성 중이다"}
          </h1>
          <p className="mt-1 text-xs text-ink-500">
            {done
              ? "잠시 후 작업 화면으로 이동한다."
              : "보통 2~3분 소요된다. 완료 시 알림이 발송된다."}
          </p>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-ink-700">전체 진행률</span>
            <span className="font-mono text-ink-500">{totalProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full bg-brand-600 transition-[width] duration-150"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>

        <ol className="mt-6 space-y-3">
          {STAGES.map((s, idx) => {
            const active = idx === currentStage && !done;
            const completed = idx < currentStage || done;
            return (
              <li
                key={s.key}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                  active
                    ? "border-brand-300 bg-brand-50"
                    : completed
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-ink-200 bg-white"
                }`}
              >
                <div
                  className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                    completed
                      ? "bg-emerald-500 text-white"
                      : active
                        ? "bg-brand-600 text-white"
                        : "bg-ink-200 text-ink-500"
                  }`}
                >
                  {completed ? "✓" : idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-xs font-medium text-ink-800">
                    <span>{s.title}</span>
                    {active && (
                      <span className="font-mono text-[10px] text-brand-700">
                        {Math.round(stageProgress)}%
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    {s.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 flex items-center justify-between border-t border-ink-100 pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard")}
          >
            백그라운드로 실행
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={done}
            onClick={() => {
              if (projectId) setStatus(projectId, "Cancelled");
              router.push("/dashboard");
            }}
          >
            취소
          </Button>
        </div>
      </Card>
    </div>
  );
}
