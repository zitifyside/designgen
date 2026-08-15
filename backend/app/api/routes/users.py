"""현재 사용자 프로필, 비밀번호, 세션, 2FA."""
from __future__ import annotations

import datetime as dt
import secrets

import pyotp
from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbDep
from app.core.identity import get_pub
from app.core.security import hash_password, verify_password
from app.core.security_middleware import validate_password_strength
from app.models.design import DesignSystem, Mockup
from app.models.generation import GEN_KIND_SCREEN, Generation
from app.models.notification import Notification
from app.models.platform import ExportHistory
from app.models.project import Project
from app.models.user import Session
from app.schemas.common import Message
from app.core.observability import log_event
from app.services.two_factor import verify_second_factor
from app.schemas.user import (
    UsageBucket,
    UsageFormatShare,
    UsageSummaryOut,
    AccountDeleteIn,
    NotificationPrefsOut,
    NotificationPrefsUpdate,
    PasswordChangeIn,
    SessionOut,
    TwoFactorDisableIn,
    TwoFactorSetupOut,
    TwoFactorVerifyIn,
    UserOut,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/profile", response_model=UserOut)
async def get_profile(user: CurrentUser):
    return UserOut.from_model(user)


@router.patch("/profile", response_model=UserOut)
async def update_profile(body: UserUpdate, user: CurrentUser, db: DbDep):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.add(user)
    return UserOut.from_model(user)


@router.post("/password", response_model=Message)
async def change_password(
    body: PasswordChangeIn, user: CurrentUser, db: DbDep, request: Request
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )
    validate_password_strength(body.new_password, email=user.email)
    user.password_hash = hash_password(body.new_password)
    db.add(user)
    current = _current_sid(request)
    rows = (
        await db.scalars(
            select(Session).where(Session.user_id == user.id, Session.revoked.is_(False))
        )
    ).all()
    revoked = 0
    for row in rows:
        if current and row.id == current:
            continue
        row.revoked = True
        revoked += 1
    log_event(
        kind="user.password_changed",
        message="비밀번호 변경 — 다른 세션 종료",
        user_id=user.id,
        payload={"revokedSessions": revoked},
    )
    return Message(detail="Password updated")


def _current_sid(request: Request) -> str | None:
    """요청에 실린 access token 의 세션 ID. 서명 검증은 이미 인증 단계에서 끝났다."""
    from app.core.security import decode_token

    raw = (request.headers.get("authorization") or "").removeprefix("Bearer ").strip()
    if not raw:
        from app.core.auth_cookies import ACCESS_COOKIE

        raw = (request.cookies.get(ACCESS_COOKIE) or "").strip()
    if not raw:
        return None
    try:
        return decode_token(raw).get("sid")
    except Exception:
        return None


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(user: CurrentUser, db: DbDep, request: Request):
    current = _current_sid(request)
    rows = (
        await db.scalars(
            select(Session)
            .where(Session.user_id == user.id, Session.revoked == False)  # noqa: E712
            .order_by(Session.created_at.desc())
        )
    ).all()
    return [
        SessionOut(
            id=s.id,
            device=s.device,
            location=s.location,
            lastActive=s.last_active_at,
            current=s.id == current,
        )
        for s in rows
    ]


@router.post("/sessions/{session_id}/logout", response_model=Message)
async def revoke_session(session_id: str, user: CurrentUser, db: DbDep):
    session = await get_pub(db, Session, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    session.revoked = True
    return Message(detail="Session revoked")


@router.post("/sessions/logout-all", response_model=Message)
async def revoke_other_sessions(user: CurrentUser, db: DbDep, request: Request):
    """현재 기기를 제외한 모든 세션을 끊는다 (기능정의서 v0.2.0 §3.1 '세션 관리').

    기기를 잃어버렸을 때 하나씩 지우게 하면 늦는다. 현재 세션까지 끊으면 조치 직후
    로그아웃돼 후속 조치(비밀번호 변경)를 못 하므로 지금 쓰는 세션은 남긴다.
    """
    current = _current_sid(request)
    rows = (
        await db.scalars(
            select(Session).where(Session.user_id == user.id, Session.revoked.is_(False))
        )
    ).all()
    revoked = 0
    for row in rows:
        if current and row.id == current:
            continue
        row.revoked = True
        db.add(row)
        revoked += 1
    log_event(
        kind="user.sessions_revoked",
        message="다른 기기 세션 전체 종료",
        user_id=user.id,
        payload={"count": revoked},
    )
    return Message(detail=f"{revoked}개 세션을 종료했습니다.")


@router.post("/2fa/setup", response_model=TwoFactorSetupOut)
async def setup_2fa(user: CurrentUser, db: DbDep):
    """TOTP 시크릿과 백업 코드 10개를 발급한다. 이 단계에서는 아직 활성화되지 않는다."""
    if user.two_factor_enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 2단계 인증이 켜져 있습니다. 먼저 해제한 뒤 다시 설정해 주세요.",
        )
    secret = pyotp.random_base32()
    codes = [secrets.token_hex(4).upper() for _ in range(10)]
    user.two_factor_secret = secret
    user.two_factor_backup_codes = codes
    user.two_factor_enabled = False
    db.add(user)
    uri = pyotp.TOTP(secret).provisioning_uri(
        name=user.email, issuer_name="AI Design Generator"
    )
    return TwoFactorSetupOut(secret=secret, otpauth_uri=uri, backup_codes=codes)


@router.post("/2fa/verify", response_model=Message)
async def verify_2fa(body: TwoFactorVerifyIn, user: CurrentUser, db: DbDep):
    """TOTP 6자리 코드를 검증한 뒤에만 2FA 를 활성화한다."""
    if not user.two_factor_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="먼저 2FA 설정을 시작해 주세요.",
        )
    if not pyotp.TOTP(user.two_factor_secret).verify(body.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="인증 코드가 올바르지 않습니다."
        )
    user.two_factor_enabled = True
    db.add(user)
    return Message(detail="2FA enabled")


