"use client";

import Link from "next/link";
import type { Project, ProjectStatus } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { useProjectStore } from "@/store/project-store";

const STATUS_TONE: Record<
  ProjectStatus,
  "neutral" | "warning" | "success" | "danger" | "brand"
> = {
  Draft: "neutral",
  InputReady: "neutral",
  Generating: "warning",
  Completed: "success",
  CompletedWarning: "warning",
  ConceptLocked: "brand",
  Failed: "danger",
  Cancelled: "neutral",
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  Draft: "Draft",
  InputReady: "준비 완료",
  Generating: "생성 중",
  Completed: "완료",
  CompletedWarning: "완료 (대체 렌더)",
  ConceptLocked: "컨셉 확정",
  Failed: "실패",
  Cancelled: "취소됨",
};

/** thumbnailColors 순서: primary · secondary · background · surface */
function palette(project: Project) {
  const [primary, secondary, background, surface] = project.thumbnailColors ?? [];
  return {
    primary: primary ?? "#94A3B8",
    secondary: secondary ?? "#CBD5E1",
    background: background ?? "#F1F5F9",
    surface: surface ?? "#FFFFFF",
  };
}

export function ProjectCard({ project }: { project: Project }) {
  const toggle = useProjectStore((s) => s.toggleFavorite);
  const c = palette(project);
  const hasDesign = (project.thumbnailColors ?? []).length > 0;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group relative block overflow-hidden rounded-xl border border-ink-200 bg-surface transition hover:border-ink-300 hover:shadow-md"
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          void toggle(project.id);
        }}
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-surface/80 text-sm shadow-sm backdrop-blur"
        aria-label="즐겨찾기"
      >
        {project.isFavorite ? "⭐" : "☆"}
      </button>

      <div
        className="relative aspect-[16/10] w-full p-4"
        style={{ background: c.background }}
      >
        <div
          className="h-full w-full rounded-md p-3 shadow-sm"
          style={{
            background: c.surface,
            border: `1px solid ${c.secondary}22`,
          }}
        >
          <div
            className="h-2.5 w-24 rounded"
            style={{ background: c.primary }}
          />
          <div
            className="mt-2 h-1.5 w-32 rounded"
            style={{ background: c.secondary, opacity: 0.6 }}
          />
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[c.primary, c.secondary, c.primary].map((bg, i) => (
              <div
                key={i}
                className="h-8 rounded"
                style={{ background: bg, opacity: i === 2 ? 0.4 : 0.85 }}
              />
            ))}
          </div>
          <div className="mt-3 h-1.5 w-36 rounded bg-ink-200/60" />
          <div className="mt-1 h-1.5 w-28 rounded bg-ink-200/60" />
        </div>

        {!hasDesign && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/70 text-[11px] font-medium text-ink-500">
            아직 생성 전
          </div>
        )}
      </div>

      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-ink-900">
            {project.name}
          </h3>
          <Badge tone={STATUS_TONE[project.status]}>
            {STATUS_LABEL[project.status]}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-ink-500">
          {project.description}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-400">
          <span>{project.platform}</span>
          <span>·</span>
          <span>
            컨셉 {project.conceptCount} × 시안 {project.variantCount}
          </span>
          {project.dsMode === "unified" && (
            <>
              <span>·</span>
              <span className="text-brand-600">단일 DS</span>
            </>
          )}
          {project.targetScreenTitle && (
            <>
              <span>·</span>
              <span>
                {project.targetScreenTitle}
                {project.targetScreenInferred ? " (AI 선택)" : ""}
              </span>
            </>
          )}
          <span>·</span>
          <span>{new Date(project.updatedAt).toLocaleDateString("ko-KR")}</span>
        </div>
      </div>
    </Link>
  );
}
