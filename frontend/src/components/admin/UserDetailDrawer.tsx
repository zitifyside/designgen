"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { api, type AdminUserDetail } from "@/lib/api";

const LEVEL_TONE: Record<string, "neutral" | "brand" | "warning" | "danger"> = {
  debug: "neutral",
  info: "brand",
  warn: "warning",
  error: "danger",
  fatal: "danger",
};

/**
 * 사용자 상세 (기능정의서 v0.2.0 §3.3 '사용자 목록·상세').
 *
 * 별도 라우트 대신 드로어로 둔다 — 정적 export 에서 동적 라우트를 하나 더 늘리면
 * 센티널·rewrite 를 또 붙여야 하는데, 목록에서 바로 여는 편이 조작도 짧다.
 */
export function UserDetailDrawer({
  userId,
  onClose,
  onChanged,
}: {
  userId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await api.admin.userDetail(userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "사용자 정보를 불러오지 못했다.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) void load();
    else setDetail(null);
  }, [userId, load]);

  const unlock = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await api.admin.unlockUser(detail.id);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "잠금 해제에 실패했다.");
    } finally {
      setBusy(false);
    }
  };

  const locked =
    !!detail?.lockedUntil && new Date(detail.lockedUntil).getTime() > Date.now();

  return (
    <Modal
      open={!!userId}
      onClose={onClose}
      title={detail ? `${detail.name} · ${detail.email}` : "사용자 상세"}
      description={
        detail
          ? `${detail.plan} · ${detail.status} · 가입 ${new Date(detail.joinedAt).toLocaleDateString("ko-KR")}`
          : undefined
      }
      size="lg"
    >
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {loading && !detail && (
        <p className="py-6 text-center text-xs text-ink-500">불러오는 중…</p>
      )}

      {detail && (
        <div className="space-y-4 text-xs">
          {locked && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              <span>
                로그인 실패 누적으로 잠긴 계정이다 (해제 예정{" "}
                {new Date(detail.lockedUntil!).toLocaleString("ko-KR")}).
              </span>
              <Button size="sm" variant="outline" loading={busy} onClick={unlock}>
                잠금 해제
              </Button>
            </div>
          )}
          {detail.deletionRequestedAt && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              계정 삭제 요청됨 (
              {new Date(detail.deletionRequestedAt).toLocaleDateString("ko-KR")}) —
              30일 유예 후 파기 대상이다.
            </div>
          )}

          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label="크레딧" value={`${detail.credits}회`} />
            <Stat
              label="이번 달 생성"
              value={`${detail.monthlyUsed} / ${detail.monthlyLimit === -1 ? "∞" : detail.monthlyLimit}`}
            />
            <Stat label="활성 세션" value={`${detail.sessions}`} />
            <Stat label="API Key" value={`${detail.apiKeys}`} />
            <Stat label="총 생성" value={`${detail.generations.total}`} />
            <Stat label="성공" value={`${detail.generations.done}`} />
            <Stat label="실패" value={`${detail.generations.failed}`} tone="danger" />
            <Stat
              label="대체 렌더"
              value={`${detail.generations.warning}`}
              tone="warning"
            />
          </section>

          <section className="grid gap-2 sm:grid-cols-2">
            <Row label="이메일 인증" value={detail.emailVerified ? "완료" : "미완료"} />
            <Row label="2FA" value={detail.twoFactorEnabled ? "사용" : "미사용"} />
            <Row
              label="최근 활동"
              value={
                detail.lastActiveAt
                  ? new Date(detail.lastActiveAt).toLocaleString("ko-KR")
                  : "—"
              }
            />
            <Row
              label="구독"
              value={
                detail.subscription
                  ? `${detail.subscription.planCode} · ${detail.subscription.status}`
                  : "구독 레코드 없음"
              }
            />
          </section>

          <section>
            <h3 className="mb-1.5 font-medium text-ink-700">
              보유 프로젝트 {detail.projects.length}
            </h3>
            {detail.projects.length === 0 ? (
              <p className="text-ink-500">프로젝트가 없다.</p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {detail.projects.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-ink-200 px-2.5 py-1.5"
                  >
                    <span className="truncate text-ink-800">{p.name}</span>
                    <span className="shrink-0 text-[10px] text-ink-500">
                      {p.platform} · {p.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1.5 font-medium text-ink-700">최근 활동 로그</h3>
            {detail.recentActivity.length === 0 ? (
              <p className="text-ink-500">기록이 없다.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {detail.recentActivity.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-2 rounded-lg border border-ink-100 px-2.5 py-1.5"
                  >
                    <Badge tone={LEVEL_TONE[l.level] ?? "neutral"}>{l.level}</Badge>
                    <span className="font-mono text-[10px] text-ink-600">{l.kind}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-700">
                      {l.message ?? ""}
                    </span>
                    <span className="shrink-0 text-[10px] text-ink-500">
                      {new Date(l.occurredAt).toLocaleString("ko-KR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="rounded-lg border border-ink-200 px-2.5 py-2">
      <div className="text-[10px] text-ink-500">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-sm font-semibold",
          tone === "danger"
            ? "text-red-700"
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-ink-200 px-2.5 py-1.5">
      <span className="text-ink-500">{label}</span>
      <span className="text-ink-800">{value}</span>
    </div>
  );
}
