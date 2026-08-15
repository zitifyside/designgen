"use client";

import { CSSProperties } from "react";
import type { DesignTokens, Mockup } from "@/lib/types";

/**
 * 시안 렌더러.
 *
 * 시안은 서로 다른 화면의 집합이 아니라 **동일 화면(kind)의 레이아웃 구조 변형**
 * 이다 (기획서 v0.5.0 §4 F-002). 따라서 화면 아키타입은 `mockup.kind` 로 고정되고,
 * `mockup.index` 가 그 화면 안에서의 구조 변형을 결정한다.
 *
 * 렌더링은 v1.0 확정대로 React + CSS 변수 방식이다 (Fabric.js·Konva.js 는 v2.0 검토).
 */

export interface ElementSelection {
  type: string;
  path: string[];
  tokenRefs: { label: string; token: string; value: string }[];
}

/** 클릭 지점의 조상 사슬 — 바깥에서 안쪽 순서다. */
export type SelectionChain = ElementSelection[];

/** DOM 조상에서 선택 사슬을 읽는다.
 *
 * 렌더 트리를 다시 짜지 않고 계층을 얻으려면 이 방법이 가장 얕게 끝난다 —
 * 각 선택 가능 요소가 자기 정보를 data 속성에 적어 두고, 클릭 시 위로 훑는다. */
function chainFrom(node: HTMLElement | null): SelectionChain {
  const chain: SelectionChain = [];
  let cur: HTMLElement | null = node;
  while (cur) {
    const raw = cur.dataset.sel;
    if (raw) {
      try {
        chain.unshift(JSON.parse(raw) as ElementSelection);
      } catch {
        /* 형식이 깨진 노드는 건너뛴다 */
      }
    }
    cur = cur.parentElement;
  }
  return chain;
}

interface Props {
  mockup: Mockup;
  projectName: string;
  tokens: DesignTokens;
  onSelect?: (chain: SelectionChain) => void;
  /** 더블클릭 — 선택 사슬에서 한 단계 안으로. */
  onEnterChild?: () => void;
  /** Image Gen 실패로 CSS Fallback 된 시안 — 콘텐츠 슬롯을 단색으로 채운다. */
  fallback?: boolean;
}

export function MockupRenderer({
  mockup,
  projectName,
  tokens,
  onSelect,
  onEnterChild,
  fallback,
}: Props) {
  const ctx: RenderContext = {
    variant: mockup.index,
    projectName,
    tokens,
    onSelect,
    onEnterChild,
    fallback: fallback ?? mockup.isFallback,
  };

  switch (mockup.kind) {
    case "dashboard":
      return <DashboardScreen ctx={ctx} />;
    case "login":
      return <LoginScreen ctx={ctx} />;
    case "list":
      return <ListScreen ctx={ctx} />;
    case "detail":
      return <DetailScreen ctx={ctx} />;
    case "landing":
    default:
      return <LandingScreen ctx={ctx} />;
  }
}

interface RenderContext {
  variant: number;
  projectName: string;
  tokens: DesignTokens;
  onSelect?: (chain: SelectionChain) => void;
  onEnterChild?: () => void;
  fallback: boolean;
}

// ── 공통 스타일 ────────────────────────────────────────────────

const surface: CSSProperties = {
  background: "var(--ds-color-surface)",
  color: "var(--ds-color-text)",
  fontFamily: "var(--ds-font-family)",
  fontSize: "var(--ds-font-size-base)",
  lineHeight: "var(--ds-line-height)" as unknown as number,
  letterSpacing: "var(--ds-letter-spacing)",
};

const page: CSSProperties = {
  ...surface,
  background: "var(--ds-color-bg)",
  minHeight: "100%",
};

const btnPrimary: CSSProperties = {
  background: "var(--ds-color-primary)",
  color: "white",
  padding: "var(--ds-space-3) var(--ds-space-5)",
  borderRadius: "var(--ds-radius-button)",
  fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
  boxShadow: "var(--ds-shadow)",
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--ds-space-2)",
  cursor: "pointer",
  border: "none",
};

const btnSecondary: CSSProperties = {
  background: "transparent",
  color: "var(--ds-color-text)",
  padding: "var(--ds-space-3) var(--ds-space-5)",
  borderRadius: "var(--ds-radius-button)",
  fontWeight: "var(--ds-font-weight-medium)" as unknown as number,
  border: "var(--ds-border-width) var(--ds-border-style) var(--ds-color-neutral)",
  cursor: "pointer",
};

const card: CSSProperties = {
  background: "var(--ds-color-surface)",
  borderRadius: "var(--ds-radius-md)",
  boxShadow: "var(--ds-shadow-card)",
  border: "var(--ds-card-border)",
  padding: "var(--ds-space-5)",
};

const muted: CSSProperties = {
  color: "var(--ds-color-text-muted)",
  fontSize: "var(--ds-font-size-sm)",
};

// ── 선택 가능 래퍼 (요소 선택·상세 패널) ──────────────────────────

