"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, type AuditLogRecord } from "@/lib/api";
import { useI18n } from "@/components/i18n/I18nProvider";

type Severity = "all" | "info" | "warning" | "critical";

const TONE: Record<string, "neutral" | "warning" | "danger"> = {
  info: "neutral",
  warning: "warning",
  critical: "danger",
};

export default function AdminAuditLogsPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [severity, setSeverity] = useState<Severity>("all");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLogs(
        await api.admin.auditLogs({
          severity: severity === "all" ? undefined : severity,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.auditFailed"));
    }
  }, [severity]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    const header = "at,actor,action,target,ip,severity";
    const rows = logs.map((l) =>
      [l.at, l.actor, l.action, l.target, l.ip ?? "", l.severity]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-logs.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title={t("admin.auditTitle")}
        description={t("admin.auditDesc")}
        action={
          <div className="flex items-center gap-2">
            <Tabs
              size="sm"
              value={severity}
              onChange={(v) => setSeverity(v as Severity)}
              items={[
                { value: "all", label: t("admin.statusAll") },
                { value: "info", label: "info" },
                { value: "warning", label: "warning" },
                { value: "critical", label: "critical" },
              ]}
            />
            <Button size="sm" variant="outline" onClick={exportCsv}>
              {t("admin.exportCsv")}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <Card padded={false}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-500">
              <th className="px-4 py-3 font-medium">{t("admin.colTime")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colActor")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colAction")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colTarget")}</th>
              <th className="px-4 py-3 font-medium">IP</th>
              <th className="px-4 py-3 font-medium">{t("admin.colSeverity")}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-ink-100">
                <td className="px-4 py-3 text-ink-500">
                  {new Date(l.at).toLocaleString("ko-KR")}
                </td>
                <td className="px-4 py-3 font-medium text-ink-900">{l.actor}</td>
                <td className="px-4 py-3 font-mono text-ink-700">{l.action}</td>
                <td className="px-4 py-3 text-ink-600">{l.target}</td>
                <td className="px-4 py-3 text-ink-500">{l.ip ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={TONE[l.severity] ?? "neutral"}>{l.severity}</Badge>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                  {t("admin.noRecords")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
