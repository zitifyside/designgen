import type { Plan } from "./types";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  plan: Plan;
  status: "Active" | "Suspended" | "Deleted";
  monthlySpend: number;
  generations: number;
  joinedAt: string;
  lastActiveAt: string;
}

export interface RefundRequest {
  id: string;
  userEmail: string;
  amount: number;
  reason: string;
  requestedAt: string;
  status: "Pending" | "Approved" | "Rejected";
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: Array<"all" | "free" | "pro" | "team">;
  priority: "low" | "normal" | "high";
  startsAt: string;
  endsAt?: string;
  status: "Draft" | "Scheduled" | "Published" | "Archived";
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  target: string;
  ip: string;
  at: string;
  severity: "info" | "warning" | "critical";
}

export interface FeedbackItem {
  id: string;
  userEmail: string;
  category: "bug" | "feature" | "feedback";
  title: string;
  body: string;
  status: "new" | "in_review" | "resolved" | "closed";
  createdAt: string;
}

export interface TemplateReview {
  id: string;
  templateName: string;
  authorEmail: string;
  category: string;
  price: number;
  submittedAt: string;
  status: "Pending" | "Approved" | "Rejected" | "RequestChanges";
}

export interface HealthStatus {
  service: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  lastChecked: string;
}

export const ADMIN_USERS: AdminUser[] = [
  {
    id: "u_001",
    email: "demo@designgenerator.io",
    name: "안승준",
    plan: "Pro",
    status: "Active",
    monthlySpend: 26000,
    generations: 12,
    joinedAt: "2026-04-12",
    lastActiveAt: "2026-06-08T10:02",
  },
  {
    id: "u_002",
    email: "minsu@startup.kr",
    name: "김민수",
    plan: "Free",
    status: "Active",
    monthlySpend: 0,
    generations: 3,
    joinedAt: "2026-05-21",
    lastActiveAt: "2026-06-07T22:15",
  },
  {
    id: "u_003",
    email: "jieun@design.co",
    name: "이지은",
    plan: "Pro",
    status: "Active",
    monthlySpend: 26000,
    generations: 28,
    joinedAt: "2026-04-30",
    lastActiveAt: "2026-06-08T09:45",
  },
  {
    id: "u_004",
    email: "jungho.dev@agency.com",
    name: "박정호",
    plan: "Team",
    status: "Active",
    monthlySpend: 67000,
    generations: 142,
    joinedAt: "2026-04-18",
    lastActiveAt: "2026-06-08T08:20",
  },
  {
    id: "u_005",
    email: "fraud@spam.xyz",
    name: "Suspicious User",
    plan: "Free",
    status: "Suspended",
    monthlySpend: 0,
    generations: 87,
    joinedAt: "2026-06-01",
    lastActiveAt: "2026-06-03T03:14",
  },
  {
    id: "u_006",
    email: "seoyeon@bigco.com",
    name: "최서연",
    plan: "Team",
    status: "Active",
    monthlySpend: 67000,
    generations: 89,
    joinedAt: "2026-05-02",
    lastActiveAt: "2026-06-07T18:32",
  },
  {
    id: "u_007",
    email: "hyojin@solo.io",
    name: "한효진",
    plan: "Pro",
    status: "Active",
    monthlySpend: 26000,
    generations: 14,
    joinedAt: "2026-05-15",
    lastActiveAt: "2026-06-06T21:00",
  },
  {
    id: "u_008",
    email: "deleted@old.com",
    name: "(삭제 예정)",
    plan: "Free",
    status: "Deleted",
    monthlySpend: 0,
    generations: 0,
    joinedAt: "2026-04-04",
    lastActiveAt: "2026-05-08T12:10",
  },
];

export const ADMIN_REFUNDS: RefundRequest[] = [
  {
    id: "rf_001",
    userEmail: "minsu@startup.kr",
    amount: 26000,
    reason: "사용량 부족, 기대와 다름",
    requestedAt: "2026-06-07T11:20",
    status: "Pending",
  },
  {
    id: "rf_002",
    userEmail: "jieun@design.co",
    amount: 5000,
    reason: "크레딧 충전 중복 결제",
    requestedAt: "2026-06-06T16:42",
    status: "Pending",
  },
  {
    id: "rf_003",
    userEmail: "ex@previous.com",
    amount: 26000,
    reason: "잘못 결제",
    requestedAt: "2026-06-04T09:15",
    status: "Approved",
  },
];

export const ADMIN_ANNOUNCEMENTS: Announcement[] = [
  {
    id: "an_001",
    title: "v1.0 GA 출시 안내",
    body: "2026-09-05 정식 출시 예정. 베타 사용자에게 첫 달 50% 할인 쿠폰 제공.",
    audience: ["all"],
    priority: "high",
    startsAt: "2026-06-01T00:00",
    status: "Published",
  },
  {
    id: "an_002",
    title: "MCP Server 정기 점검",
    body: "2026-06-15 02:00~04:00 KST MCP Server 정기 점검. 인앱 호출에는 영향 없음.",
    audience: ["pro", "team"],
    priority: "normal",
    startsAt: "2026-06-10T00:00",
    endsAt: "2026-06-15T04:00",
    status: "Scheduled",
  },
  {
    id: "an_003",
    title: "이용약관 개정 안내",
    body: "AI 학습 미사용 조항 명시. 2026-07-01 시행.",
    audience: ["all"],
    priority: "normal",
    startsAt: "2026-05-20T00:00",
    status: "Published",
  },
];

