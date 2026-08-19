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
import { useI18n } from "@/components/i18n/I18nProvider";

type Category = "all" | TemplateCategory;
type Sort = "popular" | "newest" | "rating" | "price";
/** 가격·평점 필터 (기능정의서 v0.2.0 §3.1 '템플릿 조회 — 필터'). */
type PriceFilter = "all" | "free" | "paid";
type RatingFilter = "all" | "3" | "4";

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: "all", label: "templates.catAll" },
  { value: "SaaS Dashboard", label: "templates.catSaas" },
  { value: "Ecommerce", label: "templates.catEcom" },
  { value: "Mobile App", label: "templates.catMobile" },
  { value: "Landing Page", label: "templates.catLanding" },
];

const STATUS_LABEL: Record<TemplateStatus, string> = {
  Pending: "templates.stPending",
  Approved: "templates.stApproved",
  Rejected: "templates.stRejected",
  RequestChanges: "templates.stRequestChanges",
};

const STATUS_TONE: Record<TemplateStatus, "neutral" | "success" | "danger" | "warning"> =
  {
    Pending: "neutral",
    Approved: "success",
    Rejected: "danger",
    RequestChanges: "warning",
  };

export default function TemplatesPage() {
  const { t, locale } = useI18n();
  const user = useAuthStore((s) => s.user);
  const canPublish =
    user?.plan === "Pro" || user?.plan === "Team" || user?.plan === "Admin";
  const projects = useProjectStore((s) => s.projects);
  const loadProjects = useProjectStore((s) => s.load);

  const [category, setCategory] = useState<Category>("all");
  const [sort, setSort] = useState<Sort>("popular");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
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
    setError(null);
    // 공개 목록과 내 템플릿은 따로 가져온다 — 개인 영역이 실패해도(로그아웃·권한)
    // 공개 마켓까지 빈 화면이 되면 안 된다.
    try {
      setTemplates(await api.templates.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("templates.loadFailed"));
    } finally {
      setLoading(false);
    }
    if (!canPublish) {
      setMine([]);
      return;
    }
    try {
      setMine(await api.templates.mine());
    } catch {
      // 내 템플릿 조회 실패는 마켓 열람을 막지 않는다.
      setMine([]);
    }
  }, [canPublish]);

  useEffect(() => {
    void load();
    void loadProjects();
  }, [load, loadProjects]);

  const filtered = useMemo(() => {
    let list = templates;
    if (category !== "all") list = list.filter((t) => t.category === category);
    if (priceFilter === "free") list = list.filter((t) => t.price === 0);
    if (priceFilter === "paid") list = list.filter((t) => t.price > 0);
    if (ratingFilter !== "all") {
      const min = Number(ratingFilter);
      list = list.filter((t) => t.rating >= min);
    }
    const copy = [...list];
    copy.sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "price") return a.price - b.price;
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      return b.downloads - a.downloads;
    });
    return copy;
  }, [templates, category, sort, priceFilter, ratingFilter]);

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
      setError(e instanceof Error ? e.message : t("templates.publishFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title={t("templates.title")}
        description={t("templates.description")}
        action={
          <Button
            size="sm"
            disabled={!canPublish}
            title={canPublish ? undefined : t("templates.publishLocked")}
            onClick={() => setModal(true)}
          >
            {t("templates.publishMine")}
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
                  ? "bg-ink-900 text-ink-50"
                  : "bg-surface text-ink-700 hover:bg-ink-100"
              }`}
            >
              {t(c.label)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            size="sm"
            value={priceFilter}
            onChange={(v) => setPriceFilter(v as PriceFilter)}
            items={[
              { value: "all", label: t("templates.catAll") },
              { value: "free", label: t("templates.priceFree") },
              { value: "paid", label: t("templates.pricePaid") },
            ]}
          />
          <Tabs
            size="sm"
            value={ratingFilter}
            onChange={(v) => setRatingFilter(v as RatingFilter)}
            items={[
              { value: "all", label: t("templates.ratingAll") },
              { value: "3", label: t("templates.rating3") },
              { value: "4", label: t("templates.rating4") },
            ]}
          />
          <Tabs
            size="sm"
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            items={[
              { value: "popular", label: t("templates.sortPopular") },
              { value: "newest", label: t("templates.sortNewest") },
              { value: "rating", label: t("templates.sortRating") },
              { value: "price", label: t("templates.sortPrice") },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-ink-200 bg-surface px-4 py-10 text-center text-sm text-ink-500">
          {t("templates.loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-ink-200 bg-surface px-4 py-10 text-center text-sm text-ink-500">
          {templates.length === 0
            ? t("templates.emptyAll")
            : t("templates.emptyFilter")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((tpl) => (
            <Link
              key={tpl.id}
              href={`/templates/${tpl.id}`}
              className="group block overflow-hidden rounded-xl border border-ink-200 bg-surface transition hover:shadow-md"
            >
              <div className="aspect-[16/10] w-full bg-gradient-to-br from-brand-100 via-white to-brand-50 p-4">
                <div className="flex h-full flex-col justify-between rounded-md bg-surface p-3 shadow-sm">
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
                    {tpl.name}
                  </h3>
                  {tpl.price === 0 ? (
                    <Badge tone="success">{t("templates.priceFree")}</Badge>
                  ) : (
                    <span className="text-sm font-semibold text-ink-900">
                      ${tpl.price}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-ink-500">
                  by {tpl.authorName} · {tpl.category}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-500">
                  <span>★ {tpl.rating.toFixed(1)}</span>
                  <span>↓ {tpl.downloads.toLocaleString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {canPublish && (
        <Card className="mt-8">
          <CardHeader
            title={t("templates.mineTitle")}
            description={t("templates.mineDesc")}
          />
          {mine.length === 0 ? (
            <p className="py-3 text-xs text-ink-500">
              {t("templates.mineEmpty")}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-100 text-left text-ink-500">
                  <th className="py-2 font-medium">{t("templates.colName")}</th>
                  <th className="py-2 font-medium">{t("templates.colCategory")}</th>
                  <th className="py-2 font-medium">{t("templates.colPrice")}</th>
                  <th className="py-2 font-medium">{t("templates.colStatus")}</th>
                  <th className="py-2 font-medium">{t("templates.colDate")}</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((tpl) => (
                  <tr key={tpl.id} className="border-b border-ink-50">
                    <td className="py-2 font-medium text-ink-800">{tpl.name}</td>
                    <td className="py-2 text-ink-500">{tpl.category}</td>
                    <td className="py-2">{tpl.price === 0 ? t("templates.priceFree") : `$${tpl.price}`}</td>
                    <td className="py-2">
                      <Badge tone={STATUS_TONE[tpl.status]}>
                        {t(STATUS_LABEL[tpl.status])}
                      </Badge>
                    </td>
                    <td className="py-2 text-ink-500">
                      {new Date(tpl.createdAt).toLocaleDateString(locale === "en" ? "en-US" : "ko-KR")}
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
        title={t("templates.publishTitle")}
        description={t("templates.publishDesc")}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setModal(false)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" loading={busy} onClick={handleSubmit}>
              {t("templates.publishSubmit")}
            </Button>
          </div>
        }
      >
        <Input
          label={t("templates.tplName")}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          maxLength={200}
        />
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-medium text-ink-700">{t("templates.category")}</div>
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
                    : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50"
                }`}
              >
                {t(c.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-medium text-ink-700">
            {t("templates.sourceProject")}
          </div>
          <select
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            className="w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-2 text-xs"
          >
            <option value="">{t("templates.noSource")}</option>
            {publishable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.confirmedConceptLabel
                  ? t("templates.sourceConcept", { label: p.confirmedConceptLabel })
                  : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3">
          <Input
            label={t("templates.priceUsd")}
            type="number"
            min={0}
            value={String(form.price)}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
          />
        </div>
        <div className="mt-3">
          <Textarea
            label={t("templates.desc")}
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
