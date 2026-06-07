"use client";

import { create } from "zustand";
import { MOCK_NOTIFICATIONS } from "@/lib/mock-data";
import type { Notification } from "@/lib/types";

interface NotificationState {
  notifications: Notification[];
  loaded: boolean;
  load: () => void;
  unreadCount: () => number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  loaded: false,
  load: () => {
    if (get().loaded) return;
    set({ notifications: MOCK_NOTIFICATIONS, loaded: true });
  },
  unreadCount: () => get().notifications.filter((n) => !n.read).length,
  markRead: (id) =>
    set({
      notifications: get().notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    }),
  markAllRead: () =>
    set({
      notifications: get().notifications.map((n) => ({ ...n, read: true })),
    }),
  remove: (id) =>
    set({ notifications: get().notifications.filter((n) => n.id !== id) }),
}));
