"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { DSController } from "@/components/workspace/DSController";
import { MockupCanvas } from "@/components/workspace/MockupCanvas";
import type { ElementSelection } from "@/components/workspace/MockupRenderer";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useRouteId } from "@/lib/route-id";
import { useAuthStore } from "@/store/auth-store";
import { useProjectStore } from "@/store/project-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import type { ConceptLabel, Generation } from "@/lib/types";

const SCREEN_PRESETS = [
  { value: "login", label: "로그인" },
  { value: "dashboard", label: "대시보드" },
  { value: "list", label: "목록" },
  { value: "detail", label: "상세" },
  { value: "landing", label: "랜딩" },
];

export default function WorkspaceClient() {
  const router = useRouter();
  // /projects/[id] — 경로 두 번째 세그먼트가 프로젝트 ID 다.
  const projectId = useRouteId(1);

  const refreshUser = useAuthStore((s) => s.refreshUser);
  const upsertProject = useProjectStore((s) => s.upsert);

  const loadWorkspace = useWorkspaceStore((s) => s.loadFor);
  const project = useWorkspaceStore((s) => s.project);
  const designSystems = useWorkspaceStore((s) => s.designSystems);
  const screens = useWorkspaceStore((s) => s.screens);
  const activeConcept = useWorkspaceStore((s) => s.activeConcept);
  const activeScreen = useWorkspaceStore((s) => s.activeScreen);
  const activeMockupIndex = useWorkspaceStore((s) => s.activeMockupIndex);
  const viewport = useWorkspaceStore((s) => s.viewport);
  const zoom = useWorkspaceStore((s) => s.zoom);
  const compareMode = useWorkspaceStore((s) => s.compareMode);
  const selectedElement = useWorkspaceStore((s) => s.selectedElement);
  const loading = useWorkspaceStore((s) => s.loading);
  const error = useWorkspaceStore((s) => s.error);
  const syncState = useWorkspaceStore((s) => s.syncState);
  const mockups = useWorkspaceStore((s) => s.mockups);

  const setConcept = useWorkspaceStore((s) => s.setActiveConcept);
  const setScreen = useWorkspaceStore((s) => s.setActiveScreen);
  const setMockup = useWorkspaceStore((s) => s.setActiveMockup);
  const setViewport = useWorkspaceStore((s) => s.setViewport);
  const setZoom = useWorkspaceStore((s) => s.setZoom);
  const toggleCompare = useWorkspaceStore((s) => s.toggleCompare);
  const selectElement = useWorkspaceStore((s) => s.selectElement);
  const clearError = useWorkspaceStore((s) => s.clearError);
  const confirmConcept = useWorkspaceStore((s) => s.confirmConcept);
  const unlockConcept = useWorkspaceStore((s) => s.unlockConcept);
  const addScreen = useWorkspaceStore((s) => s.addScreen);
  const screenMockups = useWorkspaceStore((s) => s.screenMockups);

  const [busy, setBusy] = useState<string | null>(null);
  const [screenModal, setScreenModal] = useState(false);
  const [screenPreset, setScreenPreset] = useState("login");
  const [customScreen, setCustomScreen] = useState("");
  const [screenDesc, setScreenDesc] = useState("");
  const [pendingGeneration, setPendingGeneration] = useState<Generation | null>(
    null,
  );
  const [warningGeneration, setWarningGeneration] = useState<Generation | null>(
    null,
  );

  useEffect(() => {
    if (projectId) void loadWorkspace(projectId);
  }, [projectId, loadWorkspace]);

  // CSS Fallback 으로 완료된 생성이 있으면 무차감 재시도 대상을 찾는다.
  const refreshWarning = useCallback(async () => {
    if (!projectId) return;
    try {
      const history = await api.generations.history(projectId);
      setWarningGeneration(
        history.find((g) => g.isWarning && !g.freeRetryUsed) ?? null,
      );
    } catch {
      /* 이력 조회 실패는 화면을 막지 않는다. */
    }
  }, [projectId]);

  useEffect(() => {
    if (project?.status === "CompletedWarning") void refreshWarning();
    else setWarningGeneration(null);
  }, [project?.status, refreshWarning]);

  // 화면 추가 생성 진행 상황 폴링.
  useEffect(() => {
    if (!pendingGeneration) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const gen = await api.generations.status(pendingGeneration.id);
        if (cancelled) return;
        if (gen.status === "Done" || gen.status === "Failed") {
          setPendingGeneration(null);
          void refreshUser();
          await loadWorkspace(projectId, true);
          if (gen.status === "Done" && gen.screen) setScreen(gen.screen);
          return;
        }
        setTimeout(tick, 900);
      } catch {
        if (!cancelled) setPendingGeneration(null);
      }
    };
    const timer = setTimeout(tick, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingGeneration, projectId, loadWorkspace, refreshUser, setScreen]);

  const conceptMockups = screenMockups();
  const activeMockup = conceptMockups[activeMockupIndex];
  const activeDS = designSystems.find((d) => d.conceptLabel === activeConcept);
  const isLocked = project?.status === "ConceptLocked";
  const canConfirm =
    project?.status === "Completed" ||
    project?.status === "CompletedWarning" ||
    project?.status === "ConceptLocked";

  // 단축키 — 1~5 시안 전환 / 0 = 100% / Ctrl+0 = Fit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (e.key >= "1" && e.key <= "5") {
        const idx = Number(e.key) - 1;
        if (idx < conceptMockups.length) setMockup(idx);
      } else if (e.key === "0") {
        setZoom(e.metaKey || e.ctrlKey ? 55 : 100);
      } else if (e.key === "Escape") {
        selectElement(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [conceptMockups.length, setMockup, setZoom, selectElement]);

  if (loading && !project) {
    return (
      <div className="px-6 py-12 text-center text-sm text-ink-400">
        작업 화면을 불러오는 중…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="px-6 py-12 text-center text-sm text-ink-400">
        프로젝트를 찾지 못했다.{" "}
        <Link href="/dashboard" className="text-brand-600 hover:underline">
          대시보드로
        </Link>
      </div>
    );
  }

  const notGenerated = designSystems.length === 0;

  const handleConfirm = async () => {
    setBusy("confirm");
    try {
      await confirmConcept(activeConcept);
      const fresh = await api.projects.get(projectId);
      upsertProject(fresh);
    } catch (e) {
      alert(e instanceof Error ? e.message : "컨셉 확정에 실패했다.");
    } finally {
      setBusy(null);
    }
  };

  const handleUnlock = async () => {
    setBusy("unlock");
    try {
      await unlockConcept();
      const fresh = await api.projects.get(projectId);
      upsertProject(fresh);
    } catch (e) {
      alert(e instanceof Error ? e.message : "확정 해제에 실패했다.");
    } finally {
      setBusy(null);
    }
  };

  const handleAddScreen = async () => {
    const screen =
      screenPreset === "custom" ? customScreen.trim() : screenPreset;
    if (!screen) return;
    setBusy("screen");
    try {
      const gen = await addScreen({ screen, description: screenDesc });
      setPendingGeneration(gen);
      setScreenModal(false);
      setScreenDesc("");
      setCustomScreen("");
      void refreshUser();
    } catch (e) {
      alert(e instanceof Error ? e.message : "화면 추가에 실패했다.");
    } finally {
      setBusy(null);
    }
  };

  const handleRetry = async () => {
    if (!warningGeneration) return;
    setBusy("retry");
    try {
      const gen = await api.generations.retry(warningGeneration.id);
      router.push(
        `/projects/new/generating?projectId=${projectId}&generationId=${gen.id}`,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "재시도에 실패했다.");
      setBusy(null);
    }
  };

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
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink-900">
                {project.name}
              </span>
              {isLocked && <Badge tone="brand">컨셉 {project.confirmedConceptLabel} 확정</Badge>}
              {project.dsMode === "unified" && (
                <Badge tone="neutral">단일 DS</Badge>
              )}
            </div>
            <div className="text-[10px] text-ink-500">
              {project.platform} · {project.targetScreenTitle || "화면 미지정"}
              {project.targetScreenInferred && project.targetScreen
                ? " (AI 선택)"
                : ""}{" "}
              · 컨셉 {project.conceptCount} × 변형 {project.variantCount}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-ink-400">
            {syncState === "saving"
              ? "동기화 중…"
              : syncState === "saved"
                ? "저장됨"
                : syncState === "error"
                  ? "동기화 실패"
                  : ""}
          </span>
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
            disabled={notGenerated}
          >
            컨셉 비교
          </Button>
          {isLocked ? (
            <Button
              variant="outline"
              size="sm"
              loading={busy === "unlock"}
              onClick={handleUnlock}
            >
              확정 해제
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={!canConfirm || notGenerated}
              loading={busy === "confirm"}
              onClick={handleConfirm}
            >
              컨셉 확정
            </Button>
          )}
          <Link href={`/projects/${project.id}/export`}>
            <Button size="sm">Export ▾</Button>
          </Link>
        </div>
      </div>

      {/* 알림 배너 */}
      {error && (
        <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700">
          <span>{error}</span>
          <button className="font-medium underline" onClick={clearError}>
            닫기
          </button>
        </div>
      )}
      {project.status === "CompletedWarning" && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-800">
          <span>
            이미지 생성에 일부 문제가 있어 CSS 렌더링으로 대체했다. 콘텐츠 슬롯은
            단색 Placeholder 로 표시된다.
          </span>
          {warningGeneration ? (
            <Button size="sm" variant="outline" loading={busy === "retry"} onClick={handleRetry}>
              다시 시도 (무차감 1회)
            </Button>
          ) : (
            <span className="text-[10px] text-amber-700">
              무차감 재시도를 이미 사용했다.
            </span>
          )}
        </div>
      )}
      {pendingGeneration && (
        <div className="border-b border-brand-200 bg-brand-50 px-5 py-2 text-xs text-brand-700">
          화면을 추가 생성 중이다 — 확정 Token 을 주입한 경량 파이프라인(Layout
          Engine → Renderer)이 실행 중이다.
        </div>
      )}

      {notGenerated ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-ink-500">
          <p>아직 생성된 디자인 시스템이 없다.</p>
          <Link href="/projects/new">
            <Button size="sm">새 생성 시작</Button>
          </Link>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Left controller */}
          <div className="w-80 shrink-0 border-r border-ink-200 bg-white">
            {activeDS && (
              <DSController
                concept={activeDS.conceptLabel}
                conceptName={activeDS.conceptName}
                tokens={activeDS.tokens}
                readOnly={activeDS.isArchived}
                dsMode={activeDS.dsMode}
              />
            )}
          </div>

          {/* Center canvas + footer */}
          <div className="flex min-w-0 flex-1 flex-col bg-ink-100/40">
            {/* Concept tabs */}
            <div className="flex items-center justify-between gap-3 border-b border-ink-200 bg-white px-5 py-2">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
                {designSystems.map((d) => {
                  const active = d.conceptLabel === activeConcept;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setConcept(d.conceptLabel)}
                      className={cn(
                        "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                        active
                          ? "bg-ink-900 text-white"
                          : "text-ink-600 hover:bg-ink-100",
                        d.isArchived && !active && "opacity-60",
                      )}
                    >
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ background: d.tokens.color.primary }}
                      />
                      컨셉 {d.conceptLabel} · {d.conceptName}
                      {d.isArchived && (
                        <span title="읽기 전용 보관" aria-hidden>
                          🔒
                        </span>
                      )}
                      {d.isModified && (
                        <span className="text-[9px] text-amber-500">●</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {activeDS?.isModified && <Badge tone="warning">User 수정됨</Badge>}
                <Badge tone="brand">실시간 반영 · 500ms ≤</Badge>
              </div>
            </div>

            {/* Screen tabs */}
            <div className="flex items-center gap-2 border-b border-ink-200 bg-white px-5 py-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
                화면
              </span>
              <div className="flex flex-1 items-center gap-1.5 overflow-x-auto scrollbar-thin">
                {screens.map((s) => (
                  <button
                    key={s.screen}
                    onClick={() => setScreen(s.screen)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition",
                      s.screen === activeScreen
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50",
                    )}
                  >
                    {s.screenTitle}
                    {s.isPrimary && (
                      <span className="text-[9px] text-ink-400">대표</span>
                    )}
                    <span className="text-[9px] text-ink-400">
                      {s.variantCount}종
                    </span>
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!isLocked || !!pendingGeneration}
                title={
                  isLocked
                    ? "확정 Token 으로 화면을 추가 생성한다"
                    : "화면 추가는 컨셉 확정 이후에만 가능하다"
                }
                onClick={() => setScreenModal(true)}
              >
                + 화면 추가
              </Button>
            </div>

            {/* Canvas */}
            <div className="flex-1 overflow-auto p-6 scrollbar-thin">
              {compareMode ? (
                <div className="grid gap-6 lg:grid-cols-3">
                  {designSystems.map((d) => {
                    const cm = mockups.find(
                      (m) =>
                        m.conceptLabel === d.conceptLabel &&
                        m.screen === activeScreen &&
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
                        zoom={Math.min(zoom, 45)}
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
                    selectable
                    onSelect={(sel: ElementSelection) => selectElement(sel)}
                    caption={`${activeMockup.screenTitle} · 변형 ${
                      activeMockupIndex + 1
                    } — ${activeMockup.variantLabel}`}
                  />
                )
              )}
            </div>

            {/* Mockup thumbnails */}
            <div className="flex shrink-0 items-center gap-3 border-t border-ink-200 bg-white px-5 py-3">
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
                구조 변형
              </span>
              <div className="flex flex-1 items-center gap-2 overflow-x-auto scrollbar-thin">
                {conceptMockups.map((m, idx) => {
                  const active = idx === activeMockupIndex;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMockup(idx)}
                      className={cn(
                        "flex shrink-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition",
                        active
                          ? "border-brand-500 bg-brand-50"
                          : "border-ink-200 bg-white hover:bg-ink-50",
                      )}
                    >
                      <span
                        className={cn(
                          "font-mono text-[10px]",
                          active ? "text-brand-700" : "text-ink-400",
                        )}
                      >
                        #{idx + 1}
                      </span>
                      <span
                        className={cn(
                          "max-w-[190px] truncate text-[11px] font-medium",
                          active ? "text-brand-700" : "text-ink-700",
                        )}
                        title={m.variantLabel}
                      >
                        {m.variantLabel || m.title}
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

          {/* Right inspector */}
          <div className="hidden w-72 shrink-0 border-l border-ink-200 bg-white xl:block">
            <div className="border-b border-ink-200 px-4 py-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
                요소 상세
              </div>
              <div className="mt-0.5 text-sm font-semibold text-ink-900">
                {selectedElement?.type ?? "선택된 요소 없음"}
              </div>
            </div>
            <div className="px-4 py-3">
              {selectedElement ? (
                <>
                  <div className="mb-3 text-[11px] text-ink-500">
                    {selectedElement.path.join(" › ")}
                  </div>
                  <div className="space-y-2">
                    {selectedElement.tokenRefs.map((r) => (
                      <div
                        key={r.label + r.token}
                        className="rounded-lg border border-ink-200 px-2.5 py-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-ink-700">
                            {r.label}
                          </span>
                          {r.value.startsWith("#") && (
                            <span
                              className="h-3.5 w-3.5 rounded border border-ink-200"
                              style={{ background: r.value }}
                            />
                          )}
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-brand-600">
                          {r.token}
                        </div>
                        <div className="font-mono text-[10px] text-ink-500">
                          {r.value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className="mt-3 w-full rounded-lg border border-ink-200 py-1.5 text-[11px] text-ink-600 hover:bg-ink-50"
                    onClick={() => {
                      void navigator.clipboard?.writeText(
                        selectedElement.tokenRefs
                          .map((r) => `${r.token}: ${r.value};`)
                          .join("\n"),
                      );
                    }}
                  >
                    CSS 변수 복사
                  </button>
                </>
              ) : (
                <p className="text-[11px] leading-relaxed text-ink-500">
                  캔버스의 버튼·카드·입력 요소를 클릭하면 참조 중인 Design Token 과
                  실제 값이 여기에 표시된다. Esc 로 선택을 해제한다.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal
        open={screenModal}
        onClose={() => setScreenModal(false)}
        title="화면 추가 생성"
        description="확정된 컨셉의 DS Token 을 주입해 Layout Engine → Renderer 만 실행한다. 구조 변형 3종이 생성되며, 월간 생성 한도 1회를 차감한다."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScreenModal(false)}
            >
              취소
            </Button>
            <Button size="sm" loading={busy === "screen"} onClick={handleAddScreen}>
              생성 시작
            </Button>
          </div>
        }
      >
        <div className="text-xs font-medium text-ink-700">화면</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SCREEN_PRESETS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setScreenPreset(s.value)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                screenPreset === s.value
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
              )}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setScreenPreset("custom")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
              screenPreset === "custom"
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
            )}
          >
            직접 입력
          </button>
        </div>

        {screenPreset === "custom" && (
          <div className="mt-3">
            <Input
              label="화면명"
              placeholder="예: 주문 내역"
              value={customScreen}
              onChange={(e) => setCustomScreen(e.target.value)}
              maxLength={60}
            />
          </div>
        )}

        <div className="mt-3">
          <Textarea
            label="간단 설명 (선택)"
            placeholder="이 화면에 필요한 요소를 한두 문장으로 적는다."
            value={screenDesc}
            onChange={(e) => setScreenDesc(e.target.value)}
            rows={3}
            countMax={1000}
            maxLength={1000}
          />
        </div>
      </Modal>
    </div>
  );
}
