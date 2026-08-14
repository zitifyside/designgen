"use client";

import { create } from "zustand";
import { api, type DeepPartial } from "@/lib/api";
import type {
  ConceptLabel,
  DesignSystem,
  DesignTokens,
  Generation,
  Mockup,
  Project,
  ScreenInfo,
} from "@/lib/types";

/** 선택한 시안 요소 — 우측 상세 패널이 Token 참조 정보를 보여준다. */
export interface SelectedElement {
  type: string;
  tokenRefs: { label: string; token: string; value: string }[];
  path: string[];
}

interface WorkspaceState {
  projectId: string | null;
  project: Project | null;
  designSystems: DesignSystem[];
  mockups: Mockup[];
  screens: ScreenInfo[];

  activeConcept: ConceptLabel;
  activeScreen: string;
  activeMockupIndex: number;
  viewport: "Desktop" | "Tablet" | "Mobile";
  zoom: number;
  compareMode: boolean;
  compareSelection: number[];
  selectedElement: SelectedElement | null;

  loading: boolean;
  error: string | null;
  /** Token 서버 동기화 상태 (debounce 300ms 후 PATCH). */
  syncState: "idle" | "saving" | "saved" | "error";

  loadFor: (projectId: string, force?: boolean) => Promise<void>;
  setActiveConcept: (c: ConceptLabel) => void;
  setActiveScreen: (screen: string) => void;
  setActiveMockup: (idx: number) => void;
  setViewport: (v: WorkspaceState["viewport"]) => void;
  setZoom: (n: number) => void;
  toggleCompare: () => void;
  toggleCompareSelection: (idx: number) => void;
  selectElement: (el: SelectedElement | null) => void;
  clearError: () => void;

  updateTokens: (
    conceptLabel: ConceptLabel,
    patch: DeepPartial<DesignTokens>,
  ) => void;
  resetTokens: (conceptLabel: ConceptLabel) => Promise<void>;

  confirmConcept: (conceptLabel: ConceptLabel) => Promise<void>;
  unlockConcept: () => Promise<void>;
  addScreen: (input: {
    screen: string;
    screenTitle?: string;
    description?: string;
  }) => Promise<Generation>;

  activeDS: () => DesignSystem | undefined;
  screenMockups: () => Mockup[];
}

function mergeDeep<T>(base: T, patch: DeepPartial<T>): T {
  if (patch === undefined || patch === null) return base;
  if (typeof patch !== "object" || Array.isArray(patch)) return patch as T;
  const out: Record<string, unknown> = Array.isArray(base)
    ? ([...(base as unknown[])] as unknown as Record<string, unknown>)
    : { ...(base as unknown as Record<string, unknown>) };
  for (const k of Object.keys(patch as object)) {
    const pv = (patch as Record<string, unknown>)[k];
    const bv = (base as unknown as Record<string, unknown>)?.[k];
    out[k] =
      pv && typeof pv === "object" && !Array.isArray(pv) && bv && typeof bv === "object"
        ? mergeDeep(bv, pv as DeepPartial<typeof bv>)
        : pv;
  }
  return out as T;
}

/**
 * 서버 동기화는 Token 변경마다 보내지 않고 300ms debounce 로 묶는다
 * (기획서 v0.5.0 §4 F-004 — 화면 반영 500ms 이내 / 서버 동기화 1초 이내).
 */
