> **공통 섹션 참조**: 메타데이터, 용어 정리, 변경 이력, 승인 기록은 [Common/공통섹션/](D:/Project/ContextBuilder/Build/Context/Common/공통섹션/) 폴더를 참조한다.

> **작성 원칙**: 기능정의서는 기획 단계에서 쓰는 **메뉴 × 기능** 매트릭스 문서이다. `메뉴 대분류 / 메뉴 중분류 / 활용 목적 / 기능 정의` 4컬럼 구성을 사용한다. 기능 정의 셀 내부 bullet 은 `•` 또는 `-` 사용을 허용한다.

> **표 너비 규칙**: DOCX 산출 시 표 열 너비는 [표너비_가이드.md §7](D:/Project/ContextBuilder/Build/Context/Common/가이드/표준/표너비_가이드.md) (2단계 그리기 절차) 을 준용한다.

> **셀 줄바꿈 표기**: 본 템플릿 §3 표 셀 내 `<br>` HTML 태그는 MD 표 내 줄바꿈 대안이 제한적이므로 그대로 유지한다.

---

# AI Design Generator — 기능 정의서

## 상단 정보

| 항목 | 내용 |
|---|---|
| **문서 제목** | AI Design Generator 기능 정의서 |
| **시스템명** | AI Design Generator |
| **작성자** | 안승준 |
| **작성일** | 2026-06-05 |
| **문서 버전** | v0.1.0 |
| **문서 상태** | 🔄 작성 중 |
| **선행 문서** | AI_Design_Generator_PRD_v0.1.0.md, AI_Design_Generator_기획서_v0.1.0.md |
| **후행 문서** | 기술명세서, 테스트케이스 |

> **참조 SSOT**
> . D:/Project/ContextBuilder/Build/CLAUDE.md §1~§4 (형식 선택·문체·형식 B 테이블 구조형)
> . D:/Project/ContextBuilder/Build/CLAUDE.md §5 (DOCX 표 가독성)
> . D:/Project/ContextBuilder/Build/Context/Common/가이드/문체/문체규칙.md
> . D:/Project/ContextBuilder/Build/Context/Planning/템플릿/요구사항/기능정의서.md
> . D:/Project/ContextBuilder/Build/Context/Common/가이드/표준/표너비_가이드.md

---

## 1. 시스템 개요

. **시스템 목적** : 요건사항과 디자인 컨텍스트를 입력받아 System 이 AI 를 통해 디자인 시스템 3종과 컨셉별 디자인 시안 5종(총 15종)을 자동 생성하고, 디자인 시스템 수정 시 시안에 실시간 반영하며, Figma·코드·MCP 까지 단일 Token 체계로 관통하는 Design System Infrastructure Platform 을 제공한다.
. **주요 사용자** : Guest, Free, Pro, Team, Admin 5등급. Touch Point 별 페르소나는 PM(Web App)·디자이너(Figma Plugin + Web App)·개발자(MCP Server + Public API)·디자인 에이전시(Public API).
. **기대 효과** : 디자이너 생산성 42% 향상·개발자 시간 30% 절감 (디자인 시스템 보유 팀 기준). 초기 시안 작업 시간 80% 단축. MAU 3,000명·MRR ₩5,700만 (출시 후 6개월 시점).

---

## 2. 메뉴 구성도 (IA)

System 의 메뉴 트리를 대분류·중분류 2단계로 정리한다. Web App·Figma Plugin·Admin 3영역으로 구분한다.

### 2.1. Web App

| 대분류 | 중분류 |
|---|---|
| 대시보드 | 내 프로젝트 목록 / 즐겨찾기 프로젝트 / 사용량 요약 / 최근 작업 |
| 새 프로젝트 | 요건 입력 / 파일 업로드 / 플랫폼 선택 / 컨셉 옵션 / 생성 진행 |
| 작업 화면 (Workspace) | DS 컨트롤러 / 시안 뷰어 / 컨셉 전환 / 비교 모드 / 요소 상세 |
| Export 화면 | Export 대상 선택 / 형식 선택 / 해상도 설정 / Export 이력 |
| 템플릿 마켓 (v2.0) | 카테고리 / 검색 / 프리셋 상세 / 내 프리셋 등록 / 구매 이력 |
| 마이페이지 | 프로필 / 구독 관리 / 크레딧 잔액 / API Key / 사용량 대시보드 / Export 이력 / 알림 / 보안 (2FA·세션) |
| 알림 센터 | 인앱 알림 목록 / 읽음 처리 / 알림 설정 |

### 2.2. Figma Plugin

| 대분류 | 중분류 |
|---|---|
| Home | 내 프로젝트 / 새 프로젝트 시작 |
| 생성 (Generate) | 요건 입력 / 플랫폼 / 프리셋 선택 / 생성 |
| DS 컨트롤러 | 컨셉 탭 / Color / Typography / Spacing / Radius / Shadow / Figma Variables 동기화 |
| Export | 현재 선택 Frame / 전체 시안 / PNG·JSON |
| 설정 | 계정 / 구독 상태 / 로그아웃 |

### 2.3. Admin

| 대분류 | 중분류 |
|---|---|
| 사용자 관리 | 사용자 목록 / 권한 변경 / 정지·삭제 |
| 통계 대시보드 | 생성 통계 / 매출 / AI 비용 / 에러율 |
| 운영 관리 | 환불 처리 / 공지사항 / 감사 로그 / 피드백 / 템플릿 심사 |
| 시스템 관리 | 헬스 체크 / API 사용량 / 모니터링 |

---

## 3. 메뉴별 기능 정의 (핵심 섹션)

메뉴 단위로 `활용 목적` 과 `기능 정의` 를 정의한다. 기능 정의 셀은 내부 bullet 으로 세부 요건을 나열한다.

### 3.1. Web App 메뉴별 기능 정의

