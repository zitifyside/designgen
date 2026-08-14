# 보안 현황 — AI Design Generator

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0.0 |
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
| 토큰 | JWT. Access 60분 / Refresh 30일, **Refresh 는 1회용 회전** |
| 세션 폐기 | 로그아웃·원격 로그아웃 시 세션 revoke. 폐기된 토큰 재사용은 `auth.refresh_reuse` 로 기록 |
| 2FA | TOTP setup → verify 후에만 활성화. 해제는 비밀번호 + 코드 동시 요구. 백업 코드 10개 |
| 잠금 해제 | 관리자 `POST /admin/users/{id}/unlock` (감사 로그 기록) |

## 2. 인가

. 모든 프로젝트 하위 리소스(DS·시안·화면·Export·첨부)는 **소유자 검사**를 거친다.
  타인 소유 자원은 403 이 아니라 **404** 로 답해 존재 여부를 흘리지 않는다.
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
| 레이트 리밋 | 로그인 5분 10회 · 가입 1시간 5회 · 2FA/비밀번호 별도 · API 분당 300회 |
| API 보안 헤더 | `X-Content-Type-Options` · `X-Frame-Options: DENY` · `Referrer-Policy: no-referrer` · `Cache-Control: no-store` · `COOP` · `CORP` · `Permissions-Policy` · `HSTS` |
| Host 헤더 | 운영에서 `TrustedHostMiddleware` 로 허용 목록 강제 (Host 위조 차단) |
| CORS | 허용 출처 화이트리스트. 배포본은 Hosting rewrite 로 **동일 출처**라 CORS 자체를 타지 않는다 |
| 오류 응답 | 500 에 내부 예외·스택 미노출. 미처리 예외는 서버 로그에만 스택 기록 |
| API 문서 | 운영에서 `/docs`·`/redoc`·`/openapi.json` 비공개 |

정적 호스팅(Firebase) 헤더:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;
  connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self';
  form-action 'self'; upgrade-insecure-requests
X-Robots-Tag: noindex, nofollow      (+ robots.txt 전면 Disallow)
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
. GDPR — 본인 데이터 JSON 내려받기, 계정 삭제 요청(30일 유예·취소 가능).

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
| **토큰 저장 위치** | Access/Refresh 를 `localStorage` 에 보관 → XSS 시 탈취 가능 | CSP·입력 이스케이프로 XSS 표면을 좁힘. 근본 해결은 httpOnly 쿠키 + CSRF 토큰 전환 |
| **가입 시 이메일 존재 노출** | 중복 이메일에 409 를 반환해 가입 여부가 드러난다 | 레이트 리밋(1시간 5회)으로 대량 열거는 차단. UX 상 즉시 안내가 필요해 유지 |
| **레이트 리밋 범위** | 프로세스 메모리 기반 — `--max-instances 1` 전제 | 인스턴스 확장 시 Redis 백엔드로 이전 |
| **Cloud Run 빌드 SA 권한** | 기본 Compute SA 에 `cloudbuild.builds.builder` 등 부여(배포 통과 목적) | 런타임 전용 SA 를 분리하고 빌드 권한은 빌드 시점만 부여 |
| **바이러스 스캔 없음** | 첨부는 형식·크기·매직 넘버만 검증. ClamAV/VirusTotal 미연동 | 원본을 보관·재배포하지 않아 노출면은 작다. 스토리지 연동 시 필수 |
| **결제 경로** | Stripe 미연동(501) — 결제 데이터 처리 없음 | 연동 시 웹훅 서명 검증·PCI 범위 재점검 필요 |

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
