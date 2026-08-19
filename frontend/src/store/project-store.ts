"use client";
import { tStored } from "@/lib/i18n";

import { create } from "zustand";
import { api } from "@/lib/api";
import type { ConceptBrief, DsMode, Platform, Project } from "@/lib/types";

interface ProjectState {
  projects: Project[];
  loaded: boolean;
  loading: boolean;
  error: string | null;

  load: (force?: boolean) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  create: (input: {
    name: string;
    requirementsText: string;
    platform: Platform;
    conceptCount?: number;
    variantCount?: number;
    dsMode?: DsMode;
    targetScreen?: string;
    targetScreenTitle?: string;
    conceptBriefs?: ConceptBrief[];
  }) => Promise<Project>;
  update: (id: string, patch: Partial<Project>) => Promise<Project>;
  remove: (id: string) => Promise<void>;
  /** 서버가 돌려준 최신 프로젝트를 목록에 반영한다. */
  upsert: (project: Project) => void;
  getById: (id: string) => Project | undefined;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loaded: false,
  loading: false,
  error: null,

  load: async (force = false) => {
    if (get().loading) return;
    if (get().loaded && !force) return;
    set({ loading: true, error: null });
    try {
      const projects = await api.projects.list();
      set({ projects, loaded: true, loading: false });
    } catch (e) {
      set({
        loading: false,
        loaded: true,
        error: e instanceof Error ? e.message : tStored("errors.loadProjects"),
      });
    }
  },

  toggleFavorite: async (id) => {
    const updated = await api.projects.toggleFavorite(id);
    get().upsert(updated);
  },

  create: async (input) => {
    const project = await api.projects.create({
      name: input.name,
      requirementsText: input.requirementsText,
      platform: input.platform,
      conceptCount: input.conceptCount,
      variantCount: input.variantCount,
      dsMode: input.dsMode,
      targetScreen: input.targetScreen,
      targetScreenTitle: input.targetScreenTitle,
      conceptBriefs: input.conceptBriefs,
    });
    set({ projects: [project, ...get().projects] });
    return project;
  },

  update: async (id, patch) => {
    const updated = await api.projects.update(id, patch);
    get().upsert(updated);
    return updated;
  },

  remove: async (id) => {
    await api.projects.remove(id);
    set({ projects: get().projects.filter((p) => p.id !== id) });
  },

  upsert: (project) => {
    const exists = get().projects.some((p) => p.id === project.id);
    set({
      projects: exists
        ? get().projects.map((p) => (p.id === project.id ? project : p))
        : [project, ...get().projects],
    });
  },

  getById: (id) => get().projects.find((p) => p.id === id),
}));
