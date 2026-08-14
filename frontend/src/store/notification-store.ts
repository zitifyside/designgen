"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/types";

interface NotificationState {
  notifications: Notification[];
  loaded: boolean;
  loading: boolean;
  load: (force?: boolean) => Promise<void>;
  unreadCount: () => number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  loaded: false,
  loading: false,

  load: async (force = false) => {
    if (get().loading) return;
    if (get().loaded && !force) return;
    set({ loading: true });
    try {
      const notifications = await api.notifications.list();
      set({ notifications, loaded: true, loading: false });
    } catch {
      set({ loading: false, loaded: true });
    }
  },

  unreadCount: () => get().notifications.filter((n) => !n.read).length,

  markRead: async (id) => {
    set({
      notifications: get().notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    });
    try {
      await api.notifications.markRead(id);
    } catch {
      /* 낙관적 갱신 — 실패해도 다음 load 에서 정정된다. */
    }
  },

  markAllRead: async () => {
    set({
      notifications: get().notifications.map((n) => ({ ...n, read: true })),
    });
    try {
      await api.notifications.markAllRead();
    } catch {
      /* noop */
    }
  },

  remove: async (id) => {
    set({ notifications: get().notifications.filter((n) => n.id !== id) });
    try {
      await api.notifications.remove(id);
    } catch {
      /* noop */
    }
  },
}));
