"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";

/**
 * 시안 뷰어의 조작 계층 — Zoom·Pan·미니맵 (기능정의서 v0.2.0 §3.1 '시안 뷰어').
 *
 * 시안 자체를 그리는 것은 `MockupCanvas` 가 하고, 여기서는 **어디를 얼마나 크게
 * 보는지만** 다룬다. 두 관심사를 섞으면 확대 상태가 렌더링 로직에 스며든다.
 *
 * 좌표 규칙 하나만 지키면 나머지는 따라온다 — 내용 상자의 좌상단을 컨테이너 기준
 * `offset` 에 놓고, 확대는 그 상자 안에서 일어난다. 그래서 커서 아래 지점을 고정한
 * 확대는 배율만 바꿔 offset 을 다시 계산하면 된다.
 */

export const ZOOM_MIN = 10;
export const ZOOM_MAX = 400;

interface Props {
  /** 내용의 원래 크기 (배율 1일 때 픽셀). */
  contentWidth: number;
  contentHeight: number;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  /** 값이 바뀌면 화면에 맞춘다 — Ctrl/Cmd+0·[맞춤] 버튼이 올린다. */
  fitSignal?: number;
  /** 화면·변형이 바뀌면 보던 위치를 초기화한다. */
  resetKey?: string;
  /**
   * 위치를 밖에서 쥐면(제어형) 여러 스테이지가 같은 지점을 본다 — 비교 모드의
   * Pan 동기화가 이 경로다. 주지 않으면 각자 자기 위치를 갖는다.
   */
  offset?: { x: number; y: number };
  onOffsetChange?: (offset: { x: number; y: number }) => void;
  children: React.ReactNode;
}

const clampZoom = (v: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));

/** 어떤 조작으로도 시안 일부는 화면에 남긴다 — 통째로 밀려나면 돌아올 길이 없다. */
const MIN_VISIBLE = 80;

