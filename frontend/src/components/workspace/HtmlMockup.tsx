"use client";

import { CSSProperties, useCallback, useEffect, useRef } from "react";
import type { ElementSelection, SelectionChain } from "./MockupRenderer";

/**
 * Stage 4 Renderer 가 그린 완성 페이지 시안을 화면에 놓는다.
 *
 * 마크업은 모델이 쓴 것이고 스타일시트도 함께 딸려 온다. 그걸 그냥 DOM 에
 * 넣으면 `section { padding: 80px }` 같은 선택자가 앱 UI 전체를 물들인다.
 * 그래서 **Shadow DOM** 안에 넣는다 — 선택자는 경계를 넘지 못하고, CSS
 * 사용자 정의 속성(`--ds-*`)은 상속되므로 토큰 편집은 그대로 살아 있다.
 * 서버에서 접두어를 붙여 격리하는 방식보다 정확하고, 프론트에서 파서를
 * 다시 만들 필요도 없다.
 *
 * 클릭 선택은 `composedPath()` 로 읽는다. Shadow 경계 안쪽에서는 평범한
 * `parentElement` 사슬이 호스트에서 끊기기 때문이다.
 */

interface Props {
  html: string;
  /** 페이지 폭. 모델은 이 폭을 기준으로 그렸다. */
  width: number;
  onSelect?: (chain: SelectionChain) => void;
  onEnterChild?: () => void;
  /** 내용 높이가 확정되면 알려 준다 — 캔버스가 프레임을 맞춘다. */
  onHeight?: (height: number) => void;
}

/** 요소 하나를 선택 정보로 옮긴다. */
function describe(el: Element): ElementSelection | null {
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return null;
  const tag = el.tagName.toLowerCase();
  if (tag === "style") return null;

  const section = el.getAttribute("data-section");
  const label = section ? `${tag} · ${section}` : tag;

  // 이 요소가 실제로 쓰는 토큰만 모은다. 전부 나열하면 패널이 토큰 사전이
  // 되어 버려서, 지금 눈에 보이는 것과 이어지지 않는다.
  const style = getComputedStyle(el);
  const tokenRefs: ElementSelection["tokenRefs"] = [];
  const inline = el.getAttribute("style") ?? "";
  const used = new Set<string>();
  for (const match of inline.matchAll(/var\((--ds-[a-z0-9-]+)\)/gi)) {
    used.add(match[1]);
  }
  for (const token of used) {
    const value = style.getPropertyValue(token).trim();
    if (value) tokenRefs.push({ label: token.replace("--ds-", ""), token, value });
  }

  return { type: label, path: [label], tokenRefs };
}

export function HtmlMockup({ html, width, onSelect, onEnterChild, onHeight }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<ShadowRoot | null>(null);

  // Shadow 루트는 한 번만 붙인다 — attachShadow 를 두 번 부르면 던진다.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || rootRef.current) return;
    rootRef.current = host.attachShadow({ mode: "open" });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // 시안 안에서만 통하는 기본값. 바깥 리셋이 Shadow 경계를 넘어오지 않으므로
    // 여기서 다시 깔아 준다.
    root.innerHTML = `<style>
      :host { display: block; }
      * { box-sizing: border-box; }
      body, div, section, p, h1, h2, h3, h4, h5, h6, ul, ol, li, figure { margin: 0; padding: 0; }
      ul, ol { list-style: none; }
      a { color: inherit; text-decoration: none; }
      img { display: block; max-width: 100%; }
      button, input, select, textarea { font: inherit; color: inherit; }
      .adg-page {
        width: ${width}px;
        font-family: var(--ds-font-family);
        color: var(--ds-color-text);
        background: var(--ds-color-bg);
      }
    </style><div class="adg-page">${html}</div>`;

    const page = root.querySelector(".adg-page") as HTMLElement | null;
    if (!page || !onHeight) return;

    // 이미지가 늦게 도착하면 높이가 늘어난다. 처음 한 번만 재면 아래쪽이
    // 잘린 채로 굳는다.
    const report = () => onHeight(page.scrollHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(page);
    const images = Array.from(root.querySelectorAll("img"));
    images.forEach((img) => img.addEventListener("load", report));
    return () => {
      observer.disconnect();
      images.forEach((img) => img.removeEventListener("load", report));
    };
  }, [html, width, onHeight]);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!onSelect) return;
      const chain: SelectionChain = [];
      // composedPath 는 Shadow 안쪽부터 바깥으로 준다. 선택 사슬은 바깥에서
      // 안쪽 순서라 뒤집는다.
      for (const node of event.nativeEvent.composedPath()) {
        if (!(node instanceof Element)) continue;
        if (node === hostRef.current) break;
        const described = describe(node);
        if (described) chain.unshift(described);
      }
      if (chain.length) onSelect(chain);
    },
    [onSelect],
  );

  return (
    <div
      ref={hostRef}
      onClick={handleClick}
      onDoubleClick={onEnterChild}
      style={{ width, cursor: onSelect ? "pointer" : "default" } as CSSProperties}
    />
  );
}
