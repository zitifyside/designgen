"use client";

import { CSSProperties, useMemo } from "react";
import { tokensToCssVars } from "@/lib/token-utils";
import type { DesignTokens, Mockup } from "@/lib/types";
import { MockupRenderer } from "./MockupRenderer";

const VP = {
  Desktop: 1440,
  Tablet: 768,
  Mobile: 390,
} as const;

interface Props {
  tokens: DesignTokens;
  mockup: Mockup;
  projectName: string;
  viewport: keyof typeof VP;
  zoom: number;
  caption?: string;
}

export function MockupCanvas({
  tokens,
  mockup,
  projectName,
  viewport,
  zoom,
  caption,
}: Props) {
  const vars = useMemo(() => tokensToCssVars(tokens), [tokens]);
  const width = VP[viewport];
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
          maxWidth: "100%",
        }}
      >
        <div
          style={
            {
              ...(vars as CSSProperties),
              width,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              background: "var(--ds-color-bg)",
            } as CSSProperties
          }
        >
          <div
            style={{
              minHeight: viewport === "Mobile" ? 720 : 900,
            }}
          >
            <MockupRenderer mockup={mockup} projectName={projectName} />
          </div>
        </div>
        <div
          aria-hidden
          style={{
            width: width * scale,
            height: (viewport === "Mobile" ? 720 : 900) * scale,
          }}
        />
      </div>
    </div>
  );
}
