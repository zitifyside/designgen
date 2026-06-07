> **공통 섹션 참조**: 메타데이터, 용어 정리, 예외 처리, 영향 범위, 변경 이력, 승인 기록은 [Common/공통섹션/](D:/Project/ContextBuilder/Build/Context/Common/공통섹션/) 폴더를 참조한다.

---
# AI Design Generator - 기획서
## Design System Infrastructure Platform 구축 기획서
---

## 메타데이터

| 항목 | 내용 |
|---|---|
| **문서 제목** | AI Design Generator 기획서 |
| **문서 버전** | v0.1.0 |
| **작성일** | 2026-06-05 |
| **작성자** | 안승준 |
| **문서 상태** | 🔄 작성 중 |
| **관련 부서** | 기획팀, 개발팀, 디자인팀, AI팀, 사업팀 |
| **우선순위** | 🔴 높음 |
| **예상 일정** | 2026-04-14 ~ 2026-09-05 (약 20주) |
| **선행 문서** | 기획서_AI_Design_Generator_v0.4.0_260331.docx, AI_Design_Generator_PRD_v0.1.0.md |
| **후행 문서** | AI_Design_Generator_기능정의서_v0.1.0.md, AI_Design_Generator_서비스정책서_v0.1.0.md |

> **참조 SSOT**
> . D:/Project/ContextBuilder/Build/CLAUDE.md §1~§4 (형식 선택·문체·형식 A/B 템플릿)
> . D:/Project/ContextBuilder/Build/CLAUDE.md §5 (DOCX 표 가독성)
> . D:/Project/ContextBuilder/Build/CLAUDE.md §6 (버전 및 변경이력 규칙)
> . D:/Project/ContextBuilder/Build/Context/Common/가이드/문체/문체규칙.md
> . D:/Project/ContextBuilder/Build/Context/Planning/템플릿/기획/기획서.md
> . D:/Project/ContextBuilder/Build/Context/Common/공통섹션/예외처리_제약사항.md

---

## 1. 기획 개요

### 한 줄 요약

AI Design Generator 는 요건사항과 디자인 컨텍스트를 입력받아 System 이 AI 를 통해 디자인 시스템 3종과 컨셉별 디자인 시안 5종(총 15종)을 자동 생성하고, Design Token 수정 시 시안에 실시간 반영하며, Figma·코드·MCP 까지 단일 Token 체계로 관통하는 Design System Infrastructure Platform 이다.

### 기획 배경

. 디자인 시안 생성 도구는 Google Stitch·Uizard·Figma AI 등이 포화 상태이며, '시안 이미지 품질' 경쟁은 더 이상 차별화 요소가 아니다.
. 기존 도구는 단일 시안 생성에 머무르며, **디자인 시스템(Design System)** 생성 + 시안 다종 비교 + Token 실시간 반영 + 코드 동기화 전 영역을 통합 제공하는 도구는 존재하지 않는다.
. W3C Design Tokens Community Group 이 2025년 10월 첫 안정 버전을 발표하면서 Design Token 의 표준 JSON 규격이 확정되었고, Figma·Penpot·Sketch 등 10개 이상의 도구가 표준을 지원하기 시작했다. 표준 선점 기회가 열렸다.
. Anthropic 이 정의한 MCP(Model Context Protocol) 가 AI 코딩 도구(Cursor·Claude Code·Windsurf)의 표준 인터페이스로 자리잡았다. 디자인 데이터를 AI 코딩 에이전트에 직접 공급하는 새로운 채널이 열렸다.
. 디자인 시스템을 갖춘 팀은 디자이너 생산성 42% 향상·개발자 시간 30% 절감 효과를 보고하고 있다. 디자인 시스템이 없는 초기 팀에게 'AI 로 30분 만에 DS 구축'은 강력한 가치이다.

### 기대 효과

- **사용자 관점**: 디자이너는 초기 시안 작업 시간을 80% 단축할 수 있다. PM·기획자는 디자이너 없이도 투자자 미팅용 시안을 확보할 수 있다. 개발자는 MCP Server 를 통해 코딩 도구에서 Design Token 을 실시간 참조하여 코드를 작성할 수 있다.
- **비즈니스 관점**: SaaS 구독·크레딧 종량제·API 라이선스·템플릿 마켓 4종 수익 라인을 동시 운영한다. 출시 6개월 시점 MRR ₩5,700만, 1년 시점 ROI 회수를 목표로 한다.
- **기술 관점**: 단일 Core Platform 위에 4개 Touch Point(Figma Plugin·Web App·Public API·MCP Server) 가 얇은 클라이언트로 동작하는 Single Core · Multiple Surfaces 아키텍처를 구축한다. Design Token 을 중심축으로 하는 일관된 데이터 흐름이다.

---

## 2. 현황 분석

### 문제 정의

**현재 상황**

- 디자인 시안 AI 생성 도구는 '단일 시안 생성' 단계에 정체되어 있다. 디자인 시스템 자동 생성·실시간 Token 반영·코드 동기화까지 통합 제공하는 도구는 부재한다.
- Figma 의 디자인 시스템 구축은 디자이너의 수작업에 의존하며, 대형 디자인 시스템(Material·Tailwind·Polaris)이 없는 팀은 시스템 부재 상태로 프로덕션에 진입한다.
- AI 가 생성한 시안과 실제 코드 간의 일관성(Token 동기화)을 보장하는 표준 인프라가 없다. 시안 이미지는 있지만, 그 시안의 Token 을 코드로 옮기는 단계는 여전히 수작업이다.

**사용자 불편사항**

- 디자이너: '초기 시안 5종을 빠르게 비교하고 싶다' 가 가장 큰 니즈인데, 기존 도구는 한 번에 1~2종만 생성한다.
- PM·기획자: 디자이너가 없는 초기 단계에 '투자자 미팅용 시안'을 확보할 방법이 없다. Wireframe 도구는 미감이 떨어지고, AI 도구는 시스템적 일관성이 부족하다.
- 개발자: Figma 디자인을 코드로 옮길 때 Color·Spacing·Typography 값을 일일이 손으로 옮긴다. Design Token 표준 JSON 이 있어도 도구 간 호환성이 떨어진다.
- 에이전시: 클라이언트에게 '3종 컨셉 시안'을 빠르게 제시해야 하는데, 디자이너 인력 부족으로 1주일 이상 소요된다.

### 시장 조사

**시장 규모**

| 구분 | 2025년 | 2026년 | 2030년 | CAGR |
|------|--------|--------|--------|------|
| AI 디자인 도구 전체 | $67.4억 | $82.2억 | $181.6억 | 22% |
| 생성형 AI in 디자인 | $9.9억 | $13.3억 | $168.9억 (2035) | 32.75% |
| AI UI/UX 도구 (세부) | $8.3억 | $9.6억 | $34.1억 (2035) | 15.15% |

