"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { ADMIN_AUDIT_LOGS, type AuditLog } from "@/lib/admin-mock";

type SevFilter = "all" | AuditLog["severity"];

const TONE: Record<AuditLog["severity"], "neutral" | "warning" | "danger"> = {
  info: "neutral",
  warning: "warning",
  critical: "danger",
};

export default function AdminAuditLogsPage() {
  const [q, setQ] = useState("");
  const [sev, setSev] = useState<SevFilter>("all");

  const filtered = ADMIN_AUDIT_LOGS.filter((l) => {
    if (sev !== "all" && l.severity !== sev) return false;
    if (
      q &&
      !`${l.actor} ${l.action} ${l.target}`.toLowerCase().includes(q.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="감사 로그"
        description="로그인·권한 변경·결제·환불·데이터 삭제 등 모든 민감 작업이 자동 기록된다. 보존 기간 1년."
        action={<Button variant="outline">CSV Export</Button>}
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="min-w-[240px] flex-1">
            <Input
              placeholder="actor·action·target 검색…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Tabs
            size="sm"
            value={sev}
            onChange={(v) => setSev(v as SevFilter)}
            items={[
              { value: "all", label: "전체" },
              { value: "info", label: "Info" },
              { value: "warning", label: "Warning" },
              { value: "critical", label: "Critical" },
            ]}
          />
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink-100 text-left text-ink-500">
              <th className="py-2 font-medium">일시</th>
              <th className="py-2 font-medium">심각도</th>
              <th className="py-2 font-medium">액션</th>
              <th className="py-2 font-medium">대상</th>
              <th className="py-2 font-medium">Actor</th>
              <th className="py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id} className="border-b border-ink-50">
                <td className="py-2 font-mono text-ink-500">{l.at}</td>
                <td className="py-2">
                  <Badge tone={TONE[l.severity]}>{l.severity}</Badge>
                </td>
                <td className="py-2 font-mono font-medium text-ink-800">
                  {l.action}
                </td>
                <td className="py-2 text-ink-700">{l.target}</td>
                <td className="py-2 text-ink-600">{l.actor}</td>
                <td className="py-2 font-mono text-ink-500">{l.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
