"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/cn";
import { api, type LogEventRecord, type LogStats } from "@/lib/api";

type LevelFilter = "all" | "error" | "warn" | "info";

const LEVEL_TONE: Record<string, "neutral" | "brand" | "warning" | "danger"> = {
  debug: "neutral",
  info: "brand",
  warn: "warning",
  error: "danger",
  fatal: "danger",
};

const LEVEL_QUERY: Record<LevelFilter, string | undefined> = {
  all: undefined,
  error: "error,fatal",
  warn: "warn",
  info: "info,debug",
};

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEventRecord[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [hours, setHours] = useState<"1" | "24" | "168">("24");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<LogEventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, summary] = await Promise.all([
        api.admin.logs({
          level: LEVEL_QUERY[level],
          kind: kind || undefined,
          q: q || undefined,
          hours: Number(hours),
          limit: 200,
        }),
        api.admin.logStats(Number(hours)),
      ]);
      setLogs(rows);
      setStats(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그를 불러오지 못했다.");
    } finally {
      setLoading(false);
    }
  }, [level, hours, kind, q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  const forwarder = stats?.forwarder;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title="로그"
        description="서비스 이벤트·접근 로그. 중앙 로그 허브가 권위 저장소이고 여기는 로컬 사본이다."
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={autoRefresh ? "primary" : "outline"}
              onClick={() => setAutoRefresh((v) => !v)}
            >
              {autoRefresh ? "자동 새로고침 켜짐" : "자동 새로고침"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              새로고침
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* 허브 전송 상태 — 로그가 중앙으로 실제로 나가고 있는지 */}
      {forwarder && (
        <div
          className={cn(
            "mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-xs",
            forwarder.enabled && !forwarder.circuitOpen
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800",
          )}
        >
          <span className="font-medium">
            중앙 로그 허브 {forwarder.enabled ? "연동됨" : "미연동"}
          </span>
          <span>프로젝트 {forwarder.projectId}</span>
          <span>환경 {forwarder.environment}</span>
          <span>모드 {forwarder.mode}</span>
          <span>대기 {forwarder.buffered}건</span>
          <span>유실 {forwarder.dropped}건</span>
          {forwarder.circuitOpen && <span className="font-medium">서킷 열림</span>}
        </div>
      )}

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="기간 내 이벤트" value={stats?.total ?? 0} />
        <Metric
          label="오류"
          value={(stats?.byLevel.error ?? 0) + (stats?.byLevel.fatal ?? 0)}
          tone="danger"
        />
        <Metric label="경고" value={stats?.byLevel.warn ?? 0} tone="warning" />
        <Metric
          label="오류율"
          value={`${((stats?.errorRate ?? 0) * 100).toFixed(1)}%`}
          tone={(stats?.errorRate ?? 0) > 0.05 ? "danger" : "default"}
        />
      </section>

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Tabs
            size="sm"
            value={level}
            onChange={(v) => setLevel(v as LevelFilter)}
            items={[
              { value: "all", label: "전체" },
              { value: "error", label: "오류" },
              { value: "warn", label: "경고" },
              { value: "info", label: "정보" },
            ]}
          />
          <Tabs
            size="sm"
            value={hours}
            onChange={(v) => setHours(v as "1" | "24" | "168")}
            items={[
              { value: "1", label: "1시간" },
              { value: "24", label: "24시간" },
              { value: "168", label: "7일" },
            ]}
          />
          <div className="w-44">
            <Input
              label="종류 (접두사)"
              placeholder="예: auth. / generation."
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            />
          </div>
          <div className="w-56">
            <Input
              label="검색"
              placeholder="메시지·경로"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {stats && stats.topKinds.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stats.topKinds.map((k) => (
              <button
                key={k.kind}
                onClick={() => setKind(k.kind)}
                className="rounded-full border border-ink-200 bg-surface px-2.5 py-1 text-[11px] text-ink-600 hover:bg-ink-50"
              >
                {k.kind} <span className="text-ink-400">{k.count}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card padded={false}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-500">
              <th className="px-4 py-3 font-medium">시각</th>
              <th className="px-4 py-3 font-medium">레벨</th>
              <th className="px-4 py-3 font-medium">종류</th>
              <th className="px-4 py-3 font-medium">메시지</th>
              <th className="px-4 py-3 font-medium">사용자</th>
              <th className="px-4 py-3 font-medium">응답</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr
                key={l.id}
                onClick={() => setSelected(l)}
                className="cursor-pointer border-b border-ink-100 hover:bg-ink-50"
              >
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-500">
                  {new Date(l.occurredAt).toLocaleString("ko-KR")}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={LEVEL_TONE[l.level] ?? "neutral"}>{l.level}</Badge>
                </td>
                <td className="px-4 py-2.5 font-mono text-ink-700">{l.kind}</td>
                <td className="max-w-[420px] truncate px-4 py-2.5 text-ink-800">
                  {l.message ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-ink-500">
                  {l.userEmail ?? (l.userId ? l.userId : "—")}
                </td>
                <td className="px-4 py-2.5 text-ink-500">
                  {l.statusCode ?? "—"}
                  {l.durationMs != null && (
                    <span className="ml-1 text-ink-400">{l.durationMs}ms</span>
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-400">
                  {loading ? "불러오는 중…" : "조건에 맞는 로그가 없다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.kind ?? "로그 상세"}
        description={selected ? new Date(selected.occurredAt).toLocaleString("ko-KR") : ""}
        size="lg"
      >
        {selected && (
          <div className="space-y-3 text-xs">
            <dl className="grid grid-cols-2 gap-2">
              <Field label="레벨" value={selected.level} />
              <Field label="계층" value={selected.tier} />
              <Field label="이벤트 ID" value={selected.eventId} mono />
              <Field label="추적 ID" value={selected.traceId ?? "—"} mono />
              <Field label="사용자" value={selected.userEmail ?? selected.userId ?? "—"} />
              <Field label="소스" value={selected.source ?? "—"} />
              <Field
                label="요청"
                value={
                  selected.method
                    ? `${selected.method} ${selected.path ?? ""}`
                    : "—"
                }
              />
              <Field
                label="응답"
                value={
                  selected.statusCode
                    ? `${selected.statusCode} · ${selected.durationMs ?? 0}ms`
                    : "—"
                }
              />
            </dl>

            {selected.message && (
              <div>
                <div className="mb-1 font-medium text-ink-700">메시지</div>
                <p className="rounded-lg bg-ink-50 px-3 py-2 text-ink-800">
                  {selected.message}
                </p>
              </div>
            )}

            {selected.payload && (
              <div>
                <div className="mb-1 font-medium text-ink-700">payload</div>
                <pre className="max-h-64 overflow-auto rounded-lg bg-ink-900 px-3 py-2 font-mono text-[11px] text-ink-100">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>
            )}

            {selected.stack && (
              <div>
                <div className="mb-1 font-medium text-ink-700">stack</div>
                <pre className="max-h-72 overflow-auto rounded-lg bg-ink-900 px-3 py-2 font-mono text-[11px] text-red-200">
                  {selected.stack}
                </pre>
              </div>
            )}

            {selected.traceId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setKind("");
                  setQ("");
                  setSelected(null);
                  void api.admin
                    .logs({ traceId: selected.traceId ?? undefined, hours: Number(hours), limit: 200 })
                    .then(setLogs)
                    .catch(() => undefined);
                }}
              >
                같은 요청의 로그만 보기
              </Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-surface p-4">
      <div className="text-[11px] text-ink-500">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold",
          tone === "danger"
            ? "text-red-600"
            : tone === "warning"
              ? "text-amber-600"
              : "text-ink-900",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-ink-200 px-2.5 py-1.5">
      <dt className="text-[10px] text-ink-500">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-ink-800", mono && "font-mono text-[11px]")}>
        {value}
      </dd>
    </div>
  );
}
