"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { api, type AdminUserDetail } from "@/lib/api";
import { useI18n } from "@/components/i18n/I18nProvider";

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
  const { t, locale } = useI18n();
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
      setError(e instanceof Error ? e.message : t("admin.loadUserFailed"));
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
      setError(e instanceof Error ? e.message : t("admin.unlockFailed"));
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
      title={detail ? `${detail.name} · ${detail.email}` : t("admin.userDetail")}
      description={
        detail
          ? t("admin.userDetailMeta", { plan: detail.plan, status: detail.status, date: new Date(detail.joinedAt).toLocaleDateString(locale === "en" ? "en-US" : "ko-KR") })
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
        <p className="py-6 text-center text-xs text-ink-500">{t("common.loading")}</p>
      )}

      {detail && (
        <div className="space-y-4 text-xs">
          {locked && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              <span>
                {t("admin.lockedUntilMsg", {
                  date: new Date(detail.lockedUntil!).toLocaleString(
                    locale === "en" ? "en-US" : "ko-KR",
                  ),
                })}
              </span>
              <Button size="sm" variant="outline" loading={busy} onClick={unlock}>
                {t("admin.unlock")}
              </Button>
            </div>
          )}
          {detail.deletionRequestedAt && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              {t("admin.deleteRequestedMsg", {
                date: new Date(detail.deletionRequestedAt).toLocaleDateString(
                  locale === "en" ? "en-US" : "ko-KR",
                ),
              })}
            </div>
          )}

          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label={t("common.credits")} value={t("admin.creditsN", { n: detail.credits })} />
            <Stat
              label={t("admin.monthlyGen")}
              value={`${detail.monthlyUsed} / ${detail.monthlyLimit === -1 ? "∞" : detail.monthlyLimit}`}
            />
            <Stat label={t("admin.activeSessions")} value={`${detail.sessions}`} />
            <Stat label="API Key" value={`${detail.apiKeys}`} />
            <Stat label={t("admin.totalGens")} value={`${detail.generations.total}`} />
            <Stat label={t("admin.success")} value={`${detail.generations.done}`} />
            <Stat label={t("admin.failed")} value={`${detail.generations.failed}`} tone="danger" />
            <Stat
              label={t("admin.fallback")}
              value={`${detail.generations.warning}`}
              tone="warning"
            />
          </section>

          <section className="grid gap-2 sm:grid-cols-2">
            <Row label={t("admin.emailVerified")} value={detail.emailVerified ? t("admin.done") : t("admin.notDone")} />
            <Row label="2FA" value={detail.twoFactorEnabled ? t("admin.used") : t("admin.unused")} />
            <Row
              label={t("admin.recentActivity")}
              value={
                detail.lastActiveAt
                  ? new Date(detail.lastActiveAt).toLocaleString(locale === "en" ? "en-US" : "ko-KR")
                  : "—"
              }
            />
            <Row
              label={t("admin.subscription")}
              value={
                detail.subscription
                  ? `${detail.subscription.planCode} · ${detail.subscription.status}`
                  : t("admin.noSub")
              }
            />
          </section>

          <section>
            <h3 className="mb-1.5 font-medium text-ink-700">
              {t("admin.ownedProjects", { n: detail.projects.length })}
            </h3>
            {detail.projects.length === 0 ? (
              <p className="text-ink-500">{t("admin.noProjects")}</p>
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
            <h3 className="mb-1.5 font-medium text-ink-700">{t("admin.recentLogs")}</h3>
            {detail.recentActivity.length === 0 ? (
              <p className="text-ink-500">{t("admin.noRecords")}</p>
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
                      {new Date(l.occurredAt).toLocaleString(locale === "en" ? "en-US" : "ko-KR")}
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
