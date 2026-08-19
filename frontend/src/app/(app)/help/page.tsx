"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/components/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import {
  HELP_CATEGORIES,
  HELP_ITEMS,
  localizeHelpItem,
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
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategory | "all">("all");
  const [openIds, setOpenIds] = useState<string[]>([]);

  const localized = useMemo(
    () => HELP_ITEMS.map((item) => localizeHelpItem(item, t)),
    [t],
  );

  const results = useMemo(() => {
    const found = searchHelp(query, localized);
    return category === "all"
      ? found
      : found.filter((i) => i.categoryKey === category);
  }, [query, category, localized]);

  const searching = query.trim().length > 0;

  const toggle = (id: string) =>
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const isOpen = (id: string) => searching || openIds.includes(id);

  return (
    <div>
      <PageHeader
        title={t("helpPage.title")}
        description={t("helpPage.description")}
        action={
          <Link href="/projects/new">
            <Button size="sm">{t("nav.newProject")}</Button>
          </Link>
        }
      />

      <Card>
        <Input
          label={t("helpPage.search")}
          placeholder={t("helpPage.searchPh")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["all", ...HELP_CATEGORIES] as const).map((c) => (
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
              {c === "all" ? t("helpPage.all") : t(`help.categories.${c}`)}
            </button>
          ))}
        </div>

        <div className="mt-2 text-[11px] text-ink-500">
          {searching
            ? t("helpPage.searchResult", { query: query.trim(), count: results.length })
            : t("helpPage.allCount", { count: HELP_ITEMS.length })}
        </div>
      </Card>

      <div className="mt-4 space-y-2">
        {results.length === 0 ? (
          <Card>
            <div className="py-6 text-center">
              <div className="text-sm font-medium text-ink-800">
                {t("helpPage.emptyTitle")}
              </div>
              <p className="mx-auto mt-1.5 max-w-md text-xs text-ink-500">
                {t("helpPage.emptyBody")}
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
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                    {item.category}
                  </div>
                  <div className="mt-0.5 text-sm font-medium text-ink-900">
                    {item.question}
                  </div>
                </div>
                <span
                  className={cn(
                    "mt-1 shrink-0 text-xs text-ink-500 transition",
                    isOpen(item.id) && "rotate-180",
                  )}
                  aria-hidden
                >
                  ▾
                </span>
              </button>

              {isOpen(item.id) && (
                <div className="border-t border-ink-100 px-4 py-3">
                  {item.answer.map((para, i) => (
                    <p
                      key={i}
                      className="mb-2 text-xs leading-relaxed text-ink-700 last:mb-0"
                    >
                      {renderEmphasis(para)}
                    </p>
                  ))}
                  {item.link && (
                    <Link
                      href={item.link.href}
                      className="mt-2.5 inline-block text-[11px] font-medium text-brand-700 hover:underline"
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
              {t("helpPage.ctaTitle")}
            </div>
            <p className="mt-0.5 text-xs text-ink-500">
              {t("helpPage.ctaBody")}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard?tour=1">
              <Button size="sm" variant="outline">
                {t("helpPage.replayTour")}
              </Button>
            </Link>
            <Link href="/me/security">
              <Button size="sm" variant="outline">
                {t("helpPage.accountSecurity")}
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
