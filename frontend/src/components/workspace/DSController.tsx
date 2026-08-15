"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { ColorSwatch } from "@/components/ui/ColorSwatch";
import { Slider } from "@/components/ui/Slider";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/store/auth-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import type { ConceptLabel, DesignTokens, DsMode } from "@/lib/types";

const SECTIONS = [
  "Color",
  "Typography",
  "Spacing",
  "Border & Radius",
  "Shadow",
  "Components",
] as const;
type Section = (typeof SECTIONS)[number];

const FONT_FAMILIES = [
  "Inter",
  "IBM Plex Sans",
  "Manrope",
  "Space Grotesk",
  "Noto Sans KR",
  "Pretendard",
];

export function DSController({
  concept,
  conceptName,
  tokens,
  readOnly = false,
  dsMode = "per_concept",
}: {
  concept: ConceptLabel;
  conceptName: string;
  tokens: DesignTokens;
  /** 컨셉 확정 후 비확정 컨셉은 읽기 전용이다. */
  readOnly?: boolean;
  dsMode?: DsMode;
}) {
  const [open, setOpen] = useState<Record<Section, boolean>>({
    Color: true,
    Typography: true,
    Spacing: false,
    "Border & Radius": false,
    Shadow: false,
    Components: false,
  });
  const update = useWorkspaceStore((s) => s.updateTokens);
  const reset = useWorkspaceStore((s) => s.resetTokens);
  const plan = useAuthStore((s) => s.user?.plan);
  const isFree = plan === "Free";

  const toggle = (s: Section) => setOpen((p) => ({ ...p, [s]: !p[s] }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-200 px-4 py-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
          컨셉 {concept}
        </div>
        <div className="mt-0.5 text-sm font-semibold text-ink-900">
          {conceptName}
        </div>
        <button
          onClick={() => void reset(concept)}
          className="mt-1.5 text-[11px] text-ink-500 hover:text-brand-600 hover:underline"
        >
          ↺ 서버 저장본으로 되돌리기
        </button>

        {readOnly && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
            컨셉 확정 후 비확정 컨셉은 읽기 전용이다. 수정하려면 상단에서 확정을
            해제한다.
          </div>
        )}
        {!readOnly && dsMode === "unified" && (
          <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-2 text-[11px] leading-relaxed text-brand-700">
            단일 DS 통일 — Typography·Spacing 등 Base 항목 수정은 전 컨셉에 함께
            반영된다. 강조색(Secondary·Info)만 컨셉별로 달라진다.
          </div>
        )}
      </div>

      <div
        className={cn(
          "flex-1 overflow-y-auto scrollbar-thin",
          readOnly && "pointer-events-none opacity-60",
        )}
      >
        {/* COLOR */}
        <PanelSection
          title="Color"
          open={open.Color}
          onToggle={() => toggle("Color")}
        >
          <div className="space-y-2.5">
            <ColorSwatch
              label="Primary"
              value={tokens.color.primary}
              onChange={(v) => update(concept, { color: { primary: v } })}
              contrastAgainst={tokens.color.surface}
            />
            <ColorSwatch
              label="Secondary"
              value={tokens.color.secondary}
              onChange={(v) => update(concept, { color: { secondary: v } })}
              contrastAgainst={tokens.color.surface}
            />
            <ColorSwatch
              label="Neutral"
              value={tokens.color.neutral}
              onChange={(v) => update(concept, { color: { neutral: v } })}
            />
            <div className="my-2 border-t border-ink-100" />
            <ColorSwatch
              label="Background"
              value={tokens.color.background}
              onChange={(v) => update(concept, { color: { background: v } })}
            />
            <ColorSwatch
              label="Surface"
              value={tokens.color.surface}
              onChange={(v) => update(concept, { color: { surface: v } })}
            />
            <ColorSwatch
              label="Text"
              value={tokens.color.text}
              onChange={(v) => update(concept, { color: { text: v } })}
              contrastAgainst={tokens.color.surface}
            />
            <ColorSwatch
              label="Text Muted"
              value={tokens.color.textMuted}
              onChange={(v) => update(concept, { color: { textMuted: v } })}
              contrastAgainst={tokens.color.surface}
            />
            <div className="my-2 border-t border-ink-100" />
            <div className="grid grid-cols-2 gap-2">
              <ColorSwatch
                label="Success"
                value={tokens.color.success}
                onChange={(v) => update(concept, { color: { success: v } })}
              />
              <ColorSwatch
                label="Warning"
                value={tokens.color.warning}
                onChange={(v) => update(concept, { color: { warning: v } })}
              />
              <ColorSwatch
                label="Error"
                value={tokens.color.error}
                onChange={(v) => update(concept, { color: { error: v } })}
              />
              <ColorSwatch
                label="Info"
                value={tokens.color.info}
                onChange={(v) => update(concept, { color: { info: v } })}
              />
            </div>
          </div>
        </PanelSection>

        {/* TYPOGRAPHY */}
        <PanelSection
          title="Typography"
          open={open.Typography}
          onToggle={() => toggle("Typography")}
          lockedForFree={isFree}
        >
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-700">
                Font Family
              </span>
              <select
                value={tokens.typography.fontFamily}
                disabled={isFree}
                onChange={(e) =>
                  update(concept, {
                    typography: { fontFamily: e.target.value },
                  })
                }
                className="block w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50 disabled:text-ink-400"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <Slider
              label="Base Size"
              unit="px"
              min={12}
              max={20}
              value={tokens.typography.baseSize}
              onChange={(n) =>
                !isFree && update(concept, { typography: { baseSize: n } })
              }
            />
            <Slider
              label="Type Scale"
              min={1.1}
              max={1.5}
              step={0.025}
              value={tokens.typography.scale}
              onChange={(n) =>
                !isFree && update(concept, { typography: { scale: n } })
              }
            />
            <Slider
              label="Line Height"
              min={1.2}
              max={2}
              step={0.05}
              value={tokens.typography.lineHeight}
              onChange={(n) =>
                !isFree && update(concept, { typography: { lineHeight: n } })
              }
            />
            <Slider
              label="Letter Spacing"
              unit="em"
              min={-0.03}
              max={0.05}
              step={0.005}
              value={tokens.typography.letterSpacing}
              onChange={(n) =>
                !isFree && update(concept, { typography: { letterSpacing: n } })
              }
            />
          </div>
        </PanelSection>

        {/* SPACING */}
        <PanelSection
          title="Spacing"
          open={open.Spacing}
          onToggle={() => toggle("Spacing")}
          lockedForFree={isFree}
        >
          <Slider
            label="Base Unit"
            unit="px"
            min={4}
            max={16}
            value={tokens.spacing.baseUnit}
            onChange={(n) =>
              !isFree && update(concept, { spacing: { baseUnit: n } })
            }
          />
          <div className="mt-3 flex items-end gap-1">
            {[0.5, 1, 1.5, 2, 3, 4, 6].map((m) => (
              <div
                key={m}
                className="flex flex-col items-center gap-1 text-[9px] text-ink-500"
              >
                <div
                  className="rounded-sm bg-brand-500"
                  style={{
                    width: 12,
                    height: tokens.spacing.baseUnit * m,
                  }}
                />
                <span>{`${tokens.spacing.baseUnit * m}px`}</span>
              </div>
            ))}
          </div>
        </PanelSection>

        {/* BORDER */}
        <PanelSection
          title="Border & Radius"
          open={open["Border & Radius"]}
          onToggle={() => toggle("Border & Radius")}
          lockedForFree={isFree}
        >
          <div className="space-y-3">
            <Slider
              label="Border Width"
              unit="px"
              min={0}
              max={4}
              value={tokens.border.width}
              onChange={(n) =>
                !isFree && update(concept, { border: { width: n } })
              }
            />
            <Slider
              label="Radius (sm)"
              unit="px"
              min={0}
              max={24}
              value={tokens.border.radiusSm}
              onChange={(n) =>
                !isFree && update(concept, { border: { radiusSm: n } })
              }
            />
            <Slider
              label="Radius (md)"
              unit="px"
              min={0}
              max={32}
              value={tokens.border.radiusMd}
              onChange={(n) =>
                !isFree && update(concept, { border: { radiusMd: n } })
              }
            />
            <Slider
              label="Radius (lg)"
              unit="px"
              min={0}
              max={48}
              value={tokens.border.radiusLg}
              onChange={(n) =>
                !isFree && update(concept, { border: { radiusLg: n } })
              }
            />
          </div>
        </PanelSection>

        {/* SHADOW */}
        <PanelSection
          title="Shadow"
          open={open.Shadow}
          onToggle={() => toggle("Shadow")}
          lockedForFree={isFree}
        >
          <div className="grid grid-cols-5 gap-1.5">
            {(["none", "sm", "md", "lg", "xl"] as const).map((p) => (
              <button
                key={p}
                type="button"
                disabled={isFree}
                onClick={() => update(concept, { shadow: { preset: p } })}
                className={cn(
                  "rounded-lg border px-2 py-2.5 text-[11px] font-medium uppercase disabled:cursor-not-allowed disabled:opacity-50",
                  tokens.shadow.preset === p
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </PanelSection>

        {/* COMPONENTS */}
        <PanelSection
          title="Components"
          open={open.Components}
          onToggle={() => toggle("Components")}
          lockedForFree={isFree}
        >
          <div className="space-y-3">
            <SegmentControl
              label="Button Shape"
              value={tokens.components.buttonVariant}
              disabled={isFree}
              options={[
                { v: "rounded", l: "Rounded" },
                { v: "pill", l: "Pill" },
                { v: "square", l: "Square" },
              ]}
              onChange={(v) =>
                update(concept, {
                  components: {
                    buttonVariant: v as DesignTokens["components"]["buttonVariant"],
                  },
                })
              }
            />
            <SegmentControl
              label="Input Style"
              value={tokens.components.inputStyle}
              disabled={isFree}
              options={[
                { v: "outlined", l: "Outlined" },
                { v: "filled", l: "Filled" },
                { v: "underline", l: "Underline" },
              ]}
              onChange={(v) =>
                update(concept, {
                  components: {
                    inputStyle: v as DesignTokens["components"]["inputStyle"],
                  },
                })
              }
            />
            <SegmentControl
              label="Card Elevation"
              value={tokens.components.cardElevation}
              disabled={isFree}
              options={[
                { v: "flat", l: "Flat" },
                { v: "outlined", l: "Outlined" },
                { v: "raised", l: "Raised" },
              ]}
              onChange={(v) =>
                update(concept, {
                  components: {
                    cardElevation:
                      v as DesignTokens["components"]["cardElevation"],
                  },
                })
              }
            />
          </div>
        </PanelSection>
      </div>
    </div>
  );
}

function PanelSection({
  title,
  open,
  onToggle,
  children,
  lockedForFree,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  lockedForFree?: boolean;
}) {
  return (
    <section className="border-b border-ink-100">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-ink-50"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-800">
          {title}
          {lockedForFree && <Badge tone="warning">Pro</Badge>}
        </span>
        <span className="text-xs text-ink-400">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

function SegmentControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<{ v: T; l: string }>;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-ink-700">{label}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className={cn(
              "rounded-lg border py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50",
              value === o.v
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50",
            )}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
