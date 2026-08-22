"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { api } from "@/lib/api";
import type { DesignTokens } from "@/lib/types";

/**
 * 디자인 시스템·컴포넌트 가이드 패널.
 *
 * 가이드는 서버가 컨셉 토큰에서 계산해 HTML 로 준다. 저장하지 않으므로
 * 토큰을 고치면 다시 받아 온 문서가 곧 최신이다 — 그래서 `tokens` 가 바뀌면
 * 다시 부른다.
 *
 * 시안과 같은 이유로 **Shadow DOM** 안에 넣는다. 가이드 마크업은 자기 CSS 를
 * 데리고 오는데, 그대로 DOM 에 두면 `.g-h2` 같은 선택자가 앱 UI 로 샌다.
 */

interface Props {
  projectId: string;
  conceptLabel: string;
  /** 토큰이 바뀌면 다시 받아 온다. 값 자체는 서버가 계산에 쓴다. */
  tokens: DesignTokens;
}

interface Contrast {
  token: string;
  value: string;
  ratio: number;
  grade: string;
}

export function DesignGuidePanel({ projectId, conceptLabel, tokens }: Props) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<ShadowRoot | null>(null);
  const [html, setHtml] = useState<string>("");
  const [contrast, setContrast] = useState<Contrast[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || rootRef.current) return;
    rootRef.current = host.attachShadow({ mode: "open" });
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api.designSystems
      .guide(projectId, conceptLabel)
      .then((res) => {
        if (!alive) return;
        setHtml(res.html);
        setContrast(res.contrast ?? []);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : t("guide.loadFailed"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // tokens 를 의존성에 두어 토큰 편집이 가이드에 즉시 반영되게 한다.
  }, [projectId, conceptLabel, tokens, t]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.innerHTML = html;
  }, [html]);

  const failing = contrast.filter((c) => c.grade === "미달");

  return (
    <div className="mx-auto max-w-[1240px]">
      {failing.length > 0 && (
        // 미달 항목은 문서 안에도 있지만, 스크롤해야 보인다. 접근성 문제는
        // 찾아야 보이면 안 고쳐지므로 위로 끌어올린다.
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold text-amber-800">
            {t("guide.contrastWarnTitle", { n: failing.length })}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {failing.map((c) => (
              <span
                key={c.token}
                className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-[11px] text-ink-700"
              >
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ background: c.value }}
                />
                <code>{c.token}</code>
                <span className="text-ink-500">{c.ratio}:1</span>
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-amber-700">
            {t("guide.contrastWarnHint")}
          </p>
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-ink-200 bg-surface px-4 py-10 text-center text-xs text-ink-500">
          {t("guide.loading")}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-6 text-center text-xs text-danger-700">
          {error}
        </div>
      )}

      <div
        ref={hostRef}
        className="overflow-hidden rounded-xl border border-ink-200 bg-surface shadow-sm"
      />
    </div>
  );
}
