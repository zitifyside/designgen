"use client";

import { create } from "zustand";
import { MOCK_USER } from "@/lib/mock-data";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  hydrate: () => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  updateProfile: (patch: Partial<User>) => void;
}

const STORAGE_KEY = "adg.auth.v1";

function readStored(): { authenticated: boolean; user: User | null } {
  if (typeof window === "undefined") return { authenticated: false, user: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { authenticated: false, user: null };
    const parsed = JSON.parse(raw);
    return {
      authenticated: !!parsed.authenticated,
      user: parsed.user ?? null,
    };
  } catch {
    return { authenticated: false, user: null };
  }
}

function persist(authenticated: boolean, user: User | null) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ authenticated, user }));
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    const { authenticated, user } = readStored();
    set({ isAuthenticated: authenticated, user, hydrated: true });
  },

  login: async (email) => {
    await new Promise((r) => setTimeout(r, 250));
    const user: User = { ...MOCK_USER, email };
    persist(true, user);
    set({ isAuthenticated: true, user });
  },

  signup: async (email, _password, name) => {
    await new Promise((r) => setTimeout(r, 350));
    const user: User = {
      ...MOCK_USER,
      email,
      name,
      plan: "Free",
      credits: 0,
      monthlyGenerations: { used: 0, limit: 3 },
    };
    persist(true, user);
    set({ isAuthenticated: true, user });
  },

  logout: () => {
    persist(false, null);
    set({ isAuthenticated: false, user: null });
  },

  updateProfile: (patch) => {
    const current = get().user;
    if (!current) return;
    const next = { ...current, ...patch };
    persist(get().isAuthenticated, next);
    set({ user: next });
  },
}));
