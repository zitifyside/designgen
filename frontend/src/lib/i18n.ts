import { DEFAULT_LOCALE, LOCALE_KEY, type Locale } from "@/lib/locale-init";
import en from "@/locales/en.json";
import ko from "@/locales/ko.json";

export type MessageTree = { [key: string]: string | MessageTree };
export type TranslateVars = Record<string, string | number>;

const MESSAGES: Record<Locale, MessageTree> = {
  ko: ko as MessageTree,
  en: en as MessageTree,
};

export function interpolate(
  template: string,
  vars?: TranslateVars,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] === undefined ? `{${name}}` : String(vars[name]),
  );
}

export function lookup(tree: MessageTree, path: string): string | undefined {
  const parts = path.split(".");
  let current: string | MessageTree | undefined = tree;
  for (const part of parts) {
    if (current == null || typeof current === "string") return undefined;
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function translate(
  locale: Locale,
  key: string,
  vars?: TranslateVars,
): string {
  const raw =
    lookup(MESSAGES[locale], key) ?? lookup(MESSAGES.ko, key) ?? key;
  return interpolate(raw, vars);
}

function storedLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const value = localStorage.getItem(LOCALE_KEY);
    if (value === "ko" || value === "en") return value;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

/** React 훅 없이 쓰는 번역 — API·스토어 에러 메시지용. */
export function tStored(key: string, vars?: TranslateVars): string {
  return translate(storedLocale(), key, vars);
}
