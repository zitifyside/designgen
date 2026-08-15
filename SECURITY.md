# 보안 현황 — AI Design Generator

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.2.2 |
| 작성일 | 2026-08-15 |
| 대상 | Firebase Hosting(정적) + Cloud Run(FastAPI) + SQLite/PostgreSQL |
| 점검 기준 | 서비스정책서 보안 요건 · OWASP Top 10 관점 · ContextBuilder Security SSOT |

이 문서는 **적용된 통제**와 **알고 있으면서 아직 닫지 않은 위험**을 함께 적는다.
남은 위험을 적지 않으면 다음 사람이 "점검 끝난 영역"으로 오해한다.

---

## 1. 인증·세션

| 통제 | 구현 |
|---|---|
| 비밀번호 저장 | bcrypt 해시 (평문·가역 암호 없음) |
| 비밀번호 정책 | 8자 이상 + 흔한 값·숫자만·문자 반복·이메일 아이디 포함 거부 |
| 브루트포스 | 계정당 연속 5회 실패 → **15분 잠금**. 잠금 중에는 올바른 비밀번호도 거부 |
| 사용자 열거 | 미존재 계정도 더미 해시로 **동일 검증 비용**을 치르고 동일 401 반환 |
| 토큰 | JWT. Access 60분 / Refresh 30일, **Refresh 는 1회용 회전**. 브라우저에는 **HttpOnly+SameSite=Lax(+prod Secure)** 쿠키로 내려 주고, Bearer 는 스모크·MCP 용으로 병행. 로그아웃은 메모리 토큰이 없어도 `POST /auth/logout` 으로 쿠키 세션을 폐기한다 |
| 세션 폐기 | access 의 `sid` 로 폐기 여부를 본다. 원격 로그아웃·비밀번호 변경은 다른 기기 access 를 즉시 끊는다. refresh 재사용 시 해당 사용자 세션 전부 폐기 |
| 2FA | TOTP setup → verify 후에만 활성화. **로그인 시 TOTP 또는 백업 코드 필수**. 이미 켠 상태에서 setup 재호출 거부. 해제는 비밀번호 + 코드 |
| 잠금 해제 | 관리자 `POST /admin/users/{id}/unlock` (감사 로그 기록) |

## 2. 인가

. 모든 프로젝트 하위 리소스(DS·시안·화면·Export·첨부)는 **소유자 검사**를 거친다.
  타인 소유 자원은 403 이 아니라 **404** 로 답해 존재 여부를 흘리지 않는다.
  팀도 같다 — 비멤버의 초대·역할 변경은 팀이 없어도 있는 것처럼 **404**.
  마켓 상세·리뷰는 `Approved` 만. 심사 대기는 `/templates/mine` 또는 Admin.
. 등급 게이팅은 서버가 최종 판정한다 — 단일 DS 통일(Pro+), Token 카테고리(Free 는 Color),
  Export 형식(.fig·.json·.css Pro+), API Key(Pro+), 팀(Team+), 템플릿 등록(Pro+).
. Admin 은 화면 가드가 아니라 **서버 RBAC** 로 강제한다. 프론트 가드는 편의일 뿐이다.
. 관리자 조치(등급 변경·정지·환불·템플릿 심사·공지·잠금 해제)는 전건 감사 로그.

## 3. 입력 검증

| 대상 | 통제 |
|---|---|
| 요청 본문 | 2MB 상한 (초과 시 413) |
| 스키마 | Pydantic 화이트리스트 — 정의되지 않은 필드는 반영되지 않는다(대량 할당 차단) |
| 첨부 파일 | **확장자 + MIME + 매직 넘버 3중 검증**, 형식별 크기(이미지 20MB·문서 10MB), 프로젝트당 5개 |
| 첨부 파일명 | 경로 구분자·제어문자 제거 후 저장 (경로 조작 차단) |
| 텍스트 파일 | UTF-8 디코딩 성공만 허용 (바이너리 위장 차단) |
| SVG | **미지원 형식으로 차단** — 스크립트 실행 벡터 |
| PDF | 암호 걸린 문서 거부, 50페이지·20,000자 상한 (CPU 소모 공격 방지) |
| SQL | SQLAlchemy ORM 파라미터 바인딩 (문자열 조립 없음) |