**경쟁사 분석**

| 경쟁사 | 유사 기능 | 장점 | 단점 | 차별화 포인트 |
|--------|----------|------|------|---------------|
| Google Stitch | 프롬프트 → 단일 시안 | 무료 베타·고품질 이미지 | DS 생성 불가·시안 단일 | DS 3종 자동 생성·시안 15종 다양성 |
| Uizard (Miro) | 프롬프트/스케치 → 프로토타입 | 빠른 반응형 변환 | Miro 종속·시안 단일 | 독립 서비스·표준 Token Export |
| Framer AI | 프롬프트 → 반응형 웹사이트 | 즉시 배포 가능 | Framer 락인·DS 부재 | 표준 .fig·JSON·CSS Export |
| Figma AI / Make | 기존 DS 기반 보조 생성 | Figma 통합 | DS 신규 생성 불가 | DS 신규 자동 생성 |
| v0 (Vercel) | 프롬프트 → React 코드 | 코드 직접 출력 | 디자인 단계 부재 | 디자인 + 코드 양방향 |
| Penpot | 오픈소스 + DTCG 지원 | 무료·DTCG 표준 | AI 생성 부재 | AI 생성 + DTCG 표준 결합 |

**벤치마킹**

- **Notion**: 단일 도구로 노트·DB·위키 다 커버하는 '인프라' 포지셔닝. 우리도 '시안 생성기'가 아닌 'DS Infrastructure'로 포지셔닝한다.
- **Vercel**: 개발자 친화 DX + 무료 → Pro 전환 funnel. 우리도 Free 진입 장벽을 최소화하고 .fig Export·MCP 를 Pro 전환 유인으로 활용한다.
- **Linear**: 빠른 키보드 단축키 + 미감 강한 UX. 우리도 디자이너가 작업 화면에서 단축키로 Token 빠르게 수정하는 UX 를 제공한다.

### 시장 진입 기회

- '시안 이미지 품질' 경쟁은 포화. 차별화 포인트는 시안 자체가 아니라 'DS 자동 생성 + Token 연동'이다.
- Figma 가 MCP 서버를 공식 제공하면서 'Figma → 코드' 채널이 표준화되었다. 우리는 'Figma 의존 없이도 동일 흐름' 을 제공하는 대체재로 포지셔닝한다.
- W3C DTCG 표준 발표 직후 시점이 '표준 선점' 기회이다. AI 생성 Design Token 을 W3C 표준 JSON 으로 직접 Export 하는 최초 도구로 자리잡는다.
- Figma 2025 AI Report 에 따르면 디자이너 22%가 AI 로 인터페이스 초안 생성, 78%가 효율성 향상 인정. 시장 수용성은 검증되었다.

---

## 3. 타겟 사용자

### 페르소나

**페르소나 #1: 김민수 (32세)**
- **연령**: 30대 초반
- **직업**: 스타트업 PM
- **특성**: 디자이너 없이 초기 MVP 를 만들어야 한다. 투자자 미팅과 사용자 인터뷰를 위해 빠른 시안이 필요하다. 디자인 도구는 Figma 기본 조작만 가능하다.
- **니즈**: 텍스트 기획서를 입력하면 1시간 내 투자자 미팅용 시안 3종이 나와야 한다. Token 수정도 직접 할 수 있어야 한다.
- **사용 시나리오**: 투자자 미팅 전날 밤, 기획서를 Web App 에 업로드한다. 30분 만에 컨셉 3종이 나온다. 회사 메인 컬러를 빠르게 적용해서 다음 날 회의에 PNG 로 들고 간다.

**페르소나 #2: 이지은 (28세)**
- **연령**: 20대 후반
- **직업**: 프리랜서 디자이너
- **특성**: Figma 를 매일 사용한다. 클라이언트 3~5명의 프로젝트를 동시에 진행한다. 초기 시안 단계에 가장 많은 시간을 쓴다.
- **니즈**: Figma 안에서 바로 AI 로 초기 시안을 생성하고, Figma 의 편집 가능한 레이어 구조로 받아야 한다. 클라이언트별 DS 토큰을 따로 관리하고 싶다.
- **사용 시나리오**: 새 프로젝트 시작 시 Figma Plugin 으로 컨셉 3종을 생성한다. 마음에 드는 컨셉을 Figma Frame 에 삽입해서 본격 디자인을 이어간다. Token 은 Figma Variables 에 자동 매핑된다.

**페르소나 #3: 박정호 (35세)**
- **연령**: 30대 중반
- **직업**: 프론트엔드 개발 리드
- **특성**: 디자인팀과의 핸드오프 비효율에 지쳤다. Design Token 표준화를 추진 중이다. Cursor·Claude Code 를 매일 사용한다.
- **니즈**: 디자이너가 작업한 시안의 Token 을 코딩 도구에서 직접 참조해야 한다. CSS Variables 또는 W3C DTCG JSON 으로 즉시 적용하고 싶다.
- **사용 시나리오**: Cursor 에서 'create dashboard with our design tokens' 라고 입력하면 MCP Server 가 현재 프로젝트의 Token 을 제공한다. 정확한 Color·Spacing 값으로 React 코드가 생성된다.

**페르소나 #4: A 디자인 에이전시**
- **역할**: 디자인 에이전시 (직원 10~20명)
- **니즈**: 클라이언트에게 3종 컨셉 시안을 1~2일 내 제시해야 한다. 디자이너 1명이 동시 5~6개 프로젝트를 처리할 수 있어야 한다.
- **사용 시나리오**: Public API 를 자사 워크플로우 도구에 임베드하여, 클라이언트 입력 폼 제출 후 자동으로 시안을 생성한다. 화이트라벨 옵션으로 자사 브랜드로 노출한다.

### 사용자 여정 (User Journey)

```
1. [상황 인지] → 2. [요건 입력] → 3. [AI 생성 대기] → 4. [시안 비교] → 5. [Token 수정] → 6. [Export·공유] → 7. [코드 연동]
```

상세 단계는 본 §3.3 사용자 여정 상세 그래프에서 정의한다.

### User Journey 상세

