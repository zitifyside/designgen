import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Design Generator",
  description:
    "Design System Infrastructure Platform — DS 3종 + 시안 15종 자동 생성, Token 실시간 반영, Figma·코드·MCP 단일 Token 관통",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
