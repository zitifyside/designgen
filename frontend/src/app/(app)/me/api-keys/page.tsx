"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import type { ApiKey } from "@/lib/types";

/**
 * 사용자 API Key 관리 (Pro 이상).
 *
 * Public API·MCP Server 인증에 쓰는 **사용자 키**이며, 서비스 내부 Provider Key
 * (LLM·Image Gen 호출용) 와는 별개 체계다 (기획서 v0.5.0 §4 F-204).
 */
export default function ApiKeysPage() {
  const user = useAuthStore((s) => s.user);
  const allowed =
    user?.plan === "Pro" || user?.plan === "Team" || user?.plan === "Admin";

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [label, setLabel] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      setKeys(await api.apiKeys.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "API Key 를 불러오지 못했다.");
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!allowed) {
    return (
      <Card>
        <CardHeader
          title="API Key"
          description="Public API·MCP Server 연동에 사용하는 사용자 키이다."
          action={<Badge tone="brand">Pro+</Badge>}
        />
        <p className="text-xs text-ink-600">
          API Key 발급은 Pro 이상 등급에서 제공된다. 플랜을 업그레이드하면 MCP
          Server(Cursor·Claude Code)에서 프로젝트 Token 을 직접 참조할 수 있다.
        </p>
      </Card>
    );
  }

  const handleCreate = async () => {
    if (!label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const key = await api.apiKeys.create(label.trim());
      setIssued(key.key ?? null);
      setLabel("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "발급에 실패했다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="API Key 발급"
          description="키 값은 발급 직후 한 번만 표시된다. 서버는 해시만 보관한다."
        />
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              label="키 이름"
              placeholder="예: MCP local, CI 파이프라인"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
            />
          </div>
          <Button loading={busy} disabled={!label.trim()} onClick={handleCreate}>
            발급
          </Button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {issued && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-[11px] font-medium text-emerald-800">
              발급된 키 — 지금 복사해 보관한다. 다시 표시되지 않는다.
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-[11px] text-ink-900">
                {issued}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void navigator.clipboard?.writeText(issued)}
              >
                복사
              </Button>
            </div>
            <div className="mt-2 text-[10px] text-emerald-800">
              MCP 설정에서는 환경변수 <code>ADG_API_KEY</code> 로 지정한다.
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="발급된 키" description="최대 5개까지 활성 보유 가능하다." />
        {keys.length === 0 ? (
          <p className="py-3 text-xs text-ink-500">발급된 키가 없다.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-100 text-left text-ink-500">
                <th className="py-2 font-medium">이름</th>
                <th className="py-2 font-medium">Prefix</th>
                <th className="py-2 font-medium">호출</th>
                <th className="py-2 font-medium">마지막 사용</th>
                <th className="py-2 font-medium">상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-ink-50">
                  <td className="py-2 font-medium text-ink-800">{k.label}</td>
                  <td className="py-2 font-mono text-ink-500">{k.prefix}…</td>
                  <td className="py-2 text-ink-500">{k.callCount}</td>
                  <td className="py-2 text-ink-500">
                    {k.lastUsedAt
                      ? new Date(k.lastUsedAt).toLocaleDateString("ko-KR")
                      : "—"}
                  </td>
                  <td className="py-2">
                    <Badge tone={k.revoked ? "neutral" : "success"}>
                      {k.revoked ? "회수됨" : "활성"}
                    </Badge>
                  </td>
                  <td className="py-2 text-right">
                    {!k.revoked && (
                      <button
                        className="text-red-600 hover:underline"
                        onClick={async () => {
                          await api.apiKeys.revoke(k.id);
                          await load();
                        }}
                      >
                        회수
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