function Sel({
  ctx,
  type,
  path,
  refs,
  children,
  style,
}: {
  ctx: RenderContext;
  type: string;
  path: string[];
  refs: (t: DesignTokens) => ElementSelection["tokenRefs"];
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  if (!ctx.onSelect) {
    return <div style={style}>{children}</div>;
  }
  const payload: ElementSelection = { type, path, tokenRefs: refs(ctx.tokens) };
  return (
    <div
      style={{ ...style, cursor: "pointer" }}
      onClick={(e) => {
        // 안쪽 요소가 먼저 받되, 넘기는 것은 조상까지 포함한 사슬이다.
        // 어느 깊이를 선택할지는 화면 쪽이 정한다 (클릭=바깥, 더블클릭=한 단계 안).
        e.stopPropagation();
        ctx.onSelect?.(chainFrom(e.currentTarget as HTMLElement));
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        ctx.onEnterChild?.();
      }}
      data-element={type}
      data-sel={JSON.stringify(payload)}
    >
      {children}
    </div>
  );
}

const buttonRefs = (t: DesignTokens) => [
  { label: "Background", token: "--ds-color-primary", value: t.color.primary },
  {
    label: "Radius",
    token: "--ds-radius-button",
    value:
      t.components.buttonVariant === "pill"
        ? "999px"
        : t.components.buttonVariant === "square"
          ? "4px"
          : `${t.border.radiusMd}px`,
  },
  { label: "Shadow", token: "--ds-shadow", value: t.shadow.preset },
  {
    label: "Font Weight",
    token: "--ds-font-weight-bold",
    value: String(t.typography.weights.bold),
  },
];

const cardRefs = (t: DesignTokens) => [
  { label: "Background", token: "--ds-color-surface", value: t.color.surface },
  {
    label: "Radius",
    token: "--ds-radius-md",
    value: `${t.border.radiusMd}px`,
  },
  {
    label: "Padding",
    token: "--ds-space-5",
    value: `${t.spacing.baseUnit * 3}px`,
  },
  { label: "Elevation", token: "--ds-shadow-card", value: t.components.cardElevation },
];

/** 지표 숫자처럼 '카드 안의 강조 텍스트' 가 참조하는 토큰. */
const metricValueRefs = (t: DesignTokens) => [
  { label: "Color", token: "--ds-color-text", value: t.color.text },
  {
    label: "Font Size",
    token: "--ds-font-size-2xl",
    value: `${Math.round(t.typography.baseSize * Math.pow(t.typography.scale, 3))}px`,
  },
  {
    label: "Font Weight",
    token: "--ds-font-weight-bold",
    value: String(t.typography.weights.bold),
  },
];

/** 차트 선·면이 참조하는 토큰. */
const chartRefs = (t: DesignTokens) => [
  { label: "Line", token: "--ds-color-primary", value: t.color.primary },
  { label: "Accent", token: "--ds-color-secondary", value: t.color.secondary },
  { label: "Surface", token: "--ds-color-surface", value: t.color.surface },
];

const headingRefs = (t: DesignTokens) => [
  { label: "Color", token: "--ds-color-text", value: t.color.text },
  {
    label: "Font Size",
    token: "--ds-font-size-3xl",
    value: `${Math.round(t.typography.baseSize * Math.pow(t.typography.scale, 4))}px`,
  },
  { label: "Font Family", token: "--ds-font-family", value: t.typography.fontFamily },
  {
    label: "Line Height",
    token: "--ds-line-height",
    value: String(t.typography.lineHeight),
  },
];

const inputRefs = (t: DesignTokens) => [
  { label: "Background", token: "--ds-input-bg", value: t.components.inputStyle },
  {
    label: "Border",
    token: "--ds-border-width",
    value: `${t.border.width}px ${t.border.style}`,
  },
  { label: "Radius", token: "--ds-radius-sm", value: `${t.border.radiusSm}px` },
];

const navRefs = (t: DesignTokens) => [
  { label: "Background", token: "--ds-color-surface", value: t.color.surface },
  { label: "Active", token: "--ds-color-primary", value: t.color.primary },
  { label: "Muted", token: "--ds-color-text-muted", value: t.color.textMuted },
];

// ── 콘텐츠 슬롯 (배너·상품 이미지·아바타) ─────────────────────────

function ContentSlot({
  ctx,
  label,
  height,
  radius = "var(--ds-radius-md)",
}: {
  ctx: RenderContext;
  label: string;
  height: number | string;
  radius?: string;
}) {
  // Image Gen 성공 시에는 컨셉 스타일과 연동된 그라디언트, CSS Fallback 시에는
  // 단색 Placeholder 로 대체한다 (기획서 v0.5.0 §4 F-002).
  const background = ctx.fallback
    ? "var(--ds-color-neutral)"
    : "linear-gradient(135deg, var(--ds-color-primary), var(--ds-color-secondary))";
  return (
    <div
      style={{
        height,
        borderRadius: radius,
        background,
        opacity: ctx.fallback ? 0.28 : 0.92,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: ctx.fallback ? "var(--ds-color-text-muted)" : "white",
        fontSize: "var(--ds-font-size-sm)",
        fontWeight: "var(--ds-font-weight-medium)" as unknown as number,
      }}
    >
      {ctx.fallback ? `${label} (Placeholder)` : label}
    </div>
  );
}

// ── 공통 블록 ──────────────────────────────────────────────────

function TopBar({ ctx, title }: { ctx: RenderContext; title: string }) {
  return (
    <Sel
      ctx={ctx}
      type="Navigation"
      path={["Page", "Header"]}
      refs={navRefs}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "var(--ds-space-6)",
      }}
    >
      <div
        style={{
          fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
          fontSize: "var(--ds-font-size-lg)",
        }}
      >
        {title.slice(0, 20)}
      </div>
      <nav
        style={{
          display: "flex",
          gap: "var(--ds-space-5)",
          alignItems: "center",
        }}
      >
        {["Product", "Pricing", "Docs"].map((n) => (
          <span key={n} style={muted}>
            {n}
          </span>
        ))}
        <button style={btnPrimary}>Get started</button>
      </nav>
    </Sel>
  );
}

function SideNav({
  ctx,
  items,
  width = 180,
}: {
  ctx: RenderContext;
  items: string[];
  width?: number;
}) {
  return (
    <Sel
      ctx={ctx}
      type="Navigation"
      path={["Page", "SideNav"]}
      refs={navRefs}
      style={{ width, flexShrink: 0 }}
    >
      <div
        style={{
          fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
          marginBottom: "var(--ds-space-4)",
        }}
      >
        {ctx.projectName.slice(0, 14)}
      </div>
      {items.map((n, i) => (
        <div
          key={n}
          style={{
            padding: "var(--ds-space-2) var(--ds-space-3)",
            borderRadius: "var(--ds-radius-sm)",
            background: i === 0 ? "var(--ds-color-primary)" : "transparent",
            color: i === 0 ? "white" : "var(--ds-color-text-muted)",
            fontSize: "var(--ds-font-size-sm)",
            marginBottom: "var(--ds-space-1)",
          }}
        >
          {n}
        </div>
      ))}
    </Sel>
  );
}

function Heading({
  ctx,
  children,
  size = "var(--ds-font-size-3xl)",
  align = "left",
}: {
  ctx: RenderContext;
  children: React.ReactNode;
  size?: string;
  align?: "left" | "center";
}) {
  return (
    <Sel ctx={ctx} type="Heading" path={["Page", "Heading"]} refs={headingRefs}>
      <h1
        style={{
          fontSize: size,
          fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
          lineHeight: 1.15,
          margin: 0,
          textAlign: align,
        }}
      >
        {children}
      </h1>
    </Sel>
  );
}

