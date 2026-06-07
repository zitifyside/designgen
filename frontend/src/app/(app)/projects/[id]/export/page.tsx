"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { MOCK_EXPORTS } from "@/lib/mock-data";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/store/auth-store";
import { useProjectStore } from "@/store/project-store";

type Scope = "current" | "concept" | "all";
type Format = "png" | "fig" | "json" | "css";
type Resolution = "1x" | "2x" | "3x";

const FORMATS: Array<{
  v: Format;
  label: string;
  description: string;
  proOnly: boolean;
}> = [
  {
    v: "png",
    label: ".png",
    description: "이미지. 모든 등급 사용 가능 (Free 워터마크)",
    proOnly: false,
  },
  {
    v: "fig",
    label: ".fig",
    description: "Figma 호환. 편집 가능 레이어 구조 유지",
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

export default function ExportPage() {
  const params = useParams();
  const projectId = String(params?.id ?? "");
  const load = useProjectStore((s) => s.load);
  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const user = useAuthStore((s) => s.user);
  const isFree = user?.plan === "Free";

  const [scope, setScope] = useState<Scope>("current");
  const [format, setFormat] = useState<Format>("png");
  const [resolution, setResolution] = useState<Resolution>("2x");

  useEffect(() => {
    load();
  }, [load]);

  if (!project) {
    return (
      <div className="px-6 py-12 text-center text-sm text-ink-400">
        프로젝트 정보를 불러오는 중…
      </div>
    );
  }

  const handleDownload = () => {
    alert(
      `Export Job 생성 (Mock)\n프로젝트: ${project.name}\n대상: ${scope}\n형식: ${format}${
        format === "png" ? ` · 해상도 ${resolution}` : ""
      }\n7일 후 자동 삭제.`,
    );
  };

  const projectExports = MOCK_EXPORTS.filter(
    (e) => e.projectId === projectId,
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        title="Export"
        description="DS Token 과 시안을 4종 형식으로 내보낸다."
        breadcrumb={
          <>
            <Link href="/dashboard" className="hover:text-ink-700">
              대시보드
            </Link>
            <span className="px-1.5">/</span>
            <Link
              href={`/projects/${project.id}`}
              className="hover:text-ink-700"
            >
              {project.name}
            </Link>
            <span className="px-1.5">/</span>
            <span className="text-ink-700">Export</span>
          </>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader title="1. Export 대상" />
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { v: "current", l: "현재 시안", h: "선택 1종" },
                { v: "concept", l: "컨셉 전체", h: "선택 컨셉 5종" },
                { v: "all", l: "전체", h: "3 컨셉 × 5 시안 = 15종" },
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
              Free 등급은 PNG 우하단에 워터마크가 포함된다. Pro 업그레이드 시
              제거된다.
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

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-5 py-4">
          <div className="text-xs text-ink-500">
            Export 파일은 생성 후 7일 경과 시 자동 삭제된다.
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                navigator.clipboard?.writeText(
                  JSON.stringify({ projectId, scope, format, resolution }),
                )
              }
            >
              클립보드 복사
            </Button>
            <Button onClick={handleDownload}>다운로드</Button>
          </div>
        </div>

        <Card>
          <CardHeader
            title="Export 이력"
            description="최근 7일간의 Export 기록. 만료된 파일은 자동 삭제된다."
          />
          {projectExports.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-500">
              아직 Export 한 파일이 없다.
            </p>
          ) : (
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
                {projectExports.map((e) => (
                  <tr key={e.id} className="border-b border-ink-50">
                    <td className="py-2 font-mono">.{e.format}</td>
                    <td className="py-2">{e.scope}</td>
                    <td className="py-2 text-ink-500">
                      {(e.sizeBytes / 1024 / 1024).toFixed(2)} MB
                    </td>
                    <td className="py-2 text-ink-500">
                      {new Date(e.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td className="py-2 text-ink-500">
                      {new Date(e.expiresAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="py-2 text-right">
                      <button className="text-brand-600 hover:underline">
                        다운로드
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
