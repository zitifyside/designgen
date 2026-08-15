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

type StatusFilter = "all" | "Active" | "Suspended" | "Deleted";
type PlanFilter = "all" | Plan;

const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  Active: "success",
  Suspended: "warning",
  Deleted: "neutral",
};

const PLANS: Plan[] = ["Free", "Pro", "Team", "Admin"];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(
        await api.admin.users({
          q: q || undefined,
          plan: planFilter === "all" ? undefined : planFilter,
          status: statusFilter === "all" ? undefined : statusFilter,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "사용자를 불러오지 못했다.");
    }
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
      setError(e instanceof Error ? e.message : "등급 변경에 실패했다.");
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
      setError(e instanceof Error ? e.message : "처리에 실패했다.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title="사용자 관리"
        description="등급 변경·정지 처리는 감사 로그에 자동 기록된다."
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
              label="검색"
              placeholder="이메일·이름"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Tabs
            size="sm"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            items={[
              { value: "all", label: "전체" },
              { value: "Active", label: "활성" },
              { value: "Suspended", label: "정지" },
            ]}
          />
          <Tabs
            size="sm"
            value={planFilter}
            onChange={(v) => setPlanFilter(v as PlanFilter)}
            items={[
              { value: "all", label: "전 등급" },
              ...PLANS.map((p) => ({ value: p, label: p })),
            ]}
          />
        </div>
      </Card>

      <Card padded={false}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-500">
              <th className="px-4 py-3 font-medium">사용자</th>
              <th className="px-4 py-3 font-medium">등급</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">생성</th>
              <th className="px-4 py-3 font-medium">가입</th>
              <th className="px-4 py-3 font-medium">최근 활동</th>
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
                    title="상세 보기"
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
                      상세
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTarget(u)}
                    >
                      {u.status === "Suspended" ? "정지 해제" : "정지"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-400">
                  조건에 맞는 사용자가 없다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
          target?.status === "Suspended" ? "계정 정지 해제" : "계정 정지"
        }
        description={
          target?.status === "Suspended"
            ? "정지를 해제하면 즉시 로그인이 가능해진다."
            : "정지 사유는 10자 이상 입력한다. 감사 로그에 기록된다."
        }
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
              취소
            </Button>
            <Button
              size="sm"
              loading={busy === "suspend"}
              onClick={() => void suspend(target?.status !== "Suspended")}
            >
              확인
            </Button>
          </div>
        }
      >
        <div className="mb-3 text-xs text-ink-600">
          대상: <b>{target?.email}</b>
        </div>
        {target?.status !== "Suspended" && (
          <Textarea
            label="정지 사유"
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
