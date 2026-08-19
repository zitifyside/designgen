"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import type { ApiKey } from "@/lib/types";
import { useI18n } from "@/components/i18n/I18nProvider";

/**
 * 사용자 API Key 관리 (Pro 이상).
 *
 * Public API·MCP Server 인증에 쓰는 **사용자 키**이며, 서비스 내부 Provider Key
 * (LLM·Image Gen 호출용) 와는 별개 체계다 (기획서 v0.5.0 §4 F-204).
 */
export default function ApiKeysPage() {
  const { t } = useI18n();
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
      setError(e instanceof Error ? e.message : t("me.keysLoadFailed"));
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
          description={t("me.keysDesc")}
          action={<Badge tone="brand">Pro+</Badge>}
        />
        <p className="text-xs text-ink-600">
          {t("me.keysGate")}
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
      setError(e instanceof Error ? e.message : t("me.issueFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t("me.issueTitle")}
          description={t("me.issueDesc")}
        />
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              label={t("me.keyName")}
              placeholder={t("me.keyNamePh")}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
            />
          </div>
          <Button loading={busy} disabled={!label.trim()} onClick={handleCreate}>
            {t("me.issue")}
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
              {t("me.copyNow")}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-surface px-2 py-1.5 font-mono text-[11px] text-ink-900">
                {issued}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void navigator.clipboard?.writeText(issued)}
              >
                {t("me.copy")}
              </Button>
            </div>
            <div className="mt-2 text-[10px] text-emerald-800">
              {t("me.mcpEnv")}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title={t("me.issuedTitle")} description={t("me.issuedDesc")} />
        {keys.length === 0 ? (
          <p className="py-3 text-xs text-ink-500">{t("me.noKeys")}</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-100 text-left text-ink-500">
                <th className="py-2 font-medium">{t("me.colName")}</th>
                <th className="py-2 font-medium">Prefix</th>
                <th className="py-2 font-medium">{t("me.colCalls")}</th>
                <th className="py-2 font-medium">{t("me.colLastUsed")}</th>
                <th className="py-2 font-medium">{t("me.colStatus")}</th>
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
                      {k.revoked ? t("me.revoked") : t("me.active")}
                    </Badge>
                  </td>
                  <td className="py-2 text-right">
                    {!k.revoked && (
                      <button
                        className="text-red-700 hover:underline"
                        onClick={async () => {
                          await api.apiKeys.revoke(k.id);
                          await load();
                        }}
                      >
                        {t("me.revoke")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <UsageGuide />
    </div>
  );
}

/** MCP Tool 5종과 REST 경로를 한 화면에서 보여 준다. */
const MCP_TOOLS: Array<[string, string]> = [
  ["list_projects", "GET /public/projects"],
  ["get_design_tokens", "GET /public/projects/{id}/tokens"],
  ["get_mockup_context", "GET /public/projects/{id}/mockups"],
  ["get_component_styles", "GET /public/projects/{id}/components"],
  ["subscribe_token_changes", "me.subscribeTodo"],
];

function UsageGuide() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"mcp" | "rest">("mcp");

  const origin =
    typeof window === "undefined" ? "https://design-gen-zitify.web.app" : window.location.origin;

  const mcpConfig = `{
  "mcpServers": {
    "ai-design-generator": {
      "command": "node",
      "args": ["${t("me.repoPathPh")}/mcp/adg-mcp-server.mjs"],
      "env": {
        "ADG_API_KEY": "${t("me.issuedKey")}",
        "ADG_API_BASE": "${origin}/api/v1"
      }
    }
  }
}`;

  const restSnippet = `curl -H "X-API-Key: ${t("me.issuedKey")}" \\
  ${origin}/api/v1/public/projects

# ${t("me.commentTokens")}
curl -H "X-API-Key: ${t("me.issuedKey")}" \\
  ${origin}/api/v1/public/projects/${t("me.projectIdPh")}/tokens`;

  const snippet = tab === "mcp" ? mcpConfig : restSnippet;

  return (
    <Card>
      <CardHeader
        title={t("me.apiTitle")}
        description={t("me.apiDesc")}
        action={
          <div className="flex gap-1 rounded-lg bg-ink-100 p-0.5">
            {(["mcp", "rest"] as const).map((tabId) => (
              <button
                key={tabId}
                onClick={() => setTab(tabId)}
                className={
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition " +
                  (tab === tabId ? "bg-surface text-ink-900 shadow-sm" : "text-ink-500")
                }
              >
                {tabId === "mcp" ? t("me.mcpSettings") : "REST"}
              </button>
            ))}
          </div>
        }
      />

      <div className="relative">
        <pre className="max-h-64 overflow-auto rounded-lg bg-ink-900 p-3 text-[11px] leading-relaxed text-ink-100">
          <code>{snippet}</code>
        </pre>
        <Button
          size="sm"
          variant="outline"
          className="absolute right-2 top-2"
          onClick={() => void navigator.clipboard?.writeText(snippet)}
        >
          {t("me.copy")}
        </Button>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-ink-200">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 border-b border-ink-200 bg-ink-50 px-3 py-1.5 text-[11px] font-medium text-ink-500">
          <span>MCP Tool</span>
          <span>{t("me.restPaths")}</span>
        </div>
        {MCP_TOOLS.map(([tool, path]) => (
          <div
            key={tool}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 border-b border-ink-100 px-3 py-2 text-[11px] last:border-b-0"
          >
            <code className="truncate font-mono text-ink-800">{tool}</code>
            <code className="truncate font-mono text-ink-500">{path.startsWith("me.") ? t(path) : path}</code>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-ink-500">
        {t("me.apiNote")}
      </p>
    </Card>
  );
}