@router.post("/2fa/disable", response_model=Message)
async def disable_2fa(body: TwoFactorDisableIn, user: CurrentUser, db: DbDep):
    """해제는 비밀번호 + TOTP 코드를 동시에 요구한다 (기능정의서 v0.2.0 §3.1)."""
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="비밀번호가 올바르지 않습니다."
        )
    if not verify_second_factor(user, body.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="인증 코드가 올바르지 않습니다."
        )
    user.two_factor_enabled = False
    user.two_factor_secret = None
    user.two_factor_backup_codes = None
    db.add(user)
    return Message(detail="2FA disabled")


@router.get("/data-export")
async def gdpr_export(user: CurrentUser, db: DbDep):
    """GDPR 데이터 내려받기 — 프로필·프로젝트·DS·시안·Export·알림을 JSON 으로 반환한다."""
    projects = (
        await db.scalars(select(Project).where(Project.owner_id == user.id))
    ).all()
    project_ids = [p.id for p in projects]

    def rows_of(model):
        if not project_ids:
            return []
        return select(model).where(model.project_id.in_(project_ids))

    design_systems = (
        (await db.scalars(rows_of(DesignSystem))).all() if project_ids else []
    )
    mockups = (await db.scalars(rows_of(Mockup))).all() if project_ids else []
    generations = (
        (await db.scalars(select(Generation).where(Generation.user_id == user.id))).all()
    )
    exports = (
        await db.scalars(select(ExportHistory).where(ExportHistory.user_id == user.id))
    ).all()
    notifications = (
        await db.scalars(select(Notification).where(Notification.user_id == user.id))
    ).all()

    return {
        "exportedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "profile": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "plan": user.plan,
            "credits": user.credits,
            "createdAt": user.created_at.isoformat() if user.created_at else None,
        },
        "projects": [
            {
                "id": p.id,
                "name": p.name,
                "platform": p.platform,
                "status": p.status,
                "dsMode": p.ds_mode,
                "targetScreen": p.target_screen,
                "requirementsText": p.requirements_text,
            }
            for p in projects
        ],
        "designSystems": [
            {
                "id": d.id,
                "projectId": d.project_id,
                "conceptLabel": d.concept_label,
                "conceptName": d.concept_name,
                "tokens": d.tokens,
            }
            for d in design_systems
        ],
        "mockups": [
            {
                "id": m.id,
                "projectId": m.project_id,
                "conceptLabel": m.concept_label,
                "screen": m.screen,
                "index": m.index,
                "title": m.title,
            }
            for m in mockups
        ],
        "generations": [
            {"id": g.id, "projectId": g.project_id, "kind": g.kind, "status": g.status}
            for g in generations
        ],
        "exports": [
            {"id": e.id, "format": e.format, "scope": e.scope, "createdAt": e.created_at.isoformat() if e.created_at else None}
            for e in exports
        ],
        "notifications": [
            {"id": n.id, "category": n.category, "title": n.title, "read": n.read}
            for n in notifications
        ],
    }