function CtaRow({
  ctx,
  align = "flex-start",
}: {
  ctx: RenderContext;
  align?: "flex-start" | "center";
}) {
  return (
    <div
      style={{
        marginTop: "var(--ds-space-5)",
        display: "flex",
        gap: "var(--ds-space-3)",
        justifyContent: align,
      }}
    >
      <Sel ctx={ctx} type="Button · Primary" path={["Page", "CTA"]} refs={buttonRefs}>
        <button style={btnPrimary}>Start free →</button>
      </Sel>
      <Sel
        ctx={ctx}
        type="Button · Secondary"
        path={["Page", "CTA"]}
        refs={buttonRefs}
      >
        <button style={btnSecondary}>Watch demo</button>
      </Sel>
    </div>
  );
}

function FeatureCards({
  ctx,
  columns,
  withIcon = true,
}: {
  ctx: RenderContext;
  columns: number;
  withIcon?: boolean;
}) {
  const features = [
    { t: "Tokens", d: "W3C DTCG 표준 JSON 으로 즉시 Export" },
    { t: "Realtime", d: "500ms 이내 모든 시안에 반영" },
    { t: "MCP", d: "Cursor·Claude Code 에서 직접 참조" },
    { t: "Figma", d: "Frame + Variables 자동 매핑" },
  ].slice(0, Math.max(2, columns));

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: "var(--ds-space-4)",
        marginTop: "var(--ds-space-6)",
      }}
    >
      {features.map((f) => (
        <Sel key={f.t} ctx={ctx} type="Card" path={["Page", "Features", f.t]} refs={cardRefs}>
          <div style={card}>
            {withIcon && (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "var(--ds-radius-sm)",
                  background: "var(--ds-color-primary)",
                  marginBottom: "var(--ds-space-3)",
                }}
              />
            )}
            <div
              style={{
                fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
                fontSize: "var(--ds-font-size-lg)",
                marginBottom: "var(--ds-space-2)",
              }}
            >
              {f.t}
            </div>
            <div style={muted}>{f.d}</div>
          </div>
        </Sel>
      ))}
    </section>
  );
}

function MetricCards({ ctx, columns }: { ctx: RenderContext; columns: number }) {
  const metrics = [
    { l: "Active Users", v: "12,438", d: "+8.2%" },
    { l: "Revenue", v: "$94,210", d: "+12.4%" },
    { l: "Conversion", v: "3.42%", d: "-0.4%" },
    { l: "Retention", v: "78.1%", d: "+1.1%" },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: "var(--ds-space-4)",
      }}
    >
      {metrics.map((m, i) => (
        <Sel key={m.l} ctx={ctx} type="Card · Metric" path={["Page", "Metrics", m.l]} refs={cardRefs}>
          <div style={card}>
            <div style={muted}>{m.l}</div>
            {/* 카드 안의 숫자는 따로 고를 수 있다 — 참조 토큰이 카드와 다르다. */}
            <Sel
              ctx={ctx}
              type="Text · Metric Value"
              path={["Page", "Metrics", m.l, "Value"]}
              refs={metricValueRefs}
            >
              <div
                style={{
                  fontSize: "var(--ds-font-size-2xl)",
                  fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
                  marginTop: "var(--ds-space-2)",
                }}
              >
                {m.v}
              </div>
            </Sel>
            <div
              style={{
                marginTop: "var(--ds-space-2)",
                fontSize: "var(--ds-font-size-sm)",
                color:
                  i === 2 ? "var(--ds-color-error)" : "var(--ds-color-success)",
              }}
            >
              {m.d}
            </div>
          </div>
        </Sel>
      ))}
    </div>
  );
}

function TrendChart({ ctx, height = 120 }: { ctx: RenderContext; height?: number }) {
  return (
    <Sel ctx={ctx} type="Card · Chart" path={["Page", "Chart"]} refs={cardRefs}>
      <div style={card}>
        <div
          style={{
            fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
            marginBottom: "var(--ds-space-4)",
          }}
        >
          Revenue trend
        </div>
        <Sel ctx={ctx} type="Chart · Area" path={["Page", "Chart", "Area"]} refs={chartRefs}>
        <svg viewBox="0 0 400 120" style={{ width: "100%", height }}>
          <polyline
            fill="none"
            stroke="var(--ds-color-primary)"
            strokeWidth="2.5"
            points="0,90 40,72 80,80 120,55 160,62 200,42 240,50 280,30 320,38 360,22 400,28"
          />
          <polyline
            fill="none"
            stroke="var(--ds-color-secondary)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            points="0,100 40,95 80,90 120,85 160,80 200,75 240,70 280,65 320,60 360,55 400,50"
          />
        </svg>
        </Sel>
      </div>
    </Sel>
  );
}

