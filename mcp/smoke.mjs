/**
 * MCP 어댑터 왕복 점검 — 서버를 실제 stdio 로 띄워 JSON-RPC 를 주고받는다.
 *
 * 어댑터는 REST 를 옮겨 담기만 하지만, 옮겨 담는 과정(도구 목록·인자 매핑·오류
 * 표면화)이 깨지면 코딩 도구 쪽에서는 원인이 보이지 않는다. 그래서 프로토콜
 * 수준에서 한 번 확인한다.
 *
 *   $env:ADG_API_KEY  = "adg_xxxx.xxxx"
 *   $env:ADG_API_BASE = "http://127.0.0.1:8000/api/v1"
 *   node mcp/smoke.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "adg-mcp-server.mjs");

if (!process.env.ADG_API_KEY) {
  console.error("ADG_API_KEY 가 없다. 웹 → 설정 → API Key 에서 발급한 뒤 환경변수로 지정한다.");
  process.exit(2);
}

let ok = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
  console.log((cond ? "  OK   " : "  FAIL ") + name + (extra ? ` — ${extra}` : ""));
  cond ? ok++ : fail++;
};

function connect(env = {}) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const pending = new Map();
  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      const resolve = pending.get(msg.id);
      if (resolve) {
        pending.delete(msg.id);
        resolve(msg);
      }
    }
  });
  let seq = 0;
  const rpc = (method, params) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  return { child, rpc };
}

const payload = (res) => {
  const text = res.result?.content?.[0]?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
};

const { child, rpc } = connect();

const init = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {} });
check("initialize", init.result?.serverInfo?.name === "ai-design-generator");

const listed = (await rpc("tools/list", {})).result?.tools ?? [];
const names = listed.map((t) => t.name);
check(
  "tools/list — 문서 Tool 5종",
  ["list_projects", "get_design_tokens", "get_mockup_context", "get_component_styles", "subscribe_token_changes"]
    .every((n) => names.includes(n)),
  names.join(", "),
);

const projects = payload(await rpc("tools/call", { name: "list_projects", arguments: {} })).projects ?? [];
check("list_projects", Array.isArray(projects), `${projects.length}건`);

// 확정 컨셉이 있는 프로젝트를 골라야 토큰·시안이 실제로 나온다.
const target = projects.find((p) => p.confirmedConcept) ?? projects[0];
if (target) {
  const args = { projectId: target.id };

  const tokens = payload(await rpc("tools/call", { name: "get_design_tokens", arguments: args }));
  check("get_design_tokens — DTCG", JSON.stringify(tokens.tokens ?? {}).includes("$type"), tokens.concept?.label);

  const screens = payload(await rpc("tools/call", { name: "get_mockup_context", arguments: args })).screens ?? [];
  check(
    "get_mockup_context — 화면축 ⊥ 변형축",
    screens.every((s) => s.screen && (s.variants?.length ?? 0) >= 1),
    `화면 ${screens.length}종 / 변형 ${screens.reduce((a, s) => a + s.variants.length, 0)}건`,
  );

  const comps = payload(await rpc("tools/call", { name: "get_component_styles", arguments: args })).components ?? {};
  check("get_component_styles", Object.keys(comps).length === 4, Object.keys(comps).join(", "));
} else {
  console.log("  SKIP 프로젝트가 없어 상세 3종은 건너뛴다 (웹에서 생성 1회 후 재실행).");
}

const sub = await rpc("tools/call", { name: "subscribe_token_changes", arguments: { projectId: "x" } });
check("subscribe_token_changes — 미구현을 성공으로 위장하지 않는다", sub.result?.isError === true);

const unknown = await rpc("tools/call", { name: "no_such_tool", arguments: {} });
check("알 수 없는 도구 → 프로토콜 오류", !!unknown.error);

child.kill();

// 키가 없을 때 원인을 알 수 있는 문구가 나와야 한다.
const bare = connect({ ADG_API_KEY: "" });
const res = await bare.rpc("tools/call", { name: "list_projects", arguments: {} });
check(
  "키 미설정 시 안내",
  res.result?.isError === true && (res.result.content[0].text ?? "").includes("ADG_API_KEY"),
);
bare.child.kill();

console.log(`\n${fail ? `실패 ${fail}건` : "전부 통과"} (${ok} PASS / ${fail} FAIL)`);
process.exit(fail ? 1 : 0);
