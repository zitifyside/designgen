/**
 * 정적 export 에서 동적 세그먼트를 대신하는 센티널 값.
 *
 * 서버 컴포넌트(generateStaticParams)와 클라이언트 훅이 함께 쓰므로
 * "use client" 가 없는 별도 모듈로 둔다 — 클라이언트 모듈에서 상수를 가져오면
 * 서버 빌드에서 클라이언트 참조 객체로 넘어와 문자열이 아니게 된다.
 */
export const ROUTE_ID_SENTINEL = "__id__";
