"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import type { Generation, GenerationStage } from "@/lib/types";

const STAGES: Array<{
  key: GenerationStage;
  title: string;
  description: string;
}> = [
  {
    key: "InputAnalyzer",
    title: "Input Analyzer",
    description: "입력 텍스트를 분석하여 컨텍스트와 대표 장면을 추출한다",
  },
  {
    key: "ConceptEngine",
    title: "Concept Engine",
    description: "컨셉별 DS Token (W3C DTCG) 을 생성한다",
  },
  {
    key: "LayoutEngine",
    title: "Layout Engine",
    description: "대표 장면의 컨셉 시안 변형을 설계한다. 사이트 목업이 아니다",
  },
  {
    key: "Renderer",
    title: "Renderer",
    description: "시안과 썸네일을 렌더링하고 QA 검증한다",
  },
];

const POLL_INTERVAL_MS = 900;

export default function GeneratingPage() {
  const params = useSearchParams();
  const router = useRouter();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const projectId = params.get("projectId");
  const generationId = params.get("generationId");

  const [generation, setGeneration] = useState<Generation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    if (!projectId || !generationId) {
      router.replace("/dashboard");
      return;
    }
    let cancelled = false;

    const poll = async () => {
      try {
        const gen = await api.generations.status(generationId);
        if (cancelled) return;
        setGeneration(gen);
        if (gen.status === "Done") {
          void refreshUser();
          setTimeout(() => {
            if (!cancelled) router.replace(`/projects/${projectId}`);
          }, 700);
          return;
        }
        if (gen.status === "Failed" || gen.status === "Cancelled") {
          void refreshUser();
          return;
        }
        timer.current = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "상태를 조회하지 못했다.");
      }
    };

    void poll();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [projectId, generationId, router, refreshUser, stopPolling]);

  const stageIndex = generation
    ? Math.max(
        0,
        STAGES.findIndex((s) => s.key === generation.stage),
      )
    : 0;
  const done = generation?.status === "Done";
  const failed = generation?.status === "Failed";
  const cancelled = generation?.status === "Cancelled";
  const progress = generation?.progress ?? 0;

  const handleCancel = async () => {
    if (!generationId) return;
    setCancelling(true);
    try {
      await api.generations.cancel(generationId);
      stopPolling();
      void refreshUser();
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "취소하지 못했다.");
      setCancelling(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Card>
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
            {done ? "✓" : failed ? "!" : cancelled ? "–" : "✨"}
          </div>
          <h1 className="mt-3 text-base font-semibold text-ink-900">
            {done
              ? "생성이 완료되었다"
              : failed
                ? "생성에 실패했다"
                : cancelled
                  ? "생성을 취소했다"
                  : "실제 AI 가 요건을 읽고 콘셉 시안을 뽑는 중이다"}
          </h1>
          <p className="mt-1 text-xs text-ink-500">
            {done
              ? "잠시 후 작업 화면으로 이동한다."
              : failed
                ? "월간 생성 한도는 자동 환불되었다."
                : cancelled
                  ? "진행률 30% 미만이면 생성 횟수가 환불된다."
                  : "보통 2~3분 소요된다. 완료 시 알림이 발송된다."}
          </p>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-ink-700">전체 진행률</span>
            <span className="font-mono text-ink-500">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className={`h-full transition-[width] duration-300 ${
                failed ? "bg-red-500" : "bg-brand-600"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {generation?.error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {generation.error}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {error}
          </div>
        )}

        <ol className="mt-6 space-y-3">
          {STAGES.map((s, idx) => {
            const active = idx === stageIndex && !done && !failed && !cancelled;
            const completed = done || idx < stageIndex;
            return (
              <li
                key={s.key}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                  active
                    ? "border-brand-300 bg-brand-50"
                    : completed
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-ink-200 bg-surface"
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
                        진행 중
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
            {done || failed || cancelled ? "대시보드로" : "백그라운드로 실행"}
          </Button>
          {failed || cancelled ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/projects/${projectId}`)}
            >
              프로젝트 열기
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={done}
              loading={cancelling}
              onClick={handleCancel}
            >
              취소
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