export const ADMIN_AUDIT_LOGS: AuditLog[] = [
  {
    id: "al_001",
    actor: "admin@designgenerator.io",
    action: "USER_SUSPEND",
    target: "u_005 fraud@spam.xyz",
    ip: "10.0.0.4",
    at: "2026-06-03T08:12",
    severity: "warning",
  },
  {
    id: "al_002",
    actor: "admin@designgenerator.io",
    action: "REFUND_APPROVE",
    target: "rf_003 (₩26,000)",
    ip: "10.0.0.4",
    at: "2026-06-04T11:05",
    severity: "info",
  },
  {
    id: "al_003",
    actor: "system",
    action: "PAYMENT_FAILED",
    target: "minsu@startup.kr · invoice_2401",
    ip: "—",
    at: "2026-06-05T02:30",
    severity: "warning",
  },
  {
    id: "al_004",
    actor: "system",
    action: "AI_COST_THRESHOLD",
    target: "일일 한도 ₩500,000 초과 임박 (₩468,200)",
    ip: "—",
    at: "2026-06-07T22:00",
    severity: "critical",
  },
  {
    id: "al_005",
    actor: "demo@designgenerator.io",
    action: "PASSWORD_CHANGE",
    target: "u_001",
    ip: "121.131.x.x",
    at: "2026-04-12T09:35",
    severity: "info",
  },
];

export const ADMIN_FEEDBACK: FeedbackItem[] = [
  {
    id: "fb_001",
    userEmail: "jieun@design.co",
    category: "bug",
    title: "Compare 모드에서 컨셉 B 의 폰트가 가끔 깨진다",
    body: "Firefox 에서만 재현. Chrome 정상.",
    status: "in_review",
    createdAt: "2026-06-06T14:00",
  },
  {
    id: "fb_002",
    userEmail: "jungho.dev@agency.com",
    category: "feature",
    title: "Cursor 외 Windsurf 도 MCP 인증 가이드 필요",
    body: "온보딩 문서에 Windsurf 가 빠져 있다.",
    status: "new",
    createdAt: "2026-06-07T09:42",
  },
  {
    id: "fb_003",
    userEmail: "minsu@startup.kr",
    category: "feedback",
    title: "Free 플랜 한도가 너무 빠듯하다",
    body: "월 3회는 평가하기 부족. 5회 정도가 적당.",
    status: "resolved",
    createdAt: "2026-06-01T11:15",
  },
];

export const ADMIN_TEMPLATE_REVIEWS: TemplateReview[] = [
  {
    id: "tr_001",
    templateName: "Lux Banking UI",
    authorEmail: "jieun@design.co",
    category: "Fintech",
    price: 39,
    submittedAt: "2026-06-06T10:00",
    status: "Pending",
  },
  {
    id: "tr_002",
    templateName: "Outdoor Marketplace",
    authorEmail: "studio@nine.io",
    category: "Ecommerce",
    price: 25,
    submittedAt: "2026-06-04T18:20",
    status: "Pending",
  },
  {
    id: "tr_003",
    templateName: "Generic Dashboard (재심사)",
    authorEmail: "newbie@test.com",
    category: "SaaS Dashboard",
    price: 15,
    submittedAt: "2026-06-02T12:00",
    status: "RequestChanges",
  },
];

export const ADMIN_HEALTH: HealthStatus[] = [
  { service: "Web App", status: "healthy", latencyMs: 42, lastChecked: "방금 전" },
  { service: "API Server", status: "healthy", latencyMs: 88, lastChecked: "방금 전" },
  { service: "PostgreSQL", status: "healthy", latencyMs: 12, lastChecked: "30초 전" },
  { service: "Redis", status: "healthy", latencyMs: 4, lastChecked: "30초 전" },
  { service: "Anthropic Claude", status: "healthy", latencyMs: 1180, lastChecked: "1분 전" },
  { service: "Image Gen API", status: "degraded", latencyMs: 4220, lastChecked: "1분 전" },
  { service: "Stripe", status: "healthy", latencyMs: 220, lastChecked: "1분 전" },
  { service: "S3", status: "healthy", latencyMs: 65, lastChecked: "30초 전" },
  { service: "MCP Server", status: "healthy", latencyMs: 96, lastChecked: "방금 전" },
];

export const ADMIN_KPI = {
  mau: 3142,
  dau: 412,
  signupsToday: 38,
  generationsToday: 612,
  exportsToday: 188,
  mrr: 57_120_000, // 원
  paidRatio: 0.114,
  errorRate: 0.018, // 1.8%
  aiCostMtd: 4_120_000, // 원
};

export const ADMIN_REVENUE_30D = [
  1.62, 1.78, 1.91, 1.82, 1.98, 2.04, 1.74, 1.88, 2.12, 2.05, 1.96, 2.18, 2.04,
  2.31, 2.42, 2.28, 2.51, 2.34, 2.18, 2.06, 1.94, 2.21, 2.45, 2.38, 2.62, 2.71,
  2.58, 2.44, 2.66, 2.81,
];

export const ADMIN_AI_COST_30D = [
  142, 136, 158, 148, 162, 174, 122, 138, 169, 158, 152, 174, 162, 183, 192,
  186, 199, 184, 175, 168, 152, 178, 196, 188, 209, 218, 204, 196, 215, 228,
];

export const ADMIN_ERROR_RATE_30D = [
  1.2, 1.4, 1.1, 1.3, 1.5, 1.2, 1.0, 1.1, 1.3, 1.6, 1.4, 1.2, 1.1, 1.3, 1.5,
  1.7, 1.4, 1.2, 1.5, 1.8, 2.1, 1.9, 1.6, 1.4, 1.5, 1.7, 1.9, 1.6, 1.8, 1.8,
];
