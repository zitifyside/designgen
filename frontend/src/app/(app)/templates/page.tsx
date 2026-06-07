"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { MOCK_TEMPLATES } from "@/lib/mock-data";
import type { Template } from "@/lib/types";

type Category = "all" | Template["category"];
type Sort = "popular" | "newest" | "rating" | "price";

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: "all", label: "전체" },
  { value: "SaaS Dashboard", label: "SaaS 대시보드" },
  { value: "Ecommerce", label: "이커머스" },
  { value: "Mobile App", label: "모바일앱" },
  { value: "Landing Page", label: "랜딩페이지" },
];

export default function TemplatesPage() {
  const [category, setCategory] = useState<Category>("all");
  const [sort, setSort] = useState<Sort>("popular");

  const filtered = useMemo(() => {
    let list = MOCK_TEMPLATES;
    if (category !== "all") list = list.filter((t) => t.category === category);
    const copy = [...list];
    copy.sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "price") return a.price - b.price;
      if (sort === "newest") return b.downloads - a.downloads;
      return b.downloads - a.downloads;
    });
    return copy;
  }, [category, sort]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title="템플릿 마켓"
        description="검증된 디자인 시스템 프리셋을 현재 프로젝트에 즉시 적용한다."
        action={
          <Link
            href="/me/credits"
            className="text-xs text-ink-500 hover:text-ink-800"
          >
            내 프리셋 등록 →
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                category === c.value
                  ? "bg-ink-900 text-white"
                  : "bg-white text-ink-700 hover:bg-ink-100"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <Tabs
          size="sm"
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          items={[
            { value: "popular", label: "인기" },
            { value: "newest", label: "최신" },
            { value: "rating", label: "평점" },
            { value: "price", label: "가격" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((t) => (
          <Link
            key={t.id}
            href={`/templates/${t.id}`}
            className="group block overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:shadow-md"
          >
            <div className="aspect-[16/10] w-full bg-gradient-to-br from-brand-100 via-white to-brand-50 p-4">
              <div className="flex h-full flex-col justify-between rounded-md bg-white p-3 shadow-sm">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-12 rounded bg-brand-500" />
                  <div className="h-2 w-8 rounded bg-ink-200" />
                  <div className="h-2 w-6 rounded bg-ink-200" />
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-6 rounded bg-ink-100" />
                  ))}
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 w-32 rounded bg-ink-200" />
                  <div className="h-1.5 w-24 rounded bg-ink-200" />
                </div>
              </div>
            </div>
            <div className="p-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-semibold text-ink-900">
                  {t.name}
                </h3>
                {t.price === 0 ? (
                  <Badge tone="success">무료</Badge>
                ) : (
                  <span className="text-sm font-semibold text-ink-900">
                    ${t.price}
                  </span>
                )}
              </div>
              <div className="mt-1 text-[10px] text-ink-500">
                by {t.authorName} · {t.category}
              </div>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-500">
                <span>★ {t.rating.toFixed(1)}</span>
                <span>↓ {t.downloads.toLocaleString()}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Card className="mt-8">
        <div className="text-xs font-semibold text-ink-700">
          내 프리셋 등록 (Pro+)
        </div>
        <p className="mt-1 text-[11px] text-ink-500">
          현재 프로젝트의 DS Token 을 마켓에 등록한다. 심사 후 게시되며 판매
          수익의 70~80% 가 정산된다.
        </p>
      </Card>
    </div>
  );
}
