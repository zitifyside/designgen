"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, downloadFile } from "@/lib/api";
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
    description: "시안 미리보기. 모든 등급 사용 가능 (Free 워터마크)",
    proOnly: false,
  },
  {
    v: "fig",
    label: ".fig",
    description: "Figma 호환. SVG + 메타데이터 방식으로 산출",
    proOnly: true,
  },
  {
    v: "json",
    label: ".json",
    description: "W3C DTCG 표준 Token JSON",
    proOnly: true,
  },
  {
    v: "css",
    label: ".css",
    description: "CSS Variables (:root scope)",
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
  const projectId = useRouteId(1);
  const user = useAuthStore((s) => s.user);
  const isFree = user?.plan === "Free";

  const loadWorkspace = useWorkspaceStore((s) => s.loadFor);
  const project = useWorkspaceStore((s) => s.project);
  const screens = useWorkspaceStore((s) => s.screens);
  const designSystems = useWorkspaceStore((s) => s.designSystems);
  const activeConcept = useWorkspaceStore((s) => s.activeConcept);

  const [scope, setScope] = useState<ExportScope>("current");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [resolution, setResolution] = useState<Resolution>("2x");
  const [screen, setScreen] = useState<string>("");
  const [history, setHistory] = useState<ExportRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (!project) {
    return (
      <div className="px-6 py-12 text-center text-sm text-ink-400">
        프로젝트 정보를 불러오는 중…
      </div>
    );
  }

  const conceptLabel = project.confirmedConceptLabel ?? activeConcept;
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
        screen: scope === "current" ? screen || undefined : undefined,
      });
      await loadHistory();
      if (thenDownload) {
        await downloadFile(
          record.downloadUrl,
          `${project.name}_${conceptLabel}.${FILE_SUFFIX[format]}`,
        );
        setMessage("다운로드를 시작했다. 파일은 7일 후 만료된다.");
      } else {
        setMessage("Export 를 생성했다. 아래 이력에서 다시 받을 수 있다.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export 에 실패했다.");
    } finally {
      setBusy(false);
    }
  };

  const copyTokens = async () => {
    setError(null);
    try {
      const tokens = await api.exports.tokens(projectId, conceptLabel);
      await navigator.clipboard?.writeText(JSON.stringify(tokens, null, 2));
      setMessage("W3C DTCG Token JSON 을 클립보드에 복사했다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "복사에 실패했다.");
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        title="Export"
        description="DS Token 과 시안을 4종 형식으로 내보낸다."
        breadcrumb={<ExportBreadcrumb project={project} />}
      />

      <div className="space-y-4">
        <Card>
          <CardHeader title="1. Export 대상" />
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { v: "current", l: "현재 화면", h: "선택 화면의 대표 변형 1종" },
                {
                  v: "concept",
                  l: "컨셉 전체",
                  h: `컨셉 ${conceptLabel} 의 전 화면 변형`,
                },
                {
                  v: "all",
                  l: "프로젝트 전체",
                  h: `${designSystems.length} 컨셉 × 총 ${totalVariants}종`,
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
                    : "border-ink-200 bg-white hover:bg-ink-50",
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
                  onClick={() => setScreen(s.screen)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition",
                    screen === s.screen
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50",
                  )}
                >
                  {s.screenTitle}
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="2. 형식" />
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
                      : "border-ink-200 bg-white hover:bg-ink-50",
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
                    {f.description}
                  </div>
                </button>
              );
            })}
          </div>
          {isFree && format === "png" && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Free 등급은 우하단에 워터마크가 포함된다. Pro 업그레이드 시 제거된다.
            </div>
          )}
          {(format === "png" || format === "fig") && (
            <div className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-600">
              현재 빌드의 .png·.fig 는 <b>SVG + 메타데이터</b> 로 산출된다. Figma
              Plugin API 직접 생성과 래스터 변환은 Export·MCP 단계(W11~12)
              산출물이다.
            </div>
          )}
        </Card>

        {format === "png" && (
          <Card>
            <CardHeader title="3. 해상도" />
            <div className="grid grid-cols-3 gap-2">
              {(["1x", "2x", "3x"] as Resolution[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setResolution(r)}
                  className={cn(
                    "rounded-lg border py-3 text-sm font-medium transition",
                    resolution === r
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
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

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-5 py-4">
          <div className="text-xs text-ink-500">
            Export 파일은 생성 후 7일 경과 시 자동 삭제된다.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={isFree} onClick={copyTokens}>
              Token 클립보드 복사
            </Button>
            <Button variant="outline" loading={busy} onClick={() => runExport(false)}>
              Export 생성
            </Button>
            <Button loading={busy} onClick={() => runExport(true)}>
              다운로드
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader
            title="Export 이력"
            description="최근 7일간의 Export 기록. 만료된 파일은 목록에서 사라진다."
          />
          {history.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-500">
              아직 Export 한 파일이 없다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-ink-500">
                    <th className="py-2 font-medium">형식</th>
                    <th className="py-2 font-medium">범위</th>
                    <th className="py-2 font-medium">크기</th>
                    <th className="py-2 font-medium">생성</th>
                    <th className="py-2 font-medium">만료</th>
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
                            워터마크
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
                          className="text-brand-600 hover:underline"
                          onClick={() =>
                            void downloadFile(
                              e.downloadUrl,
                              `${e.projectName}.${FILE_SUFFIX[e.format]}`,
                            ).catch((err) =>
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "다운로드에 실패했다.",
                              ),
                            )
                          }
                        >
                          다운로드
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
  return (
    <>
      <Link href="/dashboard" className="hover:text-ink-700">
        대시보드
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
