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

export default function SecurityPage() {
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
      setError(e instanceof Error ? e.message : "요청에 실패했다.");
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
            계정 삭제가 접수되었다 (
            {new Date(user.deletionRequestedAt).toLocaleDateString("ko-KR")}).
            30일 유예 후 파기된다.
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
            삭제 취소
          </Button>
        </div>
      )}

      <Card>
        <CardHeader
          title="비밀번호 변경"
          description="변경 후에도 기존 세션은 유지된다. 필요하면 아래에서 원격 로그아웃한다."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="현재 비밀번호"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Input
            label="새 비밀번호"
            type="password"
            hint="최소 8자"
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
            비밀번호 변경
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="2단계 인증 (2FA)"
          description="TOTP 앱(Google Authenticator·1Password)으로 로그인 2단계를 활성화한다."
          action={
            <Badge tone={user?.twoFactorEnabled ? "success" : "neutral"}>
              {user?.twoFactorEnabled ? "활성" : "비활성"}
            </Badge>
          }
        />

        {user?.twoFactorEnabled ? (
          <div className="space-y-3">
            <p className="text-xs text-ink-500">
              해제하려면 비밀번호와 TOTP 코드를 함께 입력한다.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="비밀번호"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                label="인증 코드 (6자리)"
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
                2FA 해제
              </Button>
            </div>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
              <div className="text-[11px] text-ink-500">
                인증 앱에 아래 키를 등록한다.
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
                백업 코드 10개 — 안전한 곳에 보관한다.
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
                  label="인증 코드 (6자리)"
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
                확인하고 활성화
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
                return "인증 앱에 키를 등록한 뒤 코드를 입력한다.";
              })
            }
          >
            2FA 설정 시작
          </Button>
        )}
      </Card>

      <Card>
        <CardHeader
          title="로그인 세션"
          description="현재 로그인된 기기 목록이다. 의심스러운 세션은 종료한다."
        />
        {sessions.length === 0 ? (
          <p className="py-3 text-xs text-ink-500">활성 세션이 없다.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-ink-900">
                    {s.device}
                  </div>
                  <div className="mt-0.5 text-[10px] text-ink-500">
                    {s.location ?? "위치 미상"} ·{" "}
                    {s.lastActive
                      ? new Date(s.lastActive).toLocaleString("ko-KR")
                      : "최근 활동 기록 없음"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    run(`session-${s.id}`, async () => {
                      const res = await api.users.revokeSession(s.id);
                      await load();
                      return res.detail;
                    })
                  }
                >
                  세션 종료
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="내 데이터 · 계정"
          description="GDPR 데이터 내려받기와 계정 삭제를 처리한다."
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
                return "내 데이터를 JSON 으로 내려받았다.";
              })
            }
          >
            내 데이터 내려받기 (JSON)
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-700"
            onClick={() => setDeleteModal(true)}
          >
            계정 삭제 요청
          </Button>
        </div>
      </Card>

      <Modal
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        title="계정 삭제 요청"
        description="삭제 요청 후 30일 유예 기간이 있으며, 그 기간 내에는 취소할 수 있다. 유예 후에는 데이터가 파기되고 감사 로그만 익명화 보존된다."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeleteModal(false)}>
              취소
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
              삭제 요청
            </Button>
          </div>
        }
      >
        <Input
          label="비밀번호 확인"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="mt-3">
          <Input
            label="사유 (선택)"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            maxLength={500}
          />
        </div>
      </Modal>
    </div>
  );
}
