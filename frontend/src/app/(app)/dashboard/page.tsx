"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/store/auth-store";
import { useProjectStore } from "@/store/project-store";

type Sort = "updated" | "created" | "name";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const load = useProjectStore((s) => s.load);
  const projects = useProjectStore((s) => s.projects);
  const [sort, setSort] = useState<Sort>("updated");

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    const copy = [...projects];
    copy.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "ko");
      if (sort === "created")
        return b.createdAt.localeCompare(a.createdAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return copy;
  }, [projects, sort]);

  const favorites = sorted.filter((p) => p.isFavorite);
  const others = sorted.filter((p) => !p.isFavorite);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title={`반갑다, ${user?.name ?? "Designer"}.`}
        description="진행 중인 프로젝트와 사용량을 한눈에 확인한다."
        action={
          <Link href="/projects/new">
            <Button>새 프로젝트</Button>
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <UsageCard
          title="이번 달 생성"
          used={user?.monthlyGenerations.used ?? 0}
          limit={user?.monthlyGenerations.limit ?? null}
          unit="회"
          ctaHref="/me/usage"
          ctaLabel="상세 보기"
        />
        <UsageCard
          title="크레딧 잔액"
          used={user?.credits ?? 0}
          limit={null}
          unit=" 회"
          ctaHref="/me/credits"
          ctaLabel="크레딧 충전"
        />
        <UsageCard
          title="현재 플랜"
          used={user?.plan === "Free" ? 0 : 1}
          limit={null}
          unit={` ${user?.plan ?? "Free"}`}
          ctaHref="/me/subscription"
          ctaLabel="플랜 관리"
        />
      </div>

      {favorites.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-ink-700">
            ⭐ 즐겨찾기 프로젝트
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {favorites.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-700">
            전체 프로젝트 · {others.length}
          </h2>
          <Tabs
            size="sm"
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            items={[
              { value: "updated", label: "최근 수정" },
              { value: "created", label: "최근 생성" },
              { value: "name", label: "이름" },
            ]}
          />
        </div>

        {others.length === 0 ? (
          <EmptyState
            title="아직 프로젝트가 없다"
            description="기획서·이미지·텍스트 어떤 입력으로도 시작할 수 있다."
            action={
              <Link href="/projects/new">
                <Button size="sm">새 프로젝트 만들기</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {others.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
