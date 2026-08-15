"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Textarea } from "@/components/ui/Input";
import { api, type TemplateReviews } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useRouteId } from "@/lib/route-id";
import type { Template } from "@/lib/types";

export default function TemplateDetailClient() {
  const id = useRouteId(1);
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<TemplateReviews | null>(null);
  const [myRating, setMyRating] = useState(5);
  const [myComment, setMyComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    if (!id) return;
    try {
      setReviews(await api.templates.reviews(id));
    } catch {
      setReviews(null); // 리뷰를 못 불러왔다고 상세 화면을 막지 않는다
    }
  }, [id]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

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
      <div className="px-6 py-12 text-center text-sm text-ink-500">
        템플릿을 불러오는 중…
      </div>
    );
  }

  if (!template) {
    return (
      <div className="px-6 py-12 text-center text-sm text-ink-500">
        템플릿을 찾지 못했다.{" "}
        <Link href="/templates" className="text-brand-700 hover:underline">
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
            <h3 className="text-sm font-semibold text-ink-900">
              리뷰{reviews ? ` · ${reviews.total}건` : ""}
            </h3>

            {reviews === null ? (
              <p className="py-6 text-center text-xs text-ink-500">
                리뷰를 불러오는 중…
              </p>
            ) : (
              <>
                <div className="mt-4 flex items-center gap-4">
                  <div className="text-3xl font-semibold text-ink-900">
                    {reviews.total > 0 ? reviews.average.toFixed(1) : "—"}
                  </div>
                  <div className="flex-1">
                    {[5, 4, 3, 2, 1].map((s) => {
                      const count = reviews.distribution[String(s)] ?? 0;
                      const pct = reviews.total ? (count / reviews.total) * 100 : 0;
                      return (
                        <div key={s} className="flex items-center gap-2 text-[11px]">
                          <span className="w-3 text-ink-500">{s}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                            <div
                              className="h-full bg-amber-400"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-6 text-right text-ink-500">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {reviews.reviews.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-ink-200 py-5 text-center text-xs text-ink-500">
                      아직 리뷰가 없다. 먼저 사용해 보고 남겨 보라.
                    </p>
                  ) : (
                    reviews.reviews.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-lg border border-ink-100 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-ink-800">
                            {r.authorName}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-amber-500">
                              {"★".repeat(r.rating)}
                              <span className="text-ink-300">
                                {"★".repeat(5 - r.rating)}
                              </span>
                            </span>
                            <span className="text-[10px] text-ink-500">
                              {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                            </span>
                          </span>
                        </div>
                        {r.comment && (
                          <p className="mt-1 whitespace-pre-line text-ink-600">
                            {r.comment}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            <div className="mt-5 border-t border-ink-100 pt-4">
              <div className="text-xs font-medium text-ink-800">리뷰 남기기</div>
              <div className="mt-2 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMyRating(n)}
                    aria-label={`${n}점`}
                    className={cn(
                      "text-lg transition",
                      n <= myRating ? "text-amber-500" : "text-ink-300",
                    )}
                  >
                    ★
                  </button>
                ))}
                <span className="ml-1 text-[11px] text-ink-500">{myRating}점</span>
              </div>
              <div className="mt-2">
                <Textarea
                  value={myComment}
                  onChange={(e) => setMyComment(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  countMax={1000}
                  placeholder="어떤 작업에 썼고 무엇이 좋았는지 적으면 다른 사람에게 도움이 된다."
                />
              </div>
              {postError && (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                  {postError}
                </div>
              )}
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  loading={posting}
                  onClick={async () => {
                    setPosting(true);
                    setPostError(null);
                    try {
                      await api.templates.review(id!, myRating, myComment.trim());
                      setMyComment("");
                      await loadReviews();
                    } catch (e) {
                      setPostError(
                        e instanceof Error ? e.message : "등록에 실패했다.",
                      );
                    } finally {
                      setPosting(false);
                    }
                  }}
                >
                  등록
                </Button>
              </div>
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
