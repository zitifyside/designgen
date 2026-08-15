"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  HELP_CATEGORIES,
  HELP_ITEMS,
  searchHelp,
  type HelpCategory,
} from "@/lib/help-content";

/**
 * 도움말·FAQ (기능정의서 v0.2.0 §6).
 *
 * 검색이 1급 기능이다 — 목록을 훑어 내려가는 사람보다 '워터마크'·'잠금' 같은 단어를
 * 던지는 사람이 많기 때문에, 카테고리 필터보다 검색창을 위에 둔다.
 */
export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategory | "전체">("전체");
  const [openIds, setOpenIds] = useState<string[]>([]);

  const results = useMemo(() => {
    const found = searchHelp(query);
    return category === "전체"
      ? found
      : found.filter((i) => i.category === category);
  }, [query, category]);

  const searching = query.trim().length > 0;

  const toggle = (id: string) =>
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // 검색 중에는 펼쳐 놓는다 — 찾은 항목을 한 번 더 눌러야 하면 검색한 보람이 없다.
  const isOpen = (id: string) => searching || openIds.includes(id);

  return (
    <div>
      <PageHeader
        title="도움말"
        description="사용 가이드와 자주 묻는 질문을 검색한다."
        action={
          <Link href="/projects/new">
            <Button size="sm">새 프로젝트</Button>
          </Link>
        }
      />

      <Card>
        <Input
          label="검색"
          placeholder="예: 워터마크, 화면 추가, 계정 잠금"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["전체", ...HELP_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                category === c
                  ? "border-ink-900 bg-ink-900 text-ink-50"
                  : "border-ink-200 bg-surface text-ink-600 hover:bg-ink-50",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-2 text-[11px] text-ink-500">
          {searching
            ? `'${query.trim()}' 검색 결과 ${results.length}건`
            : `전체 ${HELP_ITEMS.length}개 문항`}
        </div>
      </Card>

      <div className="mt-4 space-y-2">
        {results.length === 0 ? (
          <Card>
            <div className="py-6 text-center">
              <div className="text-sm font-medium text-ink-800">
                찾는 내용이 없다.
              </div>
              <p className="mx-auto mt-1.5 max-w-md text-xs text-ink-500">
                다른 단어로 검색하거나, 우하단 [피드백] 버튼으로 물어보면
                확인 후 가입 이메일로 답변한다.
              </p>
            </div>
          </Card>
        ) : (
          results.map((item) => (
            <Card key={item.id} padded={false}>
              <button
                onClick={() => toggle(item.id)}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
              >
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                    {item.category}
                  </div>
                  <div className="mt-0.5 text-sm font-medium text-ink-900">
                    {item.question}
                  </div>
                </div>
                <span
                  className={cn(
                    "mt-1 shrink-0 text-xs text-ink-400 transition",
                    isOpen(item.id) && "rotate-180",
                  )}
                  aria-hidden
                >
                  ▾
                </span>
              </button>

              {isOpen(item.id) && (
                <div className="border-t border-ink-100 px-4 py-3">
                  {item.answer.map((p, i) => (
                    <p
                      key={i}
                      className="mb-2 text-xs leading-relaxed text-ink-700 last:mb-0"
                    >
                      {renderEmphasis(p)}
                    </p>
                  ))}
                  {item.link && (
                    <Link
                      href={item.link.href}
                      className="mt-2.5 inline-block text-[11px] font-medium text-brand-600 hover:underline"
                    >
                      {item.link.label} →
                    </Link>
                  )}
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-ink-900">
              원하는 답이 없었다면
            </div>
            <p className="mt-0.5 text-xs text-ink-500">
              화면 우하단 [피드백] 버튼으로 보내면 확인 후 답변한다.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard?tour=1">
              <Button size="sm" variant="outline">
                투어 다시 보기
              </Button>
            </Link>
            <Link href="/me/security">
              <Button size="sm" variant="outline">
                계정·보안 설정
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** 답변 안의 `**강조**` 만 굵게 표시한다 (마크다운 전체를 끌어올 이유는 없다). */
function renderEmphasis(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
