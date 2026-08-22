"use client";

import { CSSProperties, useMemo, useState } from "react";
import { tokensToCssVars } from "@/lib/token-utils";
import type { DesignTokens, Mockup } from "@/lib/types";
import { MockupRenderer, type SelectionChain } from "./MockupRenderer";

export const VIEWPORT_WIDTH = {
  Desktop: 1440,
  Tablet: 768,
  Mobile: 390,
} as const;

/** 완성 페이지 높이를 재기 전에 쓰는 초기 프레임. */
export const CANVAS_HEIGHT = { Desktop: 900, Tablet: 900, Mobile: 720 } as const;

/** 세로로 아무리 길어도 여기서 끊는다 — 브라우저가 감당할 상한. */
const MAX_CANVAS_HEIGHT = 20000;

interface Props {
  tokens: DesignTokens;
  mockup: Mockup;
  projectName: string;
  viewport: keyof typeof VIEWPORT_WIDTH;
  zoom: number;
  caption?: string;
  selectable?: boolean;
  onSelect?: (chain: SelectionChain) => void;
  /** 더블클릭 — 선택 사슬에서 한 단계 안으로. */
  onEnterChild?: () => void;
}

export function MockupCanvas({
  tokens,
  mockup,
  projectName,
  viewport,
  zoom,
  caption,
  selectable,
  onSelect,
  onEnterChild,
}: Props) {
  const vars = useMemo(() => tokensToCssVars(tokens), [tokens]);
  const width = VIEWPORT_WIDTH[viewport];
  const scale = zoom / 100;

  // 완성 페이지 시안은 세로로 길다 — 레퍼런스 실무 시안이 2,600~13,000px 다.
  // 고정 프레임에 가두면 첫 화면만 보이고, 그 순간 시안이 아니라 목업이 된다.
  // 그래서 실제 내용 높이를 재서 프레임을 그 높이에 맞춘다.
  const [measured, setMeasured] = useState<number | null>(null);
  const height = Math.min(
    measured ?? CANVAS_HEIGHT[viewport],
    MAX_CANVAS_HEIGHT,
  );

  return (
    <div className="flex h-full flex-col items-center">
      {caption && (
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-500">
          {caption}
        </div>
      )}
      <div
        className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white"
        style={{
          width: width * scale,
          height: height * scale,
          maxWidth: "100%",
        }}
      >
        <div
          style={
            {
              ...(vars as CSSProperties),
              width,
              height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              background: "var(--ds-color-bg)",
              overflow: "hidden",
            } as CSSProperties
          }
        >
          <MockupRenderer
            mockup={mockup}
            projectName={projectName}
            tokens={tokens}
            width={width}
            onHeight={setMeasured}
            onSelect={selectable ? onSelect : undefined}
            onEnterChild={selectable ? onEnterChild : undefined}
          />
        </div>
      </div>
    </div>
  );
}
