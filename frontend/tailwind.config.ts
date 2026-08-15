import type { Config } from "tailwindcss";

/**
 * 색은 globals.css 의 CSS 변수에서 읽는다 (기능정의서 v0.2.0 §6 'UI 테마 설정').
 * `<alpha-value>` 를 남겨 둬야 `bg-ink-900/60` 같은 투명도 표기가 그대로 동작한다.
 */
const rgb = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  // 시스템 설정 추종은 <html> 클래스로 처리한다 (ThemeProvider). 미디어 쿼리에 맡기면
  // 사용자가 고른 값과 OS 설정이 어긋날 때 되돌릴 방법이 없다.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          50: rgb("ink-50"),
          100: rgb("ink-100"),
          200: rgb("ink-200"),
          300: rgb("ink-300"),
          400: rgb("ink-400"),
          500: rgb("ink-500"),
          600: rgb("ink-600"),
          700: rgb("ink-700"),
          800: rgb("ink-800"),
          900: rgb("ink-900"),
          950: rgb("ink-950"),
        },
        brand: {
          50: rgb("brand-50"),
          100: rgb("brand-100"),
          400: rgb("brand-400"),
          500: rgb("brand-500"),
          600: rgb("brand-600"),
          700: rgb("brand-700"),
        },
        // 카드·패널처럼 배경 위에 뜨는 면. 라이트에서만 흰색이다.
        surface: rgb("surface"),

        // 상태색도 테마를 따른다. 기본 팔레트를 그대로 쓰면 다크 화면에
        // 밝은 배너만 종이처럼 떠 보인다.
        red: {
          50: rgb("red-50"),
          100: rgb("red-100"),
          200: rgb("red-200"),
          300: rgb("red-300"),
          400: rgb("red-400"),
          500: rgb("red-500"),
          600: rgb("red-600"),
          700: rgb("red-700"),
          800: rgb("red-800"),
          900: rgb("red-900"),
        },
        emerald: {
          50: rgb("emerald-50"),
          100: rgb("emerald-100"),
          200: rgb("emerald-200"),
          500: rgb("emerald-500"),
          600: rgb("emerald-600"),
          700: rgb("emerald-700"),
          800: rgb("emerald-800"),
        },
        amber: {
          50: rgb("amber-50"),
          100: rgb("amber-100"),
          200: rgb("amber-200"),
          300: rgb("amber-300"),
          400: rgb("amber-400"),
          500: rgb("amber-500"),
          600: rgb("amber-600"),
          700: rgb("amber-700"),
          800: rgb("amber-800"),
          900: rgb("amber-900"),
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Noto Sans KR",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