function SourceBreakdown({ ctx }: { ctx: RenderContext }) {
  const rows = [
    { l: "Organic", v: 58 },
    { l: "Direct", v: 22 },
    { l: "Referral", v: 12 },
    { l: "Social", v: 8 },
  ];
  return (
    <Sel ctx={ctx} type="Card · Breakdown" path={["Page", "Sources"]} refs={cardRefs}>
      <div style={card}>
        <div
          style={{
            fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
            marginBottom: "var(--ds-space-4)",
          }}
        >
          Top sources
        </div>
        {rows.map((row) => (
          <div key={row.l} style={{ marginBottom: "var(--ds-space-3)" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "var(--ds-font-size-sm)",
                marginBottom: "var(--ds-space-1)",
              }}
            >
              <span>{row.l}</span>
              <span style={{ color: "var(--ds-color-text-muted)" }}>{row.v}%</span>
            </div>
            <div
              style={{
                height: 6,
                background: "var(--ds-color-neutral)",
                opacity: 0.2,
                borderRadius: "var(--ds-radius-sm)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${row.v}%`,
                  height: "100%",
                  background: "var(--ds-color-primary)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Sel>
  );
}

function DataTable({ ctx, rows = 6 }: { ctx: RenderContext; rows?: number }) {
  const data = Array.from({ length: rows }, (_, i) => ({
    name: ["Acme Corp", "Globex", "Initech", "Umbrella", "Stark", "Wayne"][i % 6],
    plan: ["Pro", "Team", "Free"][i % 3],
    amount: `$${(1200 + i * 317).toLocaleString()}`,
    status: i % 4 === 0 ? "Pending" : "Active",
  }));
  return (
    <Sel ctx={ctx} type="Table" path={["Page", "Table"]} refs={cardRefs}>
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            padding: "var(--ds-space-3) var(--ds-space-5)",
            background: "var(--ds-color-bg)",
            fontSize: "var(--ds-font-size-sm)",
            fontWeight: "var(--ds-font-weight-medium)" as unknown as number,
            color: "var(--ds-color-text-muted)",
          }}
        >
          <span>Account</span>
          <span>Plan</span>
          <span>Amount</span>
          <span>Status</span>
        </div>
        {data.map((r, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              padding: "var(--ds-space-3) var(--ds-space-5)",
              borderTop: "1px solid var(--ds-color-neutral)22",
              fontSize: "var(--ds-font-size-sm)",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: "var(--ds-font-weight-medium)" as unknown as number }}>
              {r.name}
            </span>
            <span style={{ color: "var(--ds-color-text-muted)" }}>{r.plan}</span>
            <span>{r.amount}</span>
            <span
              style={{
                justifySelf: "start",
                padding: "2px 8px",
                borderRadius: "999px",
                fontSize: "var(--ds-font-size-sm)",
                background:
                  r.status === "Active"
                    ? "var(--ds-color-success)"
                    : "var(--ds-color-warning)",
                color: "white",
              }}
            >
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </Sel>
  );
}

function FilterBar({ ctx }: { ctx: RenderContext }) {
  return (
    <Sel
      ctx={ctx}
      type="Input · Filter"
      path={["Page", "FilterBar"]}
      refs={inputRefs}
      style={{ marginBottom: "var(--ds-space-4)" }}
    >
      <div style={{ display: "flex", gap: "var(--ds-space-3)", alignItems: "center" }}>
        <div
          style={{
            flex: 1,
            background: "var(--ds-input-bg)",
            border:
              "var(--ds-border-width) var(--ds-border-style) var(--ds-color-neutral)",
            borderRadius: "var(--ds-radius-sm)",
            padding: "var(--ds-space-3) var(--ds-space-4)",
            color: "var(--ds-color-text-muted)",
            fontSize: "var(--ds-font-size-sm)",
          }}
        >
          검색어를 입력하세요
        </div>
        {["전체", "활성", "대기"].map((f, i) => (
          <div
            key={f}
            style={{
              padding: "var(--ds-space-2) var(--ds-space-4)",
              borderRadius: "var(--ds-radius-button)",
              background: i === 0 ? "var(--ds-color-primary)" : "transparent",
              color: i === 0 ? "white" : "var(--ds-color-text-muted)",
              border:
                i === 0
                  ? "none"
                  : "var(--ds-border-width) var(--ds-border-style) var(--ds-color-neutral)",
              fontSize: "var(--ds-font-size-sm)",
            }}
          >
            {f}
          </div>
        ))}
      </div>
    </Sel>
  );
}

function FormFields({ ctx, fields }: { ctx: RenderContext; fields: string[] }) {
  return (
    <>
      {fields.map((l) => (
        <Sel
          key={l}
          ctx={ctx}
          type="Input"
          path={["Page", "Form", l]}
          refs={inputRefs}
          style={{ marginBottom: "var(--ds-space-3)" }}
        >
          <div
            style={{
              fontSize: "var(--ds-font-size-sm)",
              fontWeight: "var(--ds-font-weight-medium)" as unknown as number,
              marginBottom: "var(--ds-space-2)",
            }}
          >
            {l}
          </div>
          <div
            style={{
              background: "var(--ds-input-bg)",
              borderRadius: "var(--ds-radius-sm)",
              border:
                "var(--ds-border-width) var(--ds-border-style) var(--ds-color-neutral)",
              padding: "var(--ds-space-3) var(--ds-space-4)",
              color: "var(--ds-color-text-muted)",
            }}
          >
            {l.includes("메일") || l.toLowerCase().includes("email")
              ? "you@company.com"
              : "••••••••"}
          </div>
        </Sel>
      ))}
    </>
  );
}

// ── 화면별 구조 변형 ───────────────────────────────────────────

function LandingScreen({ ctx }: { ctx: RenderContext }) {
  const v = ctx.variant % 5;
  const pad = { padding: "var(--ds-space-6)" };

  // 3) 좌측 고정 내비 + 세로 섹션 스택
  if (v === 3) {
    return (
      <div style={{ ...page, ...pad, display: "flex", gap: "var(--ds-space-6)" }}>
        <SideNav ctx={ctx} items={["홈", "기능", "가격", "문서", "블로그"]} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Heading ctx={ctx} size="var(--ds-font-size-2xl)">
            Design Systems, generated by AI.
          </Heading>
          <p style={{ ...muted, marginTop: "var(--ds-space-3)" }}>
            DS 3종 + 시안 15종을 3분 안에. Token 수정은 모든 시안에 실시간 반영된다.
          </p>
          <CtaRow ctx={ctx} />
          <div style={{ marginTop: "var(--ds-space-5)" }}>
            <ContentSlot ctx={ctx} label="제품 스크린샷" height={200} />
          </div>
          <FeatureCards ctx={ctx} columns={2} />
        </div>
      </div>
    );
  }

  // 2) 상단 풀블리드 배너 + 2열 본문
  if (v === 2) {
    return (
      <div style={{ ...page }}>
        <div style={{ padding: "var(--ds-space-4) var(--ds-space-6) 0" }}>
          <TopBar ctx={ctx} title={ctx.projectName} />
        </div>
        <ContentSlot ctx={ctx} label="히어로 배너" height={220} radius="0" />
        <div style={{ ...pad }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--ds-space-6)",
              alignItems: "center",
            }}
          >
            <div>
              <Heading ctx={ctx} size="var(--ds-font-size-2xl)">
                모든 시안을 하나의 Token 으로.
              </Heading>
              <p style={{ ...muted, marginTop: "var(--ds-space-3)" }}>
                Figma·코드·MCP 까지 단일 Token 체계로 관통한다.
              </p>
              <CtaRow ctx={ctx} />
            </div>
            <ContentSlot ctx={ctx} label="Token 패널 미리보기" height={180} />
          </div>
          <FeatureCards ctx={ctx} columns={3} withIcon={false} />
        </div>
      </div>
    );
  }

  // 1) 히어로 좌우 분할 + 우측 제품 프리뷰
  if (v === 1) {
    return (
      <div style={{ ...page, ...pad }}>
        <TopBar ctx={ctx} title={ctx.projectName} />
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.9fr",
            gap: "var(--ds-space-6)",
            alignItems: "center",
            padding: "var(--ds-space-5) 0",
          }}
        >
          <div>
            <Badge ctx={ctx} />
            <div style={{ marginTop: "var(--ds-space-4)" }}>
              <Heading ctx={ctx}>
                Design Systems,
                <br />
                generated by AI.
              </Heading>
            </div>
            <p style={{ ...muted, marginTop: "var(--ds-space-3)", maxWidth: 460 }}>
              컨셉별 DS 와 동일 화면의 구조 변형 시안을 한 번에 생성한다.
            </p>
            <CtaRow ctx={ctx} />
          </div>
          <ContentSlot ctx={ctx} label="제품 프리뷰" height={280} />
        </section>
        <FeatureCards ctx={ctx} columns={3} />
      </div>
    );
  }

  // 4) 카드 그리드 우선 + 히어로 축약
  if (v === 4) {
    return (
      <div style={{ ...page, ...pad }}>
        <TopBar ctx={ctx} title={ctx.projectName} />
        <section
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "var(--ds-space-5)",
            marginBottom: "var(--ds-space-5)",
          }}
        >
          <Heading ctx={ctx} size="var(--ds-font-size-2xl)">
            AI 가 만든 디자인 시스템
          </Heading>
          <CtaRow ctx={ctx} />
        </section>
        <FeatureCards ctx={ctx} columns={4} withIcon={false} />
        <div style={{ marginTop: "var(--ds-space-5)" }}>
          <ContentSlot ctx={ctx} label="갤러리 배너" height={160} />
        </div>
      </div>
    );
  }

  // 0) 히어로 중앙 정렬 + 3열 특징 카드 (기본)
  return (
    <div style={{ ...page, ...pad }}>
      <TopBar ctx={ctx} title={ctx.projectName} />
      <section style={{ textAlign: "center", padding: "var(--ds-space-7) 0" }}>
        <Badge ctx={ctx} />
        <div style={{ marginTop: "var(--ds-space-4)" }}>
          <Heading ctx={ctx} align="center">
            Design Systems,
            <br />
            generated by AI.
          </Heading>
        </div>
        <p
          style={{
            ...muted,
            fontSize: "var(--ds-font-size-lg)",
            maxWidth: 560,
            margin: "var(--ds-space-3) auto 0",
          }}
        >
          DS 3종 + 시안 15종을 3분 안에. Token 수정은 모든 시안에 실시간 반영된다.
        </p>
        <CtaRow ctx={ctx} align="center" />
      </section>
      <FeatureCards ctx={ctx} columns={3} />
    </div>
  );
}

