"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { DSController } from "@/components/workspace/DSController";
import { MockupCanvas } from "@/components/workspace/MockupCanvas";
import { useProjectStore } from "@/store/project-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { cn } from "@/lib/cn";

export default function WorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = String(params?.id ?? "");
  const loadProjects = useProjectStore((s) => s.load);
  const projects = useProjectStore((s) => s.projects);
  const project = projects.find((p) => p.id === projectId);

  const loadWorkspace = useWorkspaceStore((s) => s.loadFor);
  const designSystems = useWorkspaceStore((s) => s.designSystems);
  const mockups = useWorkspaceStore((s) => s.mockups);
  const activeConcept = useWorkspaceStore((s) => s.activeConcept);
  const activeMockupIndex = useWorkspaceStore((s) => s.activeMockupIndex);
  const viewport = useWorkspaceStore((s) => s.viewport);
  const zoom = useWorkspaceStore((s) => s.zoom);
  const compareMode = useWorkspaceStore((s) => s.compareMode);
  const setConcept = useWorkspaceStore((s) => s.setActiveConcept);
  const setMockup = useWorkspaceStore((s) => s.setActiveMockup);
  const setViewport = useWorkspaceStore((s) => s.setViewport);
  const setZoom = useWorkspaceStore((s) => s.setZoom);
  const toggleCompare = useWorkspaceStore((s) => s.toggleCompare);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projectId) loadWorkspace(projectId);
  }, [projectId, loadWorkspace]);

  if (!project) {
    return (
      <div className="px-6 py-12 text-center text-sm text-ink-400">
        프로젝트를 찾지 못했다. {" "}
        <Link href="/dashboard" className="text-brand-600 hover:underline">
          대시보드로
        </Link>
      </div>
    );
  }

  const activeDS = designSystems.find((d) => d.conceptLabel === activeConcept);
  const conceptMockups = mockups.filter((m) => m.conceptLabel === activeConcept);
  const activeMockup = conceptMockups[activeMockupIndex];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-ink-200 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-xs text-ink-500 hover:text-ink-800"
          >
            ← 대시보드
          </Link>
          <div className="h-4 w-px bg-ink-200" />
          <div>
            <div className="text-sm font-semibold text-ink-900">
              {project.name}
            </div>
            <div className="text-[10px] text-ink-500">
              {project.platform} · {project.status}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Tabs
            size="sm"
            value={viewport}
            onChange={(v) => setViewport(v as "Desktop" | "Tablet" | "Mobile")}
            items={[
              { value: "Desktop", label: "Desktop" },
              { value: "Tablet", label: "Tablet" },
              { value: "Mobile", label: "Mobile" },
            ]}
          />
          <div className="flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-1 text-xs">
            <button
              onClick={() => setZoom(zoom - 10)}
              className="px-2 py-1 text-ink-500 hover:text-ink-900"
            >
              −
            </button>
            <span className="min-w-[40px] text-center font-mono text-ink-700">
              {zoom}%
            </span>
            <button
              onClick={() => setZoom(zoom + 10)}
              className="px-2 py-1 text-ink-500 hover:text-ink-900"
            >
              +
            </button>
          </div>
          <Button
            variant={compareMode ? "primary" : "outline"}
            size="sm"
            onClick={toggleCompare}
          >
            컨셉 비교
          </Button>
          <Link href={`/projects/${project.id}/export`}>
            <Button size="sm">Export ▾</Button>
          </Link>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left controller */}
        <div className="w-80 shrink-0 border-r border-ink-200 bg-white">
          {activeDS && (
            <DSController
              concept={activeDS.conceptLabel}
              conceptName={activeDS.conceptName}
              tokens={activeDS.tokens}
            />
          )}
        </div>

        {/* Center canvas + footer */}
        <div className="flex min-w-0 flex-1 flex-col bg-ink-100/40">
          {/* Concept tabs */}
          <div className="flex items-center justify-between border-b border-ink-200 bg-white px-5 py-2">
            <div className="flex items-center gap-1">
              {designSystems.map((d) => {
                const active = d.conceptLabel === activeConcept;
                return (
                  <button
                    key={d.id}
                    onClick={() => setConcept(d.conceptLabel)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                      active
                        ? "bg-ink-900 text-white"
                        : "text-ink-600 hover:bg-ink-100",
                    )}
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{ background: d.tokens.color.primary }}
                    />
                    컨셉 {d.conceptLabel} · {d.conceptName}
                    {d.isModified && (
                      <span className="text-[9px] text-amber-500">●</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              {activeDS?.isModified && (
                <Badge tone="warning">User 수정됨</Badge>
              )}
              <Badge tone="brand">실시간 반영 · 500ms ≤</Badge>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto p-6 scrollbar-thin">
            {compareMode ? (
              <div className="grid gap-6 lg:grid-cols-3">
                {designSystems.map((d) => {
                  const cm = mockups.find(
                    (m) =>
                      m.conceptLabel === d.conceptLabel &&
                      m.index === activeMockupIndex,
                  );
                  if (!cm) return null;
                  return (
                    <MockupCanvas
                      key={d.id}
                      tokens={d.tokens}
                      mockup={cm}
                      projectName={project.name}
                      viewport={viewport}
                      zoom={Math.min(zoom, 50)}
                      caption={`컨셉 ${d.conceptLabel} · ${d.conceptName}`}
                    />
                  );
                })}
              </div>
            ) : (
              activeDS &&
              activeMockup && (
                <MockupCanvas
                  tokens={activeDS.tokens}
                  mockup={activeMockup}
                  projectName={project.name}
                  viewport={viewport}
                  zoom={zoom}
                  caption={`시안 ${activeMockupIndex + 1} · ${activeMockup.title}`}
                />
              )
            )}
          </div>

          {/* Mockup thumbnails */}
          <div className="flex shrink-0 items-center gap-3 border-t border-ink-200 bg-white px-5 py-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
              시안
            </span>
            <div className="flex flex-1 items-center gap-2 overflow-x-auto scrollbar-thin">
              {conceptMockups.map((m, idx) => {
                const active = idx === activeMockupIndex;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMockup(idx)}
                    className={cn(
                      "flex shrink-0 flex-col items-center gap-1 rounded-lg border px-3 py-2 transition",
                      active
                        ? "border-brand-500 bg-brand-50"
                        : "border-ink-200 bg-white hover:bg-ink-50",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[10px] font-mono",
                        active ? "text-brand-700" : "text-ink-400",
                      )}
                    >
                      #{idx + 1}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-medium",
                        active ? "text-brand-700" : "text-ink-700",
                      )}
                    >
                      {m.title}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] text-ink-400">
              총 {conceptMockups.length}종 · 단축키 1~5
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