@router.post("/delete-account", response_model=Message)
async def request_account_deletion(
    body: AccountDeleteIn, user: CurrentUser, db: DbDep
):
    """계정 삭제 요청 — 30일 유예 후 파기하며, 유예 기간 내 취소할 수 있다."""
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="비밀번호가 올바르지 않습니다."
        )
    user.deletion_requested_at = dt.datetime.now(dt.timezone.utc)
    db.add(user)
    return Message(
        detail="계정 삭제가 접수되었습니다. 30일 유예 기간 내 취소할 수 있습니다."
    )


@router.post("/delete-account/cancel", response_model=Message)
async def cancel_account_deletion(user: CurrentUser, db: DbDep):
    user.deletion_requested_at = None
    db.add(user)
    return Message(detail="계정 삭제 요청이 취소되었습니다.")


# ── 알림 설정 ────────────────────────────────────────────────────
# 카테고리 기본값. 사용자가 저장하지 않은 항목은 이 값을 따른다.
DEFAULT_NOTIFICATION_PREFS: dict[str, dict[str, bool]] = {
    "generation_done": {"inApp": True, "email": True},
    "generation_failed": {"inApp": True, "email": True},
    "billing": {"inApp": True, "email": True},
    "security": {"inApp": True, "email": True},
    "announcement": {"inApp": True, "email": False},
    "marketing": {"inApp": False, "email": False},
}


def _merged_prefs(stored: dict | None) -> dict:
    merged = {k: dict(v) for k, v in DEFAULT_NOTIFICATION_PREFS.items()}
    for key, value in (stored or {}).items():
        if key in merged and isinstance(value, dict):
            merged[key].update(
                {k: bool(v) for k, v in value.items() if k in ("inApp", "email")}
            )
    return merged


@router.get("/notification-prefs", response_model=NotificationPrefsOut)
async def get_notification_prefs(user: CurrentUser):
    return NotificationPrefsOut.model_validate(
        {"prefs": _merged_prefs(user.notification_prefs)}
    )


@router.patch("/notification-prefs", response_model=NotificationPrefsOut)
async def update_notification_prefs(
    body: NotificationPrefsUpdate, user: CurrentUser, db: DbDep
):
    """부분 갱신 — 보낸 카테고리만 덮어쓴다."""
    incoming = {
        key: value.model_dump(by_alias=True)
        for key, value in body.prefs.items()
        if key in DEFAULT_NOTIFICATION_PREFS
    }
    if not incoming:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="알 수 없는 알림 카테고리입니다.",
        )
    user.notification_prefs = _merged_prefs({**(user.notification_prefs or {}), **incoming})
    db.add(user)
    log_event(
        kind="user.notification_prefs_updated",
        message="알림 설정 변경",
        user_id=user.id,
        payload={"categories": sorted(incoming)},
    )
    return NotificationPrefsOut.model_validate({"prefs": user.notification_prefs})


@router.post("/onboarding/complete", response_model=UserOut)
async def complete_onboarding(user: CurrentUser, db: DbDep):
    """온보딩 투어를 마쳤거나 건너뛰었음을 기록한다 (기능정의서 v0.2.0 §6).

    완료와 스킵을 구분하지 않는다 — 둘 다 '이 사용자에게 다시 보여 주지 않는다' 는
    같은 결론이고, 굳이 나눠 두면 스킵한 사람에게 계속 띄우고 싶은 유혹이 생긴다.
    """
    if user.onboarded_at is None:
        user.onboarded_at = dt.datetime.now(dt.timezone.utc)
        db.add(user)
        log_event(
            kind="user.onboarding_completed",
            message="온보딩 투어 완료",
            user_id=user.id,
        )
    return UserOut.from_model(user)


