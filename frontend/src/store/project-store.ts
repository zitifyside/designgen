"use client";

import { create } from "zustand";
import { MOCK_PROJECTS } from "@/lib/mock-data";
import type { Platform, Project, ProjectStatus } from "@/lib/types";

interface ProjectState {
  projects: Project[];
  loaded: boolean;
  load: () => void;
  toggleFavorite: (id: string) => void;
  create: (input: {
    name: string;
    requirementsText: string;
    platform: Platform;
  }) => Project;
  update: (id: string, patch: Partial<Project>) => void;
  remove: (id: string) => void;
  setStatus: (id: string, status: ProjectStatus) => void;
  getById: (id: string) => Project | undefined;
}

const STORAGE_KEY = "adg.projects.v1";

function persist(projects: Project[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function readPersisted(): Project[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Project[];
  } catch {
    return null;
  }
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loaded: false,

  load: () => {
    if (get().loaded) return;
    const persisted = readPersisted();
    set({ projects: persisted ?? MOCK_PROJECTS, loaded: true });
  },

  toggleFavorite: (id) => {
    const next = get().projects.map((p) =>
      p.id === id ? { ...p, isFavorite: !p.isFavorite } : p,
    );
    persist(next);
    set({ projects: next });
  },

  create: ({ name, requirementsText, platform }) => {
    const now = new Date().toISOString();
    const id = `p_${Math.random().toString(36).slice(2, 8)}`;
    const project: Project = {
      id,
      ownerId: "u_001",
      name,
      description: requirementsText.slice(0, 80),
      platform,
      status: "Generating",
      isFavorite: false,
      requirementsText,
      createdAt: now,
      updatedAt: now,
      thumbnailConcept: "A",
      thumbnailMockup: 0,
    };
    const next = [project, ...get().projects];
    persist(next);
    set({ projects: next });
    return project;
  },

  update: (id, patch) => {
    const next = get().projects.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
    );
    persist(next);
    set({ projects: next });
  },

  remove: (id) => {
    const next = get().projects.filter((p) => p.id !== id);
    persist(next);
    set({ projects: next });
  },

  setStatus: (id, status) => get().update(id, { status }),

  getById: (id) => get().projects.find((p) => p.id === id),
}));
