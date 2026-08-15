"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import type { ExportRecord, Generation, Project } from "@/lib/types";

type Range = "7" | "30" | "90";

export default function UsagePage() {
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [range, setRange] = useState<Range>("30");
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.projects.list();
      setProjects(list);
      const histories = await Promise.all(
        list.map((p) => api.generations.history(p.id).catch(() => [])),
      );
      setGenerations(histories.flat());
      setExports(await api.exports.history().catch(() => []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void refreshUser();
  }, [load, refreshUser]);

  const days = Number(range);
  const cutoff = useMemo(
    () => Date.now() - days * 24 * 60 * 60 * 1000,
    [days],
  );

  const inRange = generations.filter(
    (g) => new Date(g.startedAt ?? g.completedAt ?? Date.now()).getTime() >= cutoff,
  );
  const byDay = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const g of inRange) {
      const key = new Date(g.startedAt ?? g.completedAt ?? Date.now())
        .toISOString()
        .slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets.entries());
  }, [inRange, days]);

  const max = Math.max(1, ...byDay.map(([, v]) => v));
  const screenAdds = inRange.filter((g) => g.kind === "screen_add").length;
  const failures = inRange.filter((g) => g.status === "Failed").length;
  const warnings = inRange.filter((g) => g.isWarning).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="사용량 요약"
          action={
            <Tabs
              size="sm"
              value={range}
              onChange={(v) => setRange(v as Range)}
              items={[
                { value: "7", label: "7일" },
                { value: "30", label: "30일" },
                { value: "90", label: "90일" },
              ]}
            />
          }
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="이번 달 생성"
            value={`${user?.monthlyGenerations.used ?? 0}${
              user?.monthlyGenerations.limit === -1
                ? " / ∞"
                : ` / ${user?.monthlyGenerations.limit ?? 0}`
            }`}
          />
          <Metric label="크레딧 잔액" value={`${user?.credits ?? 0}회`} />
          <Metric label="프로젝트" value={`${projects.length}개`} />
          <Metric label="Export" value={`${exports.length}건`} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title={`일별 생성 추이 · 최근 ${days}일`}
          description="전체 생성과 화면 추가 생성을 합산한 수치이다."
        />
        {loading ? (
          <p className="py-6 text-center text-xs text-ink-500">불러오는 중…</p>
        ) : (
          <div className="flex h-32 items-end gap-[2px]">
            {byDay.map(([date, count]) => (
              <div
                key={date}
                title={`${date} · ${count}회`}
                className="flex-1 rounded-t bg-brand-500/80"
                style={{ height: `${(count / max) * 100}%`, minHeight: 2 }}
              />
            ))}
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-ink-100 pt-3 text-xs">
          <div>
            <div className="text-ink-500">기간 내 생성</div>
            <div className="mt-0.5 font-medium text-ink-900">
              {inRange.length}회
            </div>
          </div>
          <div>
            <div className="text-ink-500">화면 추가 생성</div>
            <div className="mt-0.5 font-medium text-ink-900">{screenAdds}회</div>
          </div>
          <div>
            <div className="text-ink-500">실패 · 대체 렌더</div>
            <div className="mt-0.5 font-medium text-ink-900">
              {failures} · {warnings}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="최근 Export" description="최근 7일 보존분이다." />
        {exports.length === 0 ? (
          <p className="py-3 text-xs text-ink-500">Export 이력이 없다.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-100 text-left text-ink-500">
                <th className="py-2 font-medium">프로젝트</th>
                <th className="py-2 font-medium">형식</th>
                <th className="py-2 font-medium">범위</th>
                <th className="py-2 font-medium">일시</th>
              </tr>
            </thead>
            <tbody>
              {exports.slice(0, 10).map((e) => (
                <tr key={e.id} className="border-b border-ink-50">
                  <td className="py-2 text-ink-800">{e.projectName}</td>
                  <td className="py-2 font-mono">.{e.format}</td>
                  <td className="py-2 text-ink-500">{e.scope}</td>
                  <td className="py-2 text-ink-500">
                    {new Date(e.createdAt).toLocaleString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-200 p-3">
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-ink-900">{value}</div>
    </div>
  );
}
