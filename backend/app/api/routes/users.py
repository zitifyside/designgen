"""현재 사용자 프로필, 비밀번호, 세션, 2FA."""
from __future__ import annotations

import datetime as dt
import secrets

import pyotp
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.core.security import hash_password, verify_password
from app.core.security_middleware import validate_password_strength
from app.models.design import DesignSystem, Mockup
from app.models.generation import Generation
from app.models.notification import Notification
from app.models.platform import ExportHistory
from app.models.project import Project
from app.models.user import Session
from app.schemas.common import Message
from app.core.observability import log_event
from app.schemas.user import (
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
async def change_password(body: PasswordChangeIn, user: CurrentUser, db: DbDep):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )
    validate_password_strength(body.new_password, email=user.email)
    user.password_hash = hash_password(body.new_password)
    db.add(user)
    return Message(detail="Password updated")


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(user: CurrentUser, db: DbDep):
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
            current=False,
        )
        for s in rows
    ]


@router.post("/sessions/{session_id}/logout", response_model=Message)
async def revoke_session(session_id: str, user: CurrentUser, db: DbDep):
    session = await db.get(Session, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    session.revoked = True
    return Message(detail="Session revoked")


@router.post("/2fa/setup", response_model=TwoFactorSetupOut)
async def setup_2fa(user: CurrentUser, db: DbDep):
    """TOTP 시크릿과 백업 코드 10개를 발급한다. 이 단계에서는 아직 활성화되지 않는다."""
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
    if not user.two_factor_secret or not pyotp.TOTP(user.two_factor_secret).verify(
        body.code, valid_window=1
    ):
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