| 단계 | User 행동 | System 처리 | 산출물 |
|---|---|---|---|
| 1. 상황 인지 | User 가 디자인 시안이 필요한 상황을 인지한다 | - | - |
| 2. 접속 | User 가 Web App·Figma Plugin·API 중 채널을 선택하여 접속한다 | System 이 인증을 처리한다 | 인증된 세션 |
| 3. 요건 입력 | User 가 텍스트·파일·플랫폼을 입력한다 | Client 가 사전 검증하고 Server 에 전송한다 | 입력 스냅샷 |
| 4. 생성 | User 가 '생성' 버튼을 누른다 | Server 가 Job Queue 에 등록하고 AI Pipeline 4단계를 호출한다 | jobId, 진행률 |
| 5. 대기 | User 가 진행 상황을 본다 | System 이 stage·progress 를 갱신한다 | 실시간 상태 |
| 6. 결과 확인 | User 가 시안 15종 + DS 3종을 본다 | Client 가 Canvas 에 렌더링한다 | 시안 UI |
| 7. 비교 | User 가 컨셉·시안을 비교한다 | Client 가 Compare 모드를 활성화한다 | 비교 뷰 |
| 8. 수정 | User 가 DS Token 을 수정한다 | Client 가 Reactive Binding 으로 500ms 이내 시안에 반영한다 | 갱신된 시안 |
| 9. Export | User 가 .fig·.png·.json·.css 중 선택하여 내보낸다 | Server 가 Export Service 를 호출하여 파일을 생성한다 | 다운로드 URL |
| 10. 코드 연동 | 개발자가 Cursor 등에서 MCP 로 Token 을 참조한다 | MCP Server 가 W3C DTCG JSON 을 반환한다 | 코드 |
| 11. 저장·재사용 | User 가 프로젝트를 저장한다 | System 이 PostgreSQL 에 영속화한다 | 프로젝트 레코드 |

---

## 4. 기능 명세

### 핵심 기능

#### 1. AI Design System 자동 생성 (F-002)

**설명**: System 이 User 의 요건 입력을 분석하여 3종의 컨셉별 디자인 시스템 Token 세트를 자동 생성한다. 각 컨셉은 시각적으로 명확히 구별되는 스타일 방향성을 가진다.

**세부 스펙**
- **입력**: 텍스트 기획서 또는 파일(.md·.png·.jpg·.pdf), 플랫폼 (Web·Mobile·반응형·APP)
- **처리**: AI Pipeline 4단계 — Input Analyzer (LLM+Vision) → Concept Engine (LLM) → Layout Engine (LLM) → Renderer (Image Gen + QA Validator)
- **출력**: 3종 DS Token 세트 (W3C DTCG JSON), 컨셉별 5종 시안 (Figma 호환 노드 트리 + 고해상도 이미지 + 썸네일)

**상태 전이**

| 현재 상태 | 트리거 | 다음 상태 | 비고 |
|----------|--------|----------|------|
| Draft | User 가 요건사항을 입력한다 | Input Ready | 최소 1개 입력 필요 |
| Input Ready | User 가 '생성' 버튼을 클릭한다 | Generating | Server 가 AI Pipeline 을 호출한다 |
| Generating | System 이 생성을 완료한다 | Completed | 15종 시안 + 3종 DS 완료 |
| Generating | System 이 생성에 실패한다 (3회 재시도 후) | Failed | Client 가 오류 메시지를 출력한다 |
| Generating | User 가 '취소' 버튼을 클릭한다 | Cancelled | Server 가 생성을 중단한다 |
| Failed | User 가 '다시 시도'를 클릭한다 | Generating | 동일 입력으로 재시도한다 |

**제약사항**
- 단, 동일 User 의 동시 생성 세션은 1개로 제한한다. 기존 세션 완료 후 새 세션을 시작한다.
- 단, Free 등급은 컨셉 1종 + 시안 3종으로 제한한다.
- 단, AI 생성 품질은 입력 컨텍스트의 구체성에 의존한다. 모호한 입력 시 결과 품질이 저하될 수 있다.

#### 2. Design Token 실시간 반영 (F-004)

**설명**: User 가 좌측 패널에서 Design Token (Color·Typography·Spacing·Border·Shadow·Component) 을 수정하면, 모든 시안에 500ms 이내 실시간 반영된다.

**세부 스펙**
- **입력**: Token 변경 값 (Color Picker·Font Selector·Spacing Slider 등 UI 인터랙션)
- **처리**: Client 가 Reactive Binding (Zustand) 으로 변경을 감지하고, Diff 기반 Partial Rerender 를 수행한다. Server 에는 debounce 300ms 후 PATCH 요청을 보낸다.
- **출력**: 수정된 Token 이 적용된 시안 UI (500ms 이내), Server 동기화 (1초 이내)

**상태 전이**

| 현재 상태 | 트리거 | 다음 상태 | 비고 |
|----------|--------|----------|------|
| Completed | User 가 Token 을 수정한다 | Editing | 첫 수정 시 |
| Editing | User 가 추가 수정한다 | Editing | 연속 수정 |
| Editing | Server 가 동기화를 완료한다 | Editing | 백그라운드 동기화 |
| Editing | User 가 Undo 한다 | Editing | 변경 사항 롤백 |

**제약사항**
- 단, Free 등급은 Color 만 수정 가능하다. Typography·Spacing 등은 Pro 이상이다.
- 단, 동일 Token 명 충돌 시 기존 값을 덮어쓴다.
- 단, 동시 편집 충돌은 Last-Write-Wins 로 처리한다 (v1.0). v2.0 에서 Operational Transform 검토.

#### 3. Multi-Format Export (F-006)

**설명**: User 가 생성된 시안과 DS 를 .fig·.png·.json·.css 4종 형식으로 Export 한다.

**세부 스펙**
- **입력**: Export 대상 (현재 시안·컨셉 전체·전체), Export 형식, 해상도 옵션 (PNG 전용)
- **처리**: Export Service 가 형식별 변환기를 호출한다. Figma Plugin API (.fig), html2canvas (PNG), Token 직렬화 (JSON·CSS)
- **출력**: 다운로드 URL 또는 클립보드 데이터

**상태 전이**

| 현재 상태 | 트리거 | 다음 상태 | 비고 |
|----------|--------|----------|------|
| Completed / Editing | User 가 Export 를 요청한다 | Exporting | Job 등록 |
| Exporting | System 이 Export 를 완료한다 | Exported | 다운로드 URL 발급 |
| Exporting | System 이 변환에 실패한다 | Export Failed | 사용자에게 대체 제안 |
| Exported | User 가 추가 수정한다 | Editing | 수정 후 재Export 가능 |

**제약사항**
- 단, .fig·.json·.css Export 는 Pro 이상만 가능하다.
- 단, Free 등급 PNG Export 는 워터마크가 포함된다.
- 단, .fig Export 가 Figma Plugin API 제약으로 직접 생성 불가 시 SVG + 메타데이터 방식으로 대체한다.
- 단, Export 파일은 생성 후 7일 경과 시 자동 삭제된다.

#### 4. MCP Server 연동 (F-204 연계)

**설명**: AI 코딩 도구(Cursor·Claude Code·Windsurf) 에서 Design Token 을 직접 참조할 수 있는 MCP(Model Context Protocol) 서버이다.

