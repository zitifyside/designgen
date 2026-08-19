"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import type { SessionDevice } from "@/lib/types";
import { useI18n } from "@/components/i18n/I18nProvider";

export default function SecurityPage() {
  const { t, locale } = useI18n();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const [sessions, setSessions] = useState<SessionDevice[]>([]);
  const [setup, setSetup] = useState<{
    secret: string;
    otpauthUri: string;
    backupCodes: string[];
  } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions(await api.users.sessions());
    } catch {
      /* 세션 조회 실패는 화면을 막지 않는다. */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setNotice(null);
    setError(null);
    try {
      setNotice(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("me.requestFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {(notice || error) && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-xs",
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          {error ?? notice}
        </div>
      )}

      {user?.deletionRequestedAt && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <span>
            {t("me.deleteQueuedMsg", {
              date: new Date(user.deletionRequestedAt).toLocaleDateString(
                locale === "en" ? "en-US" : "ko-KR",
              ),
            })}
          </span>
          <Button
            size="sm"
            variant="outline"
            loading={busy === "cancel-delete"}
            onClick={() =>
              run("cancel-delete", async () => {
                const res = await api.users.cancelDeletion();
                await refreshUser();
                return res.detail;
              })
            }
          >
            {t("me.cancelDelete")}
          </Button>
        </div>
      )}

      <Card>
        <CardHeader
          title={t("me.pwTitle")}
          description={t("me.pwDesc")}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={t("me.pwCurrent")}
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Input
            label={t("me.pwNew")}
            type="password"
            hint={t("me.pwMin")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            loading={busy === "password"}
            disabled={!currentPassword || newPassword.length < 8}
            onClick={() =>
              run("password", async () => {
                const res = await api.users.changePassword(
                  currentPassword,
                  newPassword,
                );
                setCurrentPassword("");
                setNewPassword("");
                return res.detail;
              })
            }
          >
            {t("me.pwChange")}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t("me.twoFaTitle")}
          description={t("me.twoFaDesc")}
          action={
            <Badge tone={user?.twoFactorEnabled ? "success" : "neutral"}>
              {user?.twoFactorEnabled ? t("me.active") : t("me.inactive")}
            </Badge>
          }
        />

        {user?.twoFactorEnabled ? (
          <div className="space-y-3">
            <p className="text-xs text-ink-500">
              {t("me.twoFaDisableHint")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={t("me.password")}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                label={t("me.totp6")}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
              />
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                loading={busy === "2fa-off"}
                disabled={!password || code.length !== 6}
                onClick={() =>
                  run("2fa-off", async () => {
                    const res = await api.users.disable2fa(password, code);
                    setPassword("");
                    setCode("");
                    await refreshUser();
                    return res.detail;
                  })
                }
              >
                {t("me.twoFaOff")}
              </Button>
            </div>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
              <div className="text-[11px] text-ink-500">
                {t("me.twoFaRegister")}
              </div>
              <div className="mt-1 break-all font-mono text-xs text-ink-900">
                {setup.secret}
              </div>
              <div className="mt-2 break-all font-mono text-[10px] text-ink-500">
                {setup.otpauthUri}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-ink-700">
                {t("me.backupCodes")}
              </div>
              <div className="mt-1 grid grid-cols-5 gap-1.5">
                {setup.backupCodes.map((c) => (
                  <span
                    key={c}
                    className="rounded border border-ink-200 bg-surface px-1.5 py-1 text-center font-mono text-[10px]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  label={t("me.totp6")}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={6}
                />
              </div>
              <Button
                size="sm"
                loading={busy === "2fa-verify"}
                disabled={code.length !== 6}
                onClick={() =>
                  run("2fa-verify", async () => {
                    const res = await api.users.verify2fa(code);
                    setCode("");
                    setSetup(null);
                    await refreshUser();
                    return res.detail;
                  })
                }
              >
                {t("me.twoFaConfirm")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            loading={busy === "2fa-setup"}
            onClick={() =>
              run("2fa-setup", async () => {
                setSetup(await api.users.setup2fa());
                return t("me.twoFaStartHint");
              })
            }
          >
            {t("me.twoFaStart")}
          </Button>
        )}
      </Card>

      <Card>
        <CardHeader
          title={t("me.sessionsTitle")}
          description={t("me.sessionsDesc")}
          action={
            sessions.length > 1 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  run("sessions-all", async () => {
                    // 기기를 잃어버렸을 때 하나씩 지우게 하면 늦는다.
                    const res = await api.users.revokeOtherSessions();
                    await load();
                    return res.detail;
                  })
                }
              >
                {t("me.revokeOthers")}
              </Button>
            ) : undefined
          }
        />
        {sessions.length === 0 ? (
          <p className="py-3 text-xs text-ink-500">{t("me.noSessions")}</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-ink-900">
                      {s.device}
                    </span>
                    {s.current && (
                      <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                        {t("me.thisDevice")}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-ink-500">
                    {s.location ?? t("me.unknownLocation")} ·{" "}
                    {s.lastActive
                      ? new Date(s.lastActive).toLocaleString("ko-KR")
                      : t("me.noRecentActivity")}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={s.current}
                  title={s.current ? t("me.cannotRevokeCurrent") : undefined}
                  onClick={() =>
                    run(`session-${s.id}`, async () => {
                      const res = await api.users.revokeSession(s.id);
                      await load();
                      return res.detail;
                    })
                  }
                >
                  {t("me.revokeSession")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title={t("me.dataTitle")}
          description={t("me.dataDesc")}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            loading={busy === "gdpr"}
            onClick={() =>
              run("gdpr", async () => {
                const data = await api.users.gdprExport();
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "adg-my-data.json";
                a.click();
                URL.revokeObjectURL(url);
                return t("me.dataDownloaded");
              })
            }
          >
            {t("me.downloadData")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-700"
            onClick={() => setDeleteModal(true)}
          >
            {t("me.requestDelete")}
          </Button>
        </div>
      </Card>

      <Modal
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        title={t("me.deleteTitle")}
        description={t("me.deleteDesc")}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeleteModal(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              loading={busy === "delete"}
              disabled={!password}
              onClick={() =>
                run("delete", async () => {
                  const res = await api.users.requestDeletion(
                    password,
                    deleteReason,
                  );
                  setPassword("");
                  setDeleteReason("");
                  setDeleteModal(false);
                  await refreshUser();
                  return res.detail;
                })
              }
            >
              {t("me.requestDelete")}
            </Button>
          </div>
        }
      >
        <Input
          label={t("me.confirmPassword")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="mt-3">
          <Input
            label={t("me.reasonOptional")}
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            maxLength={500}
          />
        </div>
      </Modal>
    </div>
  );
}
