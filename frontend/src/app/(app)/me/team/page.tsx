"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import type { Team, TeamRole } from "@/lib/types";

const ROLE_TONE: Record<TeamRole, "brand" | "neutral"> = {
  Owner: "brand",
  Admin: "brand",
  Member: "neutral",
};

/** 팀 워크스페이스 — 역할은 Owner·Admin·Member 3종 (서비스정책서 §18.2). */
export default function TeamPage() {
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
      setError(e instanceof Error ? e.message : "팀 정보를 불러오지 못했다.");
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!allowed) {
    return (
      <Card>
        <CardHeader
          title="팀 워크스페이스"
          description="팀 단위로 프로젝트와 DS 를 공유한다."
          action={<Badge tone="brand">Team+</Badge>}
        />
        <p className="text-xs text-ink-600">
          팀 기능은 Team 등급에서 제공된다. 기본 정원은 5명이며, 추가 시드는 1인당
          월 $9 이다.
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
      setError(e instanceof Error ? e.message : "요청에 실패했다.");
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
            title="팀 만들기"
            description="팀을 만들면 프로젝트·공유 DS 라이브러리를 팀원과 함께 쓸 수 있다."
          />
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="팀 이름"
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
                  return "팀을 만들었다.";
                })
              }
            >
              팀 생성
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title={team.name}
              description={`정원 ${team.seatsUsed} / ${team.seatLimit}명 · 내 역할 ${team.myRole}`}
              action={<Badge tone={ROLE_TONE[team.myRole]}>{team.myRole}</Badge>}
            />
            <p className="text-[11px] text-ink-500">
              Owner 는 팀 해체·이양·결제·역할 변경 전체, Admin 은 팀원 초대와 Member
              역할 변경, Member 는 팀 프로젝트 읽기·쓰기와 시안 생성을 할 수 있다.
              정원을 넘는 시드는 1인당 월 $9 이다.
            </p>
          </Card>

          {canManage && (
            <Card>
              <CardHeader title="팀원 초대" description="이메일로 초대한다." />
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label="이메일"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <Input
                  label="이름 (선택)"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
                <div>
                  <div className="mb-1.5 text-xs font-medium text-ink-700">
                    역할
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
                      return "팀원을 초대했다.";
                    })
                  }
                >
                  초대
                </Button>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="팀원" description={`${team.members.length}명`} />
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-100 text-left text-ink-500">
                  <th className="py-2 font-medium">이메일</th>
                  <th className="py-2 font-medium">이름</th>
                  <th className="py-2 font-medium">역할</th>
                  <th className="py-2 font-medium">상태</th>
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
                      {m.status === "Active" ? "활성" : "초대됨"}
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
                                return "역할을 변경했다.";
                              })
                            }
                          >
                            {m.role === "Admin" ? "Member 로" : "Admin 으로"}
                          </button>
                          <button
                            className="text-red-700 hover:underline"
                            onClick={() =>
                              run(`remove-${m.id}`, async () => {
                                await api.teams.removeMember(team.id, m.id);
                                return "팀원을 제외했다.";
                              })
                            }
                          >
                            제외
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
