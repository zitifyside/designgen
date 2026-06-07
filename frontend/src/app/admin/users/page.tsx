"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { ADMIN_USERS, type AdminUser } from "@/lib/admin-mock";
import type { Plan } from "@/lib/types";

type StatusFilter = "all" | AdminUser["status"];
type PlanFilter = "all" | Plan;

const STATUS_TONE: Record<
  AdminUser["status"],
  "success" | "warning" | "neutral"
> = {
  Active: "success",
  Suspended: "warning",
  Deleted: "neutral",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>(ADMIN_USERS);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendOpen, setSuspendOpen] = useState(false);

  const filtered = users.filter((u) => {
    if (statusFilter !== "all" && u.status !== statusFilter) return false;
    if (planFilter !== "all" && u.plan !== planFilter) return false;
    if (
      q &&
      !`${u.email} ${u.name}`.toLowerCase().includes(q.toLowerCase())
    )
      return false;
    return true;
  });

  const changePlan = (id: string, plan: Plan) => {
    setUsers((arr) => arr.map((u) => (u.id === id ? { ...u, plan } : u)));
  };

  const suspend = () => {
    if (!target || suspendReason.trim().length < 10) return;
    setUsers((arr) =>
      arr.map((u) =>
        u.id === target.id ? { ...u, status: "Suspended" } : u,
      ),
    );
    setSuspendOpen(false);
    setSuspendReason("");
    setTarget(null);
  };

  const restore = (id: string) => {
    setUsers((arr) =>
      arr.map((u) => (u.id === id ? { ...u, status: "Active" } : u)),
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title="사용자 관리"
        description={`전체 ${users.length}명 · 활성 ${users.filter((u) => u.status === "Active").length}명 · 정지 ${users.filter((u) => u.status === "Suspended").length}명`}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[240px] flex-1">
            <Input
              placeholder="이메일·이름 검색…"
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
              { value: "Deleted", label: "삭제됨" },
            ]}
          />
          <Tabs
            size="sm"
            value={planFilter}
            onChange={(v) => setPlanFilter(v as PlanFilter)}
            items={[
              { value: "all", label: "전체 플랜" },
              { value: "Free", label: "Free" },
              { value: "Pro", label: "Pro" },
              { value: "Team", label: "Team" },
            ]}
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-100 text-left text-ink-500">
                <th className="py-2 font-medium">사용자</th>
                <th className="py-2 font-medium">플랜</th>
                <th className="py-2 font-medium">상태</th>
                <th className="py-2 font-medium text-right">월 매출</th>
                <th className="py-2 font-medium text-right">생성</th>
                <th className="py-2 font-medium">가입</th>
                <th className="py-2 font-medium">최근 활동</th>
                <th className="py-2 font-medium text-right">액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-ink-50">
                  <td className="py-2.5">
                    <div className="font-medium text-ink-800">{u.name}</div>
                    <div className="text-[10px] text-ink-500">{u.email}</div>
                  </td>
                  <td className="py-2.5">
                    <select
                      value={u.plan}
                      onChange={(e) =>
                        changePlan(u.id, e.target.value as Plan)
                      }
                      className="rounded border border-ink-200 bg-white px-1.5 py-0.5 text-[11px] font-medium"
                    >
                      {(["Free", "Pro", "Team", "Admin"] as Plan[]).map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5">
                    <Badge tone={STATUS_TONE[u.status]}>{u.status}</Badge>
                  </td>
                  <td className="py-2.5 text-right font-mono text-ink-700">
                    ₩{u.monthlySpend.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right font-mono">{u.generations}</td>
                  <td className="py-2.5 text-ink-500">{u.joinedAt}</td>
                  <td className="py-2.5 text-ink-500">{u.lastActiveAt}</td>
                  <td className="py-2.5 text-right">
                    {u.status === "Active" ? (
                      <button
                        onClick={() => {
                          setTarget(u);
                          setSuspendOpen(true);
                        }}
                        className="text-red-600 hover:underline"
                      >
                        정지
                      </button>
                    ) : u.status === "Suspended" ? (
                      <button
                        onClick={() => restore(u.id)}
                        className="text-emerald-600 hover:underline"
                      >
                        복구
                      </button>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={suspendOpen}
        onClose={() => {
          setSuspendOpen(false);
          setTarget(null);
          setSuspendReason("");
        }}
        title={`${target?.name ?? ""} 정지`}
        description="감사 로그에 자동 기록된다. 사용자에게는 이메일 통지가 발송된다."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSuspendOpen(false);
                setSuspendReason("");
              }}
            >
              취소
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={suspendReason.trim().length < 10}
              onClick={suspend}
            >
              정지 처리
            </Button>
          </div>
        }
      >
        <Input
          label="정지 사유 (10자 이상)"
          placeholder="약관 위반·결제 사기·스팸·기타…"
          value={suspendReason}
          onChange={(e) => setSuspendReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
