/**
 * 테마 초기화 상수 — **`"use client"` 를 붙이지 않는다.**
 *
 * 이 값들은 루트 레이아웃(서버 컴포넌트)이 읽는다. 클라이언트 모듈에 두면 RSC 가
 * 클라이언트 참조로 직렬화하려다 실패한다 (`Could not find the module ... in the
 * React Client Manifest`). 컴포넌트가 아닌 상수는 경계 밖에 따로 둔다.
 *
 * `lib/route-sentinel.ts` 를 분리한 것과 같은 이유이며, 같은 실수를 두 번 했다.
 */

/** 마지막 테마 선택을 담아 두는 로컬 저장소 키. */
export const THEME_KEY = "adg.theme";

/**
 * 첫 페인트 전에 테마를 입히는 인라인 스크립트.
 *
 * React 가 붙기 전에 실행돼야 다크 사용자가 흰 화면을 한 번 보고 넘어가는 일이
 * 없다. 실패하면 조용히 라이트로 둔다 — 테마 때문에 앱이 멈추면 안 된다.
 */
export const THEME_INIT_SCRIPT = `
(function(){try{
  var v = localStorage.getItem('${THEME_KEY}') || 'system';
  var dark = v === 'dark' || (v === 'system' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
}catch(e){}})();
`.trim();
