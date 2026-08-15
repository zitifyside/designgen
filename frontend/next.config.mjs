/** @type {import('next').NextConfig} */

// Firebase Hosting 은 정적 호스팅이므로 배포 빌드에서만 `output: "export"` 를 켠다.
// 로컬 개발·SSR 검증은 기본 모드를 그대로 쓴다 (NEXT_STATIC_EXPORT 미설정).
const isStaticExport = process.env.NEXT_STATIC_EXPORT === "1";

// 배포 빌드의 API 주소 기본값. 상대 경로를 쓰면 Hosting rewrite(/api/** → Cloud Run)만
// 붙이면 재빌드 없이 연결되고 CORS 도 필요 없다. 다른 도메인에 백엔드를 두면
// NEXT_PUBLIC_API_BASE_URL 환경변수로 절대 URL 을 넘긴다.
// (.env 계열은 .gitignore 대상이라 기본값을 코드에 둔다 — 시크릿이 아닌 공개 경로다.)
// 같은 출처(/api/v1)로 붙여 HttpOnly 쿠키가 로컬·배포 모두 동작하게 한다.
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_API_BASE_URL: apiBaseUrl },
  ...(isStaticExport
    ? {
        output: "export",
        images: { unoptimized: true },
      }
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://127.0.0.1:8000/api/:path*",
            },
          ];
        },
      }),
};

export default nextConfig;
