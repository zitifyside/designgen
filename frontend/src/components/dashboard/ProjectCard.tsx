"use client";

import Link from "next/link";
import { MOCK_DESIGN_SYSTEMS } from "@/lib/mock-data";
import type { Project } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { useProjectStore } from "@/store/project-store";

const STATUS_TONE = {
  Draft: "neutral",
  InputReady: "neutral",
  Generating: "warning",
  Completed: "success",
  Failed: "danger",
  Cancelled: "neutral",
} as const;

const STATUS_LABEL = {
  Draft: "Draft",
  InputReady: "준비 완료",
  Generating: "생성 중",
  Completed: "완료",
  Failed: "실패",
  Cancelled: "취소됨",
} as const;

export function ProjectCard({ project }: { project: Project }) {
  const toggle = useProjectStore((s) => s.toggleFavorite);
  const ds = MOCK_DESIGN_SYSTEMS(project.id).find(
    (d) => d.conceptLabel === project.thumbnailConcept,
  );
  const c = ds?.tokens.color;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group relative block overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:border-ink-300 hover:shadow-md"
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          toggle(project.id);
        }}
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-sm shadow-sm backdrop-blur"
        aria-label="즐겨찾기"
      >
        {project.isFavorite ? "⭐" : "☆"}
      </button>

      <div
        className="relative aspect-[16/10] w-full p-4"
        style={{
          background: c?.background ?? "#F1F5F9",
        }}
      >
        <div
          className="h-full w-full rounded-md p-3 shadow-sm"
          style={{
            background: c?.surface ?? "#fff",
            border: `1px solid ${c?.neutral ? c.neutral + "22" : "#E2E8F0"}`,
          }}
        >
          <div
            className="h-2.5 w-24 rounded"
            style={{ background: c?.primary ?? "#94A3B8" }}
          />
          <div
            className="mt-2 h-1.5 w-32 rounded"
            style={{ background: c?.textMuted ?? "#CBD5E1" }}
          />
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-8 rounded"
                style={{
                  background:
                    i === 0
                      ? c?.primary
                      : i === 1
                        ? c?.secondary
                        : c?.neutral,
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
          <div className="mt-3 h-1.5 w-36 rounded bg-ink-200/60" />
          <div className="mt-1 h-1.5 w-28 rounded bg-ink-200/60" />
        </div>
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
        <div className="mt-2 flex items-center gap-2 text-[10px] text-ink-400">
          <span>{project.platform}</span>
          <span>·</span>
          <span>{new Date(project.updatedAt).toLocaleDateString("ko-KR")}</span>
        </div>
      </div>
    </Link>
  );
}
