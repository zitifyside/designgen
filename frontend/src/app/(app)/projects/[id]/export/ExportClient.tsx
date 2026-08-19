"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, downloadFile, type ExportEstimate } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useRouteId } from "@/lib/route-id";
import { useAuthStore } from "@/store/auth-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import type {
  ExportFormat,
  ExportRecord,
  ExportScope,
  Project,
} from "@/lib/types";
import { useI18n } from "@/components/i18n/I18nProvider";

type Resolution = "1x" | "2x" | "3x";

const FORMATS: Array<{
  v: ExportFormat;
  label: string;
  description: string;
  proOnly: boolean;
}> = [
  {
    v: "png",
    label: ".png",
    description: "exportPage.pngDesc",
    proOnly: false,
  },
  {
    v: "fig",
    label: ".fig",
    description: "exportPage.figDesc",
    proOnly: true,
  },
  {
    v: "json",
    label: ".json",
    description: "exportPage.jsonDesc",
    proOnly: true,
  },
  {
    v: "css",
    label: ".css",
    description: "exportPage.cssDesc",
    proOnly: true,
  },
];

const FILE_SUFFIX: Record<ExportFormat, string> = {
  png: "svg",
  fig: "svg",
  json: "json",
  css: "css",
};

export default function ExportClient() {
  const { t } = useI18n();
  const projectId = useRouteId(1);
  const user = useAuthStore((s) => s.user);
  const isFree = user?.plan === "Free";

  const loadWorkspace = useWorkspaceStore((s) => s.loadFor);
  const project = useWorkspaceStore((s) => s.project);
  const screens = useWorkspaceStore((s) => s.screens);
  const designSystems = useWorkspaceStore((s) => s.designSystems);
  const mockups = useWorkspaceStore((s) => s.mockups);
  const activeConcept = useWorkspaceStore((s) => s.activeConcept);

  const [scope, setScope] = useState<ExportScope>("current");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [resolution, setResolution] = useState<Resolution>("2x");
  const [screen, setScreen] = useState<string>("");
  const [history, setHistory] = useState<ExportRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<ExportEstimate | null>(null);
  // .fig 가 실패했을 때만 켠다 — 문서 정의상 PNG 대체를 제안한다.
  const [figFallback, setFigFallback] = useState(false);
  // 시안 다중 선택 — 비우면 범위(scope) 규칙을 그대로 따른다.
  const [variantIndexes, setVariantIndexes] = useState<number[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.exports.history(projectId));
    } catch {
      /* 이력 조회 실패는 Export 실행을 막지 않는다. */
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      void loadWorkspace(projectId);
      void loadHistory();
    }
  }, [projectId, loadWorkspace, loadHistory]);

  useEffect(() => {
    if (!screen && screens.length > 0) setScreen(screens[0].screen);
  }, [screens, screen]);

  // 형식·범위를 바꿀 때마다 실제로 만들어 재 본다. 어림값은 형식·시안 수에 따라
  // 크게 빗나가고, 빗나간 예상은 없느니만 못하다.
  const conceptForEstimate = project?.confirmedConceptLabel ?? activeConcept;
  useEffect(() => {
    if (!projectId || !project) return;
    let cancelled = false;
    setEstimate(null);
    const timer = setTimeout(async () => {
      try {
        const est = await api.exports.estimate(projectId, {
          format,
          scope,
          conceptLabel: conceptForEstimate,
          screen:
            variantIndexes.length || scope === "current"
              ? screen || undefined
              : undefined,
          variantIndexes: variantIndexes.length ? variantIndexes : undefined,
        });
        if (!cancelled) setEstimate(est);
      } catch {
        if (!cancelled) setEstimate(null); // 예상 실패가 Export 를 막지는 않는다
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, project, format, scope, screen, conceptForEstimate, variantIndexes]);

  if (!project) {
    return (
      <div className="px-6 py-12 text-center text-sm text-ink-500">
        {t("exportPage.loading")}
      </div>
    );
  }

  const conceptLabel = project.confirmedConceptLabel ?? activeConcept;
  // 지금 고른 화면·컨셉의 시안 목록. 체크박스는 이 안에서만 고른다.
  const currentScreenVariants = mockups
    .filter(
      (m) =>
        m.conceptLabel === conceptLabel && (!screen || m.screen === screen),
    )
    .sort((a, b) => a.index - b.index);
  const totalVariants = screens.reduce((sum, s) => sum + s.variantCount, 0);

  const runExport = async (thenDownload: boolean) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const record = await api.exports.create(projectId, {
        format,
        scope,
        resolution: format === "png" ? resolution : undefined,
        conceptLabel,
        screen:
          variantIndexes.length || scope === "current"
            ? screen || undefined
            : undefined,
        variantIndexes: variantIndexes.length ? variantIndexes : undefined,
      });
      await loadHistory();
      if (thenDownload) {
        await downloadFile(
          record.downloadUrl,
          `${project.name}_${conceptLabel}.${FILE_SUFFIX[format]}`,
        );
        setMessage(t("exportPage.started"));
      } else {
        setMessage(t("exportPage.created"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("exportPage.failed"));
      if (format === "fig") setFigFallback(true);
    } finally {
      setBusy(false);
    }
  };

  const copyTokens = async () => {
    setError(null);
    try {
      const tokens = await api.exports.tokens(projectId, conceptLabel);
      await navigator.clipboard?.writeText(JSON.stringify(tokens, null, 2));
      setMessage(t("exportPage.copied"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("exportPage.copyFailed"));
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        title="Export"
        description={t("exportPage.description")}
        breadcrumb={<ExportBreadcrumb project={project} />}
      />

      <div className="space-y-4">
        <Card>
          <CardHeader title={t("exportPage.step1")} />
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { v: "current", l: t("exportPage.scopeCurrent"), h: t("exportPage.scopeCurrentHint") },
                {
                  v: "concept",
                  l: t("exportPage.scopeConcept"),
                  h: t("exportPage.scopeConceptHint", { label: conceptLabel }),
                },
                {
                  v: "all",
                  l: t("exportPage.scopeProject"),
                  h: t("exportPage.scopeProjectHint", { concepts: designSystems.length, variants: totalVariants }),
                },
              ] as const
            ).map((s) => (
              <button
                key={s.v}
                onClick={() => setScope(s.v)}
                className={cn(
                  "rounded-lg border p-3 text-left transition",
                  scope === s.v
                    ? "border-brand-500 bg-brand-50"
                    : "border-ink-200 bg-surface hover:bg-ink-50",
                )}
              >
                <div
                  className={cn(
                    "text-xs font-semibold",
                    scope === s.v ? "text-brand-700" : "text-ink-800",
                  )}
                >
                  {s.l}
                </div>
                <div className="mt-0.5 text-[10px] text-ink-500">{s.h}</div>
              </button>
            ))}
          </div>

          {scope === "current" && screens.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {screens.map((s) => (
                <button
                  key={s.screen}
                  onClick={() => {
                    setScreen(s.screen);
                    setVariantIndexes([]); // 화면이 바뀌면 시안 선택도 푼다
                  }}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition",
                    screen === s.screen
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-surface text-ink-600 hover:bg-ink-50",
                  )}
                >
                  {s.screenTitle}
                </button>
              ))}
            </div>
          )}

          {currentScreenVariants.length > 0 && (
            <div className="mt-3 border-t border-ink-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-ink-700">
                  {t("exportPage.pickVariants")}
                </span>
                {variantIndexes.length > 0 && (
                  <button
                    onClick={() => setVariantIndexes([])}
                    className="text-[10px] text-ink-500 underline hover:text-ink-700"
                  >
                    {t("exportPage.clearPick")}
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-[10px] text-ink-500">
                {t("exportPage.pickHint")}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {currentScreenVariants.map((m) => {
                  const on = variantIndexes.includes(m.index);
                  return (
                    <label
                      key={m.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition",
                        on
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-ink-200 bg-surface text-ink-600 hover:bg-ink-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setVariantIndexes((prev) =>
                            prev.includes(m.index)
                              ? prev.filter((i) => i !== m.index)
                              : [...prev, m.index],
                          )
                        }
                        className="h-3 w-3"
                      />
                      <span className="max-w-[180px] truncate">
                        #{m.index + 1} {m.variantLabel || m.title}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title={t("exportPage.step2")} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FORMATS.map((f) => {
              const disabled = f.proOnly && isFree;
              const selected = format === f.v;
              return (
                <button
                  key={f.v}
                  disabled={disabled}
                  onClick={() => setFormat(f.v)}
                  className={cn(
                    "relative rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                    selected
                      ? "border-brand-500 bg-brand-50"
                      : "border-ink-200 bg-surface hover:bg-ink-50",
                  )}
                >
                  {f.proOnly && (
                    <div className="absolute right-2 top-2">
                      <Badge tone="brand">Pro</Badge>
                    </div>
                  )}
                  <div className="font-mono text-sm font-semibold text-ink-900">
                    {f.label}
                  </div>
                  <div className="mt-1 text-[10px] text-ink-500">
                    {t(f.description)}
                  </div>
                </button>
              );
            })}
          </div>
          {isFree && format === "png" && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t("exportPage.watermarkNote")}
            </div>
          )}
          {(format === "png" || format === "fig") && (
            <div className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-600">
              {t("exportPage.buildNote")}
            </div>
          )}
        </Card>

        {format === "png" && (
          <Card>
            <CardHeader title={t("exportPage.step3")} />
            <div className="grid grid-cols-3 gap-2">
              {(["1x", "2x", "3x"] as Resolution[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setResolution(r)}
                  className={cn(
                    "rounded-lg border py-3 text-sm font-medium transition",
                    resolution === r
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </Card>
        )}

        {(message || error) && (
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-xs",
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700",
            )}
          >
            {error ?? message}
          </div>
        )}

        {figFallback && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <span className="text-xs text-amber-800">
              {t("exportPage.figFailed")}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFormat("png");
                setFigFallback(false);
                setError(null);
              }}
            >
              {t("exportPage.switchPng")}
            </Button>
          </div>
        )}

        <Card>
          <CardHeader
            title={t("exportPage.previewTitle")}
            description={t("exportPage.previewDesc")}
          />
          {estimate === null ? (
            <p className="py-2 text-xs text-ink-500">{t("exportPage.checking")}</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Preview label={t("exportPage.targetMockups")} value={t("exportPage.kinds", { n: estimate.mockupCount })} />
                <Preview label={t("exportPage.estSize")} value={formatBytes(estimate.sizeBytes)} />
                <Preview
                  label={t("exportPage.watermark")}
                  value={estimate.watermark ? t("exportPage.included") : t("common.none")}
                />
              </div>
              {estimate.warnings.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {estimate.warnings.map((w: string) => (
                    <li
                      key={w}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
                    >
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-surface px-5 py-4">
          <div className="text-xs text-ink-500">
            {t("exportPage.expireNote")}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={isFree} onClick={copyTokens}>
              {t("exportPage.copyToken")}
            </Button>
            <Button variant="outline" loading={busy} onClick={() => runExport(false)}>
              {t("exportPage.create")}
            </Button>
            <Button loading={busy} onClick={() => runExport(true)}>
              {t("exportPage.download")}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader
            title={t("exportPage.historyTitle")}
            description={t("exportPage.historyDesc")}
          />
          {history.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-500">
              {t("exportPage.historyEmpty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-ink-500">
                    <th className="py-2 font-medium">{t("exportPage.colFormat")}</th>
                    <th className="py-2 font-medium">{t("exportPage.colScope")}</th>
                    <th className="py-2 font-medium">{t("exportPage.colSize")}</th>
                    <th className="py-2 font-medium">{t("exportPage.colCreated")}</th>
                    <th className="py-2 font-medium">{t("exportPage.colExpires")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {history.map((e) => (
                    <tr key={e.id} className="border-b border-ink-50">
                      <td className="py-2 font-mono">
                        .{e.format}
                        {e.watermark && (
                          <span className="ml-1 text-[10px] text-amber-600">
                            {t("exportPage.watermark")}
                          </span>
                        )}
                      </td>
                      <td className="py-2">{e.scope}</td>
                      <td className="py-2 text-ink-500">
                        {(e.sizeBytes / 1024).toFixed(1)} KB
                      </td>
                      <td className="py-2 text-ink-500">
                        {new Date(e.createdAt).toLocaleString("ko-KR")}
                      </td>
                      <td className="py-2 text-ink-500">
                        {new Date(e.expiresAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          className="text-brand-700 hover:underline"
                          onClick={() =>
                            void downloadFile(
                              e.downloadUrl,
                              `${e.projectName}.${FILE_SUFFIX[e.format]}`,
                            ).catch((err) =>
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : t("exportPage.dlFailed"),
                              ),
                            )
                          }
                        >
                          {t("exportPage.download")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ExportBreadcrumb({ project }: { project: Project }) {
  const { t } = useI18n();
  return (
    <>
      <Link href="/dashboard" className="hover:text-ink-700">
        {t("exportPage.dashboard")}
      </Link>
      <span className="px-1.5">/</span>
      <Link href={`/projects/${project.id}`} className="hover:text-ink-700">
        {project.name}
      </Link>
      <span className="px-1.5">/</span>
      <span className="text-ink-700">Export</span>
    </>
  );
}

function Preview({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-200 p-3">
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-ink-900">{value}</div>
    </div>
  );
}

/** 바이트를 사람이 읽는 단위로. 소수 한 자리면 충분하다. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
