"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { tokensToCssVars } from "@/lib/token-utils";
import { cn } from "@/lib/cn";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { DesignSystem, Mockup } from "@/lib/types";
import { MockupRenderer } from "./MockupRenderer";

const PREVIEW_W = 1440;
const PREVIEW_H = 900;
const ASPECTS = ["4 / 5", "16 / 10", "1 / 1", "3 / 4", "5 / 4"] as const;

/**
 * 한 프롬프트에서 나온 콘셉 시안을 Awwwards 식 갤러리로 펼친다.
 * 사이트 목업 캔버스가 아니라, 방향이 다른 시안 카드를 고르는 화면이다.
 */
export function ConceptGallery({
  mockups,
  designSystems,
  projectName,
  selectedId,
  onSelect,
  onOpen,
}: {
  mockups: Mockup[];
  designSystems: DesignSystem[];
  projectName: string;
  selectedId?: string | null;
  onSelect: (mockup: Mockup) => void;
  onOpen?: (mockup: Mockup) => void;
}) {
  const { t } = useI18n();
  const dsByLabel = useMemo(
    () => Object.fromEntries(designSystems.map((d) => [d.conceptLabel, d])),
    [designSystems],
  );

  const items = useMemo(() => {
    const copy = [...mockups];
    copy.sort((a, b) => {
      if (a.index !== b.index) return a.index - b.index;
      return a.conceptLabel.localeCompare(b.conceptLabel);
    });
    return copy;
  }, [mockups]);

  if (items.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-ink-500">
        {t("workspace.noMockups")}
      </div>
    );
  }

  return (
    <div className="columns-1 gap-5 sm:columns-2 xl:columns-3 2xl:columns-4">
      {items.map((mockup) => {
        const ds = dsByLabel[mockup.conceptLabel];
        if (!ds) return null;
        const selected = mockup.id === selectedId;
        const aspect = ASPECTS[Math.abs(mockup.index) % ASPECTS.length];
        return (
          <article key={mockup.id} className="mb-6 break-inside-avoid">
            <button
              type="button"
              onClick={() => onSelect(mockup)}
              onDoubleClick={() => onOpen?.(mockup)}
              className={cn(
                "group w-full overflow-hidden rounded-xl border text-left transition",
                selected
                  ? "border-brand-500 ring-2 ring-brand-400 ring-offset-2"
                  : "border-ink-200 hover:border-ink-400",
              )}
            >
              <div
                className="relative w-full overflow-hidden bg-ink-100"
                style={{ aspectRatio: aspect }}
              >
                <ScaledPreview
                  tokens={ds.tokens}
                  mockup={mockup}
                  projectName={projectName}
                />
              </div>
            </button>
            <div className="mt-2 flex items-start justify-between gap-2 px-0.5">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-ink-900">
                  {ds.conceptName}
                </div>
                <div className="truncate text-[11px] text-ink-500">
                  {mockup.variantLabel || mockup.title}
                </div>
                {mockup.nodeTree?.creativeDirection && (
                  <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-ink-400">
                    {mockup.nodeTree.creativeDirection}
                  </div>
                )}
              </div>
              <span
                className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white"
                style={{ background: ds.tokens.color.primary }}
              >
                {mockup.conceptLabel}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ScaledPreview({
  tokens,
  mockup,
  projectName,
}: {
  tokens: DesignSystem["tokens"];
  mockup: Mockup;
  projectName: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  const vars = useMemo(() => tokensToCssVars(tokens), [tokens]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / PREVIEW_W);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <div
        style={
          {
            ...(vars as CSSProperties),
            width: PREVIEW_W,
            height: PREVIEW_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            background: "var(--ds-color-bg)",
            pointerEvents: "none",
          } as CSSProperties
        }
      >
        <MockupRenderer
          mockup={mockup}
          projectName={projectName}
          tokens={tokens}
        />
      </div>
    </div>
  );
}
