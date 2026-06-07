import type {
  ApiKey,
  DesignSystem,
  ExportJob,
  Mockup,
  Notification,
  Project,
  SessionDevice,
  Template,
  User,
} from "./types";

export const MOCK_USER: User = {
  id: "u_001",
  email: "demo@designgenerator.io",
  name: "안승준",
  plan: "Pro",
  credits: 78,
  monthlyGenerations: { used: 12, limit: 30 },
  emailVerified: true,
  twoFactorEnabled: false,
  language: "ko",
  theme: "system",
  createdAt: "2026-04-12T09:30:00+09:00",
};

const PROJECTS_RAW: Array<Omit<Project, "ownerId">> = [
  {
    id: "p_001",
    name: "투자자 미팅용 SaaS 대시보드",
    description: "Series A 피칭용 분석 대시보드 컨셉 3종",
    platform: "Web",
    status: "Completed",
    isFavorite: true,
    requirementsText:
      "B2B SaaS 분석 대시보드. 지표 카드 4개, 시계열 차트 2개, 우측 활동 피드. 톤은 차분하고 신뢰감 있게.",
    createdAt: "2026-05-21T11:00:00+09:00",
    updatedAt: "2026-06-05T09:20:00+09:00",
    thumbnailConcept: "A",
    thumbnailMockup: 1,
  },
  {
    id: "p_002",
    name: "프리미엄 이커머스 랜딩",
    description: "Hero·Feature·Testimonial·Pricing 4섹션",
    platform: "Web",
    status: "Completed",
    isFavorite: true,
    requirementsText:
      "프리미엄 가전 이커머스. 시각적으로 강한 Hero, 큰 타이포그래피, Pricing 3 tier.",
    createdAt: "2026-05-14T15:42:00+09:00",
    updatedAt: "2026-06-03T18:10:00+09:00",
    thumbnailConcept: "B",
    thumbnailMockup: 0,
  },
  {
    id: "p_003",
    name: "스타트업 채용 페이지",
    description: "팀 컬처·포지션·복지 3섹션",
    platform: "Web",
    status: "Completed",
    isFavorite: false,
    requirementsText:
      "AI 스타트업 채용 페이지. 사람 중심 따뜻한 무드. 포지션 카드 6개.",
    createdAt: "2026-05-02T10:00:00+09:00",
    updatedAt: "2026-05-30T13:25:00+09:00",
    thumbnailConcept: "C",
    thumbnailMockup: 2,
  },
  {
    id: "p_004",
    name: "헬스케어 모바일 앱",
    description: "iOS·Android 통합 UI 시안",
    platform: "Mobile",
    status: "Completed",
    isFavorite: false,
    requirementsText: "수면·운동 트래킹 모바일 앱. 친근하고 부드러운 무드.",
    createdAt: "2026-04-28T09:00:00+09:00",
    updatedAt: "2026-05-18T11:30:00+09:00",
    thumbnailConcept: "A",
    thumbnailMockup: 3,
  },
  {
    id: "p_005",
    name: "Notion 스타일 문서 협업",
    description: "다크 모드 기본, 키보드 단축키 강조",
    platform: "Web",
    status: "Draft",
    isFavorite: false,
    requirementsText: "팀 문서 협업 도구. 다크 모드 우선.",
    createdAt: "2026-06-02T17:00:00+09:00",
    updatedAt: "2026-06-02T17:00:00+09:00",
    thumbnailConcept: "B",
    thumbnailMockup: 1,
  },
  {
    id: "p_006",
    name: "EdTech 학습 플랫폼",
    description: "강의 카드 그리드 + 진도 추적",
    platform: "Web",
    status: "Completed",
    isFavorite: false,
    requirementsText: "초·중·고 학생 대상 학습 플랫폼. 활기차고 명확한 컬러.",
    createdAt: "2026-04-12T13:20:00+09:00",
    updatedAt: "2026-05-01T16:00:00+09:00",
    thumbnailConcept: "C",
    thumbnailMockup: 4,
  },
];

export const MOCK_PROJECTS: Project[] = PROJECTS_RAW.map((p) => ({
  ...p,
  ownerId: MOCK_USER.id,
}));

