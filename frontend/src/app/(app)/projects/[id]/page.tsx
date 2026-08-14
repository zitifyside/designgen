import { ROUTE_ID_SENTINEL } from "@/lib/route-sentinel";
import WorkspaceClient from "./WorkspaceClient";

/**
 * 정적 export 대응 — 센티널 경로 하나만 프리렌더하고, 실제 프로젝트 ID 는
 * Firebase rewrite 를 거쳐 클라이언트에서 주소로 읽는다 (lib/route-id.ts).
 */
export function generateStaticParams() {
  return [{ id: ROUTE_ID_SENTINEL }];
}

export default function WorkspacePage() {
  return <WorkspaceClient />;
}
