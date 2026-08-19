"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { UserDetailDrawer } from "@/components/admin/UserDetailDrawer";
import { api, type AdminUser } from "@/lib/api";
import type { Plan } from "@/lib/types";
import { useI18n } from "@/components/i18n/I18nProvider";

type StatusFilter = "all" | "Active" | "Suspended" | "Deleted";
type PlanFilter = "all" | Plan;

const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  Active: "success",
  Suspended: "warning",
  Deleted: "neutral",
};

const PLANS: Plan[] = ["Free", "Pro", "Team", "Admin"];

const PAGE_SIZE = 50;

export default function AdminUsersPage() {
  const { t } = useI18n();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 기능정의서 §3.3 — 50명/페이지. 목록은 서버가 잘라 준다.
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(
        await api.admin.users({
          q: q || undefined,
          plan: planFilter === "all" ? undefined : planFilter,
          status: statusFilter === "all" ? undefined : statusFilter,
          page,
          pageSize: PAGE_SIZE,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.loadUsersFailed"));
    }
  }, [q, planFilter, statusFilter, page]);

  // 조건이 바뀌면 첫 페이지부터 다시 본다.
  useEffect(() => {
    setPage(1);
  }, [q, planFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const changePlan = async (id: string, plan: Plan) => {
    setBusy(id);
    try {
      await api.admin.changeTier(id, plan);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.planChangeFailed"));
    } finally {
      setBusy(null);
    }
  };

  const suspend = async (suspendFlag: boolean) => {
    if (!target) return;
    if (suspendFlag && suspendReason.trim().length < 10) return;
    setBusy("suspend");
    try {
      await api.admin.suspend(target.id, suspendFlag, suspendReason.trim());
      setTarget(null);
      setSuspendReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title={t("admin.usersTitle")}
        description={t("admin.usersDesc")}
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <Input
              label={t("admin.searchUsers")}
              placeholder={t("admin.searchUsersPh")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Tabs
            size="sm"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            items={[
              { value: "all", label: t("admin.statusAll") },
              { value: "Active", label: t("admin.statusActive") },
              { value: "Suspended", label: t("admin.suspend") },
            ]}
          />
          <Tabs
            size="sm"
            value={planFilter}
            onChange={(v) => setPlanFilter(v as PlanFilter)}
            items={[
              { value: "all", label: t("admin.allPlans") },
              ...PLANS.map((p) => ({ value: p, label: p })),
            ]}
          />
        </div>
      </Card>

      <Card padded={false}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-500">
              <th className="px-4 py-3 font-medium">{t("admin.colUser")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colPlan")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colStatus")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colGens")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colJoined")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colRecent")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-ink-100">
                <td className="px-4 py-3">
                  <button
                    className="text-left"
                    onClick={() => setDetailUserId(u.id)}
                    title={t("admin.viewDetail")}
                  >
                    <div className="font-medium text-ink-900 hover:underline">
                      {u.name}
                    </div>
                    <div className="text-[10px] text-ink-500">{u.email}</div>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.plan}
                    disabled={busy === u.id}
                    onChange={(e) => void changePlan(u.id, e.target.value as Plan)}
                    className="rounded-lg border border-ink-200 bg-surface px-2 py-1 text-xs"
                  >
                    {PLANS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[u.status] ?? "neutral"}>
                    {u.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-ink-600">{u.generations}</td>
                <td className="px-4 py-3 text-ink-500">
                  {new Date(u.joinedAt).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-4 py-3 text-ink-500">
                  {u.lastActiveAt
                    ? new Date(u.lastActiveAt).toLocaleDateString("ko-KR")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDetailUserId(u.id)}
                    >
                      {t("admin.detail")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTarget(u)}
                    >
                      {u.status === "Suspended" ? t("admin.unsuspend") : t("admin.suspend")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-500">
                  {t("admin.noUsers")}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 서버가 페이지 단위로 주므로 총 개수를 모른다 — 가득 찼으면 다음이 있다고 본다. */}
        {(page > 1 || users.length === PAGE_SIZE) && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((n) => Math.max(1, n - 1))}
              disabled={page === 1}
              className="rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs text-ink-300 transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:text-ink-500"
            >
              {t("common.prev")}
            </button>
            <span className="text-xs text-ink-400">{t("admin.pageN", { n: page })}</span>
            <button
              onClick={() => setPage((n) => n + 1)}
              disabled={users.length < PAGE_SIZE}
              className="rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs text-ink-300 transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:text-ink-500"
            >
              {t("common.next")}
            </button>
          </div>
        )}
      </Card>

      <UserDetailDrawer
        userId={detailUserId}
        onClose={() => setDetailUserId(null)}
        onChanged={() => void load()}
      />

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={
          target?.status === "Suspended" ? t("admin.unsuspendTitle") : t("admin.suspendTitle")
        }
        description={
          target?.status === "Suspended"
            ? t("admin.unsuspendDesc")
            : t("admin.suspendDesc")
        }
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              loading={busy === "suspend"}
              onClick={() => void suspend(target?.status !== "Suspended")}
            >
              {t("common.confirm")}
            </Button>
          </div>
        }
      >
        <div className="mb-3 text-xs text-ink-600">
          {t("admin.target")}<b>{target?.email}</b>
        </div>
        {target?.status !== "Suspended" && (
          <Textarea
            label={t("admin.suspendReason")}
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            rows={3}
            countMax={500}
            maxLength={500}
          />
        )}
      </Modal>
    </div>
  );
}
