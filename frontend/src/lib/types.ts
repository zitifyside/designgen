export type Plan = "Free" | "Pro" | "Team" | "Admin";

export type Platform = "Web" | "Mobile" | "Responsive" | "APP";

/**
 * 프로젝트 상태 (기획서 v0.5.0 §4 F-002 상태 전이).
 * - CompletedWarning : Renderer 3회 실패 후 CSS Fallback 으로 완료. 무차감 재시도 1회 제공.
 * - ConceptLocked    : 컨셉 확정 완료. 확정 DS 가 프로젝트의 단일 Token 원천이다.
 */
export type ProjectStatus =
  | "Draft"
  | "InputReady"
  | "Generating"
  | "Completed"
  | "CompletedWarning"
  | "ConceptLocked"
  | "Failed"
  | "Cancelled";

export type ConceptLabel = "A" | "B" | "C";

/** DS 생성 방식 — 단일 DS 통일은 Pro 이상 한정이다. */
export type DsMode = "per_concept" | "unified";

export type GenerationStage =
  | "InputAnalyzer"
  | "ConceptEngine"
  | "LayoutEngine"
  | "Renderer"
  | "Done";

/** 생성 유형 — 전체 생성(4단계) / 화면 추가 생성(경량 2단계). */
export type GenerationKind = "full" | "screen_add";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  plan: Plan;
  credits: number;
  monthlyGenerations: { used: number; limit: number };
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  language: "ko" | "en";
  theme: "light" | "dark" | "system";
  createdAt: string;
  deletionRequestedAt?: string | null;
}

export interface ColorToken {
  primary: string;
  secondary: string;
  neutral: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface TypographyToken {
  fontFamily: string;
  baseSize: number;
  scale: number;
  weights: { regular: number; medium: number; bold: number };
  lineHeight: number;
  letterSpacing: number;
}

export interface SpacingToken {
  baseUnit: number;
}

export interface BorderToken {
  width: number;
  radiusSm: number;
  radiusMd: number;
  radiusLg: number;
  style: "solid" | "dashed" | "dotted";
}

export interface ShadowToken {
  preset: "none" | "sm" | "md" | "lg" | "xl";
}

export interface ComponentToken {
  buttonVariant: "rounded" | "pill" | "square";
  inputStyle: "outlined" | "filled" | "underline";
  cardElevation: "flat" | "raised" | "outlined";
}

export interface DesignTokens {
  color: ColorToken;
  typography: TypographyToken;
  spacing: SpacingToken;
  border: BorderToken;
  shadow: ShadowToken;
  components: ComponentToken;
}

/** DS 컨트롤러의 카테고리 — Free 등급은 color 만 수정 가능하다. */
export type TokenCategory = keyof DesignTokens;

export interface DesignSystem {
  id: string;
  projectId: string;
  conceptLabel: ConceptLabel;
  conceptName: string;
  description: string;
  tokens: DesignTokens;
  isModified: boolean;
  /** 컨셉 확정 후 비확정 컨셉은 읽기 전용 보관된다. */
  isArchived: boolean;
  dsMode: DsMode;
  baseDsId?: string | null;
  overriddenFields?: Record<string, unknown> | null;
}

/** 화면 아키타입 — 요건 입력의 '생성 화면' 프리셋과 동일한 5종. */
export type ScreenKind = "landing" | "login" | "dashboard" | "list" | "detail";

/**
 * 시안 1종. 시안은 서로 다른 화면의 집합이 아니라
 * **동일 화면(screen)의 레이아웃 구조 변형(index)** 이다.
 */
export interface Mockup {
  id: string;
  projectId: string;
  conceptLabel: ConceptLabel;
  index: number;
  screen: string;
  screenTitle: string;
  screenOrder: number;
  kind: ScreenKind;
  title: string;
  variantLabel: string;
  imageUrl?: string | null;
  isFallback: boolean;
  isFavorite: boolean;
}

export interface ScreenInfo {
  screen: string;
  screenTitle: string;
  order: number;
  variantCount: number;
  isPrimary: boolean;
}

/** 컨셉 직접 입력 모드에서 User 가 지정하는 컨셉 방향성. */
export interface ConceptBrief {
  name: string;
  direction: string;
  keywords: string;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  platform: Platform;
  status: ProjectStatus;
  isFavorite: boolean;
  requirementsText: string;
  createdAt: string;
  updatedAt: string;
  thumbnailConcept: ConceptLabel;
  thumbnailMockup: number;
  /** 카드 썸네일용 대표 컬러 [primary, secondary, background, surface]. */
  thumbnailColors: string[];

  conceptCount: number;
  variantCount: number;
  dsMode: DsMode;
  targetScreen: string;
  targetScreenTitle: string;
  /** AI 가 대표 화면을 추론했는지 여부 (미지정 입력 시 true). */
  targetScreenInferred: boolean;
  conceptBriefs?: ConceptBrief[] | null;
  confirmedConceptId?: string | null;
  confirmedConceptLabel?: ConceptLabel | null;
  lockedAt?: string | null;
}

export interface Generation {
  id: string;
  projectId: string;
  kind: GenerationKind;
  status: "Pending" | "Running" | "Done" | "Failed" | "Cancelled";
  stage: GenerationStage;
  progress: number;
  error?: string | null;
  /** CSS Fallback 으로 완료됨 — 무차감 재시도 1회 대상. */
  isWarning: boolean;
  warningReason?: string | null;
  retryOfId?: string | null;
  freeRetryUsed: boolean;
  screen?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export type ExportFormat = "png" | "fig" | "json" | "css";
export type ExportScope = "current" | "concept" | "all";

export interface ExportRecord {
  id: string;
  projectId: string;
  projectName: string;
  format: ExportFormat;
  scope: ExportScope;
  resolution?: "1x" | "2x" | "3x" | null;
  watermark: boolean;
  sizeBytes: number;
  downloadUrl: string;
  createdAt: string;
  expiresAt: string;
}

export interface Notification {
  id: string;
  category: "generation" | "billing" | "system" | "marketing";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  href?: string | null;
}

export type TemplateCategory =
  | "SaaS Dashboard"
  | "Ecommerce"
  | "Mobile App"
  | "Landing Page";

export type TemplateStatus =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "RequestChanges";

export interface Template {
  id: string;
  name: string;
  authorId?: string | null;
  authorName: string;
  category: TemplateCategory;
  price: number;
  rating: number;
  downloads: number;
  description: string;
  conceptName: string;
  status: TemplateStatus;
  createdAt: string;
}

export interface SessionDevice {
  id: string;
  device: string;
  location?: string | null;
  lastActive?: string | null;
  current: boolean;
}

export interface ApiKey {
  id: string;
  label: string;
  prefix: string;
  lastUsedAt?: string | null;
  callCount: number;
  revoked: boolean;
  createdAt: string;
  /** 발급 직후 1회만 내려온다. */
  key?: string;
}

export type TeamRole = "Owner" | "Admin" | "Member";

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  status: "Invited" | "Active";
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  seatLimit: number;
  seatsUsed: number;
  myRole: TeamRole;
  members: TeamMember[];
}

export interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  note?: string | null;
  createdAt: string;
}

export interface Subscription {
  planCode: Plan;
  status: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface PlanInfo {
  code: Plan;
  name: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  monthlyGenerations: number;
  maxConcepts: number;
  maxVariants: number;
  creditUnitCents: number;
}
