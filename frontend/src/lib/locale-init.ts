/**
 * 로케일 초기화 상수 — `"use client"` 를 붙이지 않는다.
 * 테마 초기화(`theme-init.ts`)와 같은 이유다. 루트 레이아웃이 읽는다.
 */

export const LOCALE_KEY = "adg.locale";
export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ko";

/** 첫 페인트 전에 html lang 을 맞춘다. */
export const LOCALE_INIT_SCRIPT = `
(function(){try{
  var v = localStorage.getItem('${LOCALE_KEY}');
  var lang = (v === 'en' || v === 'ko') ? v : 'ko';
  document.documentElement.lang = lang;
}catch(e){}})();
`.trim();
