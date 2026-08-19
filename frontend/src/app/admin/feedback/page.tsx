"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, type FeedbackRecord } from "@/lib/api";
import { useI18n } from "@/components/i18n/I18nProvider";

type StatusFilter = "all" | "new" | "in_review" | "resolved" | "closed";

const STATUS_LABEL: Record<string, string> = {
  new: "admin.fbNew",
  in_review: "admin.fbReview",
  resolved: "admin.fbResolved",
  closed: "admin.fbClosed",
};

const TONE: Record<string, "warning" | "brand" | "success" | "neutral"> = {
  new: "warning",
  in_review: "brand",
  resolved: "success",
  closed: "neutral",
};

export default function AdminFeedbackPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<FeedbackRecord[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [target, setTarget] = useState<FeedbackRecord | null>(null);
  const [response, setResponse] = useState("");
  const [nextStatus, setNextStatus] = useState("resolved");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(
        await api.admin.feedback({
          status: filter === "all" ? undefined : filter,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.fbLoadFailed"));
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.admin.resolveFeedback(target.id, nextStatus, response);
      setTarget(null);
      setResponse("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title={t("admin.fbTitle")}
        description={t("admin.fbDesc")}
        action={
          <Tabs
            size="sm"
            value={filter}
            onChange={(v) => setFilter(v as StatusFilter)}
            items={[
              { value: "all", label: t("admin.statusAll") },
              { value: "new", label: t("admin.fbNew") },
              { value: "in_review", label: t("admin.fbReview") },
              { value: "resolved", label: t("admin.fbResolved") },
            ]}
          />
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {items.map((f) => (
          <Card key={f.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink-900">
                    {f.title}
                  </span>
                  <Badge tone={TONE[f.status] ?? "neutral"}>
                    {STATUS_LABEL[f.status] ? t(STATUS_LABEL[f.status]) : f.status}
                  </Badge>
                  <span className="text-[10px] text-ink-500">{f.category}</span>
                </div>
                <div className="mt-1 text-[11px] text-ink-500">
                  {f.userEmail} ·{" "}
                  {new Date(f.createdAt).toLocaleString("ko-KR")}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs text-ink-700">
                  {f.body}
                </p>
                {f.adminResponse && (
                  <div className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
                    <b>{t("admin.replyPrefix")}</b> · {f.adminResponse}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTarget(f);
                  setResponse(f.adminResponse ?? "");
                }}
              >
                {t("admin.reply")}
              </Button>
            </div>
          </Card>
        ))}
        {items.length === 0 && (
          <Card>
            <p className="py-6 text-center text-xs text-ink-500">
              {t("admin.noFeedback")}
            </p>
          </Card>
        )}
      </div>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={t("admin.fbReplyTitle")}
        description={t("admin.fbReplyDesc")}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submit()}>
              {t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="mb-3">
          <div className="mb-1.5 text-xs font-medium text-ink-700">{t("admin.fbStatus")}</div>
          <div className="grid grid-cols-4 gap-1.5">
            {["new", "in_review", "resolved", "closed"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setNextStatus(s)}
                className={`rounded-lg border py-2 text-[11px] font-medium ${
                  nextStatus === s
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50"
                }`}
              >
                {t(STATUS_LABEL[s])}
              </button>
            ))}
          </div>
        </div>
        <Textarea
          label={t("admin.fbBody")}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          rows={4}
          countMax={2000}
          maxLength={2000}
        />
      </Modal>
    </div>
  );
}