const SYNC_DEBOUNCE_MS = 300;
const pendingPatches = new Map<string, DeepPartial<DesignTokens>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  projectId: null,
  project: null,
  designSystems: [],
  mockups: [],
  screens: [],

  activeConcept: "A",
  activeScreen: "",
  activeMockupIndex: 0,
  viewport: "Desktop",
  zoom: 100,
  compareMode: false,
  compareSelection: [],
  selectedElement: null,

  loading: false,
  error: null,
  syncState: "idle",

  loadFor: async (projectId, force = false) => {
    if (!force && get().projectId === projectId && get().designSystems.length > 0) {
      return;
    }
    set({ loading: true, error: null, projectId });
    try {
      const [project, designSystems, mockups, screens] = await Promise.all([
        api.projects.get(projectId),
        api.designSystems.list(projectId),
        api.mockups.list(projectId),
        api.projects.screens(projectId),
      ]);
      const confirmed = project.confirmedConceptLabel;
      const primary = screens.find((s) => s.isPrimary) ?? screens[0];
      set({
        project,
        designSystems,
        mockups,
        screens,
        activeConcept: confirmed ?? designSystems[0]?.conceptLabel ?? "A",
        activeScreen: primary?.screen ?? project.targetScreen ?? "",
        activeMockupIndex: 0,
        compareSelection: [],
        selectedElement: null,
        loading: false,
      });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "작업 화면을 불러오지 못했습니다.",
      });
    }
  },

  setActiveConcept: (c) =>
    set({ activeConcept: c, activeMockupIndex: 0, selectedElement: null }),
  setActiveScreen: (screen) =>
    set({ activeScreen: screen, activeMockupIndex: 0, compareSelection: [] }),
  setActiveMockup: (idx) => set({ activeMockupIndex: idx }),
  setViewport: (v) => set({ viewport: v }),
  setZoom: (n) => set({ zoom: Math.max(25, Math.min(400, n)) }),
  toggleCompare: () =>
    set({ compareMode: !get().compareMode, compareSelection: [] }),
  toggleCompareSelection: (idx) => {
    const cur = get().compareSelection;
    if (cur.includes(idx)) {
      set({ compareSelection: cur.filter((i) => i !== idx) });
      return;
    }
    // 비교는 2~3개까지 (기능정의서 v0.2.0 §3.1 '비교 모드').
    set({ compareSelection: [...cur, idx].slice(-3) });
  },
  selectElement: (el) => set({ selectedElement: el }),
  clearError: () => set({ error: null }),

  updateTokens: (conceptLabel, patch) => {
    const projectId = get().projectId;
    if (!projectId) return;

    // 1) 로컬 즉시 반영 — 캔버스는 CSS 변수 바인딩이라 리렌더가 곧 반영이다.
    set({
      designSystems: get().designSystems.map((ds) =>
        ds.conceptLabel === conceptLabel
          ? { ...ds, tokens: mergeDeep(ds.tokens, patch), isModified: true }
          : ds,
      ),
      syncState: "saving",
    });

    // 2) 서버 동기화는 debounce 로 묶어 보낸다.
    const key = `${projectId}:${conceptLabel}`;
    pendingPatches.set(key, mergeDeep(pendingPatches.get(key) ?? {}, patch));
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(
      key,
      setTimeout(async () => {
        const body = pendingPatches.get(key);
        pendingPatches.delete(key);
        timers.delete(key);
        if (!body) return;
        try {
          const updated = await api.designSystems.patch(
            projectId,
            conceptLabel,
            body,
          );
          if (get().project?.dsMode === "unified") {
            // 단일 DS 통일에서는 Base 항목 수정이 형제 컨셉에도 반영되므로
            // 전체를 다시 읽어 화면과 서버 상태를 일치시킨다.
            const fresh = await api.designSystems.list(projectId);
            set({ designSystems: fresh, syncState: "saved" });
            return;
          }
          set({
            designSystems: get().designSystems.map((ds) =>
              ds.conceptLabel === conceptLabel ? updated : ds,
            ),
            syncState: "saved",
          });
        } catch (e) {
          // 등급 제한(403)·읽기 전용(409) 등은 서버 값으로 되돌린다.
          set({
            syncState: "error",
            error:
              e instanceof Error ? e.message : "Token 동기화에 실패했습니다.",
          });
          try {
            const fresh = await api.designSystems.list(projectId);
            set({ designSystems: fresh });
          } catch {
            /* 되돌리기 실패는 무시하고 오류 메시지만 남긴다. */
          }
        }
      }, SYNC_DEBOUNCE_MS),
    );
  },

  resetTokens: async (conceptLabel) => {
    const projectId = get().projectId;
    if (!projectId) return;
    const fresh = await api.designSystems.list(projectId);
    set({
      designSystems: fresh,
      syncState: "idle",
      activeConcept: conceptLabel,
    });
  },

  confirmConcept: async (conceptLabel) => {
    const projectId = get().projectId;
    if (!projectId) return;
    const project = await api.projects.confirmConcept(projectId, conceptLabel);
    const designSystems = await api.designSystems.list(projectId);
    set({ project, designSystems, activeConcept: conceptLabel });
  },

  unlockConcept: async () => {
    const projectId = get().projectId;
    if (!projectId) return;
    const project = await api.projects.unlockConcept(projectId);
    const designSystems = await api.designSystems.list(projectId);
    set({ project, designSystems });
  },

  addScreen: async (input) => {
    const projectId = get().projectId;
    if (!projectId) throw new Error("프로젝트가 선택되지 않았습니다.");
    return api.projects.addScreen(projectId, input);
  },

  activeDS: () =>
    get().designSystems.find((d) => d.conceptLabel === get().activeConcept),

  screenMockups: () => {
    const { mockups, activeConcept, activeScreen } = get();
    return mockups
      .filter(
        (m) =>
          m.conceptLabel === activeConcept &&
          (!activeScreen || m.screen === activeScreen),
      )
      .sort((a, b) => a.index - b.index);
  },
}));