**세부 스펙**
- **입력**: MCP Client 의 Tool Call (get_design_tokens, get_mockup_context, get_component_styles, list_projects, subscribe_token_changes)
- **처리**: MCP Server 가 API Key 인증을 수행한 후, 해당 프로젝트의 Token·시안·컴포넌트 데이터를 조회한다
- **출력**: W3C DTCG JSON, 노드 트리 JSON, 컴포넌트 스타일 JSON, 또는 WebSocket 스트림

**제약사항**
- 단, Pro 이상 등급에서만 MCP Server 사용이 가능하다.
- 단, MCP Server 는 API Key 인증을 요구하며, 키는 환경변수 `ADG_API_KEY` 로 설정한다.
- 단, subscribe_token_changes 의 동시 구독자 수는 프로젝트당 5명으로 제한한다 (v1.0 기준).

### 선택 기능 (Nice to Have)

- [ ] **다크모드 자동 생성 (v2.0, F-109)**: Light 테마 기반 알고리즘적 변환 + WCAG AA 자동 검증
- [ ] **시안 부분 재생성 (v2.0, F-110)**: 시안의 특정 섹션만 AI 재생성
- [ ] **시안 코멘트 (v2.0, F-114)**: 좌표 기반 코멘트 + @멘션 알림
- [ ] **다국어 확장 (v2.0)**: 일본어·중국어 UI
- [ ] **AI 어시스턴트 채팅 (v2.0)**: 자연어로 Token 수정 요청 (예: "primary 를 더 따뜻한 톤으로")

---

## 5. UI/UX 설계

### 화면 구성

#### 화면 1: 대시보드 (Dashboard)

**화면 목적**: User 의 프로젝트 목록·최근 작업·사용량 요약을 한눈에 제공한다.

**화면 요소**
- **헤더**: 로고, 프로젝트 검색 바, 사용자 메뉴 (프로필·구독·로그아웃)
- **본문 — 좌측**: 사이드 네비게이션 (대시보드·새 프로젝트·템플릿 마켓·마이페이지·Admin)
- **본문 — 메인**: 즐겨찾기 프로젝트 (상단 고정 영역), 전체 프로젝트 그리드 (썸네일+이름+상태), 사용량 카드 (월간 생성 횟수·크레딧 잔액)
- **하단**: 도움말 링크·피드백 버튼

**사용자 액션**
1. User 가 '새 프로젝트' 를 클릭한다 → Client 가 요건 입력 화면으로 이동한다
2. User 가 프로젝트 카드를 클릭한다 → Client 가 작업 화면(Workspace) 으로 이동한다
3. User 가 검색 바에 키워드를 입력한다 → Server 가 검색을 수행하고 결과를 갱신한다

**와이어프레임**
```
┌──────────────────────────────────────────────────────────┐
│ AI Design Generator       [검색...]            User ▾   │
├────────┬─────────────────────────────────────────────────┤
│ 즐겨찾기 │ [즐겨찾기 프로젝트]                            │
│ 새 프로젝트│  ┌──────┐ ┌──────┐ ┌──────┐                 │
│ 작업 화면 │  │ Proj1│ │ Proj2│ │ Proj3│                  │
│ 마켓     │  └──────┘ └──────┘ └──────┘                  │
│ 마이페이지│                                              │
│ Admin   │ [전체 프로젝트]                                │
│         │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│         │ │      │ │      │ │      │ │      │           │
│         │ └──────┘ └──────┘ └──────┘ └──────┘           │
│         │ ┌──────────────┐  ┌──────────────┐            │
│         │ │ 월 생성: 15/30│  │ 크레딧: 25회 │            │
│         │ └──────────────┘  └──────────────┘            │
└────────┴─────────────────────────────────────────────────┘
```

#### 화면 2: 새 프로젝트 / 요건 입력

**화면 목적**: User 의 요건사항을 입력받아 AI 생성을 시작한다.

**화면 요소**
- **헤더**: 단계 인디케이터 (입력 → 생성 → 결과 확인)
- **본문**: 파일 Drag & Drop 영역, 텍스트 입력 영역 (Markdown 지원), 플랫폼 선택 (Web·Mobile·반응형·APP 라디오), 컨셉 옵션 (3종 자동·1종만 등)
- **하단**: [생성] 버튼, 예상 소요 시간·크레딧 차감 표시

**사용자 액션**
1. User 가 파일을 드래그하여 업로드한다 → Client 가 형식 검증 후 미리보기를 출력한다
2. User 가 텍스트로 요건을 입력한다 → Client 가 글자 수 카운팅을 출력한다
3. User 가 [생성] 을 클릭한다 → Server 가 Job 을 등록하고 진행 화면으로 이동한다

#### 화면 3: 작업 화면 (Workspace)

**화면 목적**: 시안 뷰어 + DS Token 컨트롤러를 통합 제공하는 메인 작업 공간이다.

**화면 요소**
- **상단 헤더**: 프로젝트명, 플랫폼 전환 (Web ▾ / Mobile ▾), [Export ▾], [설정]
- **좌측 패널 (DS 컨트롤러)**: 컨셉 탭 (A/B/C), Color Section, Typography Section, Spacing Section, Border & Radius Section, Shadow Section, Components Section
- **메인 캔버스**: 시안 렌더링 영역, Zoom·Pan 컨트롤, Compare 모드 토글
- **하단 툴바**: 시안 썸네일 목록 (시안 1~5), 컨셉 전환, [비교] 버튼

**사용자 액션**
1. User 가 컨셉 탭을 전환한다 → Client 가 해당 컨셉의 DS·시안을 메인 캔버스에 렌더링한다
2. User 가 Color Primary 를 변경한다 → Client 가 500ms 이내 시안에 반영한다
3. User 가 시안 내 요소를 클릭한다 → Client 가 우측 패널에 Token 참조 정보를 출력한다
4. User 가 [Compare] 를 클릭한다 → Client 가 2~3개 시안을 나란히 배치한다

**와이어프레임**
```
┌──────────────────────────────────────────────────────────────┐
│ Proj1   Web ▾ Mobile ▾                [Export ▾] [설정]      │
├────────┬─────────────────────────────────────────────────────┤
│ 컨셉:   │                                                    │
│ [A][B][C]│                                                    │
│        │              [메인 시안 캔버스]                     │
│ Color   │                                                    │
│ - Pri   │                                                    │
│ - Sec   │                                                    │
│ - Neu   │                                                    │
│        │                                                    │
│ Type    │                                                    │
│ Size    │                                                    │
│        │                                                    │
│ Space   │                                                    │
│        │                                                    │
│ Radius  │                                                    │
├────────┼─────────────────────────────────────────────────────┤
│ 시안 썸네일: [1] [2] [3] [4] [5]      [비교]                  │
└────────┴─────────────────────────────────────────────────────┘
```

