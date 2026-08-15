"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { api } from "@/lib/api";
import { useRouteId } from "@/lib/route-id";
import type { Template } from "@/lib/types";

export default function TemplateDetailClient() {
  const id = useRouteId(1);
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    api.templates
      .get(id)
      .then((t) => {
        if (!cancelled) setTemplate(t);
      })
      .catch(() => {
        if (!cancelled) setTemplate(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="px-6 py-12 text-center text-sm text-ink-400">
        템플릿을 불러오는 중…
      </div>
    );
  }

  if (!template) {
    return (
      <div className="px-6 py-12 text-center text-sm text-ink-400">
        템플릿을 찾지 못했다.{" "}
        <Link href="/templates" className="text-brand-600 hover:underline">
          템플릿 마켓으로
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title={template.name}
        description={template.description}
        breadcrumb={
          <>
            <Link href="/templates" className="hover:text-ink-700">
              템플릿 마켓
            </Link>
            <span className="px-1.5">/</span>
            <span className="text-ink-700">{template.category}</span>
          </>
        }
        action={
          <div className="flex items-center gap-2">
            {template.price === 0 ? (
              <Badge tone="success">무료</Badge>
            ) : (
              <Badge tone="brand">${template.price}</Badge>
            )}
            <Button>현재 프로젝트에 적용</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card padded={false}>
            <div className="aspect-[16/9] w-full rounded-t-xl bg-gradient-to-br from-brand-100 via-white to-brand-50 p-6">
              <div className="flex h-full flex-col justify-between rounded-lg bg-surface p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-32 rounded bg-brand-500" />
                  <div className="flex gap-1">
                    <div className="h-3 w-12 rounded bg-ink-200" />
                    <div className="h-3 w-12 rounded bg-ink-200" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="rounded-md bg-ink-50 p-3 shadow-sm"
                    >
                      <div className="h-2 w-16 rounded bg-ink-200" />
                      <div className="mt-2 h-5 w-24 rounded bg-ink-300" />
                      <div className="mt-2 h-2 w-12 rounded bg-brand-300" />
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <div className="h-2 w-44 rounded bg-ink-200" />
                  <div className="h-2 w-36 rounded bg-ink-200" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 p-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="aspect-square rounded-md bg-ink-100 p-2"
                >
                  <div className="h-full w-full rounded bg-surface" />
                </div>
              ))}
            </div>
          </Card>

          <Card className="mt-5">
            <h3 className="text-sm font-semibold text-ink-900">리뷰</h3>
            <div className="mt-4 flex items-center gap-4">
              <div className="text-3xl font-semibold">
                {template.rating.toFixed(1)}
              </div>
              <div className="flex-1">
                {[5, 4, 3, 2, 1].map((s) => (
                  <div key={s} className="flex items-center gap-2 text-[11px]">
                    <span className="w-3 text-ink-500">{s}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full bg-amber-400"
                        style={{
                          width:
                            s === 5
                              ? "72%"
                              : s === 4
                                ? "20%"
                                : s === 3
                                  ? "6%"
                                  : "2%",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {[
                {
                  who: "지영",
                  body: "Pro 업그레이드 후 처음 받은 프리셋. 초기 시안 작업 시간이 절반으로 줄었다.",
                  rating: 5,
                },
                {
                  who: "Junho",
                  body: "DS Token 호환이 깔끔하고 다크모드도 깨지지 않는다.",
                  rating: 5,
                },
              ].map((r) => (
                <div
                  key={r.who}
                  className="rounded-lg border border-ink-100 p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink-800">{r.who}</span>
                    <span className="text-amber-500">
                      {"★".repeat(r.rating)}
                    </span>
                  </div>
                  <p className="mt-1 text-ink-600">{r.body}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h3 className="text-xs font-semibold text-ink-700">제공 컨셉</h3>
            <p className="mt-1 text-sm font-semibold text-ink-900">
              {template.conceptName}
            </p>
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {["#2563EB", "#0EA5E9", "#64748B", "#F8FAFC", "#0F172A"].map(
                (c) => (
                  <div
                    key={c}
                    className="aspect-square rounded"
                    style={{ background: c }}
                  />
                ),
              )}
            </div>
          </Card>

          <Card>
            <h3 className="text-xs font-semibold text-ink-700">메타</h3>
            <dl className="mt-2 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-ink-500">작성자</dt>
                <dd>{template.authorName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">카테고리</dt>
                <dd>{template.category}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">다운로드</dt>
                <dd>{template.downloads.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">평점</dt>
                <dd>★ {template.rating.toFixed(1)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
