import type { DesignTokens } from "./types";

const SHADOW_MAP: Record<DesignTokens["shadow"]["preset"], string> = {
  none: "none",
  sm: "0 1px 2px 0 rgba(15, 23, 42, 0.06)",
  md: "0 4px 12px -2px rgba(15, 23, 42, 0.10)",
  lg: "0 12px 28px -4px rgba(15, 23, 42, 0.18)",
  xl: "0 24px 48px -8px rgba(15, 23, 42, 0.24)",
};

export function tokensToCssVars(tokens: DesignTokens): Record<string, string> {
  const { color, typography, spacing, border, shadow, components } = tokens;
  const base = spacing.baseUnit;
  return {
    "--ds-color-primary": color.primary,
    "--ds-color-secondary": color.secondary,
    "--ds-color-neutral": color.neutral,
    "--ds-color-bg": color.background,
    "--ds-color-surface": color.surface,
    "--ds-color-text": color.text,
    "--ds-color-text-muted": color.textMuted,
    "--ds-color-success": color.success,
    "--ds-color-warning": color.warning,
    "--ds-color-error": color.error,
    "--ds-color-info": color.info,

    "--ds-font-family": typography.fontFamily,
    "--ds-font-size-base": `${typography.baseSize}px`,
    "--ds-font-size-sm": `${Math.round(typography.baseSize / typography.scale)}px`,
    "--ds-font-size-lg": `${Math.round(typography.baseSize * typography.scale)}px`,
    "--ds-font-size-xl": `${Math.round(typography.baseSize * typography.scale * typography.scale)}px`,
    "--ds-font-size-2xl": `${Math.round(typography.baseSize * Math.pow(typography.scale, 3))}px`,
    "--ds-font-size-3xl": `${Math.round(typography.baseSize * Math.pow(typography.scale, 4))}px`,
    "--ds-font-weight-regular": String(typography.weights.regular),
    "--ds-font-weight-medium": String(typography.weights.medium),
    "--ds-font-weight-bold": String(typography.weights.bold),
    "--ds-line-height": String(typography.lineHeight),
    "--ds-letter-spacing": `${typography.letterSpacing}em`,

    "--ds-space-1": `${base * 0.5}px`,
    "--ds-space-2": `${base}px`,
    "--ds-space-3": `${base * 1.5}px`,
    "--ds-space-4": `${base * 2}px`,
    "--ds-space-5": `${base * 3}px`,
    "--ds-space-6": `${base * 4}px`,
    "--ds-space-7": `${base * 6}px`,

    "--ds-border-width": `${border.width}px`,
    "--ds-border-style": border.style,
    "--ds-radius-sm": `${border.radiusSm}px`,
    "--ds-radius-md": `${border.radiusMd}px`,
    "--ds-radius-lg": `${border.radiusLg}px`,
    "--ds-radius-button":
      components.buttonVariant === "pill"
        ? "999px"
        : components.buttonVariant === "square"
          ? "4px"
          : `${border.radiusMd}px`,

    "--ds-shadow": SHADOW_MAP[shadow.preset],
    "--ds-shadow-card":
      components.cardElevation === "flat"
        ? "none"
        : components.cardElevation === "outlined"
          ? "none"
          : SHADOW_MAP[shadow.preset],
    "--ds-card-border":
      components.cardElevation === "outlined" ? `1px solid ${color.neutral}33` : "none",

    "--ds-input-bg":
      components.inputStyle === "filled" ? `${color.neutral}1A` : color.surface,
    "--ds-input-border":
      components.inputStyle === "underline"
        ? `0 0 1px 0`
        : `${border.width}px`,
  };
}

export function dtcgExport(tokens: DesignTokens, conceptName: string) {
  return {
    $schema:
      "https://design-tokens.github.io/community-group/format/draft-02/",
    $description: `AI Design Generator — ${conceptName} concept tokens`,
    color: {
      primary: { $type: "color", $value: tokens.color.primary },
      secondary: { $type: "color", $value: tokens.color.secondary },
      neutral: { $type: "color", $value: tokens.color.neutral },
      background: { $type: "color", $value: tokens.color.background },
      surface: { $type: "color", $value: tokens.color.surface },
      text: { $type: "color", $value: tokens.color.text },
      "text-muted": { $type: "color", $value: tokens.color.textMuted },
      success: { $type: "color", $value: tokens.color.success },
      warning: { $type: "color", $value: tokens.color.warning },
      error: { $type: "color", $value: tokens.color.error },
      info: { $type: "color", $value: tokens.color.info },
    },
    typography: {
      "font-family": {
        $type: "fontFamily",
        $value: [tokens.typography.fontFamily, "system-ui", "sans-serif"],
      },
      "size-base": {
        $type: "dimension",
        $value: `${tokens.typography.baseSize}px`,
      },
      scale: { $type: "number", $value: tokens.typography.scale },
    },
    spacing: {
      "base-unit": {
        $type: "dimension",
        $value: `${tokens.spacing.baseUnit}px`,
      },
    },
    border: {
      width: { $type: "dimension", $value: `${tokens.border.width}px` },
      "radius-md": {
        $type: "dimension",
        $value: `${tokens.border.radiusMd}px`,
      },
    },
    shadow: { preset: { $type: "shadow", $value: tokens.shadow.preset } },
  };
}

const HEX_3_OR_6 = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export function isHex(v: string): boolean {
  return HEX_3_OR_6.test(v);
}

export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relLuminance(hex1);
  const l2 = relLuminance(hex2);
  const [light, dark] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

function relLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}
