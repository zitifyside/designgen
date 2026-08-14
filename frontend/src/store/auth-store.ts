"use client";

import { create } from "zustand";
import { ApiError, api, readTokens, writeTokens } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  error: string | null;

  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 생성·결제 후 쿼터·크레딧을 다시 읽어온다. */
  refreshUser: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  hydrated: false,
  error: null,

  hydrate: async () => {
    if (get().hydrated) return;
    const tokens = readTokens();
    if (!tokens?.accessToken) {
      set({ hydrated: true, isAuthenticated: false, user: null });
      return;
    }
    try {
      const user = await api.auth.me();
      set({ user, isAuthenticated: true, hydrated: true });
    } catch (e) {
      // 401 이면 토큰이 만료·폐기된 것이므로 비로그인 상태로 되돌린다.
      if (e instanceof ApiError && e.status === 401) writeTokens(null);
      set({ hydrated: true, isAuthenticated: false, user: null });
    }
  },

  login: async (email, password) => {
    set({ error: null });
    const user = await api.auth.login(email, password);
    set({ user, isAuthenticated: true, hydrated: true });
  },

  signup: async (email, password, name) => {
    set({ error: null });
    const user = await api.auth.signup(email, password, name);
    set({ user, isAuthenticated: true, hydrated: true });
  },

  logout: async () => {
    try {
      await api.auth.logout();
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },

  refreshUser: async () => {
    if (!get().isAuthenticated) return;
    try {
      const user = await api.auth.me();
      set({ user });
    } catch {
      /* 조회 실패는 화면을 막지 않는다. */
    }
  },

  updateProfile: async (patch) => {
    const user = await api.users.updateProfile(patch);
    set({ user });
  },

  setUser: (user) => set({ user }),
}));
