"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, type HealthComponent } from "@/lib/api";
import { useI18n } from "@/components/i18n/I18nProvider";

const TONE: Record<HealthComponent["status"], "success" | "warning" | "danger" | "neutral"> =
  {
    operational: "success",
    degraded: "warning",
    down: "danger",
    not_configured: "neutral",
  };

const LABEL: Record<HealthComponent["status"], string> = {
  operational: "admin.opOperational",
  degraded: "admin.opDegraded",
  down: "admin.opDown",
  not_configured: "admin.opUnknown",
};

export default function AdminHealthPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<HealthComponent[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setItems(await api.admin.health());
      setCheckedAt(new Date().toLocaleString("ko-KR"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.healthFailed"));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        title={t("admin.healthTitle")}
        description={t("admin.healthDesc")}
        action={
          <Button size="sm" variant="outline" loading={busy} onClick={() => void load()}>
            {t("admin.checkNow")}
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <Card padded={false}>
        <ul>
          {items.map((c) => (
            <li
              key={c.name}
              className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink-900">{c.name}</div>
                <div className="mt-0.5 text-[11px] text-ink-500">{c.detail}</div>
              </div>
              <div className="flex items-center gap-3">
                {typeof c.latencyMs === "number" && (
                  <span className="font-mono text-[11px] text-ink-500">
                    {c.latencyMs}ms
                  </span>
                )}
                <Badge tone={TONE[c.status]}>{t(LABEL[c.status])}</Badge>
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-5 py-8 text-center text-xs text-ink-500">
              {t("admin.healthLoading")}
            </li>
          )}
        </ul>
      </Card>

      {checkedAt && (
        <p className="mt-3 text-[11px] text-ink-500">{t("admin.lastCheck", { when: checkedAt })}</p>
      )}
    </div>
  );
}
