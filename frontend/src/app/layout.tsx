import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init";
import { LOCALE_INIT_SCRIPT } from "@/lib/locale-init";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Design Generator",
  description: "Design System Infrastructure — tokens, concepts, and mockups",
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
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
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
        <ThemeProvider>
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
