"use client";

import { create } from "zustand";
import { MOCK_DESIGN_SYSTEMS, MOCK_MOCKUPS } from "@/lib/mock-data";
import type {
  ConceptLabel,
  DesignSystem,
  DesignTokens,
  Mockup,
} from "@/lib/types";

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

interface WorkspaceState {
  projectId: string | null;
  designSystems: DesignSystem[];
  mockups: Mockup[];
  activeConcept: ConceptLabel;
  activeMockupIndex: number;
  viewport: "Desktop" | "Tablet" | "Mobile";
  zoom: number;
  compareMode: boolean;

  loadFor: (projectId: string) => void;
  setActiveConcept: (c: ConceptLabel) => void;
  setActiveMockup: (idx: number) => void;
  setViewport: (v: WorkspaceState["viewport"]) => void;
  setZoom: (n: number) => void;
  toggleCompare: () => void;

  updateTokens: (
    conceptLabel: ConceptLabel,
    patch: DeepPartial<DesignTokens>,
  ) => void;
  resetTokens: (conceptLabel: ConceptLabel) => void;
  activeDS: () => DesignSystem | undefined;
}

function mergeDeep<T>(base: T, patch: DeepPartial<T>): T {
  if (patch === undefined || patch === null) return base;
  if (typeof patch !== "object" || Array.isArray(patch)) return patch as T;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const k of Object.keys(patch)) {
    const pv = (patch as any)[k];
    const bv = (base as any)?.[k];
    out[k] =
      pv && typeof pv === "object" && !Array.isArray(pv) && bv && typeof bv === "object"
        ? mergeDeep(bv, pv)
        : pv;
  }
  return out;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  projectId: null,
  designSystems: [],
  mockups: [],
  activeConcept: "A",
  activeMockupIndex: 0,
  viewport: "Desktop",
  zoom: 100,
  compareMode: false,

  loadFor: (projectId) => {
    if (get().projectId === projectId && get().designSystems.length > 0) return;
    set({
      projectId,
      designSystems: MOCK_DESIGN_SYSTEMS(projectId),
      mockups: MOCK_MOCKUPS(projectId),
      activeConcept: "A",
      activeMockupIndex: 0,
      viewport: "Desktop",
      zoom: 100,
      compareMode: false,
    });
  },

  setActiveConcept: (c) => set({ activeConcept: c }),
  setActiveMockup: (idx) => set({ activeMockupIndex: idx }),
  setViewport: (v) => set({ viewport: v }),
  setZoom: (n) => set({ zoom: Math.max(25, Math.min(200, n)) }),
  toggleCompare: () => set({ compareMode: !get().compareMode }),

  updateTokens: (conceptLabel, patch) => {
    const next = get().designSystems.map((ds) =>
      ds.conceptLabel === conceptLabel
        ? { ...ds, tokens: mergeDeep(ds.tokens, patch), isModified: true }
        : ds,
    );
    set({ designSystems: next });
  },

  resetTokens: (conceptLabel) => {
    const projectId = get().projectId;
    if (!projectId) return;
    const fresh = MOCK_DESIGN_SYSTEMS(projectId).find(
      (d) => d.conceptLabel === conceptLabel,
    );
    if (!fresh) return;
    const next = get().designSystems.map((ds) =>
      ds.conceptLabel === conceptLabel ? fresh : ds,
    );
    set({ designSystems: next });
  },

  activeDS: () =>
    get().designSystems.find((d) => d.conceptLabel === get().activeConcept),
}));
