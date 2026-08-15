"use client";

/**
 * 백엔드 REST API 클라이언트.
 *
 * 백엔드(FastAPI)는 camelCase 로 직렬화하므로 프론트 타입과 필드명이 1:1 이다.
 * 인증은 JWT 이며, 401 이 오면 refresh 토큰으로 1회 자동 갱신 후 재시도한다.
 */
import type {
  ApiKey,
  ConceptBrief,
  ConceptLabel,
  CreditTransaction,
  DesignSystem,
  DesignTokens,
  DsMode,
  ExportFormat,
  ExportRecord,
  ExportScope,
  FileUploadRecord,
  Generation,
  Mockup,
  Notification,
  PlanInfo,
  Platform,
  Project,
  ScreenInfo,
  SessionDevice,
  Subscription,
  Team,
  TeamRole,
  Template,
  TemplateCategory,
  TemplateStatus,
  User,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

const TOKEN_KEY = "adg.tokens.v1";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function readTokens(): TokenPair | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as TokenPair) : null;
  } catch {
    return null;
  }
}

export function writeTokens(tokens: TokenPair | null) {
  if (typeof window === "undefined") return;
  if (tokens) localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * 세션이 완전히 끊겼을 때(갱신까지 실패) 앱에 알리는 훅.
 * auth-store 가 등록해 로그인 상태를 내리고, AppShell 이 로그인 화면으로 보낸다.
 */
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

function notifyUnauthorized() {
  try {
    unauthorizedHandler?.();
  } catch {
    /* 알림 실패가 원래 오류를 덮지 않게 한다. */
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Query;
  auth?: boolean;
  /** 401 재시도 루프를 막기 위한 내부 플래그. */
  retried?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const base = path.startsWith("http")
    ? path
    : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

async function refreshTokens(): Promise<boolean> {
  const tokens = readTokens();
  if (!tokens?.refreshToken) return false;
  try {
    const res = await fetch(buildUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as TokenPair;
    writeTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    return true;
  } catch {
    return false;
  }
}

export async function request<T>(
  path: string,
  { method = "GET", body, query, auth = true, retried }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const tokens = readTokens();
    if (tokens?.accessToken) {
      headers.Authorization = `Bearer ${tokens.accessToken}`;
    }
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      0,
      "서버에 연결하지 못했습니다. 백엔드가 실행 중인지 확인해 주세요.",
    );
  }

  if (res.status === 401 && auth) {
    if (!retried && (await refreshTokens())) {
      return request<T>(path, { method, body, query, auth, retried: true });
    }
    // 갱신까지 실패하면 세션이 끝난 것이다. 토큰을 지우고 앱에 알려
    // 로그인 화면으로 돌려보낸다 — 백엔드 원문 메시지를 그대로 보여주지 않는다.
    writeTokens(null);
    notifyUnauthorized();
    throw new ApiError(401, "세션이 만료되었습니다. 다시 로그인해 주세요.");
  }

  if (!res.ok) {
    // 응답이 JSON 이 아니면 API 서버가 아니라 정적 호스팅·프록시가 답한 것이다
    // (예: 백엔드 미배포 상태에서 /api/** 가 404 HTML 로 떨어지는 경우).
    // 이때 상태 코드만 보여주면 원인을 알 수 없으므로 무엇이 문제인지 밝힌다.
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      throw new ApiError(
        res.status,
        `API 서버에 연결되지 않았습니다 (${res.status}). ` +
          `요청 주소 ${API_BASE} 에 백엔드가 실행 중인지 확인해 주세요.`,
      );
    }

    let detail = `요청이 실패했습니다 (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
      else if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
        detail = data.detail.map((d: { msg: string }) => d.msg).join(", ");
      }
    } catch {
      /* JSON 이라고 했는데 파싱이 안 되면 기본 메시지를 쓴다. */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** 인증이 필요한 파일 다운로드 — Blob 을 받아 브라우저 저장을 트리거한다. */
export async function downloadFile(path: string, filename: string) {
  const tokens = readTokens();
  const res = await fetch(buildUrl(path), {
    headers: tokens?.accessToken
      ? { Authorization: `Bearer ${tokens.accessToken}` }
      : {},
  });
  if (!res.ok) {
    let detail = `다운로드에 실패했습니다 (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      /* noop */
    }
    throw new ApiError(res.status, detail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * multipart 업로드. Content-Type 을 직접 지정하면 boundary 가 빠지므로
 * 브라우저가 채우도록 두고, 인증 헤더만 붙인다.
 */
export async function uploadMultipart<T>(path: string, files: File[]): Promise<T> {
  const form = new FormData();
  for (const file of files) form.append("files", file, file.name);

  const tokens = readTokens();
  const res = await fetch(buildUrl(path), {
    method: "POST",
    headers: tokens?.accessToken
      ? { Authorization: `Bearer ${tokens.accessToken}` }
      : {},
    body: form,
  });
  if (!res.ok) {
    let detail = `업로드에 실패했습니다 (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      /* 본문이 JSON 이 아니면 기본 메시지를 쓴다. */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

interface AuthResponse extends TokenPair {
  tokenType: string;
  user: User;
}

export const api = {
  auth: {
    async login(email: string, password: string): Promise<User> {
      const data = await request<AuthResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      writeTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      return data.user;
    },
    async signup(email: string, password: string, name: string): Promise<User> {
      const data = await request<AuthResponse>("/auth/signup", {
        method: "POST",
        body: { email, password, name },
        auth: false,
      });
      writeTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      return data.user;
    },
    me: () => request<User>("/auth/me"),
    async logout() {
      const tokens = readTokens();
      try {
        if (tokens?.refreshToken) {
          await request("/auth/logout", {
            method: "POST",
            body: { refreshToken: tokens.refreshToken },
          });
        }
      } finally {
        writeTokens(null);
      }
    },
  },

  users: {
    profile: () => request<User>("/users/profile"),
    updateProfile: (patch: Partial<User>) =>
      request<User>("/users/profile", { method: "PATCH", body: patch }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ detail: string }>("/users/password", {
        method: "POST",
        body: { currentPassword, newPassword },
      }),
    completeOnboarding: () =>
      request<User>("/users/onboarding/complete", { method: "POST" }),
    usage: (granularity: "day" | "week" | "month", periods: number) =>
      request<UsageSummary>(
        `/users/usage?granularity=${granularity}&periods=${periods}`,
      ),
    sessions: () => request<SessionDevice[]>("/users/sessions"),
    revokeSession: (id: string) =>
      request<{ detail: string }>(`/users/sessions/${id}/logout`, {
        method: "POST",
      }),
    revokeOtherSessions: () =>
      request<{ detail: string }>("/users/sessions/logout-all", {
        method: "POST",
      }),
    setup2fa: () =>
      request<{ secret: string; otpauthUri: string; backupCodes: string[] }>(
        "/users/2fa/setup",
        { method: "POST" },
      ),
    verify2fa: (code: string) =>
      request<{ detail: string }>("/users/2fa/verify", {
        method: "POST",
        body: { code },
      }),
    disable2fa: (password: string, code: string) =>
      request<{ detail: string }>("/users/2fa/disable", {
        method: "POST",
        body: { password, code },
      }),
    notificationPrefs: () =>
      request<{ prefs: NotificationPrefs }>("/users/notification-prefs"),
    updateNotificationPrefs: (prefs: NotificationPrefs) =>
      request<{ prefs: NotificationPrefs }>("/users/notification-prefs", {
        method: "PATCH",
        body: { prefs },
      }),
    gdprExport: () => request<Record<string, unknown>>("/users/data-export"),
    requestDeletion: (password: string, reason: string) =>
      request<{ detail: string }>("/users/delete-account", {
        method: "POST",
        body: { password, reason },
      }),
    cancelDeletion: () =>
      request<{ detail: string }>("/users/delete-account/cancel", {
        method: "POST",
      }),
  },

  apiKeys: {
    list: () => request<ApiKey[]>("/users/api-keys"),
    create: (label: string) =>
      request<ApiKey>("/users/api-keys", { method: "POST", body: { label } }),
    revoke: (id: string) =>
      request<{ detail: string }>(`/users/api-keys/${id}`, {
        method: "DELETE",
      }),
  },

  teams: {
    list: () => request<Team[]>("/teams"),
    create: (name: string, description = "") =>
      request<Team>("/teams", { method: "POST", body: { name, description } }),
    invite: (teamId: string, email: string, name: string, role: TeamRole) =>
      request<Team["members"][number]>(`/teams/${teamId}/members`, {
        method: "POST",
        body: { email, name, role },
      }),
    updateRole: (teamId: string, memberId: string, role: TeamRole) =>
      request<Team["members"][number]>(`/teams/${teamId}/members/${memberId}`, {
        method: "PATCH",
        body: { role },
      }),
    removeMember: (teamId: string, memberId: string) =>
      request<{ detail: string }>(`/teams/${teamId}/members/${memberId}`, {
        method: "DELETE",
      }),
  },

  projects: {
    list: (query?: { favorite?: boolean; status?: string; q?: string }) =>
      request<Project[]>("/projects", { query }),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (body: {
      name: string;
      requirementsText: string;
      platform: Platform;
      conceptCount?: number;
      variantCount?: number;
      dsMode?: DsMode;
      targetScreen?: string;
      targetScreenTitle?: string;
      conceptBriefs?: ConceptBrief[];
    }) => request<Project>("/projects", { method: "POST", body }),
    update: (id: string, patch: Partial<Project>) =>
      request<Project>(`/projects/${id}`, { method: "PATCH", body: patch }),
    remove: (id: string) =>
      request<{ detail: string }>(`/projects/${id}`, { method: "DELETE" }),
    toggleFavorite: (id: string) =>
      request<Project>(`/projects/${id}/favorite`, { method: "POST" }),
    duplicate: (id: string) =>
      request<Project>(`/projects/${id}/duplicate`, { method: "POST" }),
    confirmConcept: (id: string, conceptLabel: ConceptLabel) =>
      request<Project>(`/projects/${id}/confirm-concept`, {
        method: "POST",
        body: { conceptLabel },
      }),
    unlockConcept: (id: string) =>
      request<Project>(`/projects/${id}/unlock-concept`, { method: "POST" }),
    screens: (id: string) => request<ScreenInfo[]>(`/projects/${id}/screens`),
    addScreen: (
      id: string,
      body: { screen: string; screenTitle?: string; description?: string },
    ) =>
      request<Generation>(`/projects/${id}/screens`, {
        method: "POST",
        body,
      }),
  },

  files: {
    list: (projectId: string) =>
      request<FileUploadRecord[]>(`/projects/${projectId}/files`),
    upload: (projectId: string, files: File[]) =>
      uploadMultipart<FileUploadRecord[]>(`/projects/${projectId}/files`, files),
    remove: (projectId: string, fileId: string) =>
      request<{ detail: string }>(`/projects/${projectId}/files/${fileId}`, {
        method: "DELETE",
      }),
  },

  generations: {
    start: (
      projectId: string,
      body: {
        requirementsText?: string;
        concepts?: number;
        variants?: number;
        dsMode?: DsMode;
        targetScreen?: string;
        targetScreenTitle?: string;
        conceptBriefs?: ConceptBrief[];
      },
    ) =>
      request<Generation>(`/projects/${projectId}/generate`, {
        method: "POST",
        body,
      }),
    status: (id: string) => request<Generation>(`/generations/${id}/status`),
    cancel: (id: string) =>
      request<{ detail: string }>(`/generations/${id}/cancel`, {
        method: "POST",
      }),
    retry: (id: string) =>
      request<Generation>(`/generations/${id}/retry`, { method: "POST" }),
    history: (projectId: string) =>
      request<Generation[]>(`/projects/${projectId}/generations`),
  },

  designSystems: {
    list: (projectId: string) =>
      request<DesignSystem[]>(`/projects/${projectId}/design-systems`),
    patch: (
      projectId: string,
      conceptLabel: ConceptLabel,
      tokens: DeepPartial<DesignTokens>,
    ) =>
      request<DesignSystem>(
        `/projects/${projectId}/design-systems/${conceptLabel}`,
        { method: "PATCH", body: { tokens } },
      ),
  },

  mockups: {
    list: (projectId: string, query?: { concept?: string; screen?: string }) =>
      request<Mockup[]>(`/projects/${projectId}/mockups`, { query }),
    toggleFavorite: (projectId: string, mockupId: string) =>
      request<Mockup>(`/projects/${projectId}/mockups/${mockupId}/favorite`, {
        method: "POST",
      }),
  },

  exports: {
    create: (
      projectId: string,
      body: {
        format: ExportFormat;
        scope: ExportScope;
        resolution?: "1x" | "2x" | "3x";
        conceptLabel?: ConceptLabel;
        screen?: string;
      },
    ) =>
      request<ExportRecord>(`/projects/${projectId}/exports`, {
        method: "POST",
        body,
      }),
    estimate: (
      projectId: string,
      body: {
        format: ExportFormat;
        scope: ExportScope;
        conceptLabel?: ConceptLabel;
        screen?: string;
      },
    ) =>
      request<ExportEstimate>(`/projects/${projectId}/exports/estimate`, {
        method: "POST",
        body,
      }),
    history: (projectId?: string) =>
      request<ExportRecord[]>("/exports", { query: { projectId } }),
    remove: (id: string) =>
      request<{ detail: string }>(`/exports/${id}`, { method: "DELETE" }),
    tokens: (projectId: string, concept?: ConceptLabel) =>
      request<Record<string, unknown>>(`/projects/${projectId}/tokens.json`, {
        query: { concept },
      }),
  },

  templates: {
    list: (query?: { category?: string; q?: string }) =>
      request<Template[]>("/templates", { query, auth: false }),
    mine: () => request<Template[]>("/templates/mine"),
    get: (id: string) => request<Template>(`/templates/${id}`, { auth: false }),
    create: (body: {
      name: string;
      category: TemplateCategory;
      description?: string;
      conceptName?: string;
      price?: number;
      projectId?: string;
      conceptLabel?: ConceptLabel;
    }) => request<Template>("/templates", { method: "POST", body }),
    reviews: (id: string) =>
      request<TemplateReviews>(`/templates/${id}/reviews`, { auth: false }),
    review: (id: string, rating: number, comment: string) =>
      request<{ detail: string }>(`/templates/${id}/reviews`, {
        method: "POST",
        body: { rating, comment },
      }),
  },

  notifications: {
    list: () => request<Notification[]>("/notifications"),
    markRead: (id: string) =>
      request<{ detail: string }>(`/notifications/${id}/read`, {
        method: "PATCH",
      }),
    markAllRead: () =>
      request<{ detail: string }>("/notifications/read-all", { method: "POST" }),
    remove: (id: string) =>
      request<{ detail: string }>(`/notifications/${id}`, { method: "DELETE" }),
  },

  billing: {
    plans: () => request<PlanInfo[]>("/plans", { auth: false }),
    subscription: () => request<Subscription>("/subscriptions/current"),
    creditBalance: () => request<{ credits: number }>("/credits/balance"),
    creditTransactions: () =>
      request<CreditTransaction[]>("/credits/transactions"),
    // 아래 금전 이동 4종은 Stripe 연동 전이라 서버가 501 을 반환한다.
    purchaseCredits: (quantity: number) =>
      request<{ detail: string }>("/credits/purchase", {
        method: "POST",
        body: { quantity },
      }),
    checkout: (planCode: string, interval: "monthly" | "annual") =>
      request<{ detail: string }>("/subscriptions/checkout", {
        method: "POST",
        body: { planCode, interval },
      }),
    cancelSubscription: () =>
      request<{ detail: string }>("/subscriptions/cancel", {
        method: "POST",
      }),
    requestRefund: (amountCents: number, reason: string) =>
      request<{ detail: string }>("/refunds/request", {
        method: "POST",
        body: { amountCents, reason },
      }),
  },

  system: {
    health: () =>
      request<Record<string, unknown>>("/health", { auth: false }),
    announcements: () =>
      request<AnnouncementRecord[]>("/announcements", { auth: false }),
    feedback: (body: { category: string; title: string; body: string }) =>
      request<{ detail: string }>("/feedback", { method: "POST", body }),
  },

  admin: {
    dashboard: () => request<AdminKpi>("/admin/dashboard"),
    users: (query?: { q?: string; plan?: string; status?: string }) =>
      request<AdminUser[]>("/admin/users", { query }),
    changeTier: (userId: string, plan: string) =>
      request<{ detail: string }>(`/admin/users/${userId}/tier`, {
        method: "PATCH",
        body: { plan },
      }),
    suspend: (userId: string, suspend: boolean, reason: string) =>
      request<{ detail: string }>(`/admin/users/${userId}/suspend`, {
        method: "PATCH",
        body: { suspend, reason },
      }),
    refunds: () => request<AdminRefund[]>("/admin/refunds"),
    resolveRefund: (id: string, approve: boolean, note: string) =>
      request<{ detail: string }>(`/admin/refunds/${id}`, {
        method: "PATCH",
        body: { approve, note },
      }),
    announcements: () => request<AnnouncementRecord[]>("/admin/announcements"),
    createAnnouncement: (body: Partial<AnnouncementRecord>) =>
      request<AnnouncementRecord>("/admin/announcements", {
        method: "POST",
        body,
      }),
    updateAnnouncement: (id: string, body: Partial<AnnouncementRecord>) =>
      request<AnnouncementRecord>(`/admin/announcements/${id}`, {
        method: "PATCH",
        body,
      }),
    deleteAnnouncement: (id: string) =>
      request<{ detail: string }>(`/admin/announcements/${id}`, {
        method: "DELETE",
      }),
    auditLogs: (query?: { severity?: string }) =>
      request<AuditLogRecord[]>("/admin/audit-logs", { query }),
    feedback: (query?: { status?: string }) =>
      request<FeedbackRecord[]>("/admin/feedback", { query }),
    resolveFeedback: (id: string, status: string, adminResponse: string) =>
      request<{ detail: string }>(`/admin/feedback/${id}`, {
        method: "PATCH",
        body: { status, adminResponse },
      }),
    logs: (query?: {
      level?: string;
      kind?: string;
      q?: string;
      userId?: string;
      traceId?: string;
      hours?: number;
      limit?: number;
    }) => request<LogEventRecord[]>("/admin/logs", { query }),
    logStats: (hours: number) =>
      request<LogStats>("/admin/logs/stats", { query: { hours } }),
    userDetail: (userId: string) =>
      request<AdminUserDetail>(`/admin/users/${userId}`),
    unlockUser: (userId: string) =>
      request<{ detail: string }>(`/admin/users/${userId}/unlock`, {
        method: "POST",
      }),
    stats: (rangeDays: number) =>
      request<AdminStats>("/admin/stats", { query: { range: rangeDays } }),
    health: () => request<HealthComponent[]>("/admin/health"),
    templates: (query?: { status?: TemplateStatus }) =>
      request<Template[]>("/admin/templates", { query }),
    moderateTemplate: (id: string, status: TemplateStatus, reason = "") =>
      request<Template>(`/admin/templates/${id}`, {
        method: "PATCH",
        body: { status, reason },
      }),
  },
};

export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export interface AdminKpi {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalProjects: number;
  generationsTotal: number;
  pendingRefunds: number;
  openFeedback: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  plan: string;
  status: string;
  generations: number;
  joinedAt: string;
  lastActiveAt?: string | null;
}

export interface AdminRefund {
  id: string;
  userId?: string;
  amountCents: number;
  reason: string;
  status: string;
  createdAt: string;
}

export interface ExportEstimate {
  format: string;
  scope: string;
  mockupCount: number;
  sizeBytes: number;
  watermark: boolean;
  warnings: string[];
}

export interface TemplateReviews {
  average: number;
  total: number;
  distribution: Record<string, number>;
  reviews: Array<{
    id: string;
    authorName: string;
    rating: number;
    comment: string;
    createdAt: string;
  }>;
}

export interface UsageSummary {
  granularity: "day" | "week" | "month";
  buckets: Array<{ label: string; generations: number; screenAdds: number }>;
  totalGenerations: number;
  totalScreenAdds: number;
  failures: number;
  warnings: number;
  exportTotal: number;
  exportFormats: Array<{ format: string; count: number }>;
  projectCount: number;
  thisMonth: number;
  lastMonth: number;
}

export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  audience: string[];
  priority: string;
  status: string;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface AuditLogRecord {
  id: string;
  actor: string;
  action: string;
  target: string;
  ip?: string | null;
  severity: string;
  at: string;
}

export interface AdminStatsDailyPoint {
  date: string;
  generations: number;
  failures: number;
  aiCostCents: number;
  signups: number;
}

export interface AdminStats {
  rangeDays: number;
  daily: AdminStatsDailyPoint[];
  planDistribution: Record<string, number>;
  mrrCents: number;
  paidRatio: number;
  arpuCents: number;
  errorRate: number;
  aiCostTotalCents: number;
  paymentsRecorded: number;
}

export interface HealthComponent {
  name: string;
  status: "operational" | "degraded" | "down" | "not_configured";
  detail: string;
  latencyMs?: number | null;
}

/** 카테고리 → 채널별 알림 수신 여부. */
export type NotificationPrefs = Record<
  string,
  { inApp: boolean; email: boolean }
>;

export interface LogEventRecord {
  id: string;
  eventId: string;
  occurredAt: string;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  tier: string;
  kind: string;
  message?: string | null;
  traceId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  source?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  payload?: Record<string, unknown> | null;
  stack?: string | null;
}

export interface LogStats {
  rangeHours: number;
  total: number;
  byLevel: Record<string, number>;
  topKinds: Array<{ kind: string; count: number }>;
  errorRate: number;
  forwarder: {
    enabled: boolean;
    mode: string;
    projectId: string;
    environment: string;
    buffered: number;
    dropped: number;
    circuitOpen: boolean;
  };
}

export interface AdminUserDetail {
  id: string;
  email: string;
  name: string;
  plan: string;
  status: string;
  credits: number;
  monthlyUsed: number;
  monthlyLimit: number;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  isAdmin: boolean;
  joinedAt: string;
  lastActiveAt?: string | null;
  lockedUntil?: string | null;
  failedLoginAttempts: number;
  deletionRequestedAt?: string | null;
  subscription?: { planCode: string; status: string; currentPeriodEnd?: string | null } | null;
  projects: Array<{ id: string; name: string; status: string; platform: string; updatedAt?: string | null }>;
  generations: { total: number; done: number; failed: number; warning: number };
  recentActivity: LogEventRecord[];
  sessions: number;
  apiKeys: number;
}

export interface FeedbackRecord {
  id: string;
  userEmail: string;
  category: string;
  title: string;
  body: string;
  status: string;
  adminResponse?: string | null;
  createdAt: string;
}
