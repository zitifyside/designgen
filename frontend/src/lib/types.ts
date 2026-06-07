export type Plan = "Free" | "Pro" | "Team" | "Admin";

export type Platform = "Web" | "Mobile" | "Responsive" | "APP";

export type ProjectStatus =
  | "Draft"
  | "InputReady"
  | "Generating"
  | "Completed"
  | "Failed"
  | "Cancelled";

export type ConceptLabel = "A" | "B" | "C";

export type GenerationStage =
  | "InputAnalyzer"
  | "ConceptEngine"
  | "LayoutEngine"
  | "Renderer"
  | "Done";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  plan: Plan;
  credits: number;
  monthlyGenerations: { used: number; limit: number };
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  language: "ko" | "en";
  theme: "light" | "dark" | "system";
  createdAt: string;
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

export interface DesignSystem {
  id: string;
  projectId: string;
  conceptLabel: ConceptLabel;
  conceptName: string;
  description: string;
  tokens: DesignTokens;
  isModified: boolean;
}

export type MockupKind =
  | "landing"
  | "dashboard"
  | "pricing"
  | "signup"
  | "settings";

export interface Mockup {
  id: string;
  projectId: string;
  conceptLabel: ConceptLabel;
  index: number;
  kind: MockupKind;
  title: string;
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
}

export interface Generation {
  id: string;
  projectId: string;
  status: "Pending" | "Running" | "Done" | "Failed";
  stage: GenerationStage;
  progress: number;
  startedAt: string;
}

export interface ExportJob {
  id: string;
  projectId: string;
  projectName: string;
  format: "png" | "fig" | "json" | "css";
  scope: "current" | "concept" | "all";
  resolution?: "1x" | "2x" | "3x";
  sizeBytes: number;
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
  href?: string;
}

export interface Template {
  id: string;
  name: string;
  authorName: string;
  category:
    | "SaaS Dashboard"
    | "Ecommerce"
    | "Mobile App"
    | "Landing Page";
  price: number;
  rating: number;
  downloads: number;
  description: string;
  conceptName: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string;
  createdAt: string;
}

export interface SessionDevice {
  id: string;
  device: string;
  location: string;
  lastActive: string;
  current: boolean;
}