export function CanvasStage({
  contentWidth,
  contentHeight,
  zoom,
  onZoomChange,
  fitSignal = 0,
  resetKey,
  offset: offsetProp,
  onOffsetChange,
  children,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [innerOffset, setInnerOffset] = useState({ x: 0, y: 0 });
  const controlled = offsetProp !== undefined;
  const offset = controlled ? offsetProp : innerOffset;
  const setOffset = useCallback(
    (next: { x: number; y: number } | ((o: { x: number; y: number }) => { x: number; y: number })) => {
      const value = typeof next === "function" ? next(offset) : next;
      if (controlled) onOffsetChange?.(value);
      else setInnerOffset(value);
    },
    [controlled, offset, onOffsetChange],
  );
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [dragging, setDragging] = useState(false);

  const scale = zoom / 100;

  // 컨테이너 크기를 알아야 '맞춤'과 미니맵을 계산할 수 있다.
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 내용이 화면에서 완전히 벗어나지 않도록 위치를 가둔다. */
  const clampOffset = useCallback(
    (o: { x: number; y: number }, s: number) => {
      if (!box.w || !box.h) return o;
      const w = contentWidth * s;
      const h = contentHeight * s;
      return {
        x: Math.max(MIN_VISIBLE - w, Math.min(box.w - MIN_VISIBLE, o.x)),
        y: Math.max(MIN_VISIBLE - h, Math.min(box.h - MIN_VISIBLE, o.y)),
      };
    },
    [box.w, box.h, contentWidth, contentHeight],
  );

  const center = useCallback(
    (nextScale: number) => {
      setOffset({
        x: (box.w - contentWidth * nextScale) / 2,
        y: (box.h - contentHeight * nextScale) / 2,
      });
    },
    [box.w, box.h, contentWidth, contentHeight],
  );

  const fit = useCallback(() => {
    if (!box.w || !box.h) return;
    const pad = 48;
    const s = Math.min(
      (box.w - pad) / contentWidth,
      (box.h - pad) / contentHeight,
    );
    const next = clampZoom(Math.floor(s * 100));
    onZoomChange(next);
    center(next / 100);
  }, [box.w, box.h, contentWidth, contentHeight, onZoomChange, center]);

  // 처음 열릴 때와 화면·변형이 바뀔 때는 가운데에서 시작한다.
  useEffect(() => {
    if (box.w && box.h) center(scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, box.w, box.h]);

  useEffect(() => {
    if (fitSignal > 0) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  /** 커서 아래 지점을 고정한 채 배율만 바꾼다. */
  const zoomAt = useCallback(
    (nextZoom: number, cx: number, cy: number) => {
      const next = clampZoom(nextZoom);
      if (next === zoom) return;
      const s0 = zoom / 100;
      const s1 = next / 100;
      setOffset((o) =>
        clampOffset(
          { x: cx - (cx - o.x) * (s1 / s0), y: cy - (cy - o.y) * (s1 / s0) },
          s1,
        ),
      );
      onZoomChange(next);
    },
    [zoom, onZoomChange, clampOffset],
  );

  // 휠 확대 (기능정의서 §3.1 '시안 뷰어 — Zoom 마우스 휠').
  // passive:false 로 직접 붙여야 브라우저 기본 스크롤을 막을 수 있다.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      // 트랙패드는 작은 delta 를 많이 보내므로 비율로 다룬다.
      const factor = Math.exp(-e.deltaY / 400);
      zoomAt(Math.round(zoom * factor), cx, cy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, zoomAt]);

  // Space 를 누르는 동안 손바닥 도구가 된다.
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return (
        !!el &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
          el.isContentEditable)
      );
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        e.preventDefault(); // 스페이스로 페이지가 스크롤되지 않게
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    // 창을 벗어나면 눌린 상태로 남지 않게 푼다.
    const blur = () => setSpaceDown(false);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const panFrom = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );

  const startPan = (e: React.MouseEvent) => {
    // Space + 좌클릭 또는 휠 버튼 드래그.
    if (!(spaceDown || e.button === 1)) return;
    e.preventDefault();
    panFrom.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      const from = panFrom.current;
      if (!from) return;
      setOffset(
        clampOffset(
          { x: from.ox + (e.clientX - from.x), y: from.oy + (e.clientY - from.y) },
          scale,
        ),
      );
    };
    const stop = () => {
      panFrom.current = null;
      setDragging(false);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
  }, [dragging, clampOffset, scale]);

  // 미니맵 — 내용 전체를 축소해 그리고, 지금 보이는 범위를 사각형으로 표시한다.
  const MINI_W = 132;
  const miniScale = MINI_W / contentWidth;
  const miniH = Math.round(contentHeight * miniScale);
  const view = {
    x: (-offset.x / scale) * miniScale,
    y: (-offset.y / scale) * miniScale,
    w: (box.w / scale) * miniScale,
    h: (box.h / scale) * miniScale,
  };
  const overflowing = view.w < MINI_W - 1 || view.h < miniH - 1;

  /** 미니맵을 누르면 그 지점이 화면 가운데로 오도록 옮긴다. */
  const jumpTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / miniScale;
    const py = (e.clientY - rect.top) / miniScale;
    setOffset(
      clampOffset({ x: box.w / 2 - px * scale, y: box.h / 2 - py * scale }, scale),
    );
  };

  return (
    <div
      ref={hostRef}
      onMouseDown={startPan}
      className={cn(
        "group relative h-full w-full overflow-hidden",
        dragging ? "cursor-grabbing" : spaceDown ? "cursor-grab" : "cursor-default",
      )}
    >
      <div
        style={{
          position: "absolute",
          left: offset.x,
          top: offset.y,
          // 드래그 중에는 전환 효과를 끄지 않으면 커서보다 늦게 따라온다.
          transition: dragging ? "none" : "left 80ms linear, top 80ms linear",
        }}
      >
        {children}
      </div>

      {/* 조작 힌트 — 처음 쓰는 사람이 Space 드래그를 알 길이 없다. */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-ink-900/75 px-2 py-1 text-[10px] text-ink-50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        휠 확대 · Space 드래그 이동
      </div>

      {overflowing && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={jumpTo}
          className="absolute bottom-3 right-3 cursor-pointer overflow-hidden rounded-lg border border-ink-300 bg-surface/90 shadow-lg backdrop-blur"
          style={{ width: MINI_W, height: miniH }}
          title="클릭한 지점으로 이동한다"
        >
          <div className="absolute inset-0 bg-ink-100" />
          <div
            className="absolute border-2 border-brand-500 bg-brand-500/10"
            style={{
              left: Math.max(0, view.x),
              top: Math.max(0, view.y),
              width: Math.min(MINI_W, view.w),
              height: Math.min(miniH, view.h),
            }}
          />
        </div>
      )}
    </div>
  );
}
