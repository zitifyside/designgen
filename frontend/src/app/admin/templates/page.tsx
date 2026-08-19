"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { api } from "@/lib/api";
import type { Template, TemplateStatus } from "@/lib/types";
import { useI18n } from "@/components/i18n/I18nProvider";

type Filter = "all" | TemplateStatus;

const LABEL: Record<TemplateStatus, string> = {
  Pending: "admin.tplPending",
  Approved: "admin.tplApproved",
  Rejected: "admin.tplRejected",
  RequestChanges: "admin.tplChanges",
};

const TONE: Record<TemplateStatus, "warning" | "success" | "danger" | "neutral"> =
  {
    Pending: "warning",
    Approved: "success",
    Rejected: "danger",
    RequestChanges: "neutral",
  };

export default function AdminTemplatesPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Template[]>([]);
  const [filter, setFilter] = useState<Filter>("Pending");
  const [target, setTarget] = useState<Template | null>(null);
  const [decision, setDecision] = useState<TemplateStatus>("Approved");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(
        await api.admin.templates({
          status: filter === "all" ? undefined : filter,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.tplLoadFailed"));
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const moderate = async () => {
    if (!target) return;
    if (decision !== "Approved" && !reason.trim()) {
      setError(t("admin.reasonRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.admin.moderateTemplate(target.id, decision, reason.trim());
      setTarget(null);
      setReason("");
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
        title={t("admin.tplTitle")}
        description={t("admin.tplDesc")}
        action={
          <Tabs
            size="sm"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            items={[
              { value: "Pending", label: t("admin.pending") },
              { value: "Approved", label: t("admin.published") },
              { value: "Rejected", label: t("admin.rejected") },
              { value: "all", label: t("admin.statusAll") },
            ]}
          />
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
              <th className="px-4 py-3 font-medium">{t("admin.colName")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colAuthor")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colCategory")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colPrice")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colStatus")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colRegistered")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((tpl) => (
              <tr key={tpl.id} className="border-b border-ink-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-ink-900">{tpl.name}</div>
                  <div className="text-[10px] text-ink-500">{tpl.description}</div>
                </td>
                <td className="px-4 py-3 text-ink-600">{tpl.authorName}</td>
                <td className="px-4 py-3 text-ink-600">{tpl.category}</td>
                <td className="px-4 py-3">
                  {tpl.price === 0 ? t("templates.priceFree") : `$${tpl.price}`}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={TONE[tpl.status]}>{t(LABEL[tpl.status])}</Badge>
                </td>
                <td className="px-4 py-3 text-ink-500">
                  {new Date(tpl.createdAt).toLocaleDateString(locale === "en" ? "en-US" : "ko-KR")}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setTarget(tpl);
                        setDecision("Approved");
                      }}
                    >
                      {t("admin.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTarget(tpl);
                        setDecision("Rejected");
                      }}
                    >
                      {t("admin.reject")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setTarget(tpl);
                        setDecision("RequestChanges");
                      }}
                    >
                      {t("admin.requestChanges")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-500">
                  {t("admin.noTpl")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={t("admin.tplAction", { action: decision ? t(LABEL[decision]) : "" })}
        description={t("admin.tplActionDesc")}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" loading={busy} onClick={() => void moderate()}>
              {t("common.confirm")}
            </Button>
          </div>
        }
      >
        <div className="mb-3 text-xs text-ink-600">
          {t("admin.target")}<b>{target?.name}</b>
        </div>
        <Textarea
          label={decision === "Approved" ? t("admin.memoOptional") : t("admin.reasonRequiredLabel")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          countMax={500}
          maxLength={500}
        />
      </Modal>
    </div>
  );
}
