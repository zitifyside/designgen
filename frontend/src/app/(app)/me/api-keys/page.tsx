"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { MOCK_API_KEYS } from "@/lib/mock-data";
import { useAuthStore } from "@/store/auth-store";
import type { ApiKey } from "@/lib/types";

export default function ApiKeysPage() {
  const plan = useAuthStore((s) => s.user?.plan);
  const isFree = plan === "Free";
  const [keys, setKeys] = useState<ApiKey[]>(MOCK_API_KEYS);
  const [openCreate, setOpenCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [issued, setIssued] = useState<string | null>(null);

  const handleCreate = () => {
    if (!newName.trim()) return;
    const prefix = `adg_live_${Math.random().toString(36).slice(2, 6)}`;
    const fullKey = `${prefix}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    setKeys((k) => [
      {
        id: `key_${Date.now()}`,
        name: newName.trim(),
        prefix,
        createdAt: new Date().toISOString(),
      },
      ...k,
    ]);
    setIssued(fullKey);
    setNewName("");
  };

  const handleRevoke = (id: string) => {
    if (!confirm("API Key 를 즉시 무효화한다. 계속하는가?")) return;
    setKeys((k) => k.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="API Key"
          description="Public API 및 MCP Server 접근에 사용된다. Pro+ 등급만 발급 가능."
          action={
            <Button
              size="sm"
              onClick={() => setOpenCreate(true)}
              disabled={isFree}
            >
              새 Key 발급
            </Button>
          }
        />
        {isFree && (
          <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Free 등급은 API Key 를 발급받을 수 없다. Pro 업그레이드가 필요하다.
          </div>
        )}
        {keys.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-500">
            등록된 Key 가 없다.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-100 text-left text-ink-500">
                <th className="py-2 font-medium">이름</th>
                <th className="py-2 font-medium">Prefix</th>
                <th className="py-2 font-medium">생성일</th>
                <th className="py-2 font-medium">마지막 사용</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-ink-50">
                  <td className="py-2 font-medium text-ink-800">{k.name}</td>
                  <td className="py-2 font-mono text-ink-600">
                    {k.prefix}_••••••••
                  </td>
                  <td className="py-2 text-ink-500">
                    {new Date(k.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="py-2 text-ink-500">
                    {k.lastUsedAt
                      ? new Date(k.lastUsedAt).toLocaleString("ko-KR")
                      : "—"}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleRevoke(k.id)}
                      className="text-red-600 hover:underline"
                    >
                      무효화
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader title="MCP Server 연결 안내" />
        <p className="text-xs text-ink-600">
          Cursor·Claude Code·Windsurf 등 MCP 호환 클라이언트에 다음 환경변수를
          등록한다.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-ink-900 px-4 py-3 text-[11px] text-emerald-300">
{`# .env 또는 MCP 클라이언트 환경
ADG_API_KEY=adg_live_xxxx_xxxxxxxxxxxxxxxxxxxxxxxxxx
ADG_MCP_URL=https://mcp.designgenerator.io`}
        </pre>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-ink-500">
          <Badge tone="brand">MCP</Badge>
          <span>
            Tool 목록: get_design_tokens, get_mockup_context,
            get_component_styles, list_projects, subscribe_token_changes
          </span>
        </div>
      </Card>

      <Modal
        open={openCreate}
        onClose={() => {
          setOpenCreate(false);
          setIssued(null);
        }}
        title="새 API Key 발급"
        description="Key 는 발급 직후 1회만 표시된다. 안전한 곳에 즉시 보관한다."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpenCreate(false);
                setIssued(null);
              }}
            >
              {issued ? "닫기" : "취소"}
            </Button>
            {!issued && (
              <Button size="sm" onClick={handleCreate}>
                발급
              </Button>
            )}
          </div>
        }
      >
        {issued ? (
          <div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              ✓ API Key 가 발급되었다. 지금 한 번만 표시된다.
            </div>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-ink-900 px-3 py-2 font-mono text-[11px] text-emerald-300">
              {issued}
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => navigator.clipboard?.writeText(issued)}
            >
              클립보드 복사
            </Button>
          </div>
        ) : (
          <Input
            label="Key 이름"
            placeholder="예: Local Dev, Production API"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
        )}
      </Modal>
    </div>
  );
}
