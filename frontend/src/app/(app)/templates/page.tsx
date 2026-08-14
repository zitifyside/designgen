"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useProjectStore } from "@/store/project-store";
import type { Template, TemplateCategory, TemplateStatus } from "@/lib/types";

type Category = "all" | TemplateCategory;
type Sort = "popular" | "newest" | "rating" | "price";

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: "all", label: "전체" },
  { value: "SaaS Dashboard", label: "SaaS 대시보드" },
  { value: "Ecommerce", label: "이커머스" },
  { value: "Mobile App", label: "모바일앱" },
  { value: "Landing Page", label: "랜딩페이지" },
];

const STATUS_LABEL: Record<TemplateStatus, string> = {
  Pending: "심사 대기",
  Approved: "게시 중",
  Rejected: "거부됨",
  RequestChanges: "수정 요청",
};

const STATUS_TONE: Record<TemplateStatus, "neutral" | "success" | "danger" | "warning"> =
  {
    Pending: "neutral",
    Approved: "success",
    Rejected: "danger",
    RequestChanges: "warning",
  };

export default function TemplatesPage() {
  const user = useAuthStore((s) => s.user);
  const canPublish =
    user?.plan === "Pro" || user?.plan === "Team" || user?.plan === "Admin";
  const projects = useProjectStore((s) => s.projects);
  const loadProjects = useProjectStore((s) => s.load);

  const [category, setCategory] = useState<Category>("all");
  const [sort, setSort] = useState<Sort>("popular");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [mine, setMine] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    category: "SaaS Dashboard" as TemplateCategory,
    description: "",
    price: 0,
    projectId: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, own] = await Promise.all([
        api.templates.list(),
        canPublish ? api.templates.mine() : Promise.resolve<Template[]>([]),
      ]);
      setTemplates(list);
      setMine(own);
    } catch (e) {
      setError(e instanceof Error ? e.message : "템플릿을 불러오지 못했다.");
    } finally {
      setLoading(false);
    }
  }, [canPublish]);

  useEffect(() => {
    void load();
    void loadProjects();
  }, [load, loadProjects]);

  const filtered = useMemo(() => {
    let list = templates;
    if (category !== "all") list = list.filter((t) => t.category === category);
    const copy = [...list];
    copy.sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "price") return a.price - b.price;
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      return b.downloads - a.downloads;
    });
    return copy;
  }, [templates, category, sort]);

  const publishable = projects.filter(
    (p) => p.status === "ConceptLocked" || p.status === "Completed",
  );

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.templates.create({
        name: form.name.trim(),
        category: form.category,
        description: form.description,
        price: Number(form.price) || 0,
        projectId: form.projectId || undefined,
      });
      setModal(false);
      setForm({ ...form, name: "", description: "", price: 0 });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "등록에 실패했다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title="템플릿 마켓"
        description="검증된 디자인 시스템 프리셋을 현재 프로젝트에 즉시 적용한다."
        action={
          <Button
            size="sm"
            disabled={!canPublish}
            title={canPublish ? undefined : "템플릿 등록은 Pro 이상 등급이다."}
            onClick={() => setModal(true)}
          >
            내 프리셋 등록
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

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

      {loading ? (
        <div className="rounded-xl border border-ink-200 bg-white px-4 py-10 text-center text-sm text-ink-400">
          템플릿을 불러오는 중…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-ink-200 bg-white px-4 py-10 text-center text-sm text-ink-400">
          게시된 템플릿이 없다.
        </div>
      ) : (
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
      )}

      {canPublish && (
        <Card className="mt-8">
          <CardHeader
            title="내가 등록한 템플릿"
            description="등록 후 Admin 심사를 통과하면 마켓에 게시된다. 판매 수익의 70~80% 가 정산된다."
          />
          {mine.length === 0 ? (
            <p className="py-3 text-xs text-ink-500">
              아직 등록한 템플릿이 없다.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-100 text-left text-ink-500">
                  <th className="py-2 font-medium">이름</th>
                  <th className="py-2 font-medium">카테고리</th>
                  <th className="py-2 font-medium">가격</th>
                  <th className="py-2 font-medium">상태</th>
                  <th className="py-2 font-medium">등록일</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((t) => (
                  <tr key={t.id} className="border-b border-ink-50">
                    <td className="py-2 font-medium text-ink-800">{t.name}</td>
                    <td className="py-2 text-ink-500">{t.category}</td>
                    <td className="py-2">{t.price === 0 ? "무료" : `$${t.price}`}</td>
                    <td className="py-2">
                      <Badge tone={STATUS_TONE[t.status]}>
                        {STATUS_LABEL[t.status]}
                      </Badge>
                    </td>
                    <td className="py-2 text-ink-500">
                      {new Date(t.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="내 프리셋 등록"
        description="현재 프로젝트의 DS Token 을 추출해 마켓에 등록한다. 등록 직후에는 심사 대기(Pending) 상태다."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setModal(false)}>
              취소
            </Button>
            <Button size="sm" loading={busy} onClick={handleSubmit}>
              등록 요청
            </Button>
          </div>
        }
      >
        <Input
          label="템플릿 이름"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          maxLength={200}
        />
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-medium text-ink-700">카테고리</div>
          <div className="grid grid-cols-2 gap-1.5">
            {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() =>
                  setForm({ ...form, category: c.value as TemplateCategory })
                }
                className={`rounded-lg border py-2 text-xs font-medium transition ${
                  form.category === c.value
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-medium text-ink-700">
            Token 원본 프로젝트
          </div>
          <select
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-xs"
          >
            <option value="">선택 안 함 (Token 미포함)</option>
            {publishable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.confirmedConceptLabel
                  ? ` · 컨셉 ${p.confirmedConceptLabel}`
                  : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3">
          <Input
            label="가격 (USD)"
            type="number"
            min={0}
            value={String(form.price)}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
          />
        </div>
        <div className="mt-3">
          <Textarea
            label="설명"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            countMax={1000}
            maxLength={1000}
          />
        </div>
      </Modal>
    </div>
  );
}
