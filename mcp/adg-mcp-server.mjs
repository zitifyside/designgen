#!/usr/bin/env node
/**
 * AI Design Generator — MCP Server (stdio)
 *
 * 기획서 v0.5.0 §4 F-204 의 MCP Tool 5종을 Cursor·Claude Code 같은 코딩 도구에
 * 노출한다. 실제 계약은 백엔드 Public API 한 곳에만 두고, 이 파일은 그 위를 덮는
 * 얇은 어댑터다 — 두 표면이 갈라져 서로 다른 값을 말하는 일을 막는다.
 *
 * 의존성은 두지 않는다. 사용자가 `npx`·`npm install` 없이 파일 하나만 가리키면
 * 붙게 하는 편이, 코딩 도구 설정에 패키지 설치 단계를 얹는 것보다 실패 지점이 적다.
 *
 * 설정 예 (Claude Code · Cursor 공통 형식):
 *   {
 *     "mcpServers": {
 *       "ai-design-generator": {
 *         "command": "node",
 *         "args": ["D:/Project/designgenerator/mcp/adg-mcp-server.mjs"],
 *         "env": {
 *           "ADG_API_KEY": "adg_xxxx.xxxxxxxx",
 *           "ADG_API_BASE": "https://design-gen-zitify.web.app/api/v1"
 *         }
 *       }
 *     }
 *   }
 */

import { createInterface } from "node:readline";

const API_BASE = (
  process.env.ADG_API_BASE || "https://design-gen-zitify.web.app/api/v1"
).replace(/\/+$/, "");
const API_KEY = process.env.ADG_API_KEY || "";
const PROTOCOL_VERSION = "2024-11-05";

/** 도구 정의 — 이름은 문서의 MCP Tool 명칭을 그대로 쓴다. */
const TOOLS = [
  {
    name: "list_projects",
    description:
      "AI Design Generator 의 내 프로젝트 목록을 가져온다. 확정 컨셉·대상 화면·상태를 포함한다.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    call: () => request("/public/projects"),
  },
  {
    name: "get_design_tokens",
    description:
      "프로젝트의 디자인 토큰을 W3C DTCG 표준 JSON 으로 가져온다. concept 를 비우면 확정 컨셉을 쓴다.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "프로젝트 ID" },
        concept: { type: "string", description: "컨셉 라벨 (A·B·C…). 생략 시 확정 컨셉" },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    call: ({ projectId, concept }) =>
      request(`/public/projects/${enc(projectId)}/tokens`, { concept }),
  },
  {
    name: "get_mockup_context",
    description:
      "프로젝트의 화면과 각 화면의 구조 변형(시안) 목록을 가져온다. 시안은 서로 다른 화면이 아니라 같은 화면의 레이아웃 변형이다.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "프로젝트 ID" },
        concept: { type: "string", description: "컨셉 라벨. 생략 시 확정 컨셉" },
        screen: { type: "string", description: "특정 화면 키로 좁힌다 (예: dashboard)" },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    call: ({ projectId, concept, screen }) =>
      request(`/public/projects/${enc(projectId)}/mockups`, { concept, screen }),
  },
  {
    name: "get_component_styles",
    description:
      "버튼·입력·카드·타이포그래피의 해석된 최종 스타일 값을 가져온다. 토큰에서 매번 다시 계산할 필요가 없다.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "프로젝트 ID" },
        concept: { type: "string", description: "컨셉 라벨. 생략 시 확정 컨셉" },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    call: ({ projectId, concept }) =>
      request(`/public/projects/${enc(projectId)}/components`, { concept }),
  },
  {
    name: "subscribe_token_changes",
    description:
      "토큰 변경 구독 (미구현). 현재는 폴링 방식으로 get_design_tokens 를 다시 호출한다.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false,
    },
    call: async () => {
      // 없는 기능을 있는 척 성공시키면 도구가 조용히 낡은 값을 쓰게 된다.
      throw new Error(
        "실시간 구독은 아직 제공되지 않는다 (v1.0 로드맵). get_design_tokens 를 다시 호출해 최신 값을 받는다.",
      );
    },
  },
];

const enc = (v) => encodeURIComponent(String(v ?? ""));

async function request(path, query = {}) {
  if (!API_KEY) {
    throw new Error(
      "ADG_API_KEY 가 설정되지 않았다. 웹에서 [설정 → API Key] 로 발급한 뒤 MCP 설정의 env 에 넣는다.",
    );
  }
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  let res;
  try {
    res = await fetch(url, {
      headers: { "X-API-Key": API_KEY, Accept: "application/json" },
    });
  } catch (e) {
    throw new Error(`API 서버에 연결하지 못했다 (${API_BASE}): ${e.message}`);
  }

  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      detail = JSON.parse(text).detail ?? detail;
    } catch {
      /* JSON 이 아니면 원문 앞부분을 그대로 보여 준다 */
    }
    if (res.status === 401) {
      throw new Error(`인증 실패: ${detail} (키가 회수됐거나 잘못됐다)`);
    }
    if (res.status === 403) {
      throw new Error(`권한 없음: ${detail} (Public API 는 Pro 이상)`);
    }
    if (res.status === 429) {
      throw new Error("호출이 너무 잦다. 잠시 후 다시 시도한다.");
    }
    throw new Error(`요청 실패 (${res.status}): ${detail}`);
  }
  return JSON.parse(text || "{}");
}

// ── JSON-RPC (MCP stdio: 줄 단위 JSON) ─────────────────────────────

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function reply(id, result) {
  if (id === undefined || id === null) return; // 알림에는 응답하지 않는다
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
  if (id === undefined || id === null) return;
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "ai-design-generator", version: "1.0.0" },
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return;

    case "ping":
      return reply(id, {});

    case "tools/list":
      return reply(
        id,
        { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) },
      );

    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return replyError(id, -32602, `알 수 없는 도구: ${params?.name}`);
      try {
        const data = await tool.call(params?.arguments ?? {});
        return reply(id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        });
      } catch (e) {
        // 도구 실패는 프로토콜 오류가 아니라 결과로 돌려준다 — 모델이 읽고 대응해야 한다.
        return reply(id, {
          content: [{ type: "text", text: e.message }],
          isError: true,
        });
      }
    }

    default:
      return replyError(id, -32601, `지원하지 않는 메서드: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  handle(msg).catch((e) => replyError(msg.id, -32603, e.message));
});
rl.on("close", () => process.exit(0));