const conceptA = (projectId: string): DesignSystem => ({
  id: `ds_${projectId}_A`,
  projectId,
  conceptLabel: "A",
  conceptName: "Modern Minimal",
  description:
    "낮은 채도·넓은 여백·중성 컬러 중심. 차분하고 신뢰감 있는 무드.",
  isModified: false,
  tokens: {
    color: {
      primary: "#2563EB",
      secondary: "#0EA5E9",
      neutral: "#64748B",
      background: "#F8FAFC",
      surface: "#FFFFFF",
      text: "#0F172A",
      textMuted: "#64748B",
      success: "#16A34A",
      warning: "#D97706",
      error: "#DC2626",
      info: "#2563EB",
    },
    typography: {
      fontFamily: "Inter",
      baseSize: 14,
      scale: 1.25,
      weights: { regular: 400, medium: 500, bold: 700 },
      lineHeight: 1.55,
      letterSpacing: -0.005,
    },
    spacing: { baseUnit: 8 },
    border: { width: 1, radiusSm: 6, radiusMd: 10, radiusLg: 16, style: "solid" },
    shadow: { preset: "sm" },
    components: {
      buttonVariant: "rounded",
      inputStyle: "outlined",
      cardElevation: "outlined",
    },
  },
});

const conceptB = (projectId: string): DesignSystem => ({
  id: `ds_${projectId}_B`,
  projectId,
  conceptLabel: "B",
  conceptName: "Bold Vibrant",
  description:
    "강한 채도·굵은 타이포·진한 그림자. 임팩트 있는 첫인상 중심.",
  isModified: false,
  tokens: {
    color: {
      primary: "#F97316",
      secondary: "#9333EA",
      neutral: "#111827",
      background: "#0F172A",
      surface: "#1E293B",
      text: "#F8FAFC",
      textMuted: "#94A3B8",
      success: "#22D3EE",
      warning: "#FACC15",
      error: "#F43F5E",
      info: "#A855F7",
    },
    typography: {
      fontFamily: "Inter",
      baseSize: 16,
      scale: 1.333,
      weights: { regular: 500, medium: 700, bold: 900 },
      lineHeight: 1.4,
      letterSpacing: -0.015,
    },
    spacing: { baseUnit: 12 },
    border: { width: 2, radiusSm: 4, radiusMd: 8, radiusLg: 12, style: "solid" },
    shadow: { preset: "lg" },
    components: {
      buttonVariant: "square",
      inputStyle: "filled",
      cardElevation: "raised",
    },
  },
});

const conceptC = (projectId: string): DesignSystem => ({
  id: `ds_${projectId}_C`,
  projectId,
  conceptLabel: "C",
  conceptName: "Soft Pastel",
  description: "파스텔 컬러·둥근 모서리·따뜻한 무드. 친근하고 부드럽게.",
  isModified: false,
  tokens: {
    color: {
      primary: "#EC4899",
      secondary: "#A78BFA",
      neutral: "#78716C",
      background: "#FFF7ED",
      surface: "#FFFFFF",
      text: "#44403C",
      textMuted: "#A8A29E",
      success: "#86EFAC",
      warning: "#FDE68A",
      error: "#FCA5A5",
      info: "#BFDBFE",
    },
    typography: {
      fontFamily: "Inter",
      baseSize: 15,
      scale: 1.2,
      weights: { regular: 400, medium: 600, bold: 700 },
      lineHeight: 1.65,
      letterSpacing: 0,
    },
    spacing: { baseUnit: 10 },
    border: { width: 1, radiusSm: 12, radiusMd: 20, radiusLg: 28, style: "solid" },
    shadow: { preset: "md" },
    components: {
      buttonVariant: "pill",
      inputStyle: "filled",
      cardElevation: "raised",
    },
  },
});

export const MOCK_DESIGN_SYSTEMS = (projectId: string): DesignSystem[] => [
  conceptA(projectId),
  conceptB(projectId),
  conceptC(projectId),
];

const MOCKUP_KINDS: Array<{ kind: Mockup["kind"]; title: string }> = [
  { kind: "landing", title: "랜딩 페이지" },
  { kind: "dashboard", title: "대시보드" },
  { kind: "pricing", title: "Pricing" },
  { kind: "signup", title: "회원가입" },
  { kind: "settings", title: "설정" },
];

export const MOCK_MOCKUPS = (projectId: string): Mockup[] => {
  const out: Mockup[] = [];
  (["A", "B", "C"] as const).forEach((label) => {
    MOCKUP_KINDS.forEach((m, idx) => {
      out.push({
        id: `mk_${projectId}_${label}_${idx}`,
        projectId,
        conceptLabel: label,
        index: idx,
        kind: m.kind,
        title: m.title,
      });
    });
  });
  return out;
};

