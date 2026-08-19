/**
 * 도움말·FAQ 구조 (기능정의서 v0.2.0 §6 '도움말 및 FAQ').
 *
 * 문항 본문·카테고리·링크 라벨은 locale JSON `help.*` 에 둔다.
 * 검색은 화면에서 번역문을 모아 훑는다.
 */

export type HelpCategory =
  | "gettingStarted"
  | "generation"
  | "designSystem"
  | "export"
  | "billing"
  | "account";

export interface HelpItem {
  id: string;
  category: HelpCategory;
  answerCount: number;
  keywords?: string[];
  linkHref?: string;
}

export const HELP_CATEGORIES: HelpCategory[] = [
  "gettingStarted",
  "generation",
  "designSystem",
  "export",
  "billing",
  "account",
];

export const HELP_ITEMS: HelpItem[] = [
  {
    id: "quickstart",
    category: "gettingStarted",
    answerCount: 3,
    keywords: ["처음", "시작", "튜토리얼", "가이드", "온보딩"],
    linkHref: "/projects/new",
  },
  {
    id: "requirements-writing",
    category: "gettingStarted",
    answerCount: 3,
    keywords: ["요건", "프롬프트", "입력", "첨부", "자동저장", "draft"],
  },
  {
    id: "concept-vs-variant",
    category: "generation",
    answerCount: 3,
    keywords: ["컨셉", "시안", "variant", "차이", "구조", "레이아웃", "메인", "컨셉보드"],
  },
  {
    id: "add-screen",
    category: "generation",
    answerCount: 3,
    keywords: ["화면 추가", "로그인 화면", "메인", "다른 화면", "스크린", "장면"],
  },
  {
    id: "concept-lock",
    category: "generation",
    answerCount: 2,
    keywords: ["확정", "잠금", "lock", "해제", "변경"],
  },
  {
    id: "generation-warning",
    category: "generation",
    answerCount: 2,
    keywords: ["주의", "warning", "실패", "fallback", "재시도"],
  },
  {
    id: "concurrent-generation",
    category: "generation",
    answerCount: 2,
    keywords: ["동시", "409", "진행 중", "대기", "취소"],
  },
  {
    id: "ds-mode",
    category: "designSystem",
    answerCount: 2,
    keywords: ["단일 DS", "unified", "통일", "per concept", "브랜드"],
  },
  {
    id: "token-edit",
    category: "designSystem",
    answerCount: 3,
    keywords: ["토큰", "수정", "편집", "색상", "타이포", "undo", "되돌리기"],
  },
  {
    id: "export-formats",
    category: "export",
    answerCount: 3,
    keywords: ["export", "내보내기", "png", "json", "css", "figma", "워터마크"],
  },
  {
    id: "mcp",
    category: "export",
    answerCount: 3,
    keywords: ["mcp", "api key", "cursor", "claude code", "연동", "public api"],
    linkHref: "/me/api-keys",
  },
  {
    id: "plan-limits",
    category: "billing",
    answerCount: 3,
    keywords: ["요금", "플랜", "등급", "free", "pro", "team", "한도", "가격"],
    linkHref: "/me/subscription",
  },
  {
    id: "credits",
    category: "billing",
    answerCount: 2,
    keywords: ["크레딧", "한도 초과", "충전", "사용량", "리셋"],
    linkHref: "/me/credits",
  },
  {
    id: "account-locked",
    category: "account",
    answerCount: 2,
    keywords: ["잠금", "로그인 실패", "차단", "lock", "비밀번호"],
  },
  {
    id: "two-factor",
    category: "account",
    answerCount: 2,
    keywords: ["2fa", "2단계", "otp", "인증", "백업 코드", "보안"],
    linkHref: "/me/security",
  },
  {
    id: "delete-account",
    category: "account",
    answerCount: 2,
    keywords: ["탈퇴", "삭제", "gdpr", "데이터 내보내기", "개인정보"],
    linkHref: "/me/security",
  },
];

export function localizeHelpItem(
  item: HelpItem,
  t: (key: string) => string,
): {
  id: string;
  category: string;
  categoryKey: HelpCategory;
  question: string;
  answer: string[];
  link?: { href: string; label: string };
  keywords?: string[];
} {
  const answer = Array.from({ length: item.answerCount }, (_, i) =>
    t(`help.items.${item.id}.a${i + 1}`),
  );
  return {
    id: item.id,
    categoryKey: item.category,
    category: t(`help.categories.${item.category}`),
    question: t(`help.items.${item.id}.question`),
    answer,
    keywords: item.keywords,
    link: item.linkHref
      ? { href: item.linkHref, label: t(`help.items.${item.id}.link`) }
      : undefined,
  };
}

/** 제목·본문·키워드를 함께 훑는다 — 사용자는 답변에 있는 단어로도 검색한다. */
export type LocalizedHelpItem = ReturnType<typeof localizeHelpItem>;

export function searchHelp(
  query: string,
  localized: LocalizedHelpItem[],
) {
  const q = query.trim().toLowerCase();
  if (!q) return localized;
  const terms = q.split(/\s+/);
  return localized.filter((item) => {
    const haystack = [
      item.question,
      item.category,
      ...item.answer,
      ...(item.keywords ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