function Badge({ ctx }: { ctx: RenderContext }) {
  return (
    <Sel
      ctx={ctx}
      type="Badge"
      path={["Page", "Badge"]}
      refs={(t) => [
        { label: "Background", token: "--ds-color-primary", value: t.color.primary },
        { label: "Radius", token: "999px", value: "pill" },
      ]}
      style={{ display: "inline-block" }}
    >
      <span
        style={{
          display: "inline-block",
          padding: "var(--ds-space-1) var(--ds-space-3)",
          borderRadius: "999px",
          background: "var(--ds-color-primary)",
          color: "white",
          fontSize: "var(--ds-font-size-sm)",
        }}
      >
        NEW · v1.0 OUT NOW
      </span>
    </Sel>
  );
}

function DashboardScreen({ ctx }: { ctx: RenderContext }) {
  const v = ctx.variant % 5;
  const pad = { padding: "var(--ds-space-5)" };

  const header = (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "var(--ds-space-5)",
      }}
    >
      <div>
        <div
          style={{
            fontSize: "var(--ds-font-size-2xl)",
            fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
          }}
        >
          Overview
        </div>
        <div style={{ ...muted, marginTop: "var(--ds-space-1)" }}>
          Last updated 2 minutes ago
        </div>
      </div>
      <Sel ctx={ctx} type="Button · Primary" path={["Page", "Action"]} refs={buttonRefs}>
        <button style={btnPrimary}>+ New report</button>
      </Sel>
    </header>
  );

  // 2) 좌측 사이드바 + 지표 3열
  if (v === 2) {
    return (
      <div style={{ ...page, ...pad, display: "flex", gap: "var(--ds-space-5)" }}>
        <SideNav
          ctx={ctx}
          items={["Overview", "Reports", "Customers", "Billing", "Settings"]}
          width={170}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {header}
          <MetricCards ctx={ctx} columns={3} />
          <div style={{ marginTop: "var(--ds-space-5)" }}>
            <TrendChart ctx={ctx} height={150} />
          </div>
        </div>
      </div>
    );
  }

  // 3) 상단 필터 바 + 표 중심
  if (v === 3) {
    return (
      <div style={{ ...page, ...pad }}>
        {header}
        <FilterBar ctx={ctx} />
        <MetricCards ctx={ctx} columns={4} />
        <div style={{ marginTop: "var(--ds-space-5)" }}>
          <DataTable ctx={ctx} rows={5} />
        </div>
      </div>
    );
  }

  // 1) 지표 2열 + 차트 2분할 균등
  if (v === 1) {
    return (
      <div style={{ ...page, ...pad }}>
        {header}
        <MetricCards ctx={ctx} columns={2} />
        <div
          style={{
            marginTop: "var(--ds-space-5)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--ds-space-4)",
          }}
        >
          <TrendChart ctx={ctx} />
          <SourceBreakdown ctx={ctx} />
        </div>
      </div>
    );
  }

  // 4) 카드 대시보드 (지표·차트 혼합 그리드)
  if (v === 4) {
    return (
      <div style={{ ...page, ...pad }}>
        {header}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--ds-space-4)",
          }}
        >
          <div style={{ gridColumn: "span 2" }}>
            <TrendChart ctx={ctx} height={140} />
          </div>
          <SourceBreakdown ctx={ctx} />
          <div style={{ gridColumn: "span 3" }}>
            <MetricCards ctx={ctx} columns={4} />
          </div>
        </div>
      </div>
    );
  }

  // 0) 지표 4열 + 대형 차트 1 + 보조 1 (기본)
  return (
    <div style={{ ...page, ...pad }}>
      {header}
      <MetricCards ctx={ctx} columns={4} />
      <div
        style={{
          marginTop: "var(--ds-space-5)",
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "var(--ds-space-4)",
        }}
      >
        <TrendChart ctx={ctx} />
        <SourceBreakdown ctx={ctx} />
      </div>
    </div>
  );
}

