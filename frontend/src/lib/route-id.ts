"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * 정적 export(Firebase Hosting) 대응 라우트 ID 훅.
 *
 * `output: "export"` 에서는 동적 세그먼트를 빌드 시점에 알 수 없으므로
 * 센티널 경로 하나(`__id__`)만 프리렌더하고, Firebase rewrite 로 실제 URL 을
 * 그 HTML 에 매핑한다. 그 때문에 `useParams()` 가 센티널을 돌려줄 수 있어
 * 실제 값은 브라우저 주소에서 읽는다.
 */
import { ROUTE_ID_SENTINEL } from "./route-sentinel";

export { ROUTE_ID_SENTINEL };

export function useRouteId(segmentIndex: number): string {
  const params = useParams();
  const fromParams = normalize(params?.id);

  const [id, setId] = useState(
    fromParams && fromParams !== ROUTE_ID_SENTINEL ? fromParams : "",
  );

  useEffect(() => {
    if (fromParams && fromParams !== ROUTE_ID_SENTINEL) {
      setId(fromParams);
      return;
    }
    if (typeof window === "undefined") return;
    const segments = window.location.pathname.split("/").filter(Boolean);
    setId(decodeURIComponent(segments[segmentIndex] ?? ""));
  }, [fromParams, segmentIndex]);

  return id;
}

function normalize(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
