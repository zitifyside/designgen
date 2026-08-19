"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import type { Team, TeamRole } from "@/lib/types";
import { useI18n } from "@/components/i18n/I18nProvider";

const ROLE_TONE: Record<TeamRole, "brand" | "neutral"> = {
  Owner: "brand",
  Admin: "brand",
  Member: "neutral",
};

/** 팀 워크스페이스 — 역할은 Owner·Admin·Member 3종 (서비스정책서 §18.2). */
export default function TeamPage() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const allowed = user?.plan === "Team" || user?.plan === "Admin";

  const [team, setTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("Member");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      const teams = await api.teams.list();
      setTeam(teams[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("me.teamLoadFailed"));
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!allowed) {
    return (
      <Card>
        <CardHeader
          title={t("me.teamTitle")}
          description={t("me.teamDesc")}
          action={<Badge tone="brand">Team+</Badge>}
        />
        <p className="text-xs text-ink-600">
          {t("me.teamGate")}
        </p>
      </Card>
    );
  }

  const canManage = team?.myRole === "Owner" || team?.myRole === "Admin";

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await fn());
      await load();
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
          className={
            error
              ? "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
              : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
          }
        >
          {error ?? notice}
        </div>
      )}

      {!team ? (
        <Card>
          <CardHeader
            title={t("me.teamCreateTitle")}
            description={t("me.teamCreateDesc")}
          />
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label={t("me.teamName")}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                maxLength={120}
              />
            </div>
            <Button
              loading={busy === "create"}
              disabled={!teamName.trim()}
              onClick={() =>
                run("create", async () => {
                  await api.teams.create(teamName.trim());
                  setTeamName("");
                  return t("me.teamCreated");
                })
              }
            >
              {t("me.teamCreate")}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title={team.name}
              description={t("me.teamSeats", { used: team.seatsUsed, limit: team.seatLimit, role: team.myRole })}
              action={<Badge tone={ROLE_TONE[team.myRole]}>{team.myRole}</Badge>}
            />
            <p className="text-[11px] text-ink-500">
              {t("me.teamRoles")}
            </p>
          </Card>

          {canManage && (
            <Card>
              <CardHeader title={t("me.inviteTitle")} description={t("me.inviteDesc")} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label={t("common.email")}
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <Input
                  label={t("me.nameOptional")}
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
                <div>
                  <div className="mb-1.5 text-xs font-medium text-ink-700">
                    {t("me.role")}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["Member", "Admin"] as TeamRole[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setInviteRole(r)}
                        className={`rounded-lg border py-2 text-xs font-medium ${
                          inviteRole === r
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  loading={busy === "invite"}
                  disabled={!inviteEmail.trim()}
                  onClick={() =>
                    run("invite", async () => {
                      await api.teams.invite(
                        team.id,
                        inviteEmail.trim(),
                        inviteName.trim(),
                        inviteRole,
                      );
                      setInviteEmail("");
                      setInviteName("");
                      return t("me.invited");
                    })
                  }
                >
                  {t("me.invite")}
                </Button>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title={t("me.members")} description={t("me.membersCount", { n: team.members.length })} />
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-100 text-left text-ink-500">
                  <th className="py-2 font-medium">{t("common.email")}</th>
                  <th className="py-2 font-medium">{t("common.name")}</th>
                  <th className="py-2 font-medium">{t("me.role")}</th>
                  <th className="py-2 font-medium">{t("common.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {team.members.map((m) => (
                  <tr key={m.id} className="border-b border-ink-50">
                    <td className="py-2 text-ink-800">{m.email}</td>
                    <td className="py-2 text-ink-500">{m.name || "—"}</td>
                    <td className="py-2">
                      <Badge tone={ROLE_TONE[m.role]}>{m.role}</Badge>
                    </td>
                    <td className="py-2 text-ink-500">
                      {m.status === "Active" ? t("me.memberActive") : t("me.memberInvited")}
                    </td>
                    <td className="py-2 text-right">
                      {canManage && m.role !== "Owner" && (
                        <div className="flex justify-end gap-2">
                          <button
                            className="text-brand-700 hover:underline"
                            onClick={() =>
                              run(`role-${m.id}`, async () => {
                                await api.teams.updateRole(
                                  team.id,
                                  m.id,
                                  m.role === "Admin" ? "Member" : "Admin",
                                );
                                return t("me.roleChanged");
                              })
                            }
                          >
                            {m.role === "Admin" ? t("me.toMember") : t("me.toAdmin")}
                          </button>
                          <button
                            className="text-red-700 hover:underline"
                            onClick={() =>
                              run(`remove-${m.id}`, async () => {
                                await api.teams.removeMember(team.id, m.id);
                                return t("me.removed");
                              })
                            }
                          >
                            {t("me.remove")}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