function LoginScreen({ ctx }: { ctx: RenderContext }) {
  const v = ctx.variant % 5;

  const form = (withSocial: boolean, width: number | string) => (
    <Sel ctx={ctx} type="Card · Form" path={["Page", "AuthCard"]} refs={cardRefs}>
      <div style={{ ...card, width, maxWidth: "100%" }}>
        <div
          style={{
            fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
            fontSize: "var(--ds-font-size-2xl)",
          }}
        >
          {ctx.projectName.slice(0, 22)} 시작하기
        </div>
        <div style={{ ...muted, marginTop: "var(--ds-space-2)" }}>
          신용카드 없이 30초만에 가입.
        </div>

        {withSocial && (
          <div
            style={{
              marginTop: "var(--ds-space-5)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--ds-space-3)",
            }}
          >
            {["Google", "GitHub"].map((p) => (
              <button
                key={p}
                style={{ ...btnSecondary, width: "100%", justifyContent: "center" }}
              >
                Continue with {p}
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: "var(--ds-space-5)" }}>
          <FormFields ctx={ctx} fields={["이메일", "비밀번호"]} />
        </div>

        <Sel ctx={ctx} type="Button · Primary" path={["Page", "Submit"]} refs={buttonRefs}>
          <button
            style={{
              ...btnPrimary,
              width: "100%",
              justifyContent: "center",
              marginTop: "var(--ds-space-4)",
            }}
          >
            로그인
          </button>
        </Sel>
      </div>
    </Sel>
  );

  // 1) 좌우 분할 (브랜드 패널 + 폼)
  if (v === 1) {
    return (
      <div style={{ ...page, display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <div
          style={{
            background: "var(--ds-color-primary)",
            color: "white",
            padding: "var(--ds-space-7)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: "var(--ds-font-size-2xl)",
              fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
            }}
          >
            {ctx.projectName.slice(0, 20)}
          </div>
          <p style={{ marginTop: "var(--ds-space-3)", opacity: 0.85 }}>
            디자인 시스템부터 시안까지, 하나의 Token 으로.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--ds-space-6)",
          }}
        >
          {form(false, 380)}
        </div>
      </div>
    );
  }

  // 2) 상단 로고 + 폭 넓은 단일 컬럼
  if (v === 2) {
    return (
      <div style={{ ...page, padding: "var(--ds-space-7)" }}>
        <div style={{ textAlign: "center", marginBottom: "var(--ds-space-6)" }}>
          <div
            style={{
              display: "inline-flex",
              width: 44,
              height: 44,
              borderRadius: "var(--ds-radius-md)",
              background: "var(--ds-color-primary)",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          {form(true, 620)}
        </div>
      </div>
    );
  }

  // 3) 카드 없는 전면 폼 + 하단 보조 링크
  if (v === 3) {
    return (
      <div
        style={{
          ...page,
          padding: "var(--ds-space-7)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: 520,
          margin: "0 auto",
        }}
      >
        <Heading ctx={ctx} size="var(--ds-font-size-2xl)">
          다시 오신 걸 환영합니다
        </Heading>
        <div style={{ marginTop: "var(--ds-space-5)" }}>
          <FormFields ctx={ctx} fields={["이메일", "비밀번호"]} />
        </div>
        <Sel ctx={ctx} type="Button · Primary" path={["Page", "Submit"]} refs={buttonRefs}>
          <button
            style={{ ...btnPrimary, width: "100%", justifyContent: "center" }}
          >
            로그인
          </button>
        </Sel>
        <div
          style={{
            ...muted,
            marginTop: "var(--ds-space-4)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>비밀번호 찾기</span>
          <span>회원가입</span>
        </div>
      </div>
    );
  }

  // 4) 우측 폼 고정 + 좌측 이미지 배경
  if (v === 4) {
    return (
      <div style={{ ...page, display: "grid", gridTemplateColumns: "1.2fr 0.8fr" }}>
        <div style={{ padding: "var(--ds-space-5)" }}>
          <ContentSlot ctx={ctx} label="브랜드 이미지" height="100%" />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "var(--ds-space-6)",
          }}
        >
          {form(true, "100%")}
        </div>
      </div>
    );
  }

  // 0) 중앙 단일 카드 + 소셜 로그인 상단 (기본)
  return (
    <div
      style={{
        ...page,
        padding: "var(--ds-space-7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {form(true, 440)}
    </div>
  );
}

function ListScreen({ ctx }: { ctx: RenderContext }) {
  const v = ctx.variant % 5;
  const pad = { padding: "var(--ds-space-5)" };

  const title = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "var(--ds-space-4)",
      }}
    >
      <div
        style={{
          fontSize: "var(--ds-font-size-2xl)",
          fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
        }}
      >
        고객 목록
      </div>
      <Sel ctx={ctx} type="Button · Primary" path={["Page", "Action"]} refs={buttonRefs}>
        <button style={btnPrimary}>+ 새로 추가</button>
      </Sel>
    </div>
  );

  // 1) 카드 그리드 3열
  if (v === 1) {
    return (
      <div style={{ ...page, ...pad }}>
        {title}
        <FilterBar ctx={ctx} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--ds-space-4)",
          }}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <Sel key={i} ctx={ctx} type="Card · Item" path={["Page", "Grid", String(i)]} refs={cardRefs}>
              <div style={card}>
                <ContentSlot ctx={ctx} label="썸네일" height={90} />
                <div
                  style={{
                    marginTop: "var(--ds-space-3)",
                    fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
                  }}
                >
                  항목 {i + 1}
                </div>
                <div style={{ ...muted, marginTop: "var(--ds-space-1)" }}>
                  카테고리 · 업데이트 2일 전
                </div>
              </div>
            </Sel>
          ))}
        </div>
      </div>
    );
  }

  // 2) 좌측 필터 패널 + 우측 리스트
  if (v === 2) {
    return (
      <div style={{ ...page, ...pad, display: "flex", gap: "var(--ds-space-5)" }}>
        <Sel ctx={ctx} type="Card · Filter" path={["Page", "FilterPanel"]} refs={cardRefs} style={{ width: 200, flexShrink: 0 }}>
          <div style={card}>
            <div
              style={{
                fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
                marginBottom: "var(--ds-space-3)",
              }}
            >
              필터
            </div>
            {["플랜", "상태", "가입일", "지역"].map((f) => (
              <div key={f} style={{ marginBottom: "var(--ds-space-3)" }}>
                <div style={muted}>{f}</div>
                <div
                  style={{
                    marginTop: "var(--ds-space-1)",
                    height: 28,
                    borderRadius: "var(--ds-radius-sm)",
                    background: "var(--ds-input-bg)",
                    border:
                      "var(--ds-border-width) var(--ds-border-style) var(--ds-color-neutral)",
                  }}
                />
              </div>
            ))}
          </div>
        </Sel>
        <div style={{ flex: 1, minWidth: 0 }}>
          {title}
          <DataTable ctx={ctx} rows={6} />
        </div>
      </div>
    );
  }

  // 3) 밀집 리스트 + 우측 미리보기
  if (v === 3) {
    return (
      <div style={{ ...page, ...pad }}>
        {title}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: "var(--ds-space-4)",
          }}
        >
          <Sel ctx={ctx} type="List" path={["Page", "List"]} refs={cardRefs}>
            <div style={{ ...card, padding: 0 }}>
              {Array.from({ length: 7 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    padding: "var(--ds-space-3) var(--ds-space-4)",
                    borderTop: i === 0 ? "none" : "1px solid var(--ds-color-neutral)22",
                    background: i === 0 ? "var(--ds-color-bg)" : "transparent",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "var(--ds-font-size-sm)",
                  }}
                >
                  <span>항목 {i + 1}</span>
                  <span style={{ color: "var(--ds-color-text-muted)" }}>2일 전</span>
                </div>
              ))}
            </div>
          </Sel>
          <Sel ctx={ctx} type="Card · Preview" path={["Page", "Preview"]} refs={cardRefs}>
            <div style={card}>
              <ContentSlot ctx={ctx} label="미리보기" height={120} />
              <div
                style={{
                  marginTop: "var(--ds-space-3)",
                  fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
                }}
              >
                항목 1
              </div>
              <div style={{ ...muted, marginTop: "var(--ds-space-2)" }}>
                선택한 항목의 요약 정보를 표시한다.
              </div>
            </div>
          </Sel>
        </div>
      </div>
    );
  }

  // 4) 섹션 그룹 리스트 + 상단 탭
  if (v === 4) {
    return (
      <div style={{ ...page, ...pad }}>
        {title}
        <div
          style={{
            display: "flex",
            gap: "var(--ds-space-4)",
            borderBottom: "1px solid var(--ds-color-neutral)22",
            marginBottom: "var(--ds-space-4)",
          }}
        >
          {["전체", "활성", "대기", "보관"].map((t, i) => (
            <div
              key={t}
              style={{
                paddingBottom: "var(--ds-space-2)",
                borderBottom:
                  i === 0 ? "2px solid var(--ds-color-primary)" : "2px solid transparent",
                color: i === 0 ? "var(--ds-color-primary)" : "var(--ds-color-text-muted)",
                fontWeight: "var(--ds-font-weight-medium)" as unknown as number,
                fontSize: "var(--ds-font-size-sm)",
              }}
            >
              {t}
            </div>
          ))}
        </div>
        {["최근 7일", "이전"].map((group) => (
          <div key={group} style={{ marginBottom: "var(--ds-space-5)" }}>
            <div style={{ ...muted, marginBottom: "var(--ds-space-2)" }}>{group}</div>
            <DataTable ctx={ctx} rows={3} />
          </div>
        ))}
      </div>
    );
  }

  // 0) 표 형식 + 상단 필터 바 (기본)
  return (
    <div style={{ ...page, ...pad }}>
      {title}
      <FilterBar ctx={ctx} />
      <DataTable ctx={ctx} rows={7} />
    </div>
  );
}