## 4. 전송·응답

| 통제 | 값 |
|---|---|
| 레이트 리밋 | 로그인 5분 10회 · 가입 1시간 5회 · 2FA/비밀번호 별도 · 업로드 시간당 20회 · API 분당 300회 · Public API 등급별 분당 300/600 |
| 봇 차단 | 알려진 AI·검색·SEO·헤드리스 UA 403. 빈 UA 거부. 한국 인앱(카카오톡·네이버 등)은 통과. curl·httpx 는 API 클라이언트라 통과 |
| 가입 허니팟 | `website` 필드가 채워지면 가입 거부 |
| 관리자 IP | `ADMIN_ALLOW_IPS` 가 있을 때만 `/admin` API 제한. **빈 목록은 막지 않는다** |
| 클라이언트 IP | `X-Forwarded-For` 왼쪽(GFE 가 덮어씀). `CF-Connecting-IP` 는 이 스택에 Cloudflare 가 없어 **무시** |
| CSRF | 변이 요청 Origin/Referer 가 CORS 출처와 맞는지 본다. 요청 `Host` 는 허용 목록에 넣지 않는다 |
| API 보안 헤더 | `X-Content-Type-Options` · `X-Frame-Options: DENY` · `Referrer-Policy: no-referrer` · `Cache-Control: no-store` · `COOP` · `CORP` · `Permissions-Policy` · `HSTS` |
| Host 헤더 | 운영에서 `TrustedHostMiddleware` 로 허용 목록 강제 (Host 위조 차단) |
| CORS | 허용 출처 화이트리스트. 배포본은 Hosting rewrite 로 **동일 출처**라 CORS 자체를 타지 않는다 |
| 오류 응답 | 500 에 내부 예외·스택 미노출. 미처리 예외는 서버 로그에만 스택 기록 |
| API 문서 | 운영에서 `/docs`·`/redoc`·`/openapi.json` 비공개 |
| 공개 헬스 | `{"status":"ok"}` 만. 환경·DB·FAKE_AI 는 관리자 `/admin/health` |
| 크롤 함정 | 숨은 링크 `/api/v1/__crawl-trap` + 정찰 경로. 밟은 IP 는 24시간 차단 |

정적 호스팅(Firebase) 헤더:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;
  connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self';
  form-action 'self'; upgrade-insecure-requests
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet
  (+ robots.txt Disallow: / · llms.txt · HTML robots 메타)
