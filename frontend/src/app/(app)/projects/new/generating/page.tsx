"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { Generation, GenerationStage } from "@/lib/types";

const STAGE_KEYS: Array<{
  key: GenerationStage;
  title: string;
  descKey: string;
}> = [
  { key: "InputAnalyzer", title: "Input Analyzer", descKey: "generating.inputAnalyzerDesc" },
  { key: "ConceptEngine", title: "Concept Engine", descKey: "generating.conceptEngineDesc" },
  { key: "LayoutEngine", title: "Layout Engine", descKey: "generating.layoutEngineDesc" },
  { key: "Renderer", title: "Renderer", descKey: "generating.rendererDesc" },
];

const POLL_INTERVAL_MS = 900;

export default function GeneratingPage() {
  const { t } = useI18n();
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
        setError(e instanceof Error ? e.message : t("generating.statusFailed"));
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
        STAGE_KEYS.findIndex((s) => s.key === generation.stage),
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
      setError(e instanceof Error ? e.message : t("generating.cancelFailed"));
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
              ? t("generating.titleDone")
              : failed
                ? t("generating.titleFailed")
                : cancelled
                  ? t("generating.titleCancelled")
                  : t("generating.titleRunning")}
          </h1>
          <p className="mt-1 text-xs text-ink-500">
            {done
              ? t("generating.bodyDone")
              : failed
                ? t("generating.bodyFailed")
                : cancelled
                  ? t("generating.bodyCancelled")
                  : t("generating.bodyRunning")}
          </p>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-ink-700">{t("generating.overall")}</span>
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
          {STAGE_KEYS.map((s, idx) => {
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
                        {t("generating.inProgress")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    {t(s.descKey)}
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
{done || failed || cancelled ? t("generating.toDashboard") : t("generating.runBackground")}
          </Button>
          {failed || cancelled ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/projects/${projectId}`)}
            >
              {t("generating.openProject")}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={done}
              loading={cancelling}
              onClick={handleCancel}
            >
              {t("common.cancel")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