function DetailScreen({ ctx }: { ctx: RenderContext }) {
  const v = ctx.variant % 5;
  const pad = { padding: "var(--ds-space-6)" };

  const fields = [
    { l: "이름", v: "안승준" },
    { l: "이메일", v: "demo@designgenerator.io" },
    { l: "역할", v: "Designer · Pro" },
  ];

  const detailCard = (
    <Sel ctx={ctx} type="Card · Detail" path={["Page", "Detail"]} refs={cardRefs}>
      <div style={card}>
        <div
          style={{
            fontWeight: "var(--ds-font-weight-bold)" as unknown as number,
            fontSize: "var(--ds-font-size-lg)",
          }}
        >
          프로필
        </div>
        <div style={{ ...muted, marginTop: "var(--ds-space-2)", marginBottom: "var(--ds-space-5)" }}>
          팀원에게 노출되는 정보이다.
        </div>
        {fields.map((f) => (
          <div
            key={f.l}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              padding: "var(--ds-space-3) 0",
              borderTop: "1px solid var(--ds-color-neutral)22",
              fontSize: "var(--ds-font-size-sm)",
            }}
          >
            <div style={{ color: "var(--ds-color-text-muted)" }}>{f.l}</div>
            <div style={{ fontWeight: "var(--ds-font-weight-medium)" as unknown as number }}>
              {f.v}
            </div>
          </div>
        ))}
        <div style={{ marginTop: "var(--ds-space-5)", display: "flex", gap: "var(--ds-space-3)" }}>
          <Sel ctx={ctx} type="Button · Primary" path={["Page", "Save"]} refs={buttonRefs}>
            <button style={btnPrimary}>저장</button>
          </Sel>
          <button style={btnSecondary}>취소</button>
        </div>
      </div>
    </Sel>
  );

  // 1) 상단 요약 + 탭 분할 본문
  if (v === 1) {
    return (
      <div style={{ ...page, ...pad }}>
        <Sel ctx={ctx} type="Card · Summary" path={["Page", "Summary"]} refs={cardRefs}>
          <div style={{ ...card, display: "flex", gap: "var(--ds-space-5)", alignItems: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "999px",
                background: "var(--ds-color-primary)",
              }}
            />
            <div>
              <div style={{ fontWeight: "var(--ds-font-weight-bold)" as unknown as number }}>
                안승준
              </div>
              <div style={muted}>Designer · Pro · 2026-03 가입</div>
            </div>
          </div>
        </Sel>
        <div
          style={{
            display: "flex",
            gap: "var(--ds-space-4)",
            borderBottom: "1px solid var(--ds-color-neutral)22",
            margin: "var(--ds-space-5) 0 var(--ds-space-4)",
          }}
        >
          {["프로필", "보안", "알림", "결제"].map((t, i) => (
            <div
              key={t}
              style={{
                paddingBottom: "var(--ds-space-2)",
                borderBottom:
                  i === 0 ? "2px solid var(--ds-color-primary)" : "2px solid transparent",
                color: i === 0 ? "var(--ds-color-primary)" : "var(--ds-color-text-muted)",
                fontSize: "var(--ds-font-size-sm)",
              }}
            >
              {t}
            </div>
          ))}
        </div>
        {detailCard}
      </div>
    );
  }

  // 2) 2열 (본문 + 사이드 메타)
  if (v === 2) {
    return (
      <div style={{ ...page, ...pad }}>
        <Heading ctx={ctx} size="var(--ds-font-size-2xl)">
          계정 설정
        </Heading>
        <div
          style={{
            marginTop: "var(--ds-space-5)",
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr",
            gap: "var(--ds-space-4)",
          }}
        >
          {detailCard}
          <Sel ctx={ctx} type="Card · Meta" path={["Page", "Meta"]} refs={cardRefs}>
            <div style={card}>
              <div style={{ fontWeight: "var(--ds-font-weight-bold)" as unknown as number }}>
                활동 요약
              </div>
              {["최근 로그인", "생성 횟수", "Export"].map((m) => (
                <div
                  key={m}
                  style={{
                    marginTop: "var(--ds-space-3)",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "var(--ds-font-size-sm)",
                  }}
                >
                  <span style={{ color: "var(--ds-color-text-muted)" }}>{m}</span>
                  <span>—</span>
                </div>
              ))}
            </div>
          </Sel>
        </div>
      </div>
    );
  }

  // 3) 단일 컬럼 롱폼 + 고정 액션 바
  if (v === 3) {
    return (
      <div style={{ ...page, ...pad, maxWidth: 640, margin: "0 auto" }}>
        <Heading ctx={ctx} size="var(--ds-font-size-2xl)">
          프로필 편집
        </Heading>
        <div style={{ marginTop: "var(--ds-space-5)" }}>
          <FormFields ctx={ctx} fields={["이름", "이메일", "비밀번호"]} />
        </div>
        <div
          style={{
            position: "sticky",
            bottom: 0,
            marginTop: "var(--ds-space-5)",
            padding: "var(--ds-space-4) 0",
            borderTop: "1px solid var(--ds-color-neutral)22",
            background: "var(--ds-color-bg)",
            display: "flex",
            gap: "var(--ds-space-3)",
            justifyContent: "flex-end",
          }}
        >
          <button style={btnSecondary}>취소</button>
          <Sel ctx={ctx} type="Button · Primary" path={["Page", "Save"]} refs={buttonRefs}>
            <button style={btnPrimary}>저장</button>
          </Sel>
        </div>
      </div>
    );
  }

  // 4) 히어로 요약 + 아코디언 섹션
  if (v === 4) {
    return (
      <div style={{ ...page, ...pad }}>
        <ContentSlot ctx={ctx} label="커버 이미지" height={140} />
        <div style={{ marginTop: "var(--ds-space-5)" }}>
          <Heading ctx={ctx} size="var(--ds-font-size-2xl)">
            안승준
          </Heading>
          <div style={{ ...muted, marginTop: "var(--ds-space-2)" }}>
            Designer · Pro · 2026-03 가입
          </div>
        </div>
        <div style={{ marginTop: "var(--ds-space-5)" }}>
          {["기본 정보", "보안", "알림 설정"].map((s, i) => (
            <Sel key={s} ctx={ctx} type="Card · Accordion" path={["Page", s]} refs={cardRefs} style={{ marginBottom: "var(--ds-space-3)" }}>
              <div style={{ ...card, padding: "var(--ds-space-4) var(--ds-space-5)" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: "var(--ds-font-weight-medium)" as unknown as number,
                  }}
                >
                  <span>{s}</span>
                  <span style={{ color: "var(--ds-color-text-muted)" }}>
                    {i === 0 ? "−" : "+"}
                  </span>
                </div>
                {i === 0 && (
                  <div style={{ marginTop: "var(--ds-space-4)" }}>
                    <FormFields ctx={ctx} fields={["이름", "이메일"]} />
                  </div>
                )}
              </div>
            </Sel>
          ))}
        </div>
      </div>
    );
  }

  // 0) 좌측 내비 + 우측 상세 카드 (기본)
  return (
    <div style={{ ...page, ...pad }}>
      <Heading ctx={ctx} size="var(--ds-font-size-2xl)">
        계정 설정
      </Heading>
      <div
        style={{
          marginTop: "var(--ds-space-5)",
          display: "grid",
          gridTemplateColumns: "200px 1fr",
          gap: "var(--ds-space-5)",
        }}
      >
        <SideNav
          ctx={ctx}
          items={["프로필", "알림", "결제", "API Keys", "보안"]}
          width={200}
        />
        {detailCard}
      </div>
    </div>
  );
}