```

`script-src` 에 `'unsafe-inline'` 이 남아 있는 이유: Next.js 정적 export 가 하이드레이션
부트스트랩을 인라인 스크립트로 심는다. nonce 를 쓰려면 요청 시점에 HTML 을 만들어야 하므로
정적 호스팅과 양립하지 않는다. 대신 `connect-src 'self'`·`object-src 'none'`·
`frame-ancestors 'none'` 으로 실제 피해 경로를 좁혔다.

## 5. 비밀·데이터

. 시크릿은 ContextBuilder `Secrets/env/designgenerator/` SSOT 를 심볼릭 링크로 참조하며
  저장소에 커밋하지 않는다 (`.gitignore` 로 `.env`·`*.db` 차단, `git check-ignore` 로 실증).
. 운영 `SECRET_KEY` 가 32자 미만이거나 기본 문자열이면 **기동을 거부**한다.
. 로그·payload 는 저장 전에 재귀 마스킹한다 — `password`·`token`·`secret`·`authorization`·
  `cookie`·`api_key` 계열 키, `Bearer …`·JWT·`sk-`·`ghp_`·`AIza` 패턴.
. IP 는 원본 대신 솔트 해시 32자만 저장한다. 중앙 로그 허브로는 사용자 ID 대신 해시를 보낸다.
. API Key 는 평문을 저장하지 않고 SHA-256 해시만 보관하며, 발급 응답에서 1회만 노출한다.
. GDPR — 본인 데이터 JSON 내려받기, 계정 삭제 요청(30일 유예·취소 가능). 유예가 끝나면 `deleted_at` 논리 삭제, **365일** 뒤 이메일·이름·비밀을 익명화한다. 행은 FK 때문에 남긴다.

## 6. 관측

. 인증 실패·계정 잠금·토큰 재사용·쿼터 차단·관리자 조치·미처리 예외를 전부 기록한다.
. **실패 경로 로그는 업무 트랜잭션과 분리된 세션**으로 적재한다. 요청 세션에 붙이면
  401/403 롤백과 함께 사라진다 — 가장 필요한 로그가 사라지는 구조였다(수정 완료).
. 중앙 로그 허브(마에 loghub)로 미러링한다. 전송 실패는 서킷브레이커로 흡수하고
  업무 요청에 영향을 주지 않는다.

## 7. 의존성

| 시점 | 결과 |
|---|---|
| 2026-08-15 | 프론트 운영 의존성 **critical 1건 해소** — Next.js 14.2.5 → **14.2.35** (캐시 포이즈닝·DoS 외) |

남은 `high` 2건(Next 이미지 최적화기 DoS, postcss)은 **현 배포 형태에서 실행 경로가 없다** —
정적 export 라 Next 서버 런타임(이미지 최적화기·HTTP 핸들러)이 배포되지 않고, postcss 는
빌드 타임에만 쓰인다. 해소하려면 Next 16 메이저 업그레이드(React 19 동반)가 필요해
위험 대비 회귀 비용이 커 보류했다. **SSR 로 전환한다면 이 판단은 즉시 무효**다.

```bash
cd frontend && npm audit --omit=dev     # 정기 확인
```

---

## 8. 알려진 잔여 위험

| 위험 | 현황 | 대응 |
|---|---|---|
| **DB 휘발** | Cloud Run 컨테이너 `/tmp` SQLite — 콜드 스타트 시 사용자 데이터·로그 소실, 세션도 무효화 | PostgreSQL(Neon 등) 전환. `DATABASE_URL` 교체만으로 끝난다 |
| **토큰 저장 위치** | 브라우저는 HttpOnly 쿠키. 구 localStorage 키는 기동 시 지운다 | XSS 로 JS 가 쿠키를 읽지 못한다. 변이 요청은 Origin/Referer CSRF 검사 |
| **가입 시 이메일 존재 노출** | 중복 이메일에 409 를 반환해 가입 여부가 드러난다 | 레이트 리밋(1시간 5회)으로 대량 열거는 차단. UX 상 즉시 안내가 필요해 유지 |
| **레이트 리밋 범위** | 프로세스 메모리 기반 — `--max-instances 1` 전제 | 인스턴스 확장 시 Redis 백엔드로 이전 |
| **Cloud Run 빌드 SA 권한** | 기본 Compute SA 에 `cloudbuild.builds.builder` 등 부여(배포 통과 목적) | 런타임 전용 SA 를 분리하고 빌드 권한은 빌드 시점만 부여 |
| **바이러스 스캔 없음** | 첨부는 형식·크기·매직 넘버만 검증. ClamAV/VirusTotal 미연동 | 원본을 보관·재배포하지 않아 노출면은 작다. 스토리지 연동 시 필수 |
| **결제 경로** | Stripe 미연동(501) — 결제 데이터 처리 없음 | 연동 시 웹훅 서명 검증·PCI 범위 재점검 필요 |
| **Secret Manager** | Cloud Run 은 아직 env 주입 | `--update-secrets` 이관은 운영자 배포 때 |
| **L5·L6** | CAPTCHA·Cloudflare WAF 없음 | UX·DNS 결정 후 |
| **CodeQL** | org 라이선스 필요 | semgrep OWASP ERROR 로 대체 |

---

## 9. 정기 점검

```bash
# 의존성
cd frontend && npm audit --omit=dev
cd backend  && .venv/Scripts/python.exe -m pip list --outdated

# 시크릿이 저장소에 들어가지 않는지
git check-ignore -v backend/.env backend/designgen.db

