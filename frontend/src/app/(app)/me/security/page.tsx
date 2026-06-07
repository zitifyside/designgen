"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useState } from "react";
import { MOCK_SESSIONS } from "@/lib/mock-data";
import { useAuthStore } from "@/store/auth-store";

export default function SecurityPage() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [sessions, setSessions] = useState(MOCK_SESSIONS);

  if (!user) return null;

  const terminate = (id: string) =>
    setSessions((s) => s.filter((x) => x.id !== id));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="2단계 인증 (TOTP)"
          description="Google Authenticator·1Password 호환. 분실 시 백업 코드로 복구한다."
          action={
            <Button
              variant={user.twoFactorEnabled ? "outline" : "primary"}
              size="sm"
              onClick={() =>
                updateProfile({ twoFactorEnabled: !user.twoFactorEnabled })
              }
            >
              {user.twoFactorEnabled ? "비활성화" : "활성화"}
            </Button>
          }
        />
        <div className="flex items-center gap-2">
          {user.twoFactorEnabled ? (
            <Badge tone="success">활성화됨</Badge>
          ) : (
            <Badge tone="warning">비활성화</Badge>
          )}
          <span className="text-xs text-ink-500">
            {user.twoFactorEnabled
              ? "백업 코드 10개가 발급되었다. 안전한 곳에 보관한다."
              : "Pro 등급 권장 · Admin 필수."}
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="비밀번호"
          description="변경 시 모든 세션이 자동 로그아웃된다."
          action={
            <Button variant="outline" size="sm">
              비밀번호 변경
            </Button>
          }
        />
        <div className="text-xs text-ink-500">
          마지막 변경: 2026-04-12 (약 2개월 전)
        </div>
      </Card>

      <Card>
        <CardHeader
          title="로그인된 기기"
          description="이상한 기기가 보인다면 즉시 세션을 종료한다."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSessions((s) => s.filter((x) => x.current))}
            >
              현재 외 전체 종료
            </Button>
          }
        />
        <ul className="divide-y divide-ink-100">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between py-3 text-xs"
            >
              <div>
                <div className="flex items-center gap-2 font-medium text-ink-800">
                  {s.device}
                  {s.current && <Badge tone="brand">현재</Badge>}
                </div>
                <div className="mt-0.5 text-[10px] text-ink-500">
                  {s.location} · 최근 활동{" "}
                  {new Date(s.lastActive).toLocaleString("ko-KR")}
                </div>
              </div>
              {!s.current && (
                <button
                  onClick={() => terminate(s.id)}
                  className="text-red-600 hover:underline"
                >
                  세션 종료
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="GDPR · 데이터 Export"
          description="모든 프로젝트·DS·이력을 JSON 패키지로 받는다. 월 1회 제한."
          action={<Button variant="outline" size="sm">Export 요청</Button>}
        />
        <p className="text-xs text-ink-500">
          요청 후 수 분 내로 다운로드 링크가 이메일로 발송된다. 링크는 7일간
          유효하다.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="계정 삭제"
          description="30일 유예 후 모든 데이터가 hard delete 된다. 진행 중 구독이 있으면 차단된다."
          action={
            <Button variant="danger" size="sm">
              계정 삭제 요청
            </Button>
          }
        />
        <p className="text-xs text-ink-500">
          유예 기간 내 재로그인 시 자동 취소된다. 감사 로그만 익명화 보존된다.
        </p>
      </Card>
    </div>
  );
}
