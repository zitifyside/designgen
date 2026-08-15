"use client";

import { CSSProperties, useMemo } from "react";
import { tokensToCssVars } from "@/lib/token-utils";
import type { DesignTokens, Mockup } from "@/lib/types";
import { MockupRenderer, type ElementSelection } from "./MockupRenderer";

export const VIEWPORT_WIDTH = {
  Desktop: 1440,
  Tablet: 768,
  Mobile: 390,
} as const;

export const CANVAS_HEIGHT = { Desktop: 900, Tablet: 900, Mobile: 720 } as const;

interface Props {
  tokens: DesignTokens;
  mockup: Mockup;
  projectName: string;
  viewport: keyof typeof VIEWPORT_WIDTH;
  zoom: number;
  caption?: string;
  selectable?: boolean;
  onSelect?: (selection: ElementSelection) => void;
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
}: Props) {
  const vars = useMemo(() => tokensToCssVars(tokens), [tokens]);
  const width = VIEWPORT_WIDTH[viewport];
  const height = CANVAS_HEIGHT[viewport];
  const scale = zoom / 100;

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
            onSelect={selectable ? onSelect : undefined}
          />
        </div>
      </div>
    </div>
  );
}