#### 화면 4: Export 화면

**화면 목적**: 생성된 시안·DS 를 다양한 형식으로 내보낸다.

**화면 요소**
- **Export 대상 선택**: 현재 시안 / 컨셉 전체 / 전체 (15종)
- **Export 형식 선택**: .fig / .png / .json / .css (Pro 이상은 전체, Free 는 .png 만)
- **해상도 설정 (PNG 전용)**: 1x / 2x / 3x
- **[다운로드] 버튼**, **[클립보드 복사] 버튼**
- **Export 이력**: 최근 7일간 Export 한 파일 목록 + 다운로드 링크

### UI 플로우

```
[로그인]
  ↓
[대시보드] ─→ [새 프로젝트] ─→ [요건 입력] ─→ [생성 대기] ─→ [작업 화면]
  ↓                                                              ↓
[기존 프로젝트 선택]  ────────────────────────────────────→  [작업 화면]
                                                                ↓
                                                          [Export 화면]
                                                                ↓
                                                          [다운로드/공유]

[마이페이지]   ← 상단 프로필 아이콘
[템플릿 마켓]  ← 상단 네비게이션
[Admin]      ← Admin 권한자만 접근
```

상세 화면 트리 (Web App / Figma Plugin / Public API / MCP Server 4종 Touch Point) 는 [AI_Design_Generator_기능정의서_v0.1.0.md §2 메뉴 구성도](D:/Project/designgenerator/Docs/md/AI_Design_Generator_기능정의서_v0.1.0.md) 를 참조한다.

---

## 6. 사용자 시나리오

### 시나리오 1: 스타트업 PM 의 투자자 미팅 준비 (정상 흐름)

**전제 조건**
- User 김민수가 Free 플랜으로 가입되어 있다
- User 가 텍스트 기획서를 준비한 상태이다
- 투자자 미팅까지 24시간이 남았다