# 인증·권한 회귀 (등급 게이팅·동시성·소유권 46 검사)
cd backend && .venv/Scripts/python.exe scripts/smoke_e2e.py
```

취약점을 발견하면 공개 이슈 대신 운영자에게 직접 알린다.

---

## 10. 콘텍스트 체크리스트 대응 (14+1)

기준: [신규프로젝트_체크리스트.md](D:/Project/ContextBuilder/Build/Context/Security/적용/신규프로젝트_체크리스트.md) + OP-04/OP-05 + 방어·검증 SSOT.

| Step | 항목 | 상태 | 구현 |
|---|---|---|---|
| 1 | 신뢰 경계 | 적용 | 웹 JWT·Public API Key·Admin RBAC. 타인 자원 404 |
| 2 | HTTP 보안 헤더 | 적용 | `firebase.json` + API `SECURITY_HEADERS` (HSTS preload·COOP·CORP·Permissions-Policy) |
| 3 | CSP | 적용 | `script-src 'self' 'unsafe-inline'` — 정적 export 인라인 부트스트랩. nonce 는 정적 호스팅과 양립하지 않음 |
| 4 | 인증 쿠키 | 적용 | HttpOnly + SameSite=Lax + prod Secure. localStorage 토큰 제거 |
| 5 | Postgres 앱 role | 준비 | [postgres_app_role.sql](D:/Project/designgenerator/backend/scripts/postgres_app_role.sql). 운영 DB 가 SQLite 라 적용 시점은 Postgres 전환 때 |
| 6 | 로그 redact | 적용 | 키 재귀 마스킹 + 이메일 마스킹 + `/auth/*` 본문 `[auth-redacted]` |
| 7 | Cloud Run 프록시 | 해당 없음 | 별도 릴레이가 아니라 Hosting rewrite. Origin CSRF·본문 2MB(청크 포함)·Server 헤더 제거 |
| 8 | 로컬 릴레이 | 해당 없음 | 로컬 Express 릴레이를 두지 않음 |
| 9 | Secret Manager | 운영 잔여 | 로컬은 `Secrets/env/designgenerator/` 심볼릭 링크. Cloud Run `--update-secrets` 이관은 배포 시 운영자 실행 |
| 10 | 방화벽·Ollama | 해당 없음 | 앱이 Cloud Run. 운영자 PC `harden-firewall.ps1` 은 머신 작업 |
| 11 | 빌드 시크릿 grep | 적용 | `check_secrets.py` + CI. 자리표시자(xxxx) 는 제외 |
| 12 | 침투 드릴 | 적용 | `smoke_e2e.py` (2FA·sid·CSRF·봇·함정·헬스) |
| 13 | 백엔드 협업 잔존 | 문서화 | Stripe 웹훅·Redis RL·SA 분리·바이러스 스캔 |
| 14 | 공급망 CI | 적용 | Dependabot + gitleaks + pip-audit + npm audit + osv-scanner + semgrep. CodeQL 은 org 라이선스 필요 |
| 15 | EU GDPR | 부분 | 내보내기·삭제(30일 유예)·365일 익명화. 필수 쿠키만 사용. DPO·DPIA·72h 통지는 EU 대상 확대 시 |

OP-05 레이어: L1 robots/noindex/llms.txt/ai.txt · L2 헤더 · L3 UA · L4 rate-limit · L7 함정. L5 CAPTCHA·L6 Cloudflare WAF·L9 핑거프린트는 UX·DNS 운영 결정.

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|---|---|---|---|
| v1.2.2 | 2026-08-16 | 안승준 | IP 는 CF 헤더 무시. CSRF 는 CORS 출처만. 팀 비멤버·미승인 템플릿 404. 쿠키 로그아웃 |
| v1.2.1 | 2026-08-16 | 안승준 | §5·§10 계정 삭제 365일 익명화(DA 논리삭제 §7) 병기 |
| v1.2.0 | 2026-08-16 | 안승준 | 체크리스트 14+1 전수 매핑. L7 함정·헬스 정찰면 축소·발신 SSRF·osv/semgrep·컨테이너 비루트 |
| v1.1.0 | 2026-08-15 | 안승준 | HttpOnly 쿠키·CSRF·봇 가드·시드 잠금 반영 |
