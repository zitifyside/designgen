import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Design Generator",
  description:
    "Design System Infrastructure Platform — DS 3종 + 시안 15종 자동 생성, Token 실시간 반영, Figma·코드·MCP 단일 Token 관통",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 첫 페인트 전에 테마를 입힌다 — 다크 사용자가 흰 화면을 한 번 보지 않도록. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a
          href="/api/v1/__crawl-trap"
          className="absolute -left-[9999px] h-px w-px overflow-hidden"
          aria-hidden="true"
          tabIndex={-1}
          rel="nofollow"
        >
          .
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