export const MOCK_EXPORTS: ExportJob[] = [
  {
    id: "ex_001",
    projectId: "p_001",
    projectName: "투자자 미팅용 SaaS 대시보드",
    format: "png",
    scope: "concept",
    resolution: "2x",
    sizeBytes: 4_312_000,
    createdAt: "2026-06-06T15:20:00+09:00",
    expiresAt: "2026-06-13T15:20:00+09:00",
  },
  {
    id: "ex_002",
    projectId: "p_002",
    projectName: "프리미엄 이커머스 랜딩",
    format: "fig",
    scope: "all",
    sizeBytes: 12_840_000,
    createdAt: "2026-06-04T11:05:00+09:00",
    expiresAt: "2026-06-11T11:05:00+09:00",
  },
  {
    id: "ex_003",
    projectId: "p_001",
    projectName: "투자자 미팅용 SaaS 대시보드",
    format: "json",
    scope: "concept",
    sizeBytes: 184_000,
    createdAt: "2026-06-02T09:42:00+09:00",
    expiresAt: "2026-06-09T09:42:00+09:00",
  },
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "n_001",
    category: "generation",
    title: "시안 생성 완료",
    body: "프로젝트 '프리미엄 이커머스 랜딩' 의 시안 15종이 준비되었다.",
    read: false,
    createdAt: "2026-06-07T18:32:00+09:00",
    href: "/projects/p_002",
  },
  {
    id: "n_002",
    category: "billing",
    title: "월간 결제 완료",
    body: "Pro 구독 ₩26,000 이 정상 결제되었다. 영수증을 마이페이지에서 확인 가능.",
    read: false,
    createdAt: "2026-06-05T08:00:00+09:00",
    href: "/me/subscription",
  },
  {
    id: "n_003",
    category: "system",
    title: "공지: v1.0 GA 출시 예정",
    body: "2026-09-05 정식 출시 예정. 베타 사용자에게는 첫 달 50% 할인 쿠폰을 제공한다.",
    read: true,
    createdAt: "2026-06-01T10:00:00+09:00",
  },
  {
    id: "n_004",
    category: "generation",
    title: "AI 생성 실패 후 Fallback 적용",
    body: "프로젝트 'EdTech 학습 플랫폼' 의 Renderer 단계에서 일부 시안을 CSS 렌더링으로 대체했다.",
    read: true,
    createdAt: "2026-05-30T16:14:00+09:00",
    href: "/projects/p_006",
  },
];

export const MOCK_TEMPLATES: Template[] = [
  {
    id: "tmpl_001",
    name: "SaaS Analytics Pro",
    authorName: "Studio Nine",
    category: "SaaS Dashboard",
    price: 19,
    rating: 4.8,
    downloads: 1242,
    description:
      "차트·메트릭·필터 중심의 분석 대시보드 프리셋. Light·Dark 동시 지원.",
    conceptName: "Modern Minimal",
  },
  {
    id: "tmpl_002",
    name: "Bold Commerce",
    authorName: "Hue Lab",
    category: "Ecommerce",
    price: 29,
    rating: 4.6,
    downloads: 824,
    description:
      "강한 채도와 굵은 타이포의 D2C 이커머스 프리셋. 모바일 우선 설계.",
    conceptName: "Bold Vibrant",
  },
  {
    id: "tmpl_003",
    name: "Pastel Care",
    authorName: "Soft Type",
    category: "Mobile App",
    price: 0,
    rating: 4.4,
    downloads: 3120,
    description: "헬스케어·웰니스 모바일 앱용 파스텔 프리셋. 무료.",
    conceptName: "Soft Pastel",
  },
  {
    id: "tmpl_004",
    name: "Launch Landing",
    authorName: "Pixel Goods",
    category: "Landing Page",
    price: 12,
    rating: 4.9,
    downloads: 2410,
    description: "SaaS 출시용 단일 페이지 랜딩 프리셋. Hero·Pricing·CTA 포함.",
    conceptName: "Modern Minimal",
  },
];

export const MOCK_API_KEYS: ApiKey[] = [
  {
    id: "key_001",
    name: "Local Dev",
    prefix: "adg_live_a12f",
    lastUsedAt: "2026-06-07T09:14:00+09:00",
    createdAt: "2026-04-18T10:00:00+09:00",
  },
  {
    id: "key_002",
    name: "MCP — Cursor",
    prefix: "adg_live_88c0",
    lastUsedAt: "2026-06-06T22:01:00+09:00",
    createdAt: "2026-05-02T17:30:00+09:00",
  },
];

export const MOCK_SESSIONS: SessionDevice[] = [
  {
    id: "sess_001",
    device: "Chrome 126 · macOS",
    location: "Seoul, KR",
    lastActive: "2026-06-08T10:02:00+09:00",
    current: true,
  },
  {
    id: "sess_002",
    device: "Safari 17 · iPhone",
    location: "Seoul, KR",
    lastActive: "2026-06-07T21:48:00+09:00",
    current: false,
  },
  {
    id: "sess_003",
    device: "Figma Plugin · Desktop",
    location: "Seoul, KR",
    lastActive: "2026-06-05T15:10:00+09:00",
    current: false,
  },
];