| 메뉴 대분류 | 메뉴 중분류 | 활용 목적 | 기능 정의 |
|---|---|---|---|
| 대시보드 | 내 프로젝트 목록 | User 가 본인이 작업한 프로젝트를 한눈에 보고 빠르게 재진입한다 | **1. 목록 조회**<br>• 페이지네이션 (20개/페이지)<br>• 정렬 (생성일·이름·수정일)<br>• 썸네일 + 프로젝트명 + 상태 + 플랫폼 표시<br>**2. 필터·검색**<br>• 이름 키워드 검색<br>• 플랫폼·상태·생성일 필터<br>**3. 즐겨찾기**<br>• 상단 고정 영역<br>• ☆ 토글<br>**※ 현 메뉴 개선사항**<br>- 무한 스크롤 vs 페이지네이션 결정 필요 |
| 대시보드 | 사용량 요약 | User 가 본인의 월간 생성 횟수·크레딧 잔액·플랜 사용 한도를 확인한다 | **1. 사용량 카드**<br>• 월간 생성 횟수 (사용/한도)<br>• 크레딧 잔액<br>• 현재 플랜<br>**2. 액션 버튼**<br>• [플랜 업그레이드]<br>• [크레딧 충전]<br>• [상세 보기] → 마이페이지 사용량 대시보드 이동 |
| 대시보드 | 최근 작업 | User 가 가장 최근에 작업한 프로젝트로 1클릭 재진입한다 | **1. 카드 형식**<br>• 최근 7일 작업 5건<br>• 작업 일시 표시 (상대 시간: "2시간 전")<br>• 클릭 시 작업 화면 진입 |
| 새 프로젝트 | 요건 입력 | User 가 디자인 시스템 + 시안 생성을 위한 요건사항을 입력한다 | **1. 입력 방식 3종**<br>• 텍스트 입력 (최대 10,000자, Markdown 일부 지원)<br>• 파일 업로드 (Drag & Drop)<br>• 이미지 첨부 (참조 이미지)<br>**2. 사전 검증**<br>• 글자 수 카운팅<br>• 파일 크기·형식 검증<br>**3. 자동 저장**<br>• 입력 중 30초마다 Draft 자동 저장 |
| 새 프로젝트 | 파일 업로드 | User 가 .md·.png·.jpg·.pdf 파일을 첨부하여 AI 가 분석할 자료를 제공한다 | **1. 지원 형식**<br>• 이미지 : png·jpg·jpeg (최대 20MB)<br>• 문서 : md·pdf (최대 10MB)<br>• 1프로젝트 당 최대 5개 첨부<br>**2. 검증·보안**<br>• Client·Server 양측 형식 검증<br>• MIME + 확장자 + 매직 넘버 3중 체크<br>• 바이러스 스캔 (ClamAV 또는 VirusTotal)<br>**3. 표시**<br>• 업로드 진행률 바<br>• 미리보기 썸네일<br>• 삭제 버튼 |
| 새 프로젝트 | 플랫폼 선택 | User 가 생성할 시안의 대상 플랫폼을 선택한다 | **1. 옵션 4종**<br>• Web (v1.0 지원)<br>• Mobile (v1.0 지원)<br>• 반응형 (v2.0 예정, v1.0 비활성)<br>• APP (v2.0 예정, v1.0 비활성)<br>**2. 비활성 옵션 UI**<br>• "v2.0 출시 예정" 배지<br>• 클릭 시 출시 알림 신청 폼 |
| 새 프로젝트 | 컨셉 옵션 | User 가 생성할 컨셉 수를 등급에 맞게 선택한다 | **1. Free 등급**<br>• 컨셉 1종 × 시안 3종 (고정)<br>**2. Pro·Team 등급**<br>• 컨셉 3종 × 시안 5종 (기본)<br>• 컨셉 1·2종 옵션 (크레딧 절약)<br>**3. 예상 비용 표시**<br>• 차감 크레딧<br>• 예상 소요 시간 (2~3분) |
| 새 프로젝트 | 생성 진행 | User 가 AI 생성 진행 상황을 실시간으로 확인한다 | **1. 진행 표시**<br>• 4단계 (Input Analyzer → Concept Engine → Layout Engine → Renderer)<br>• 현재 단계 하이라이트<br>• 진행률 (%)<br>• 예상 남은 시간<br>**2. 액션 버튼**<br>• [취소] : 진행 중 Job 종료, 크레딧 정책 적용<br>• [백그라운드] : 다른 작업 가능, 완료 시 알림<br>**3. 완료 시**<br>• 자동 작업 화면 이동<br>• 인앱·이메일 알림 발송 (옵션 설정 시) |
| 작업 화면 | DS 컨트롤러 — Color | User 가 컬러 토큰을 수정하면 모든 시안에 실시간 반영된다 | **1. 카테고리**<br>• Primary·Secondary·Neutral<br>• Semantic (Error·Success·Warning·Info)<br>**2. UI**<br>• Color Picker (HSL·RGB·HEX)<br>• 팔레트 미리보기<br>• Contrast Ratio 자동 표시 (WCAG AA 검증)<br>**3. 반영**<br>• 500ms 이내 시안 갱신<br>• Debounce 300ms 후 Server 동기화<br>**※ Free 등급 제한**<br>- Color 만 수정 가능 |
| 작업 화면 | DS 컨트롤러 — Typography | User 가 타이포그래피 토큰을 수정하여 시안의 글꼴·크기·굵기를 변경한다 | **1. 입력 항목**<br>• Font Family (Selector — Google Fonts 연동)<br>• Size Scale (Slider — 8~96px)<br>• Weight (100·300·400·500·700·900)<br>• Line Height (1.0~2.0)<br>• Letter Spacing (-0.05em~0.1em)<br>**2. 카테고리**<br>• Heading (H1~H6)·Body·Caption·Label<br>**3. 미리보기**<br>• 카테고리별 샘플 텍스트 |
| 작업 화면 | DS 컨트롤러 — Spacing | User 가 간격 토큰의 Base Unit 을 조정하여 시안 전체 여백을 일괄 변경한다 | **1. 입력**<br>• Base Unit (Slider — 4·8·12·16px)<br>• Scale 자동 생성 (1x·2x·4x·8x·16x)<br>**2. 미리보기**<br>• Scale 단위 시각화 (사각형 배열)<br>**3. 적용**<br>• padding·margin·gap 일괄 갱신 |
| 작업 화면 | DS 컨트롤러 — Border & Radius | User 가 border 두께와 radius 값을 조정한다 | **1. Border**<br>• Width (0·1·2·4px)<br>• Style (solid·dashed·dotted)<br>• Color (DS Color Token 참조)<br>**2. Radius**<br>• Slider (0~40px)<br>• 카테고리 (sm·md·lg·xl·full)<br>**3. 미리보기**<br>• Button·Card·Input 샘플 |
| 작업 화면 | DS 컨트롤러 — Shadow | User 가 그림자 강도를 조정한다 | **1. Preset 5종**<br>• None·sm·md·lg·xl<br>**2. Custom**<br>• X·Y·Blur·Spread·Color<br>**3. 미리보기**<br>• Card 샘플 4종 노출 |
| 작업 화면 | DS 컨트롤러 — Components | User 가 Button·Input·Card·Navigation 등 주요 컴포넌트의 스타일을 일괄 정의한다 | **1. Button Style**<br>• Variant (Primary·Secondary·Tertiary·Ghost)<br>• Size (sm·md·lg)<br>• 라운드·그림자·아이콘 적용<br>**2. Input Style**<br>• Border·Background·Focus Ring<br>• 라벨 위치 (top·left·floating)<br>**3. Card Style**<br>• Padding·Radius·Shadow<br>**4. Navigation Style**<br>• 위치 (top·side·bottom)<br>• 색상·아이콘 |
| 작업 화면 | 컨셉 전환 | User 가 컨셉 A·B·C 간 전환하여 각 컨셉의 DS·시안을 확인한다 | **1. 탭 UI**<br>• A / B / C 라벨 + 컨셉명 + 미리보기 색<br>**2. 전환 시**<br>• DS Token 갱신<br>• 시안 5종 일괄 갱신<br>**3. 비교 모드 진입**<br>• [컨셉 비교] 버튼으로 A·B·C 동시 비교 |
| 작업 화면 | 시안 뷰어 | User 가 생성된 시안을 확인하고 Zoom·Pan 으로 디테일을 탐색한다 | **1. 렌더링**<br>• Canvas 기반 (Fabric.js·Konva.js)<br>• 노드 트리 기반 편집 가능 레이어<br>**2. 조작**<br>• Zoom (10%~400%) — 마우스 휠 / Ctrl+/-<br>• Pan — Space + 드래그 / 마우스 미들 드래그<br>• 미니맵 (우하단)<br>**3. 단축키**<br>• 0 : 100%<br>• Cmd/Ctrl + 0 : Fit to Screen<br>• 1~5 : 시안 1~5 전환 |
| 작업 화면 | 비교 모드 | User 가 2~3개 시안을 나란히 배치하여 비교한다 | **1. 진입**<br>• 하단 툴바 [비교] 버튼<br>• 시안 썸네일 다중 선택 (Shift+클릭)<br>**2. 레이아웃**<br>• 2분할 / 3분할<br>• 가로 / 세로 분할<br>**3. 동기화**<br>• Zoom·Pan 동기화 토글<br>• 동기화 ON 시 모든 시안 동시 이동 |
| 작업 화면 | 요소 선택·상세 | User 가 시안 내 UI 요소를 클릭하여 Token 참조 정보와 스타일 속성을 확인한다 | **1. 선택 인터랙션**<br>• 클릭 → 요소 선택 (파란 outline)<br>• 더블 클릭 → 자식 요소 진입<br>• Esc → 부모 요소 복귀<br>**2. 우측 패널**<br>• 요소 타입 (Button·Card·Input 등)<br>• Token 참조 정보 (Color: --primary, Spacing: --space-md)<br>• 실제 값 (#2563EB, 16px)<br>• 부모-자식 계층 트리<br>**3. 액션**<br>• [Token 수정] : 좌측 패널의 해당 Token 으로 점프<br>• [복사] : 스타일 JSON·CSS 복사 |
| 작업 화면 | 플랫폼 전환 (뷰포트) | User 가 동일 시안을 Web·Mobile 뷰포트로 전환한다 | **1. 뷰포트 옵션**<br>• Desktop (1440·1920px)<br>• Tablet (768·1024px)<br>• Mobile (375·414px)<br>**2. 전환 시**<br>• 뷰포트 즉시 변경<br>• 시안 데이터 캐싱<br>**3. 반응형 시안 (v2.0)**<br>• 분기점 자동 표시<br>• Breakpoint 별 레이아웃 미리보기 |
| Export 화면 | Export 대상 선택 | User 가 Export 할 시안 범위를 지정한다 | **1. 옵션 3종**<br>• 현재 시안 (1종)<br>• 컨셉 전체 (5종)<br>• 전체 (15종)<br>**2. 시안 다중 선택**<br>• 썸네일 ☑ 체크박스 |
| Export 화면 | Export 형식 선택 | User 가 Export 형식을 선택한다 | **1. 형식 4종**<br>• .fig (Figma 호환) — Pro+<br>• .png (이미지) — 전체 등급<br>• .json (W3C DTCG) — Pro+<br>• .css (CSS Variables) — Pro+<br>**2. PNG 옵션**<br>• 해상도 1x·2x·3x<br>• 워터마크 (Free 등급 강제)<br>**3. 미리보기·검증**<br>• 예상 파일 크기<br>• Figma·DTCG 호환성 체크 |
| Export 화면 | Export 실행·이력 | User 가 Export 를 실행하고 이력을 관리한다 | **1. 실행**<br>• [다운로드] : 파일 직접 다운로드<br>• [클립보드 복사] : PNG·Figma 포맷<br>**2. 이력 조회**<br>• 최근 7일<br>• 형식·시각·파일 크기<br>• 재다운로드 가능<br>**3. 자동 만료**<br>• 생성 후 7일 경과 시 S3 자동 삭제<br>• 만료 24시간 전 알림<br>**※ 실패 처리**<br>- .fig 실패 시 PNG 대체 제안 |
| 템플릿 마켓 | 템플릿 조회 | User 가 카테고리별 디자인 시스템 프리셋을 탐색한다 | **1. 카테고리**<br>• SaaS 대시보드 / 이커머스 / 모바일앱 / 랜딩페이지<br>**2. 정렬**<br>• 인기 / 최신 / 평점 / 가격<br>**3. 필터**<br>• 가격 (무료·유료)<br>• 평점 (3점 이상·4점 이상)<br>**4. 카드 UI**<br>• 미리보기 이미지 / 이름 / 작성자 / 가격 / 평점 / 다운로드 수 |
| 템플릿 마켓 | 템플릿 상세 | User 가 템플릿의 상세 정보를 확인하고 구매·적용한다 | **1. 상세 정보**<br>• 미리보기 이미지 5장<br>• Token 구성 (Color·Typography·Spacing 요약)<br>• 작성자·가격·다운로드 수·평점<br>**2. 리뷰 섹션**<br>• 1~5 평점 분포<br>• 사용자 코멘트 (최신순·도움순)<br>**3. 액션**<br>• [구매] : Stripe 결제 또는 크레딧 차감<br>• [적용] : 구매 후 현재 프로젝트에 DS 로드 |
| 템플릿 마켓 | 내 프리셋 등록 | Pro+ 등급 User 가 자신의 DS 를 마켓에 등록하여 판매한다 | **1. 등록 폼**<br>• 이름·설명·카테고리·가격<br>• Token 자동 추출 (현재 프로젝트의 DS)<br>• 미리보기 이미지 (자동 생성 + 수동 업로드)<br>**2. 심사**<br>• Pending 상태로 등록<br>• Admin 심사 후 Approved·Rejected<br>• 거부 사유 표시<br>**3. 정산**<br>• 판매 금액의 70~80% 작성자에게 정산<br>• 월간 정산 |
| 마이페이지 | 프로필 설정 | User 가 본인 정보를 조회·수정한다 | **1. 조회**<br>• 이름·이메일·아바타<br>• 가입 일자·현재 등급<br>**2. 수정**<br>• 이름·아바타 변경<br>• 이메일 변경 시 재검증<br>• 언어·테마 설정 |
| 마이페이지 | 구독 관리 | User 가 본인 구독 상태를 관리한다 | **1. 현재 구독**<br>• 플랜·요금·다음 결제일<br>• 사용량 (월간 생성·크레딧)<br>**2. 액션**<br>• [업그레이드·다운그레이드]<br>• [결제 수단 변경]<br>• [구독 취소] — 사유 입력<br>**3. 결제 이력**<br>• 영수증 PDF 다운로드 |
| 마이페이지 | 크레딧 충전 | User 가 추가 생성 크레딧을 구매한다 | **1. 충전 패키지**<br>• 10회·50회·100회·500회<br>• 단가 (Pro $0.5/회·Team $0.3/회)<br>**2. 결제**<br>• Stripe Checkout<br>• 즉시 잔액 반영<br>**3. 이력**<br>• credit_transactions 조회 |
| 마이페이지 | API Key 관리 | Pro+ 등급 User 가 API Key 를 발급·관리한다 | **1. 발급**<br>• Key 이름 라벨링<br>• 발급 시 1회만 표시<br>**2. 목록**<br>• Key 이름 / Prefix / 마지막 사용일<br>**3. 액션**<br>• [취소] : 즉시 무효화<br>• [사용량 보기] : 호출 횟수·응답 시간·에러율<br>**4. 보안**<br>• 발급 시 2FA 인증 권장 |
| 마이페이지 | 사용량 대시보드 | User 가 본인의 월간 사용량 추이를 확인한다 | **1. 지표 카드**<br>• 월간 생성 / 크레딧 잔액 / Export 횟수<br>**2. 차트**<br>• 일별·주별·월별 전환<br>• 생성 횟수 그래프<br>• Export 형식별 분포<br>**3. 비교**<br>• 전월 대비 증감 |
| 마이페이지 | 보안 — 2FA | User 가 2단계 인증을 활성화·해제한다 | **1. 활성화**<br>• QR 코드 스캔 (Google Authenticator·1Password)<br>• 백업 코드 10개 발급<br>**2. 검증**<br>• TOTP 6자리 코드<br>**3. 해제**<br>• 비밀번호 + TOTP 코드 동시 입력<br>**4. 백업 코드 재발급**<br>• 기존 코드 무효화 |
| 마이페이지 | 보안 — 세션 관리 | User 가 로그인된 기기 목록을 확인하고 원격 로그아웃한다 | **1. 목록**<br>• 기기 이름 (User-Agent 기반)<br>• 위치 (GeoIP)<br>• 마지막 활동 시각<br>• 현재 세션 표시<br>**2. 액션**<br>• [세션 종료] : 특정 기기<br>• [전체 종료] : 현재 외 전부 |
| 마이페이지 | 알림 설정 | User 가 카테고리별 알림 ON·OFF 를 설정한다 | **1. 카테고리**<br>• 생성 완료 (인앱·이메일)<br>• 결제 (인앱·이메일)<br>• 마케팅 (이메일)<br>**2. 옵션**<br>• 카테고리별 채널 별 ON·OFF<br>**3. Unsubscribe**<br>• 이메일 내 링크 |
| 마이페이지 | 계정 삭제 | User 가 계정 삭제를 요청한다 | **1. 요청**<br>• 사유 입력 (선택)<br>• 비밀번호 + 2FA 검증<br>**2. 유예 기간**<br>• 30일<br>• 유예 기간 내 취소 가능<br>**3. 데이터 파기**<br>• 30일 경과 후 hard delete<br>• 감사 로그만 익명화 보존 |
| 마이페이지 | GDPR Export | User 가 본인 데이터를 JSON 으로 다운로드한다 | **1. 범위**<br>• 프로필·프로젝트·DS·시안·결제 이력·감사 로그<br>**2. 처리**<br>• 비동기 Job (수 분 소요)<br>• 7일 유효 다운로드 링크 이메일 발송<br>**3. 제한**<br>• 월 1회 제한 |
| 알림 센터 | 인앱 알림 목록 | User 가 본인 알림을 확인하고 관리한다 | **1. 목록**<br>• 최신순<br>• 읽음·미읽음 구분<br>• 카테고리 아이콘<br>**2. 액션**<br>• 클릭 : 관련 페이지 이동 + 읽음 처리<br>• [전체 읽음 처리]<br>• [개별 삭제]<br>**3. 자동 삭제**<br>• 30일 경과 시 |

### 3.2. Figma Plugin 메뉴별 기능 정의

| 메뉴 대분류 | 메뉴 중분류 | 활용 목적 | 기능 정의 |
|---|---|---|---|
| Home | 내 프로젝트 | User 가 Figma 내에서 기존 프로젝트를 빠르게 재진입한다 | **1. 목록**<br>• 최근 작업 5건<br>• 썸네일·이름·플랫폼<br>**2. 액션**<br>• [열기] : 작업 화면 이동<br>• [새 프로젝트] |
| 생성 | 요건 입력 | User 가 Figma 내에서 텍스트·파일로 요건을 입력하고 생성을 시작한다 | **1. 입력**<br>• 텍스트 영역 (최대 5,000자)<br>• 파일 업로드 (.md·.png·.jpg·.pdf)<br>**2. 옵션**<br>• 플랫폼 선택<br>• 프리셋 선택 (마켓 템플릿)<br>**3. 생성**<br>• [생성] 클릭 시 Figma Plugin UI 가 진행 상황 표시 |
| DS 컨트롤러 | Color·Typography·Spacing·Radius·Shadow | User 가 Plugin 내에서 DS Token 을 수정한다 | **1. UI 축약**<br>• Plugin 의 좁은 UI 에 최적화된 간소 컨트롤러<br>• 카테고리 접기·펴기<br>**2. 동작**<br>• Web App 과 동일한 Token 모델<br>• Plugin 내 시안에 실시간 반영 |
| DS 컨트롤러 | Figma Variables 동기화 | User 가 DS Token 을 Figma Variables 에 매핑하여 다른 Frame 에도 적용한다 | **1. 매핑**<br>• Color → Figma Color Variables<br>• Spacing → Figma Number Variables<br>• Typography → Figma Text Style<br>**2. 동기화**<br>• [Figma Variables 에 동기화] 버튼<br>• Plugin → Figma 단방향 동기화 (v1.0)<br>• 양방향 동기화 (v2.0 계획) |
| Export | Frame 삽입·이미지 Export | User 가 시안을 Figma Frame 으로 삽입하거나 PNG·JSON 으로 내보낸다 | **1. Frame 삽입**<br>• 시안 노드 트리 → Figma Frame 자동 변환<br>• 편집 가능 레이어 유지<br>• Variables 자동 적용<br>**2. PNG·JSON Export**<br>• Figma Plugin API 통한 파일 생성<br>• 다운로드 또는 Plugin 내 보관함 저장 |
| 설정 | 계정·구독·로그아웃 | User 가 Plugin 내에서 계정 정보를 관리한다 | **1. 표시**<br>• 이메일·등급·크레딧 잔액<br>**2. 액션**<br>• [Web App 으로 이동] : 상세 설정<br>• [로그아웃] |

### 3.3. Admin 메뉴별 기능 정의

| 메뉴 대분류 | 메뉴 중분류 | 활용 목적 | 기능 정의 |
|---|---|---|---|
| 사용자 관리 | 사용자 목록·상세 | Admin 이 전체 사용자를 조회하고 권한·상태를 관리한다 | **1. 목록**<br>• 페이지네이션 (50명/페이지)<br>• 검색 (이메일·이름)<br>• 필터 (등급·상태·가입일)<br>**2. 상세 페이지**<br>• 프로필·등급·구독·결제 이력<br>• 활동 로그 (로그인·생성·Export 이력)<br>• 보유 프로젝트 목록<br>**3. 액션**<br>• 등급 변경 (Free → Pro 등)<br>• 정지 (사유 입력 필수)<br>• 삭제 (감사 로그 자동 기록) |
| 통계 대시보드 | Admin 메인 | Admin 이 일별·주별·월별 핵심 지표를 모니터링한다 | **1. 핵심 지표 카드**<br>• MAU·DAU·신규 가입<br>• 생성 횟수·Export 횟수<br>• MRR·결제 성공률<br>**2. 그래프**<br>• 일별 추이 (30일)<br>• 등급별 분포<br>**3. 알림**<br>• 에러율 5% 초과 시 빨간 배지<br>• AI 비용 임계값 초과 시 노란 배지 |
| 통계 대시보드 | 매출 통계 | Admin 이 매출 추이와 플랜별 분포를 확인한다 | **1. 매출**<br>• 월별·주별·일별 매출 그래프<br>• 플랜별 (Pro·Team·크레딧·템플릿) 분포<br>**2. KPI**<br>• ARPU·LTV·Churn rate<br>**3. 환불 통계**<br>• 환불률·평균 처리 시간 |
| 통계 대시보드 | AI 비용 통계 | Admin 이 AI API 비용 추이를 모니터링한다 | **1. 비용**<br>• 일별·월별 비용 그래프<br>• AI Provider 별 (Claude·Image Gen) 분포<br>**2. 사용 분석**<br>• 생성 1건당 평균 비용<br>• 비용 임계값 알림 (일 ₩500,000 초과 시) |
| 통계 대시보드 | 에러 로그 | Admin 이 시스템 에러를 추적·분류한다 | **1. 로그 목록**<br>• 시각·에러 코드·메시지·발생 횟수<br>• 영향받은 사용자 수<br>**2. 필터**<br>• 카테고리 (AI·결제·API·DB)<br>• 심각도 (Critical·High·Medium·Low)<br>**3. Sentry 연동**<br>• 상세 페이지에서 Sentry Issue 이동 |
| 운영 관리 | 환불 처리 | Admin 이 환불 요청을 심사하고 처리한다 | **1. 요청 목록**<br>• 요청자·금액·사유·요청일<br>**2. 액션**<br>• [승인] : Stripe Refund API 자동 호출<br>• [거부] : 거부 사유 입력 + 사용자 통지<br>**3. 자동 처리**<br>• 임계 금액 이하 (예: $5) 자동 승인 옵션 |
| 운영 관리 | 공지사항 | Admin 이 공지를 등록·수정·삭제한다 | **1. 등록**<br>• 제목·본문 (Markdown)<br>• 노출 대상 (all·free·pro·team)<br>• 우선순위 (low·normal·high)<br>• 노출 기간<br>**2. 미리보기**<br>• 사용자 화면에 노출될 모습 확인<br>**3. 노출 채널**<br>• 대시보드 상단 배너<br>• 인앱 알림 (high·normal) |
| 운영 관리 | 감사 로그 | Admin 이 중요 작업의 이력을 조회한다 | **1. 로그 종류**<br>• 로그인·로그아웃<br>• 권한 변경·계정 정지<br>• 결제·환불·취소<br>• 데이터 삭제<br>**2. 필터**<br>• 사용자·액션·일자<br>**3. Export**<br>• CSV 다운로드<br>• 보존 기간 1년 |
| 운영 관리 | 피드백 관리 | Admin 이 사용자 피드백을 응대한다 | **1. 목록**<br>• 신규·검토중·해결·종료<br>• 카테고리 (피드백·버그·요청)<br>**2. 응답**<br>• Admin 응답 작성<br>• 사용자 이메일 자동 발송<br>**3. 통계**<br>• 카테고리별 분포·평균 해결 시간 |
| 운영 관리 | 템플릿 심사 | Admin 이 마켓에 등록된 템플릿을 심사한다 | **1. 심사 대기**<br>• 작성자·이름·카테고리·가격<br>• 미리보기 이미지<br>**2. 액션**<br>• [승인] : 즉시 게시<br>• [거부] : 거부 사유 입력 (필수)<br>• [수정 요청] : 작성자에게 알림<br>**3. 자동 검증**<br>• 금칙어·저작권 자동 사전 검증 (v2.0) |
| 시스템 관리 | 헬스 체크 | Admin 이 주요 서비스 상태를 모니터링한다 | **1. 점검 대상**<br>• DB (PostgreSQL)<br>• Redis<br>• AI API (Anthropic·Image Gen)<br>• Stripe<br>• S3<br>**2. 주기**<br>• 30초<br>**3. 알림**<br>• 장애 감지 시 Slack·Email 알림<br>• PagerDuty 연동 (v2.0) |
| 시스템 관리 | API 사용량 통계 | Admin 이 Public API 사용 현황을 모니터링한다 | **1. API Key 별 통계**<br>• 호출량·응답 시간·에러율<br>• 비정상 패턴 자동 탐지<br>**2. 차트**<br>• 엔드포인트별 호출량 TOP 10<br>• 시간대별 트래픽<br>**3. 알림**<br>• Rate Limit 초과 알림 |

---

## 4. 기능별 상세 입력 항목

등록·수정 화면을 포함하는 기능은 입력 항목을 별도 테이블로 정리한다.

### 4.1. 새 프로젝트 — 요건 입력 항목

| 항목 | 입력 유형 | 필수 | 제약 | 비고 |
|---|---|---|---|---|
| 프로젝트명 | Input | Y | max length = 200, 공백 불허 | 자동 제안 (입력 텍스트 기반) |
| 요건 텍스트 | Textarea | N | max length = 10,000, Markdown 일부 지원 | 글자 수 카운팅 |
| 파일 첨부 | File | N | png·jpg·jpeg·md·pdf, 이미지 20MB·문서 10MB, 최대 5개 | Drag & Drop 지원 |
| 플랫폼 | Radio | Y | Web / Mobile (v1.0) / 반응형 / APP (v2.0 비활성) | 기본값: Web |
| 컨셉 수 | Radio | Y | 1종 / 2종 / 3종 | Free 는 1종 고정 |
| 시안 수 | Radio | Y | 3종 / 5종 | Free 는 3종 고정 |
| 컬러 우선 영역 | Dropdown | N | Brand 우선 / Semantic 우선 / Neutral 우선 | 선택사항, AI 가이드 |
| 참조 스타일 | Tag Input | N | 최대 5개 | 예: "Modern", "Bold", "Minimal" |

### 4.2. 마이페이지 — 프로필 수정 항목

| 항목 | 입력 유형 | 필수 | 제약 | 비고 |
|---|---|---|---|---|
| 이름 | Input | Y | max length = 100 | |
| 이메일 | Input | Y | RFC 5322 형식, 변경 시 재검증 필요 | OAuth 가입자는 변경 불가 |
| 아바타 | File | N | png·jpg, 5MB 이하, 정사각형 권장 | 자동 크롭 (256x256) |
| 언어 | Dropdown | Y | 한국어 / English / 일본어 (v2.0) / 中文 (v2.0) | 기본: 브라우저 언어 자동 감지 |
| 테마 | Radio | Y | Light / Dark / System | 기본: System |

### 4.3. Admin — 공지사항 등록 항목

| 항목 | 입력 유형 | 필수 | 제약 | 비고 |
|---|---|---|---|---|
| 제목 | Input | Y | max length = 200 | |
| 본문 | Textarea | Y | Markdown 지원, max length = 10,000 | 미리보기 가능 |
| 노출 대상 | Checkbox | Y | all / free / pro / team | 다중 선택 |
| 우선순위 | Radio | Y | low / normal / high | high 는 인앱 알림 강제 |
| 노출 시작 | Calendar | Y | YYYY-MM-DD HH:MM | KST 기준 |
| 노출 종료 | Calendar | N | YYYY-MM-DD HH:MM (NULL = 무기한) | |
| 이미지 첨부 | File | N | png·jpg, 2MB 이하 | 본문 상단 노출 |

### 4.4. Admin — 사용자 정지 항목

| 항목 | 입력 유형 | 필수 | 제약 | 비고 |
|---|---|---|---|---|
| 정지 사유 | Radio | Y | 약관 위반 / 결제 사기 / 스팸 / 기타 | 감사 로그 자동 기록 |
| 상세 사유 | Textarea | Y | min length = 10 | |
| 정지 기간 | Radio | Y | 7일 / 30일 / 90일 / 영구 | |
| 사용자 통지 | Checkbox | Y | 통지 ON / OFF | ON 시 자동 이메일 발송 |

---

## 5. 권한 매트릭스

본 §5 의 권한 매트릭스는 [AI_Design_Generator_서비스정책서_v0.1.0.md 부록 B 등급별 권한 매트릭스](D:/Project/designgenerator/Docs/md/AI_Design_Generator_서비스정책서_v0.1.0.md) 의 SSOT 와 일치해야 한다. 서비스정책서 갱신 시 본 표를 동시 갱신한다.

### 5.1. Web App 메뉴 접근 권한

| 메뉴 / 기능 | Guest | Free | Pro | Team | Admin |
|---|---|---|---|---|---|
| 로그인 | ✅ | - | - | - | - |
| 대시보드 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 새 프로젝트 (생성) | ❌ | ✅ 월 3회 | ✅ 월 30회 | ✅ 무제한 | ✅ 무제한 |
| 작업 화면 (Workspace) | ❌ | ✅ | ✅ | ✅ | ✅ |
| DS 컨트롤러 — Color | ❌ | ✅ | ✅ | ✅ | ✅ |
| DS 컨트롤러 — Typography·Spacing·기타 | ❌ | ❌ | ✅ | ✅ | ✅ |
| 시안 비교 모드 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 요소 선택·상세 | ❌ | ❌ | ✅ | ✅ | ✅ |
| Export (.png) | ❌ | ✅ 워터마크 | ✅ | ✅ | ✅ |
| Export (.fig·.json·.css) | ❌ | ❌ | ✅ | ✅ | ✅ |
| 시안 부분 재생성 (v2.0) | ❌ | ❌ | ✅ | ✅ | ✅ |
| 다크모드 자동 생성 (v2.0) | ❌ | ❌ | ✅ | ✅ | ✅ |
| 템플릿 마켓 — 조회 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 템플릿 마켓 — 구매·적용 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 템플릿 마켓 — 등록·판매 | ❌ | ❌ | ✅ | ✅ | ✅ |
| 마이페이지 — 프로필·구독·크레딧 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 마이페이지 — API Key 관리 | ❌ | ❌ | ✅ | ✅ | ✅ |
| 마이페이지 — 사용량 대시보드 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 마이페이지 — 2FA·세션 관리 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 마이페이지 — GDPR Export | ❌ | ✅ | ✅ | ✅ | ✅ |
| 알림 센터 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 팀 관리 (Team 메뉴) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Admin 대시보드 | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin — 사용자 관리 | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin — 환불 처리 | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin — 공지사항 등록 | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin — 감사 로그 | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin — 템플릿 심사 | ❌ | ❌ | ❌ | ❌ | ✅ |

### 5.2. Figma Plugin 기능 접근 권한

| 기능 | Free | Pro | Team |
|---|---|---|---|
| Plugin 로그인 | ✅ | ✅ | ✅ |
| 생성 (월 3회·30회·무제한) | ✅ | ✅ | ✅ |
| DS 컨트롤러 — Color | ✅ | ✅ | ✅ |
| DS 컨트롤러 — 전체 Token | ❌ | ✅ | ✅ |
| Figma Frame 삽입 | ✅ | ✅ | ✅ |
| Figma Variables 동기화 | ❌ | ✅ | ✅ |
| PNG Export (Plugin) | ✅ 워터마크 | ✅ | ✅ |
| JSON Export (Plugin) | ❌ | ✅ | ✅ |

### 5.3. Public API · MCP Server 접근 권한

| 기능 | Free | Pro | Team |
|---|---|---|---|
| API Key 발급 | ❌ | ✅ | ✅ (팀 공용) |
| API 호출 (분당) | - | 300회 | 600회 |
| MCP Server 연동 | ❌ | ✅ | ✅ |
| Public API 전 엔드포인트 | ❌ | ✅ | ✅ |
| Webhook 등록 (v2.0) | ❌ | ✅ | ✅ |

---

## 6. 공통 기능 / 횡단 관심사

여러 메뉴에서 공통으로 사용하는 기능을 별도 섹션으로 기술한다.

. **인앱 알림** : 생성 완료·결제 성공·크레딧 부족·공지 등 시스템 이벤트를 헤더 벨 아이콘 + 알림 센터에서 통합 표시한다. 30일 자동 삭제.
. **이메일 알림** : 결제 실패·계정 보안·주간 요약 등 중요 이벤트는 이메일로 발송한다. Unsubscribe 링크 필수. 카테고리별 ON/OFF 설정 가능.
. **온보딩 투어** : 신규 사용자 첫 로그인 시 주요 기능을 단계별로 안내한다. 스킵 가능. 완료 여부 저장.
. **도움말 및 FAQ** : 인앱 도움말 페이지에서 사용 가이드·FAQ·튜토리얼 비디오를 검색 가능하다.
. **피드백·버그 리포트** : 모든 화면 우하단 [피드백] 버튼으로 접근. 스크린샷 첨부·환경 정보(브라우저·OS) 자동 수집 (사용자 동의 후).
. **공지사항 노출** : Admin 등록 공지를 대시보드 상단 배너 + 인앱 알림(우선순위 high) 으로 노출한다.
. **언어 설정 (i18n)** : 한국어·영어 2종 (v1.0). 일본어·중국어 (v2.0). 사용자별·세션별 설정 가능.
. **UI 테마 설정** : Light·Dark·System(브라우저 기본) 3종. AI 생성 시안의 다크모드와는 별개.
. **자동 저장 (Draft)** : 새 프로젝트 입력 중 30초마다 Draft 상태로 자동 저장. 페이지 이탈 후 재진입 시 복원.
. **단축키** : 주요 메뉴·작업 단축키 제공. Cmd/Ctrl+S(저장)·Cmd/Ctrl+E(Export)·Esc(취소)·1~5(시안 전환)·0(Zoom 100%)·Cmd/Ctrl+0(Fit to Screen). 단축키 도움말 ?(물음표).
. **검색 인덱싱** : 프로젝트명·태그·생성 일자 기준 GIN 인덱스(pg_trgm) 적용. 부분 일치 검색 지원.
. **버전 관리 / Undo** : 작업 화면에서 Cmd/Ctrl+Z 로 Token 수정 Undo 가능. 프로젝트 단위 버전 히스토리는 마이페이지 또는 작업 화면 우상단에서 조회.
. **로그·감사 추적** : 로그인·권한 변경·결제·데이터 삭제 등 중요 작업은 audit_logs 테이블에 자동 기록한다. Admin 조회 가능.
. **에러 처리 표준** : 모든 에러는 §11.3 에 정의된 13종 에러 코드 중 하나로 매핑한다. 사용자 화면에는 표준 에러 메시지 + 재시도·뒤로가기 옵션 노출.

---

## 7. 메뉴 ↔ 기능 ID 매핑

본 기능정의서의 메뉴는 [PRD v0.1.0 §3 요구사항 리스트](D:/Project/designgenerator/Docs/md/AI_Design_Generator_PRD_v0.1.0.md) 의 ADG_xxx 요구사항 ID 와 연동된다. 메뉴 단위로 어떤 요구사항이 해당 메뉴를 구성하는지 매핑한다.

| 메뉴 대분류 | 메뉴 중분류 | 관련 요구사항 ID |
|---|---|---|
| 대시보드 | 내 프로젝트 목록 | ADG_PROJ_002, ADG_PROJ_003, ADG_PROJ_007 |
| 대시보드 | 사용량 요약 | ADG_BILL_011, ADG_GEN_013 |
| 대시보드 | 최근 작업 | ADG_PROJ_002 |
| 새 프로젝트 | 요건 입력 | ADG_GEN_001, ADG_GEN_002, ADG_GEN_003 |
| 새 프로젝트 | 파일 업로드 | ADG_FILE_001, ADG_FILE_002, ADG_FILE_003, ADG_FILE_006 |
| 새 프로젝트 | 컨셉 옵션·생성 진행 | ADG_GEN_004, ADG_GEN_005, ADG_GEN_006, ADG_GEN_007, ADG_GEN_008, ADG_GEN_013 |
| 작업 화면 | DS 컨트롤러 (Color·Typography·Spacing·기타) | ADG_DS_001, ADG_DS_002, ADG_DS_003, ADG_DS_009 |
| 작업 화면 | 컨셉 전환 | ADG_DS_004 |
| 작업 화면 | 시안 뷰어 | ADG_MOCK_001, ADG_MOCK_002 |
| 작업 화면 | 비교 모드 | ADG_MOCK_004 |
| 작업 화면 | 요소 선택·상세 | ADG_MOCK_005 |
| 작업 화면 | 플랫폼 전환 | ADG_MOCK_003 |
| Export 화면 | Export 대상·형식·실행 | ADG_EXP_001, ADG_EXP_002, ADG_EXP_003, ADG_EXP_004, ADG_EXP_005, ADG_EXP_006, ADG_EXP_007 |
| 템플릿 마켓 | 조회·상세·구매·등록 | ADG_MKT_001~008 |
| 마이페이지 | 프로필·언어·테마 | ADG_USER_001, ADG_USER_002, ADG_USER_003 |
| 마이페이지 | 구독·크레딧·결제 이력 | ADG_BILL_001~007, ADG_BILL_011 |
| 마이페이지 | API Key 관리 | ADG_API_001, ADG_API_002, ADG_API_003 |
| 마이페이지 | 2FA·세션 관리 | ADG_AUTH_007, ADG_AUTH_009, ADG_AUTH_010 |
| 마이페이지 | 계정 삭제·GDPR Export | ADG_USER_004, ADG_USER_005 |
| 알림 센터 | 인앱 알림·설정 | ADG_NOTI_001, ADG_NOTI_002, ADG_NOTI_004, ADG_NOTI_005 |
| Figma Plugin | 전 메뉴 | ADG_DS_007 (Figma Variables 동기화) 외 Web App 과 공유 |
| Admin | 사용자 관리 | ADG_ADM_002 |
| Admin | 통계 대시보드 | ADG_ADM_001, ADG_ADM_007, ADG_ADM_008 |
| Admin | 운영 관리 | ADG_ADM_003, ADG_ADM_004, ADG_ADM_005, ADG_ADM_006, ADG_ADM_009 |
| Admin | 시스템 관리 | ADG_SYS_001, ADG_ADM_010 |

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| v0.1.0 | 2026-06-05 | 안승준 | 초안 작성. v0.4.0 service plan 기반 메뉴 × 기능 4컬럼 매트릭스. Web App·Figma Plugin·Admin 3영역 분리. 메뉴 50+ 단위로 활용 목적과 기능 정의 작성. 입력 항목 상세 4종(요건 입력·프로필·공지·정지), 권한 매트릭스 3종(Web App·Plugin·API/MCP), 공통 기능 14종, 메뉴 ↔ 요구사항 ID 매핑 포함. |

---

**문서 끝**
