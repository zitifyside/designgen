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
import { CanvasStage } from "@/components/workspace/CanvasStage";
import {
  CANVAS_HEIGHT,
  MockupCanvas,
  VIEWPORT_WIDTH,
} from "@/components/workspace/MockupCanvas";
import type { ElementSelection } from "@/components/workspace/MockupRenderer";
import { ConceptGallery } from "@/components/workspace/ConceptGallery";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useRouteId } from "@/lib/route-id";
import { useAuthStore } from "@/store/auth-store";
import { useProjectStore } from "@/store/project-store";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useWorkspaceStore } from "@/store/workspace-store";
import type { ConceptLabel, Generation } from "@/lib/types";

const SCREEN_PRESETS = [
  { value: "main", labelKey: "projectNew.sceneMain" },
  { value: "landing", labelKey: "projectNew.sceneLanding" },
  { value: "login", labelKey: "projectNew.sceneLogin" },
  { value: "dashboard", labelKey: "projectNew.sceneDashboard" },
  { value: "list", labelKey: "projectNew.sceneList" },
  { value: "detail", labelKey: "projectNew.sceneDetail" },
];

export default function WorkspaceClient() {
  const { t } = useI18n();
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
  const compareSelection = useWorkspaceStore((s) => s.compareSelection);
  const toggleCompareSelection = useWorkspaceStore((s) => s.toggleCompareSelection);
  const clearCompareSelection = useWorkspaceStore((s) => s.clearCompareSelection);
  const selectElement = useWorkspaceStore((s) => s.selectElement);
  const selectChain = useWorkspaceStore((s) => s.selectChain);
  const selectionChain = useWorkspaceStore((s) => s.selectionChain);
  const selectionDepth = useWorkspaceStore((s) => s.selectionDepth);
  const enterChild = useWorkspaceStore((s) => s.enterChild);
  const exitToParent = useWorkspaceStore((s) => s.exitToParent);
  const selectDepth = useWorkspaceStore((s) => s.selectDepth);
  const clearError = useWorkspaceStore((s) => s.clearError);
  const confirmConcept = useWorkspaceStore((s) => s.confirmConcept);
  const unlockConcept = useWorkspaceStore((s) => s.unlockConcept);
  const addScreen = useWorkspaceStore((s) => s.addScreen);
  const screenMockups = useWorkspaceStore((s) => s.screenMockups);
  const undoTokens = useWorkspaceStore((s) => s.undoTokens);
  const canUndo = useWorkspaceStore((s) => s.canUndo);
  const tokenHistory = useWorkspaceStore((s) => s.tokenHistory);

  const [busy, setBusy] = useState<string | null>(null);
  const [screenModal, setScreenModal] = useState(false);
  const [screenPreset, setScreenPreset] = useState("main");
  const [customScreen, setCustomScreen] = useState("");
  const [screenDesc, setScreenDesc] = useState("");
  const [pendingGeneration, setPendingGeneration] = useState<Generation | null>(
    null,
  );
  const [warningGeneration, setWarningGeneration] = useState<Generation | null>(
    null,
  );
  const [shortcutHelp, setShortcutHelp] = useState(false);
  // 값을 올려 CanvasStage 에 "화면에 맞춰라" 를 알린다 (맞춤 배율은 컨테이너
  // 크기를 아는 쪽에서만 계산할 수 있다).
  const [fitSignal, setFitSignal] = useState(0);
  // 시안 비교 (기능정의서 §3.1 '비교 모드') — 분할 방향과 확대·이동 동기화.
  const [compareDir, setCompareDir] = useState<"row" | "col">("row");
  const [syncView, setSyncView] = useState(true);
  const [syncOffset, setSyncOffset] = useState({ x: 0, y: 0 });
  const [saveHint, setSaveHint] = useState(false);
  const [view, setView] = useState<"gallery" | "studio">("gallery");

  useEffect(() => {
    if (projectId) void loadWorkspace(projectId);
  }, [projectId, loadWorkspace]);

  useEffect(() => {
    if (project?.status === "Draft") {
      router.replace(`/projects/new?draft=${encodeURIComponent(project.id)}`);
    }
  }, [project, router]);

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
  // 존재하는 시안만 남긴다 — 화면을 바꾸면 인덱스가 범위를 벗어날 수 있다.
  const variantCompare = compareSelection
    .filter((i) => i < conceptMockups.length)
    .slice(0, 3);
  const activeMockup = conceptMockups[activeMockupIndex];
  const activeDS = designSystems.find((d) => d.conceptLabel === activeConcept);
  const isLocked = project?.status === "ConceptLocked";
  const canConfirm =
    project?.status === "Completed" ||
    project?.status === "CompletedWarning" ||
    project?.status === "ConceptLocked";

  // 비교로 들어가고 나올 때, 그리고 분할 방향이 바뀔 때는 배율을 다시 맞춘다.
  // 칸이 좁아졌는데 배율이 그대로면 시안이 잘려 비교 자체가 되지 않는다.
  const compareCount = variantCompare.length;
  useEffect(() => {
    setFitSignal((n) => n + 1);
  }, [compareCount, compareDir, viewport]);

  // 단축키 (기능정의서 v0.2.0 §6 '단축키').
  // 입력 요소 안에서는 1~5·0·? 를 가로채지 않는다 — 글자를 못 치게 되기 때문이다.
  // 반면 Ctrl/Cmd 조합은 입력 중에도 동작해야 자연스럽다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        // Token 되돌리기. 편집 중인 입력값이 아니라 디자인 시스템을 되돌린다.
        if (canUndo(activeConcept)) {
          e.preventDefault();
          undoTokens(activeConcept);
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        // 자동 저장이라 따로 저장할 것은 없지만, 사용자는 확인을 원한다.
        e.preventDefault();
        setSaveHint(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "e") {
        e.preventDefault();
        if (project) router.push(`/projects/${project.id}/export`);
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        setFitSignal((n) => n + 1); // Fit to Screen
        return;
      }
      if (mod && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        setZoom(Math.round(zoom * 1.25));
        return;
      }
      if (mod && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        setZoom(Math.round(zoom / 1.25));
        return;
      }
      if (mod || e.altKey) return;

      if (e.key === "Escape") {
        // Esc 는 입력 중에도 받는다 — 열린 것을 닫는 키이기 때문이다.
        if (shortcutHelp) setShortcutHelp(false);
        else if (screenModal) setScreenModal(false);
        else exitToParent(); // 한 단계 밖으로. 맨 바깥이면 선택 해제
        return;
      }
      if (typing) return;

      if (e.key >= "1" && e.key <= "5") {
        const idx = Number(e.key) - 1;
        if (idx < conceptMockups.length) setMockup(idx);
      } else if (e.key === "0") {
        setZoom(100);
      } else if (e.key === "?") {
        setShortcutHelp((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activeConcept,
    canUndo,
    conceptMockups.length,
    zoom,
    project,
    router,
    screenModal,
    exitToParent,
    setMockup,
    setZoom,
    shortcutHelp,
    undoTokens,
  ]);

  // 저장 안내는 잠깐만 띄운다.
  useEffect(() => {
    if (!saveHint) return;
    const t = setTimeout(() => setSaveHint(false), 1800);
    return () => clearTimeout(t);
  }, [saveHint]);

  if (loading && !project) {
    return (
      <div className="px-6 py-12 text-center text-sm text-ink-500">
        {t("workspace.loading")}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="px-6 py-12 text-center text-sm text-ink-500">
        {t("workspace.notFound")}{" "}
        <Link href="/dashboard" className="text-brand-700 hover:underline">
          {t("workspace.toDashboard")}
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
      alert(e instanceof Error ? e.message : t("workspace.lockFailed"));
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
      alert(e instanceof Error ? e.message : t("workspace.unlockFailed"));
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
      alert(e instanceof Error ? e.message : t("workspace.addScreenFailed"));
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
      alert(e instanceof Error ? e.message : t("workspace.retryFailed"));
      setBusy(null);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-ink-200 bg-surface px-5 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-xs text-ink-500 hover:text-ink-800"
          >
            {t("workspace.backDashboard")}
          </Link>
          <div className="h-4 w-px bg-ink-200" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink-900">
                {project.name}
              </span>
              {isLocked && <Badge tone="brand">{t("workspace.lockedBadge", { label: project.confirmedConceptLabel ?? "" })}</Badge>}
              {project.dsMode === "unified" && (
                <Badge tone="neutral">{t("workspace.unifiedDs")}</Badge>
              )}
            </div>
            <div className="text-[10px] text-ink-500">
              {t("workspace.meta", { platform: project.platform, concepts: project.conceptCount, variants: project.variantCount })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-ink-500">
            {saveHint
              ? t("workspace.autoSaving")
              : syncState === "saving"
                ? t("workspace.syncing")
                : syncState === "saved"
                  ? t("workspace.saved")
                  : syncState === "error"
                    ? t("workspace.syncFailed")
                    : ""}
          </span>
          {!notGenerated && (
            <div className="inline-flex rounded-lg bg-ink-100 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setView("gallery")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition",
                  view === "gallery"
                    ? "bg-surface text-ink-900 shadow-sm"
                    : "text-ink-500 hover:text-ink-800",
                )}
              >
                {t("workspace.gallery")}
              </button>
              <button
                type="button"
                onClick={() => setView("studio")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition",
                  view === "studio"
                    ? "bg-surface text-ink-900 shadow-sm"
                    : "text-ink-500 hover:text-ink-800",
                )}
              >
                {t("workspace.refine")}
              </button>
            </div>
          )}
          {view === "studio" && (
            <>
          <button
            onClick={() => undoTokens(activeConcept)}
            disabled={(tokenHistory[activeConcept]?.length ?? 0) === 0}
            title={t("workspace.undoTitle")}
            className={cn(
              "rounded-lg border border-ink-200 bg-surface px-2 py-1 text-xs transition",
              (tokenHistory[activeConcept]?.length ?? 0) === 0
                ? "cursor-not-allowed text-ink-300"
                : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
            )}
          >
            {t("workspace.undo")}
          </button>
          <button
            onClick={() => setShortcutHelp(true)}
            title={t("workspace.shortcutsTitle")}
            className="rounded-lg border border-ink-200 bg-surface px-2 py-1 text-xs text-ink-600 transition hover:bg-ink-50 hover:text-ink-900"
          >
            ?
          </button>
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
          <div className="flex items-center gap-1 rounded-lg border border-ink-200 bg-surface px-1 text-xs">
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
            <button
              onClick={() => setFitSignal((n) => n + 1)}
              title={t("workspace.fitTitle")}
              className="border-l border-ink-200 px-2 py-1 text-[11px] text-ink-500 hover:text-ink-900"
            >
              {t("workspace.fit")}
            </button>
          </div>
          <Button
            variant={compareMode ? "primary" : "outline"}
            size="sm"
            onClick={toggleCompare}
            disabled={notGenerated}
          >
            {t("workspace.compareConcepts")}
          </Button>
            </>
          )}
          {isLocked ? (
            <Button
              variant="outline"
              size="sm"
              loading={busy === "unlock"}
              onClick={handleUnlock}
            >
              {t("workspace.unlock")}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={!canConfirm || notGenerated}
              loading={busy === "confirm"}
              onClick={handleConfirm}
            >
              {t("workspace.lock")}
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
            {t("workspace.close")}
          </button>
        </div>
      )}
      {project.status === "CompletedWarning" && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-800">
          <span>
            {t("workspace.fallbackWarn")}
          </span>
          {warningGeneration ? (
            <Button size="sm" variant="outline" loading={busy === "retry"} onClick={handleRetry}>
              {t("workspace.retryFree")}
            </Button>
          ) : (
            <span className="text-[10px] text-amber-700">
              {t("workspace.retryUsed")}
            </span>
          )}
        </div>
      )}
      {pendingGeneration && (
        <div className="border-b border-brand-200 bg-brand-50 px-5 py-2 text-xs text-brand-700">
          {t("workspace.addingScreen")}
        </div>
      )}

      {notGenerated ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-ink-500">
          <p>{t("workspace.emptyGallery")}</p>
          <Link href="/projects/new">
            <Button size="sm">{t("workspace.promptGenerate")}</Button>
          </Link>
        </div>
      ) : view === "gallery" ? (
        <div className="min-h-0 flex-1 overflow-auto bg-[#f4f3ef] px-6 py-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">
                {t("workspace.galleryHeading")}
              </h2>
              <p className="mt-0.5 text-[11px] text-ink-500">
                {t("workspace.galleryHint")}
              </p>
            </div>
            <div className="text-[11px] text-ink-500">
              {t("workspace.galleryMeta", { concepts: designSystems.length, count: mockups.length })}
            </div>
          </div>
          <ConceptGallery
            mockups={mockups}
            designSystems={designSystems}
            projectName={project.name}
            selectedId={activeMockup?.id}
            onSelect={(m) => {
              setConcept(m.conceptLabel);
              setScreen(m.screen);
              setMockup(m.index);
            }}
            onOpen={(m) => {
              setConcept(m.conceptLabel);
              setScreen(m.screen);
              setMockup(m.index);
              setView("studio");
            }}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Left controller */}
          <div className="w-80 shrink-0 border-r border-ink-200 bg-surface">
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
            <div className="flex items-center justify-between gap-3 border-b border-ink-200 bg-surface px-5 py-2">
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
                          ? "bg-ink-900 text-ink-50"
                          : "text-ink-600 hover:bg-ink-100",
                        d.isArchived && !active && "opacity-60",
                      )}
                    >
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ background: d.tokens.color.primary }}
                      />
                      {t("workspace.conceptNamed", { label: d.conceptLabel, name: d.conceptName })}
                      {d.isArchived && (
                        <span title={t("workspace.readOnlyKeep")} aria-hidden>
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
                {activeDS?.isModified && <Badge tone="warning">{t("workspace.userModified")}</Badge>}
                <Badge tone="brand">{t("workspace.realtime")}</Badge>
              </div>
            </div>

            {/* Screen tabs */}
            <div className="flex items-center gap-2 border-b border-ink-200 bg-surface px-5 py-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
                {t("workspace.screen")}
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
                        : "border-ink-200 bg-surface text-ink-600 hover:bg-ink-50",
                    )}
                  >
                    {s.screenTitle}
                    {s.isPrimary && (
                      <span className="text-[9px] text-ink-500">{t("workspace.hero")}</span>
                    )}
                    <span className="text-[9px] text-ink-500">
                      {t("workspace.variantKinds", { n: s.variantCount })}
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
                    ? t("workspace.addScreenHintLocked")
                    : t("workspace.addScreenHintLockedOut")
                }
                onClick={() => setScreenModal(true)}
              >
                {t("workspace.addScreen")}
              </Button>
            </div>

            {/* Canvas */}
            <div className="relative flex-1 overflow-auto p-6 scrollbar-thin">
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
                        caption={t("workspace.captionConcept", { label: d.conceptLabel, name: d.conceptName })}
                      />
                    );
                  })}
                </div>
              ) : variantCompare.length >= 2 && activeDS ? (
                <div className="absolute inset-0 flex flex-col">
                  <div className="z-10 flex items-center justify-between gap-3 px-4 pt-3">
                    <span className="text-[11px] font-medium text-ink-600">
                      {t("workspace.compareVariants", { n: variantCompare.length })}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5 rounded-lg bg-ink-100 p-0.5">
                        {(["row", "col"] as const).map((d) => (
                          <button
                            key={d}
                            onClick={() => setCompareDir(d)}
                            className={cn(
                              "rounded-md px-2 py-1 text-[11px] font-medium transition",
                              compareDir === d
                                ? "bg-surface text-ink-900 shadow-sm"
                                : "text-ink-500",
                            )}
                          >
{d === "row" ? t("workspace.splitRow") : t("workspace.splitCol")}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setSyncView((v) => !v)}
                        title={t("workspace.syncTitle")}
                        className={cn(
                          "rounded-lg border px-2 py-1 text-[11px] font-medium transition",
                          syncView
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-ink-200 bg-surface text-ink-600 hover:bg-ink-50",
                        )}
                      >
{syncView ? t("workspace.syncOn") : t("workspace.syncOff")}
                      </button>
                      <button
                        onClick={clearCompareSelection}
                        className="rounded-lg border border-ink-200 bg-surface px-2 py-1 text-[11px] text-ink-600 transition hover:bg-ink-50"
                      >
                        {t("workspace.endCompare")}
                      </button>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "flex min-h-0 flex-1 gap-2 p-3",
                      compareDir === "row" ? "flex-row" : "flex-col",
                    )}
                  >
                    {variantCompare.map((idx) => {
                      const m = conceptMockups[idx];
                      if (!m) return null;
                      return (
                        <div
                          key={m.id}
                          className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-ink-200 bg-ink-50"
                        >
                          <div className="shrink-0 truncate px-3 py-1.5 text-[10px] font-medium text-ink-600">
                            #{idx + 1} {m.variantLabel || m.title}
                          </div>
                          <div className="min-h-0 flex-1">
                            <CanvasStage
                              contentWidth={VIEWPORT_WIDTH[viewport]}
                              contentHeight={CANVAS_HEIGHT[viewport]}
                              zoom={zoom}
                              onZoomChange={setZoom}
                              fitSignal={fitSignal}
                              resetKey={`cmp:${activeConcept}:${activeScreen}:${viewport}:${compareDir}:${variantCompare.length}`}
                              offset={syncView ? syncOffset : undefined}
                              onOffsetChange={syncView ? setSyncOffset : undefined}
                            >
                              <MockupCanvas
                                tokens={activeDS.tokens}
                                mockup={m}
                                projectName={project.name}
                                viewport={viewport}
                                zoom={zoom}
                              />
                            </CanvasStage>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                activeDS &&
                activeMockup && (
                  <div className="absolute inset-0 flex flex-col">
                    {/* 설명은 화면에 고정한다 — 함께 움직이면 확대했을 때 사라진다. */}
                    <div className="pointer-events-none z-10 pt-4 text-center text-[11px] font-medium uppercase tracking-wider text-ink-500">
                      {t("workspace.variantOf", { title: activeMockup.screenTitle, n: activeMockupIndex + 1 })}{" "}
                      {activeMockup.variantLabel}
                    </div>
                    <div className="min-h-0 flex-1">
                      <CanvasStage
                        contentWidth={VIEWPORT_WIDTH[viewport]}
                        contentHeight={CANVAS_HEIGHT[viewport]}
                        zoom={zoom}
                        onZoomChange={setZoom}
                        fitSignal={fitSignal}
                        resetKey={`${activeConcept}:${activeScreen}:${activeMockupIndex}:${viewport}`}
                      >
                        <MockupCanvas
                          tokens={activeDS.tokens}
                          mockup={activeMockup}
                          projectName={project.name}
                          viewport={viewport}
                          zoom={zoom}
                          selectable
                          onSelect={selectChain}
                          onEnterChild={enterChild}
                        />
                      </CanvasStage>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Mockup thumbnails */}
            <div className="flex shrink-0 items-center gap-3 border-t border-ink-200 bg-surface px-5 py-3">
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
                {t("workspace.variants")}
              </span>
              <div className="flex flex-1 items-center gap-2 overflow-x-auto scrollbar-thin">
                {conceptMockups.map((m, idx) => {
                  const active = idx === activeMockupIndex;
                  return (
                    <button
                      key={m.id}
                      onClick={(e) => {
                        // Shift+클릭은 비교 대상 선택 — 일반 클릭은 전환이다.
                        if (e.shiftKey) toggleCompareSelection(idx);
                        else setMockup(idx);
                      }}
                      title={
                        compareSelection.includes(idx)
                          ? t("workspace.compareSelected")
                          : t("workspace.compareAdd")
                      }
                      className={cn(
                        "relative flex shrink-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition",
                        compareSelection.includes(idx)
                          ? "border-brand-500 ring-2 ring-brand-400 ring-offset-1"
                          : active
                            ? "border-brand-500 bg-brand-50"
                            : "border-ink-200 bg-surface hover:bg-ink-50",
                      )}
                    >
                      {compareSelection.includes(idx) && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white">
                          {compareSelection.indexOf(idx) + 1}
                        </span>
                      )}
                      <span
                        className={cn(
                          "font-mono text-[10px]",
                          active ? "text-brand-700" : "text-ink-500",
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
              <div className="text-[10px] text-ink-500">
                {t("workspace.totalHotkeys", { n: conceptMockups.length })}
              </div>
            </div>
          </div>

          {/* Right inspector */}
          <div className="hidden w-72 shrink-0 border-l border-ink-200 bg-surface xl:block">
            <div className="border-b border-ink-200 px-4 py-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
                {t("workspace.elementDetail")}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-ink-900">
                {selectedElement?.type ?? t("workspace.noSelection")}
              </div>
            </div>
            <div className="px-4 py-3">
              {selectedElement ? (
                <>
                  {/* 부모-자식 계층 트리 — 눌러서 그 단계로 옮긴다. */}
                  <div className="mb-3 flex flex-wrap items-center gap-1">
                    {selectionChain.map((node, i) => (
                      <span key={`${node.type}-${i}`} className="flex items-center gap-1">
                        {i > 0 && <span className="text-[10px] text-ink-400">›</span>}
                        <button
                          onClick={() => selectDepth(i)}
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px] transition",
                            i === selectionDepth
                              ? "bg-brand-50 font-medium text-brand-700"
                              : "text-ink-500 hover:bg-ink-100 hover:text-ink-700",
                          )}
                        >
                          {node.type}
                        </button>
                      </span>
                    ))}
                  </div>
                  {selectionDepth < selectionChain.length - 1 && (
                    <div className="mb-3 text-[10px] text-ink-500">
                      {t("workspace.drillHint")}
                    </div>
                  )}
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
                        <div className="mt-1 font-mono text-[10px] text-brand-700">
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
                    {t("workspace.copyCss")}
                  </button>
                </>
              ) : (
                <p className="text-[11px] leading-relaxed text-ink-500">
                  {t("workspace.selectHint")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal
        open={screenModal}
        onClose={() => setScreenModal(false)}
        title={t("workspace.addScreenTitle")}
        description={t("workspace.addScreenDesc")}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScreenModal(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button size="sm" loading={busy === "screen"} onClick={handleAddScreen}>
              {t("workspace.start")}
            </Button>
          </div>
        }
      >
        <div className="text-xs font-medium text-ink-700">{t("workspace.scene")}</div>
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
                  : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50",
              )}
            >
              {t(s.labelKey)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setScreenPreset("custom")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
              screenPreset === "custom"
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50",
            )}
          >
            {t("workspace.customInput")}
          </button>
        </div>

        {screenPreset === "custom" && (
          <div className="mt-3">
            <Input
              label={t("workspace.screenName")}
              placeholder={t("workspace.screenPlaceholder")}
              value={customScreen}
              onChange={(e) => setCustomScreen(e.target.value)}
              maxLength={60}
            />
          </div>
        )}

        <div className="mt-3">
          <Textarea
            label={t("workspace.briefOptional")}
            placeholder={t("workspace.briefPlaceholder")}
            value={screenDesc}
            onChange={(e) => setScreenDesc(e.target.value)}
            rows={3}
            countMax={1000}
            maxLength={1000}
          />
        </div>
      </Modal>

      <Modal
        open={shortcutHelp}
        onClose={() => setShortcutHelp(false)}
        title={t("workspace.hotkeysTitle")}
        description={t("workspace.hotkeysDesc")}
        size="sm"
      >
        <div className="overflow-hidden rounded-lg border border-ink-200">
          {SHORTCUTS.map(([keys, label], i) => (
            <div
              key={label}
              className={cn(
                "flex items-center justify-between gap-3 px-3 py-2 text-xs",
                i % 2 === 1 && "bg-ink-50",
              )}
            >
              <span className="text-ink-700">{t(label)}</span>
              <span className="flex shrink-0 gap-1">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-ink-300 bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-700 shadow-sm"
                  >
                    {k.includes(".") ? t(k) : k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/** 기능정의서 v0.2.0 §6 '단축키' 정의와 1:1 로 맞춘다. */
const SHORTCUTS: Array<[string[], string]> = [
  [["1", "~", "5"], "workspace.hkSwitch"],
  [["workspace.kbdWheel"], "workspace.hkWheel"],
  [["Space", "workspace.kbdDrag"], "workspace.hkPan"],
  [["0"], "workspace.hk100"],
  [["Ctrl/Cmd", "+/−"], "workspace.hkZoom"],
  [["Ctrl/Cmd", "0"], "workspace.hkFit"],
  [["Ctrl/Cmd", "Z"], "workspace.hkUndo"],
  [["Ctrl/Cmd", "S"], "workspace.hkSave"],
  [["Ctrl/Cmd", "E"], "workspace.hkExport"],
  [["Esc"], "workspace.hkEsc"],
  [["?"], "workspace.hkHelp"],
];
