"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { AnnouncementBanner } from "@/components/dashboard/AnnouncementBanner";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useAuthStore } from "@/store/auth-store";
import { useProjectStore } from "@/store/project-store";

type Sort = "updated" | "created" | "name";

const RECENT_DAYS = 7;
const RECENT_LIMIT = 5;
/** 한 페이지에 보여 줄 프로젝트 수 (기능정의서 v0.2.0 §3.1 '내 프로젝트 목록'). */
const PAGE_SIZE = 20;

export default function DashboardPage() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const load = useProjectStore((s) => s.load);
  const projects = useProjectStore((s) => s.projects);
  const loading = useProjectStore((s) => s.loading);
  const error = useProjectStore((s) => s.error);
  const [sort, setSort] = useState<Sort>("updated");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    void load();
    void refreshUser();
  }, [load, refreshUser]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const copy = q
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q),
        )
      : [...projects];
    copy.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "ko");
      if (sort === "created") return b.createdAt.localeCompare(a.createdAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return copy;
  }, [projects, sort, query]);

  const favorites = filtered.filter((p) => p.isFavorite);
  const others = filtered.filter((p) => !p.isFavorite);
  const pageCount = Math.max(1, Math.ceil(others.length / PAGE_SIZE));
  // 검색·정렬로 목록이 줄면 지금 페이지가 사라질 수 있다.
  const safePage = Math.min(page, pageCount);
  const pageItems = others.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // 최근 작업 — 최근 7일 5건 (기능정의서 v0.2.0 §3.1).
  const recent = useMemo(() => {
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    return [...projects]
      .filter((p) => new Date(p.updatedAt).getTime() >= cutoff)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, RECENT_LIMIT);
  }, [projects]);

  const monthlyLimit = user?.monthlyGenerations.limit ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <AnnouncementBanner />
      <PageHeader
        title={t("dashboard.greeting", { name: user?.name ?? t("dashboard.greetingFallback") })}
        description={t("dashboard.description")}
        action={
          <Link href="/projects/new">
            <Button>{t("nav.newProject")}</Button>
          </Link>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
          <button
            className="ml-2 font-medium underline"
            onClick={() => void load(true)}
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <UsageCard
          title={t("dashboard.monthlyGen")}
          used={user?.monthlyGenerations.used ?? 0}
          limit={monthlyLimit === -1 ? null : monthlyLimit}
          unit={t("dashboard.unitTimes")}
          note={monthlyLimit === -1 ? t("dashboard.unlimitedPlan") : undefined}
          ctaHref="/me/usage"
          ctaLabel={t("dashboard.viewDetails")}
        />
        <UsageCard
          title={t("dashboard.creditBalance")}
          used={user?.credits ?? 0}
          limit={null}
          unit={t("dashboard.creditUnit")}
          ctaHref="/me/credits"
          ctaLabel={t("dashboard.chargeCredits")}
        />
        <UsageCard
          title={t("dashboard.currentPlan")}
          used={user?.plan === "Free" ? 0 : 1}
          limit={null}
          unit={` ${user?.plan ?? "Free"}`}
          ctaHref="/me/subscription"
          ctaLabel={t("dashboard.managePlan")}
        />
      </div>

      {recent.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-ink-700">
            {t("dashboard.recentWork", { days: RECENT_DAYS })}
          </h2>
          <div className="flex flex-wrap gap-2">
            {recent.map((p) => (
              <Link
                key={p.id}
                href={
                  p.status === "Draft"
                    ? `/projects/new?draft=${encodeURIComponent(p.id)}`
                    : `/projects/${p.id}`
                }
                className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-surface px-3 py-2 text-xs text-ink-700 transition hover:border-ink-300 hover:bg-ink-50"
              >
                <span className="font-medium text-ink-900">{p.name}</span>
                {p.status === "Draft" && (
                  <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">
                    {t("dashboard.draftBadge")}
                  </span>
                )}
                <span className="text-[10px] text-ink-500">
                  {relativeTime(p.updatedAt, t)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {favorites.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-ink-700">
            {t("dashboard.favorites")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {favorites.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink-700">
            {t("dashboard.allProjects", { count: others.length })}
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("dashboard.searchByName")}
              className="w-44 rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-xs placeholder:text-ink-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <Tabs
              size="sm"
              value={sort}
              onChange={(v) => setSort(v as Sort)}
              items={[
                { value: "updated", label: t("dashboard.sortUpdated") },
                { value: "created", label: t("dashboard.sortCreated") },
                { value: "name", label: t("dashboard.sortName") },
              ]}
            />
          </div>
        </div>

        {loading && projects.length === 0 ? (
          <div className="rounded-xl border border-ink-200 bg-surface px-4 py-10 text-center text-sm text-ink-500">
            {t("dashboard.loadingProjects")}
          </div>
        ) : others.length === 0 ? (
          <EmptyState
            title={query ? t("dashboard.emptySearch") : t("dashboard.emptyProjects")}
            description={t("dashboard.emptyHint")}
            action={
              <Link href="/projects/new">
                <Button size="sm">{t("dashboard.createProject")}</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pageItems.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>

            {pageCount > 1 && (
              <div className="mt-5 flex items-center justify-center gap-1.5">
                <button
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage === 1}
                  className="rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-xs text-ink-600 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-400"
                >
                  {t("common.prev")}
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={
                      "min-w-[30px] rounded-lg border px-2 py-1.5 text-xs transition " +
                      (n === safePage
                        ? "border-ink-900 bg-ink-900 text-ink-50"
                        : "border-ink-200 bg-surface text-ink-600 hover:bg-ink-50")
                    }
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage === pageCount}
                  className="rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-xs text-ink-600 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-400"
                >
                  {t("common.next")}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function relativeTime(
  iso: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { n: hours });
  return t("time.daysAgo", { n: Math.round(hours / 24) });
}