@router.get("/usage", response_model=UsageSummaryOut)
async def usage_summary(
    user: CurrentUser,
    db: DbDep,
    granularity: str = Query(default="day", pattern="^(day|week|month)$"),
    periods: int = Query(default=30, ge=1, le=365),
):
    """사용량 집계 (기능정의서 v0.2.0 §3.1 '사용량 대시보드').

    화면이 프로젝트마다 이력을 따로 부르면 프로젝트 수만큼 요청이 늘고, 정작
    합계는 클라이언트가 다시 계산한다. 집계는 데이터가 있는 쪽에서 한 번에 한다.
    """
    now = dt.datetime.now(dt.timezone.utc)

    # 구간 경계를 먼저 만든다 — 빈 구간도 0 으로 남아야 그래프가 끊기지 않는다.
    def start_of(d: dt.datetime) -> dt.datetime:
        if granularity == "day":
            return d.replace(hour=0, minute=0, second=0, microsecond=0)
        if granularity == "week":
            base = d.replace(hour=0, minute=0, second=0, microsecond=0)
            return base - dt.timedelta(days=base.weekday())
        return d.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    def step_back(d: dt.datetime, n: int) -> dt.datetime:
        if granularity == "day":
            return d - dt.timedelta(days=n)
        if granularity == "week":
            return d - dt.timedelta(weeks=n)
        month = d.month - n
        year = d.year + (month - 1) // 12
        return d.replace(year=year, month=(month - 1) % 12 + 1)

    edges = [start_of(step_back(now, i)) for i in range(periods - 1, -1, -1)]
    window_start = edges[0]

    rows = (
        await db.scalars(
            select(Generation).where(
                Generation.user_id == user.id,
                Generation.created_at >= window_start,
            )
        )
    ).all()

    def bucket_index(when: dt.datetime) -> int | None:
        """구간 경계는 정렬돼 있으므로 뒤에서부터 찾으면 첫 일치가 답이다."""
        if when.tzinfo is None:
            when = when.replace(tzinfo=dt.timezone.utc)
        for i in range(len(edges) - 1, -1, -1):
            if when >= edges[i]:
                return i
        return None

    gen_counts = [0] * len(edges)
    add_counts = [0] * len(edges)
    for g in rows:
        idx = bucket_index(g.created_at)
        if idx is None:
            continue
        gen_counts[idx] += 1
        if g.kind == GEN_KIND_SCREEN:
            add_counts[idx] += 1

    fmt = {"day": "%m-%d", "week": "%m-%d~", "month": "%Y-%m"}[granularity]
    buckets = [
        UsageBucket(label=e.strftime(fmt), generations=gen_counts[i], screen_adds=add_counts[i])
        for i, e in enumerate(edges)
    ]

    # Export 형식 분포
    export_rows = (
        await db.execute(
            select(ExportHistory.format, func.count())
            .where(ExportHistory.user_id == user.id)
            .group_by(ExportHistory.format)
        )
    ).all()

    # 전월 대비 — 이번 달 1일과 지난달 1일을 경계로 센다.
    this_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_start = (this_start - dt.timedelta(days=1)).replace(day=1)
    this_month = await db.scalar(
        select(func.count())
        .select_from(Generation)
        .where(Generation.user_id == user.id, Generation.created_at >= this_start)
    )
    last_month = await db.scalar(
        select(func.count())
        .select_from(Generation)
        .where(
            Generation.user_id == user.id,
            Generation.created_at >= last_start,
            Generation.created_at < this_start,
        )
    )
    project_count = await db.scalar(
        select(func.count()).select_from(Project).where(Project.owner_id == user.id)
    )

    return UsageSummaryOut(
        granularity=granularity,
        buckets=buckets,
        total_generations=sum(gen_counts),
        total_screen_adds=sum(add_counts),
        failures=sum(1 for g in rows if g.status == "Failed"),
        warnings=sum(1 for g in rows if g.is_warning),
        export_total=sum(c for _, c in export_rows),
        export_formats=[UsageFormatShare(format=f, count=c) for f, c in export_rows],
        project_count=project_count or 0,
        this_month=this_month or 0,
        last_month=last_month or 0,
    )
