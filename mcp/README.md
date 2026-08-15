# AI Design Generator — MCP Server

확정된 디자인 시스템(토큰·시안 구조·컴포넌트 스타일)을 Cursor·Claude Code 같은
코딩 도구가 직접 읽게 하는 stdio MCP 서버다. 화면을 열어 값을 옮겨 적는 단계를
없애는 것이 목적이다.

계약의 진원은 백엔드 Public API(`backend/app/api/routes/public_api.py`) 한 곳이며,
이 디렉터리의 서버는 그 위를 덮는 얇은 어댑터다. 새 Tool 을 늘릴 때도 REST 를 먼저
정의하고 어댑터를 맞춘다 — 두 표면이 갈라져 서로 다른 값을 말하면 원인을 찾기 어렵다.

## 1. 사전 준비

| 항목 | 내용 |
|---|---|
| 등급 | Pro 이상 (Free 는 키 발급 자체가 막힌다) |
| 키 발급 | 웹 → 설정 → **API Key** → 이름 입력 후 발급 |
| 런타임 | Node 18 이상 (`fetch` 내장). 별도 설치 의존성 없음 |

키 값은 발급 직후 한 번만 보인다. 서버는 SHA-256 해시만 보관하므로 분실하면
재발급해야 한다.

## 2. 설정

Claude Code · Cursor 공통 형식이다.

```json
{
  "mcpServers": {
    "ai-design-generator": {
      "command": "node",
      "args": ["D:/Project/designgenerator/mcp/adg-mcp-server.mjs"],
      "env": {
        "ADG_API_KEY": "adg_xxxxxxxx.xxxxxxxxxxxxxxxx",
        "ADG_API_BASE": "https://design-gen-zitify.web.app/api/v1"
      }
    }
  }
}
```

`ADG_API_BASE` 를 생략하면 운영 주소를 쓴다. 로컬 백엔드로 붙일 때만
`http://127.0.0.1:8000/api/v1` 로 바꾼다.

## 3. 제공 Tool

| Tool | REST | 반환 |
|---|---|---|
| `list_projects` | `GET /public/projects` | 프로젝트 목록 (확정 컨셉·대상 화면 포함) |
| `get_design_tokens` | `GET /public/projects/{id}/tokens` | W3C DTCG 표준 토큰 JSON |
| `get_mockup_context` | `GET /public/projects/{id}/mockups` | 화면별 구조 변형 목록 |
| `get_component_styles` | `GET /public/projects/{id}/components` | 버튼·입력·카드·타이포 해석값 |
| `subscribe_token_changes` | — | 미구현 (v1.0 로드맵). 호출 시 폴링을 안내한다 |

`concept` 인자를 비우면 **확정 컨셉**을 쓴다. 코딩 도구는 보통 "이 프로젝트의
확정 토큰"을 원하지 어느 컨셉인지까지 알고 있지 않기 때문이다.

`get_mockup_context` 의 응답은 화면축과 변형축을 분리해 돌려준다 — 시안은 서로 다른
화면의 집합이 아니라 **같은 화면의 구조 변형**이므로, 그 관계가 응답 구조에 그대로
드러나야 도구가 잘못 해석하지 않는다.

```json
{
  "screens": [
    {
      "screen": "dashboard",
      "title": "대시보드",
      "archetype": "dashboard",
      "variants": [
        { "variantIndex": 0, "structure": "지표 4열 + 대형 차트 1 + 보조 표", "isFallback": false }
      ]
    }
  ]
}
```

## 4. 안전 경계

. **읽기 전용** — 생성·수정·삭제 경로는 두지 않았다. 키가 유출돼도 자원이 바뀌지 않는다
. **소유권 격리** — 타인의 프로젝트는 403 이 아니라 404 로 답해 존재 여부도 흘리지 않는다
. **즉시 회수** — 웹에서 키를 회수하면 다음 호출부터 401 이다
. **호출 한도** — Pro 분당 300회 · Team 분당 600회. 초과 시 429 와 `Retry-After`

## 5. 점검

백엔드를 띄운 상태에서 어댑터 왕복을 확인한다.

```powershell
# 1) 백엔드 기동
cd backend
powershell -File scripts\dev-server.ps1 start

# 2) 어댑터 점검 (키는 웹에서 발급한 값)
$env:ADG_API_KEY  = "adg_xxxx.xxxx"
$env:ADG_API_BASE = "http://127.0.0.1:8000/api/v1"
node mcp\smoke.mjs
```

REST 계약 자체는 `backend/scripts/smoke_e2e.py` 가 상시 검증한다
(인증 경계·소유권 격리·읽기 전용·회수 후 차단 포함).