**진행 과정**
1. User 가 Web App 에 로그인한다
2. User 가 [새 프로젝트] 를 클릭한다
3. User 가 기획서 텍스트를 입력하고 플랫폼 'Web' 을 선택한다
4. User 가 [생성] 을 클릭한다
5. Server 가 Job Queue 에 등록하고 진행 상황 화면을 출력한다
6. System 이 2~3분 후 컨셉 1종 + 시안 3종을 완성한다 (Free 등급 제한)
7. User 가 작업 화면에서 시안 3종을 비교한다
8. User 가 Primary Color 를 회사 브랜드 컬러 (#FF5722) 로 수정한다
9. Client 가 500ms 이내 모든 시안에 반영한다
10. User 가 마음에 드는 시안을 선택하여 PNG 로 Export 한다 (Free 등급 워터마크 포함)
11. User 가 다운로드한 PNG 를 PPT 에 삽입하여 미팅 자료를 완성한다

**성공 조건**
- 24시간 내 투자자 미팅용 시안이 완성된다
- 회사 브랜드 컬러가 반영된 일관된 디자인이 출력된다
- PNG 파일이 PPT 에 정상 삽입된다

### 시나리오 2: 프리랜서 디자이너의 Figma 작업 흐름 (정상 흐름)

**전제 조건**
- User 이지은이 Pro 플랜으로 가입되어 있다
- User 가 Figma 에서 새 파일을 열어둔 상태이다
- 클라이언트로부터 기획서 PDF 를 받았다

**진행 과정**
1. User 가 Figma 에서 AI Design Generator Plugin 을 실행한다
2. User 가 기획서 PDF 를 Plugin 에 업로드한다
3. User 가 플랫폼 'Web', 컨셉 3종 옵션을 선택하고 [생성] 을 클릭한다
4. System 이 3분 후 컨셉 3종 × 시안 5종 = 15종을 완성한다
5. User 가 Plugin 내 작업 화면에서 컨셉 B 의 시안 3번이 가장 마음에 든다
6. User 가 [Figma Frame 으로 삽입] 을 클릭한다
7. Plugin 이 선택 시안의 노드 트리를 Figma Frame 으로 변환하여 삽입한다
8. Plugin 이 DS Token 을 Figma Variables 로 자동 매핑한다
9. User 가 Figma 의 편집 가능한 레이어로 본격 디자인을 이어간다

**성공 조건**
- 시안이 Figma Frame 으로 정상 삽입된다
- DS Token 이 Figma Variables 에 자동 매핑되어 일관된 디자인 시스템이 구축된다
- User 가 Figma 의 표준 도구로 추가 편집할 수 있다

### 시나리오 3: 개발자의 MCP Server 활용 (정상 흐름)

**전제 조건**
- User 박정호가 Team 플랜으로 가입되어 있다
- User 가 Cursor IDE 를 사용하며 MCP Server 가 설정되어 있다 (`ADG_API_KEY` 환경변수)
- 디자이너 동료가 'Project Dashboard' 프로젝트의 DS 를 완성한 상태이다

**진행 과정**
1. User 가 Cursor 에서 'create dashboard with our design tokens for Project Dashboard project' 를 입력한다
2. Cursor 의 AI 에이전트가 MCP Server 를 호출한다 (`list_projects` → `get_design_tokens`)
3. MCP Server 가 'Project Dashboard' 프로젝트의 W3C DTCG JSON 을 반환한다
4. AI 에이전트가 Token 을 참조하여 React 컴포넌트 코드를 생성한다
5. 생성된 코드는 정확한 Color (#2563EB)·Spacing (8px·16px·24px)·Typography (Inter 14px) 값을 포함한다
6. User 가 코드를 검토한 후 프로젝트에 커밋한다

**성공 조건**
- MCP Server 가 API Key 인증을 통과한다
- DS Token 이 W3C DTCG 표준 JSON 으로 반환된다
- 생성된 코드가 디자인 시안과 동일한 시각적 결과를 만든다

### 시나리오 4: AI 생성 실패 (예외 흐름)

**전제 조건**
- User 가 [생성] 을 클릭했다
- AI Pipeline 의 Renderer 단계에서 Image Generation Model 이 Timeout 을 발생시킨다

**진행 과정**
1. User 가 [생성] 을 클릭한다 (Generating 상태 진입)
2. Server 가 AI Pipeline 1~3단계를 정상 처리한다
3. Renderer 단계에서 첫 Timeout 발생 → Server 가 자동 재시도 (1회차)
4. 2회차 시도에서도 Timeout 발생 → Server 가 자동 재시도 (3회차)
5. 3회차도 Timeout 발생 → Fallback 전략 작동 (Token 기반 CSS 렌더링 대체 출력)
6. System 이 시안의 레이아웃 구조 + CSS 렌더링 결과를 반환한다 (이미지 품질은 낮음)
7. Client 가 User 에게 "이미지 생성에 일부 문제가 있어 CSS 렌더링으로 대체했습니다. 다시 시도하시겠습니까?" 출력한다
8. User 가 [다시 시도] 를 클릭하거나 현재 결과로 진행한다

**성공 조건**
- 시스템이 완전히 실패하지 않고 부분 결과를 제공한다
- User 가 다음 행동을 명확히 결정할 수 있는 정보를 받는다
- 크레딧이 부분 환불되거나 차감되지 않는다 (Fallback 시 정책 적용)

---

## 7. 기술 요구사항

### 프론트엔드

- **필요 컴포넌트**: Canvas Viewer (Fabric.js·Konva.js), Color Picker, Font Selector, Spacing Slider, Compare Modal, Export Modal, Project Card, Notification Bell, Onboarding Tour
- **상태 관리**: Zustand (Design Token 전역 + Reactive Binding), React Query (Server State Sync), Local Storage (사용자 설정)
- **API 연동**: REST API (POST/GET/PATCH/DELETE), WebSocket (Token 실시간 동기화·생성 진행 상황), Server-Sent Events (선택)
- **빌드**: Next.js 14+ App Router, Vite (Figma Plugin), Tailwind CSS 4+
- **인증**: JWT (Web App), API Key (외부 클라이언트)

### 백엔드

- **필요 API**: §11 API 설계에서 정의한 17개 카테고리·90+ 엔드포인트 ([기획서 v0.4.0 §11.5](D:/Project/designgenerator/Docs/md/AI_Design_Generator_PRD_v0.1.0.md) 참조)
- **데이터베이스**: PostgreSQL 15+ (25개 테이블), Redis 7+ (캐싱·세션·Job Queue)
- **비즈니스 로직**: Project Service, DS Service, Export Service, Template Service, Billing Service, User Service (6개 마이크로서비스)
- **AI Pipeline**: Input Analyzer → Concept Engine → Layout Engine → Renderer (4단계, Python·FastAPI 또는 Node.js)
- **Job Queue**: Bull (Redis 기반), Worker 다중 인스턴스
- **외부 연동**: Anthropic Claude API, Image Gen API (Stable Diffusion·DALL-E), Stripe (결제), Figma Plugin API, S3·CloudFront

### 데이터 구조

데이터 구조는 25개 테이블로 구성된다. 핵심 테이블만 본 절에 요약하며, 상세는 [기획서 v0.4.0 §10 백엔드 DB 설계](D:/Project/designgenerator/Docs/md/AI_Design_Generator_PRD_v0.1.0.md) 를 참조한다.

**테이블 카테고리별 개수**

| 카테고리 | 테이블 수 | 주요 테이블 |
|---|---|---|
| 사용자·인증 | 6 | users, user_sessions, user_auth_providers, email_verifications, password_resets, two_factor_auth |
| 결제·과금 | 5 | plans, subscriptions, payments, refunds, credit_transactions |
| 팀 | 2 | teams, team_memberships |
| 프로젝트·디자인 | 7 | projects, design_systems, design_mockups, ai_generations, project_versions, project_shares, project_favorites |
| Export·마켓 | 4 | export_history, templates, template_purchases, template_reviews |
| 시스템 | 7 | api_keys, api_usage, notifications, audit_logs, announcements, feedback_reports, file_uploads |

**핵심 테이블: design_systems (디자인 시스템 Token 저장)**

| 필드명 | 타입 | 필수 | 설명 | 예시 |
|--------|------|------|---|---|
| id | UUID | ✅ | PK | uuid v4 |
| project_id | UUID | ✅ | FK → projects.id | uuid v4 |
| concept_label | VARCHAR(1) | ✅ | A/B/C | "A" |
| concept_name | VARCHAR(100) | ✅ | 컨셉 이름 | "Modern Minimal" |
| tokens | JSONB | ✅ | W3C DTCG 표준 JSON | `{ "color": { "primary": {...} } }` |
| is_modified | BOOLEAN | ❌ | User 수정 여부 | true |
| created_at | TIMESTAMPTZ | ✅ | 생성 시각 | 2026-04-09T... |
| updated_at | TIMESTAMPTZ | ✅ | 수정 시각 | 2026-04-09T... |

GIN 인덱스를 tokens 컬럼에 적용하여 Token 검색을 가속화한다.

### 기술 스택 총괄

| 영역 | 기술 | 버전/사양 | 비고 |
|------|------|----------|------|
| **프론트엔드** | React | 18+ | UI 컴포넌트 |
| | Next.js | 14+ (App Router) | SSR/SSG + CSR 혼합 |
| | Zustand | 최신 | Design Token 전역 상태 + Reactive Binding |
| | Fabric.js / Konva.js | 최신 | Canvas 기반 시안 뷰어 |
| | Tailwind CSS | 4+ | DS 컨트롤러 및 UI 스타일링 |
| **백엔드** | Node.js | 20+ | API Server |
| | Express.js | 4+ | REST API 프레임워크 |
| | Python / FastAPI | 3.11+ | AI Pipeline 전용 서버 |
| | Bull | 최신 | Job Queue |
| | Prisma | 최신 | ORM |
| **AI** | Claude API (Anthropic) | claude-sonnet-4 이상 | LLM |
| | Stable Diffusion / DALL-E | 최신 | Image Generation |
| **인프라** | AWS / GCP | - | 클라우드 |
| | PostgreSQL | 15+ | RDBMS |
| | Redis | 7+ | 캐싱·세션·Queue |
| | S3 / GCS | - | 파일 저장소 |
| | CloudFlare | - | CDN + DDoS 방어 |
| **외부 서비스** | Stripe | API v2024+ | 결제·구독 |
| | Figma Plugin API | 최신 | .fig Export + Variables |
| | OAuth 2.0 | Google·Apple·GitHub | 소셜 로그인 |
| | Sentry | 최신 | 에러 트래킹 |
| | Datadog / New Relic | - | APM + 모니터링 |
| **프로토콜** | MCP | Anthropic 표준 | AI 코딩 도구 연동 |
| | W3C DTCG | 2025.10 stable | Design Token 표준 |

---

## 8. 성공 지표 (KPI)

### 정량적 지표

| 지표 | 현재 | 목표 | 측정 방법 | 기간 |
|------|------|------|----------|------|
| MAU (Monthly Active Users) | 0 | 1,000명 | Google Analytics | 출시 후 3개월 |
| MAU | 0 | 3,000명 | Google Analytics | 출시 후 6개월 |
| 유료 전환율 | 0% | 10% 이상 | 무료 대비 유료 비율 | 출시 후 6개월 |
| MRR (Monthly Recurring Revenue) | ₩0 | ₩5,700만 | Stripe 대시보드 | 출시 후 6개월 |
| API 라이선스 계약 | 0건 | 10건 | CRM 추적 | 출시 후 6개월 |
| AI 생성 시간 (15종 기준) | - | 3분 이내 | Server 로그 | Beta |
| Token 반영 속도 | - | 500ms 이내 | Client 프로파일링 | Beta |
| Export 성공률 | - | 99% 이상 | Export 요청 대비 성공 비율 | 출시 후 1개월 |
| 시스템 가용성 | - | 99.5% 이상 | Uptime 모니터링 | 출시 후 1개월 |
| Figma Plugin 설치 | 0 | 1,000 | Figma Community 통계 | Beta |

### 정성적 지표

- **사용자 만족도**: NPS(Net Promoter Score) 30 이상. 출시 후 3개월·6개월 설문 조사로 측정한다.
- **사용 편의성**: SUS(System Usability Scale) 70점 이상. 출시 후 1개월 사용성 테스트로 측정한다.
- **기능 유용성**: '필수 도구' 응답 비율 50% 이상. Pro 구독자 대상 설문 조사로 측정한다.
- **브랜드 인지도**: Product Hunt Top 5 Daily, 디자이너 커뮤니티 (Dribbble·Behance·Twitter/X) 언급량 월 100건 이상.

---

## 9. 개발 일정

### 마일스톤

| 단계 | 작업 내용 | 담당 | 기간 | 상태 |
|------|----------|------|---|---|
| Phase 1 | 기획 및 설계, AI Prompt 초안 | 기획팀 + AI팀 | W1~W2 | ⏸️ 대기 |
| Phase 2 | AI Pipeline 프로토타입 | AI팀 | W3~W5 | ⏸️ 대기 |
| Phase 3 | Figma Plugin + Web App 프론트엔드 | 개발팀 | W5~W8 | ⏸️ 대기 |
| Phase 4 | 백엔드 API + DB 연동 | 개발팀 | W5~W7 | ⏸️ 대기 |
| Phase 5 | AI + FE + BE 통합 | 전체 | W9~W10 | ⏸️ 대기 |
| Phase 6 | Export + MCP Server 개발 | 개발팀 | W11~W12 | ⏸️ 대기 |
| Phase 7 | QA 테스트 + 버그 수정 | QA팀 | W13~W14 | ⏸️ 대기 |
| Phase 8 | 베타 배포 + 피드백 수집 | 전체 | W15~W16 | ⏸️ 대기 |

### 상세 일정

**Week 1-2: 기획 및 설계 (2026-04-14 ~ 2026-04-27)**
- [ ] PRD·기획서·기능정의서·서비스정책서 v0.1.0 완성
- [ ] AI Prompt 초안 작성 (Input Analyzer·Concept Engine·Layout Engine 각 단계 별)
- [ ] DB 스키마 마이그레이션 SQL 작성
- [ ] API 명세 OpenAPI 3.0 초안 작성
- [ ] Figma Plugin 와이어프레임 작성

**Week 3-5: AI Pipeline 프로토타입 (2026-04-28 ~ 2026-05-18)**
- [ ] Anthropic Claude API 연동
- [ ] Image Generation API 연동 (Stable Diffusion 또는 DALL-E)
- [ ] AI Pipeline 4단계 통합 테스트
- [ ] 품질 보장 메커니즘 구현 (컨셉 구별성·시안 다양성·Token 일관성·접근성·그리드 정합성)
- [ ] Fallback 전략 4종 구현

**Week 5-8: 프론트엔드 개발 (2026-05-12 ~ 2026-06-08)**
- [ ] Figma Plugin 기본 UI 개발 (Home·Generate·DS 컨트롤러·Export)
- [ ] Web App 기본 UI 개발 (대시보드·새 프로젝트·작업 화면·Export)
- [ ] Canvas 시안 뷰어 (Fabric.js·Konva.js)
- [ ] DS 컨트롤러 (Color·Typography·Spacing·Border·Shadow·Component)
- [ ] Reactive Binding (Zustand) 구현
- [ ] OAuth 2.0 로그인 (Google·Apple·GitHub)

**Week 5-7: 백엔드 개발 (2026-05-12 ~ 2026-06-01)**
- [ ] PostgreSQL 25개 테이블 스키마 생성
- [ ] 17개 카테고리·90+ API 엔드포인트 구현
- [ ] Bull Queue 기반 비동기 Job 처리
- [ ] Stripe 결제·구독·Webhook 연동
- [ ] S3 파일 업로드·바이러스 스캔
- [ ] JWT 인증·Rate Limiting·CSRF 방어

**Week 9-10: 통합 및 테스트 (2026-06-09 ~ 2026-06-22)**
- [ ] AI + FE + BE 통합 시나리오 테스트
- [ ] 사용자 시나리오 4종 (PM·디자이너·개발자·실패) 검증
- [ ] 동시 접속 500명 부하 테스트 (k6)
- [ ] 보안 점검 (TLS·암호화·Rate Limit·CSRF·XSS)

**Week 11-12: Export + MCP Server (2026-06-23 ~ 2026-07-06)**
- [ ] .fig Export 구현 (Figma Plugin API)
- [ ] PNG Export (html2canvas)
- [ ] W3C DTCG JSON Export
- [ ] CSS Variables Export
- [ ] Copy & Paste (Clipboard API)
- [ ] MCP Server 구축 (get_design_tokens·get_mockup_context·get_component_styles·list_projects·subscribe_token_changes)

**Week 13-14: QA (2026-07-07 ~ 2026-07-20)**
- [ ] 기능 테스트 (52개 기능 ID 별)
- [ ] 권한 테스트 (Guest·Free·Pro·Team·Admin 5등급)
- [ ] 호환성 테스트 (Chrome·Safari·Firefox 최신 2개 버전)
- [ ] 접근성 테스트 (WCAG AA)
- [ ] 결제 시나리오 테스트 (Stripe Test Mode)
- [ ] 버그 수정

**Week 15-16: 베타 배포 (2026-07-21 ~ 2026-08-03)**
- [ ] Staging 환경 배포
- [ ] 클로즈드 베타 (50~100명 초청)
- [ ] 피드백 수집·우선순위 분류
- [ ] 크리티컬 이슈 수정
- [ ] Production 배포 준비

**Week 17-20: 정식 출시 준비 (2026-08-04 ~ 2026-08-31)**
- [ ] Production 환경 최종 점검
- [ ] 모니터링·알림 체계 구축
- [ ] 이용약관·개인정보처리방침 법무 검토 완료
- [ ] Product Hunt 런칭 자료 준비
- [ ] Figma Community Plugin 공식 배포

---

## 10. 리스크 관리

### 예상 리스크

| 리스크 | 발생 확률 | 영향도 | 대응 방안 | 담당자 |
|--------|----------|--------|----------|--------|
| AI 생성 품질 불안정 | 높음 | 높음 | Prompt Engineering 최적화, QA Validator 자동 검증, Fallback 전략 4종 구비, 사용자 피드백 기반 모델 fine-tuning | AI팀 |
| AI API 비용 초과 | 중간 | 높음 | Redis 캐싱, 생성량 제한 정책, 비용 임계값 알림, 월 비용 ₩500만 초과 시 자동 알림 | AI팀, 개발팀 |
| Google Stitch 등 대형 경쟁사 추격 | 높음 | 높음 | DS 생성 + Token 바인딩 차별점에 집중. 무료 시안 생성 경쟁 회피, 인프라 플랫폼으로 포지셔닝 | 사업팀 |
| Figma Export 호환성 | 중간 | 중간 | Figma Plugin API 버전 고정, SVG + 메타데이터 대체 전략, PNG 기본 제공 | 개발팀 |
| 디자인 저작권 문제 | 낮음 | 높음 | 이용약관에 저작권 정책 명시, AI 학습 미사용 명시, 유사성 검증 도구 도입 검토 | 법무 |
| 대형 플랫폼에 의한 인수/대체 | 중간 | 높음 | W3C 표준 기반 생태계 Lock-in 구축, 템플릿 마켓 네트워크 효과로 방어, 커뮤니티 빌딩 | 사업팀 |
| Stripe 결제 실패 다발 | 낮음 | 중간 | Webhook 이중화, 결제 실패 자동 알림, 3일 유예 정책, 결제 수단 다양화 (Apple Pay·Google Pay 추가) | 개발팀 |
| 보안 사고 (계정 탈취·데이터 유출) | 낮음 | 높음 | 2FA 권장·강제, 감사 로그 1년 보존, 정기 보안 점검, KMS 키 회전 | 보안 담당 |
| 성능 저하 (동시 접속·생성 폭주) | 중간 | 중간 | Auto Scaling 적용, 우선순위 큐 분리 (Pro > Free), 부하 테스트 k6 자동화 | 개발팀 |
| AI Provider 정책 변경·요금 인상 | 중간 | 중간 | Multi-Provider 추상화 레이어 구축 (Claude·OpenAI·자체 모델 전환 가능) | AI팀 |

### 의존성

- **외부 의존성**:
  - Anthropic Claude API (필수, 대체 OpenAI·자체 모델 추상화 검토)
  - Stable Diffusion·DALL-E (필수, 대체 가능)
  - Stripe (결제 필수)
  - Figma Plugin API (.fig Export 필수)
  - Google·Apple·GitHub OAuth (인증)
  - AWS·GCP·CloudFlare (인프라)

- **내부 의존성**:
  - AI Pipeline 의 4단계 모듈은 순차 의존 (Input Analyzer → Concept Engine → Layout Engine → Renderer)
  - Export Service 는 DS Service·Project Service 에 의존
  - MCP Server 는 API Key 발급 시스템 (Billing Service) 에 의존

---

## 11. 비용 예측

### 개발 비용

| 항목 | 산출 근거 | 예상 금액 |
|------|----------|----------|
| 인건비 (개발) | 프론트 2명 + 백엔드 1명 + AI 1명 × 5개월 | 약 2억 원 |
| 인건비 (기획/디자인) | 기획 1명 + 디자인 1명 × 2개월 | 약 3,000만 원 |
| 인건비 (QA) | QA 1명 × 1개월 | 약 500만 원 |
| **합계** | - | **약 2.35억 원** |

### 운영 비용 (월간)

| 항목 | 산출 근거 | 예상 월 금액 |
|------|----------|-------------|
| AI API 비용 | 생성 1회당 약 $0.5 × 월 10,000회 | 약 500만 원 |
| 서버 인프라 | AWS/GCP 서버 + S3 | 약 200만 원 |
| CDN / 네트워크 | 이미지 전송 및 Export 파일 배포 | 약 50만 원 |
| **합계** | - | **약 750만 원** |

### ROI 예측

- **시나리오 A (보수적)**: 출시 후 6개월, MAU 1,000명, 유료 전환율 8% → 월 MRR ₩2,320만 (Pro 80명 × $19)
- **시나리오 B (기본)**: 출시 후 6개월, MAU 3,000명, 유료 전환율 10% → 월 MRR ₩5,700만 (Pro 250명 + Team 10팀)
- **시나리오 C (낙관적)**: 출시 후 6개월, MAU 5,000명, 유료 전환율 12% + API 라이선스 10건 → 월 MRR ₩1.2억
- **예상 회수 기간**: 시나리오 B 기준 약 8~10개월 (개발비 + 6개월 운영비)

---

## 12. 참고 자료

### 12.1. 관련 문서

- [AI_Design_Generator_PRD_v0.1.0.md](D:/Project/designgenerator/Docs/md/AI_Design_Generator_PRD_v0.1.0.md) (선행)
- [AI_Design_Generator_기능정의서_v0.1.0.md](D:/Project/designgenerator/Docs/md/AI_Design_Generator_기능정의서_v0.1.0.md) (후행)
- [AI_Design_Generator_서비스정책서_v0.1.0.md](D:/Project/designgenerator/Docs/md/AI_Design_Generator_서비스정책서_v0.1.0.md) (후행)
- 기획서_AI_Design_Generator_v0.4.0_260331.docx (선행)

### 12.2. 외부 자료

- Google Stitch (구 Galileo AI) — https://stitch.google.com
- Figma MCP Server Documentation — https://developers.figma.com/docs/figma-mcp-server/
- W3C Design Tokens Community Group — https://design-tokens.github.io/community-group
- Figma 2025 AI Report — https://www.figma.com/reports/ai-2025/
- Anthropic Model Context Protocol — https://www.anthropic.com/news/model-context-protocol

### 12.3. 디자인 시안

- Figma 와이어프레임 (TBD - W2 작성 예정)
- 디자인 시스템 가이드 — [Context/Design/디자인시스템_가이드라인.md](D:/Project/ContextBuilder/Build/Context/Design/디자인시스템_가이드라인.md)

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| v0.1.0 | 2026-06-05 | 안승준 | 초안 작성. v0.4.0 service plan 기반으로 12장 구조(기획 개요·현황 분석·타겟·기능 명세·UI/UX·사용자 시나리오·기술 요구사항·KPI·일정·리스크·비용·참고)로 재구성. 페르소나 4종, User Journey 11단계, 사용자 시나리오 4종(PM·디자이너·개발자·실패), Phase 1~8 상세 일정, 리스크 10종, ROI 시나리오 3종 포함. |

---

**문서 끝**
