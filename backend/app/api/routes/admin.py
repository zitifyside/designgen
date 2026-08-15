"""관리자 콘솔: 사용자, 통계, 환불, 공지, 감사 로그, 피드백."""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.deps import AdminUser, DbDep
from app.core.identity import get_pub
from app.core.observability import TIER_AUDIT, log_event
from app.models.admin import Announcement, AuditLog, Feedback
from app.models.billing import Payment, Plan, Refund, Subscription
from app.models.generation import Generation
from app.models.logging import AppLogEvent
from app.models.platform import ApiKey
from app.models.notification import Notification
from app.models.project import Project
from app.models.template import Template
from app.models.user import Session, User
from app.core.config import settings
from app.schemas.admin import (
    AdminUserDetailOut,
    AdminUserOut,
    DailyPointOut,
    HealthComponentOut,
    LogEventOut,
    LogStatsOut,
    StatsOut,
    AnnouncementIn,
    AnnouncementOut,
    AuditLogOut,
    FeedbackOut,
    FeedbackResolveIn,
    KpiOut,
    RefundResolveIn,
    SuspendIn,
    TierChangeIn,
)
from app.schemas.common import Message
from app.schemas.template import TemplateModerateIn, TemplateOut
from app.services import loghub
from app.services.quota import plan_limits

router = APIRouter(prefix="/admin", tags=["admin"])


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


async def _log(db, admin: User, action: str, target: str, severity: str = "info") -> None:
    """관리자 조치를 감사 로그(DB)와 중앙 로그 허브에 함께 남긴다.

    감사 로그는 t3(감사 사본) 등급으로 보낸다 — 허브 구조설계상 운영 지표(t1)·
    오류(t2) 와 보존 정책이 다르다.
    """
    db.add(
        AuditLog(actor=admin.email, action=action, target=target, severity=severity)
    )
    log_event(
        kind=f"admin.{action}"[:80],
        level="warn" if severity in ("warning", "critical") else "info",
        message=f"관리자 조치: {action} → {target}",
        tier=TIER_AUDIT,
        user_id=admin.id,
        payload={"actor": admin.email, "action": action, "target": target},
    )


# ── 대시보드 / 통계 ──────────────────────────────────────────────
@router.get("/dashboard", response_model=KpiOut)
async def dashboard(admin: AdminUser, db: DbDep):
    total_users = await db.scalar(select(func.count()).select_from(User)) or 0
    active_users = await db.scalar(
        select(func.count()).select_from(User).where(User.status == "Active")
    ) or 0
    suspended = await db.scalar(
        select(func.count()).select_from(User).where(User.status == "Suspended")
    ) or 0
    total_projects = await db.scalar(select(func.count()).select_from(Project)) or 0
    generations = await db.scalar(select(func.count()).select_from(Generation)) or 0
    pending_refunds = await db.scalar(
        select(func.count()).select_from(Refund).where(Refund.status == "Pending")
    ) or 0
    open_feedback = await db.scalar(
        select(func.count()).select_from(Feedback).where(Feedback.status.in_(("new", "in_review")))
    ) or 0
    return KpiOut(
        total_users=total_users,
        active_users=active_users,
        suspended_users=suspended,
        total_projects=total_projects,
        generations_total=generations,
        pending_refunds=pending_refunds,
        open_feedback=open_feedback,
    )


# ── 사용자 관리 ────────────────────────────────────────────────
@router.get("/users", response_model=list[AdminUserOut])
async def list_users(
    admin: AdminUser,
    db: DbDep,
    q: str | None = Query(default=None),
    plan: str | None = Query(default=None),
    user_status: str | None = Query(default=None, alias="status"),
    # 기능정의서 v0.2.0 §3.3 — 50명/페이지. 전수 반환은 사용자가 늘면 그대로 무너진다.
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200, alias="pageSize"),
):
    stmt = select(User)
    if q:
        from app.core.text import escape_like

        needle = f"%{escape_like(q)}%"
        stmt = stmt.where(
            (User.email.ilike(needle, escape="\\")) | (User.name.ilike(needle, escape="\\"))
        )
    if plan:
        stmt = stmt.where(User.plan == plan)
    if user_status:
        stmt = stmt.where(User.status == user_status)
    stmt = stmt.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.scalars(stmt)).all()
    out = []
    for u in rows:
        gens = await db.scalar(
            select(func.count()).select_from(Generation).where(Generation.user_id == u.id)
        ) or 0
        out.append(
            AdminUserOut(
                id=u.id, email=u.email, name=u.name, plan=u.plan, status=u.status,
                generations=gens, joined_at=u.created_at, last_active_at=u.last_active_at,
            )
        )
    return out


@router.patch("/users/{user_id}/tier", response_model=Message)
async def change_tier(user_id: str, body: TierChangeIn, admin: AdminUser, db: DbDep):
    target = await get_pub(db, User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    target.plan = body.plan
    target.monthly_limit = plan_limits(body.plan)[0]
    target.is_admin = body.plan == "Admin"
    await _log(db, admin, "USER_TIER_CHANGE", f"{user_id} → {body.plan}")
    return Message(detail="Tier updated")


@router.patch("/users/{user_id}/suspend", response_model=Message)
async def suspend_user(user_id: str, body: SuspendIn, admin: AdminUser, db: DbDep):
    target = await get_pub(db, User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    target.status = "Suspended" if body.suspend else "Active"
    await _log(
        db, admin,
        "USER_SUSPEND" if body.suspend else "USER_UNSUSPEND",
        f"{user_id} {body.reason}".strip(),
        severity="warning" if body.suspend else "info",
    )
    return Message(detail="User status updated")


# ── 환불 ────────────────────────────────────────────────────────
@router.get("/refunds")
async def list_refunds(admin: AdminUser, db: DbDep):
    rows = (
        await db.scalars(select(Refund).order_by(Refund.created_at.desc()))
    ).all()
    return [
        {
            "id": r.id, "userId": r.user_id, "amountCents": r.amount_cents,
            "reason": r.reason, "status": r.status, "createdAt": r.created_at,
        }
        for r in rows
    ]


@router.patch("/refunds/{refund_id}", response_model=Message)
async def resolve_refund(refund_id: str, body: RefundResolveIn, admin: AdminUser, db: DbDep):
    r = await get_pub(db, Refund, refund_id)
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Refund not found")
    r.status = "Approved" if body.approve else "Rejected"
    r.resolved_at = _now()
    # NOTE: 실제 Stripe 환불 처리는 스텁 상태인 결제 플로우의 일부이다.
    await _log(db, admin, "REFUND_APPROVE" if body.approve else "REFUND_REJECT", refund_id)
    return Message(detail="Refund resolved")


# ── 공지 ──────────────────────────────────────────────────
@router.get("/announcements", response_model=list[AnnouncementOut])
async def list_announcements(admin: AdminUser, db: DbDep):
    rows = (await db.scalars(select(Announcement).order_by(Announcement.created_at.desc()))).all()
    return [AnnouncementOut.model_validate(a) for a in rows]


@router.post("/announcements", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
async def create_announcement(body: AnnouncementIn, admin: AdminUser, db: DbDep):
    a = Announcement(**body.model_dump())
    db.add(a)
    await db.flush()
    await _log(db, admin, "ANNOUNCEMENT_CREATE", a.id)
    return AnnouncementOut.model_validate(a)


@router.patch("/announcements/{announcement_id}", response_model=AnnouncementOut)
async def update_announcement(announcement_id: str, body: AnnouncementIn, admin: AdminUser, db: DbDep):
    a = await get_pub(db, Announcement, announcement_id)
    if a is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")
    for field, value in body.model_dump().items():
        setattr(a, field, value)
    db.add(a)
    return AnnouncementOut.model_validate(a)


@router.delete("/announcements/{announcement_id}", response_model=Message)
async def delete_announcement(announcement_id: str, admin: AdminUser, db: DbDep):
    a = await get_pub(db, Announcement, announcement_id)
    if a is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")
    await db.delete(a)
    return Message(detail="Deleted")


# ── 감사 로그 ─────────────────────────────────────────────────────
@router.get("/audit-logs", response_model=list[AuditLogOut])
async def list_audit_logs(
    admin: AdminUser,
    db: DbDep,
    severity: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if severity:
        stmt = stmt.where(AuditLog.severity == severity)
    rows = (await db.scalars(stmt)).all()
    return [
        AuditLogOut(
            id=l.id, actor=l.actor, action=l.action, target=l.target,
            ip=l.ip, severity=l.severity, at=l.created_at,
        )
        for l in rows
    ]


# ── 피드백 ───────────────────────────────────────────────────────
@router.get("/feedback", response_model=list[FeedbackOut])
async def list_feedback(admin: AdminUser, db: DbDep, status_filter: str | None = Query(default=None, alias="status")):
    stmt = select(Feedback).order_by(Feedback.created_at.desc())
    if status_filter:
        stmt = stmt.where(Feedback.status == status_filter)
    rows = (await db.scalars(stmt)).all()
    return [FeedbackOut.model_validate(f) for f in rows]


@router.patch("/feedback/{feedback_id}", response_model=Message)
async def resolve_feedback(feedback_id: str, body: FeedbackResolveIn, admin: AdminUser, db: DbDep):
    f = await get_pub(db, Feedback, feedback_id)
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")
    f.status = body.status
    f.admin_response = body.admin_response or f.admin_response
    db.add(f)
    return Message(detail="Feedback updated")


# ── 템플릿 심사 ──────────────────────────────────────────────────
@router.get("/templates", response_model=list[TemplateOut])
async def list_templates_for_review(
    admin: AdminUser,
    db: DbDep,
    status_filter: str | None = Query(default=None, alias="status"),
):
    """마켓 등록 템플릿 심사 큐 (기능정의서 v0.2.0 §3.3 '템플릿 심사')."""
    stmt = select(Template).order_by(Template.created_at.desc())
    if status_filter:
        stmt = stmt.where(Template.status == status_filter)
    rows = (await db.scalars(stmt)).all()
    return [TemplateOut.model_validate(t) for t in rows]


@router.patch("/templates/{template_id}", response_model=TemplateOut)
async def moderate_template(
    template_id: str, body: TemplateModerateIn, admin: AdminUser, db: DbDep
):
    t = await get_pub(db, Template, template_id)
    if t is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    if body.status in ("Rejected", "RequestChanges") and not body.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="거부·수정 요청은 사유 입력이 필수입니다.",
        )
    t.status = body.status
    db.add(t)
    await _log(db, admin, f"template.{body.status.lower()}", t.name, "warning")
    if t.author_id:
        db.add(
            Notification(
                user_id=t.author_id,
                category="system",
                title=f"템플릿 심사 결과: {body.status}",
                body=f"'{t.name}' 템플릿이 {body.status} 처리되었습니다. {body.reason}".strip(),
                href="/templates",
            )
        )
    return TemplateOut.model_validate(t)


# ── 통계 ────────────────────────────────────────────────────────
@router.get("/stats", response_model=StatsOut)
async def stats(
    admin: AdminUser,
    db: DbDep,
    range_days: int = Query(default=30, ge=1, le=365, alias="range"),
):
    """일별 생성·실패·AI 비용 + 플랜 분포 + 매출 지표.

    결제(Stripe) 연동 전이므로 매출 계열은 실제 결제 레코드가 없으면 0 이다.
    실측 없는 수치를 지어내지 않는다.
    """
    since = _now() - dt.timedelta(days=range_days)

    # 활성 사용자 — `last_active_at` 은 로그인·토큰 갱신 때 갱신되므로 '접속한 날'의
    # 근사치다. 요청마다 찍지 않으므로 실제 체류와는 다를 수 있다.
    now = _now()
    dau = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.last_active_at >= now - dt.timedelta(days=1))
    )
    mau = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.last_active_at >= now - dt.timedelta(days=30))
    )

    gens = (
        await db.scalars(select(Generation).where(Generation.created_at >= since))
    ).all()
    users = (await db.scalars(select(User))).all()
    plans = {p.code: p for p in (await db.scalars(select(Plan))).all()}
    subs = (
        await db.scalars(select(Subscription).where(Subscription.status == "active"))
    ).all()
    payments = (
        await db.scalars(select(Payment).where(Payment.created_at >= since))
    ).all()

    buckets: dict[str, dict[str, int]] = {}
    for i in range(range_days):
        day = (since + dt.timedelta(days=i + 1)).date().isoformat()
        buckets[day] = {"generations": 0, "failures": 0, "aiCostCents": 0, "signups": 0}

    def bucket_for(value: dt.datetime | None):
        if value is None:
            return None
        return buckets.get(value.date().isoformat())

    for g in gens:
        b = bucket_for(g.created_at)
        if b is None:
            continue
        b["generations"] += 1
        b["aiCostCents"] += g.ai_cost_cents or 0
        if g.status == "Failed":
            b["failures"] += 1
    for u in users:
        b = bucket_for(u.created_at)
        if b is not None:
            b["signups"] += 1

    plan_distribution: dict[str, int] = {}
    for u in users:
        plan_distribution[u.plan] = plan_distribution.get(u.plan, 0) + 1

    mrr = sum(
        (plans[s.plan_code].monthly_price_cents if s.plan_code in plans else 0)
        for s in subs
    )
    paid_users = sum(1 for u in users if u.plan in ("Pro", "Team"))
    total_gens = len(gens)
    failures = sum(1 for g in gens if g.status == "Failed")

    return StatsOut(
        range_days=range_days,
        dau=dau or 0,
        mau=mau or 0,
        daily=[
            DailyPointOut(
                date=day,
                generations=v["generations"],
                failures=v["failures"],
                ai_cost_cents=v["aiCostCents"],
                signups=v["signups"],
            )
            for day, v in buckets.items()
        ],
        plan_distribution=plan_distribution,
        mrr_cents=mrr,
        paid_ratio=(paid_users / len(users)) if users else 0.0,
        arpu_cents=int(mrr / paid_users) if paid_users else 0,
        error_rate=(failures / total_gens) if total_gens else 0.0,
        ai_cost_total_cents=sum(g.ai_cost_cents or 0 for g in gens),
        payments_recorded=len(payments),
    )


@router.get("/health", response_model=list[HealthComponentOut])
async def health_components(admin: AdminUser, db: DbDep):
    """주요 구성요소 상태 — 실제로 확인 가능한 항목만 점검한다."""
    out: list[HealthComponentOut] = []

    started = dt.datetime.now()
    try:
        await db.scalar(select(func.count()).select_from(User))
        latency = int((dt.datetime.now() - started).total_seconds() * 1000)
        out.append(
            HealthComponentOut(
                name="Database", status="operational",
                detail="reachable", latency_ms=latency,
            )
        )
    except Exception:  # noqa: BLE001
        out.append(HealthComponentOut(name="Database", status="down", detail="연결 실패"))

    out.append(
        HealthComponentOut(
            name="AI Pipeline",
            status="degraded" if settings.fake_ai_pipeline else "operational",
            detail=(
                "FAKE_AI_PIPELINE=true — placeholder 출력으로 동작 중"
                if settings.fake_ai_pipeline
                else f"provider 활성 ({settings.gemini_model})"
            ),
        )
    )
    out.append(
        HealthComponentOut(
            name="AI Provider Key",
            status="operational" if (settings.gemini_api_key or settings.openai_api_key) else "not_configured",
            detail="Gemini / OpenAI 키 설정 여부",
        )
    )
    out.append(
        HealthComponentOut(
            name="Stripe",
            status="operational" if settings.stripe_secret_key else "not_configured",
            detail="결제 연동 미구성" if not settings.stripe_secret_key else "키 설정됨",
        )
    )
    out.append(
        HealthComponentOut(
            name="Object Storage",
            status="not_configured",
            detail="Export 산출물은 현재 요청 시 생성되며 S3 미연동",
        )
    )
    return out


# 로그 (관측)
@router.get("/logs", response_model=list[LogEventOut])
async def list_logs(
    admin: AdminUser,
    db: DbDep,
    level: str | None = Query(default=None),
    kind: str | None = Query(default=None),
    q: str | None = Query(default=None),
    user_id: str | None = Query(default=None, alias="userId"),
    trace_id: str | None = Query(default=None, alias="traceId"),
    hours: int = Query(default=24, ge=1, le=720),
    limit: int = Query(default=100, ge=1, le=500),
):
    """애플리케이션 로그 조회.

    중앙 로그 허브가 권위 저장소이고 여기는 로컬 사본이다 — 허브가 죽어도
    운영 콘솔에서 최근 로그를 볼 수 있어야 하므로 두 곳에 쓴다.
    """
    since = _now() - dt.timedelta(hours=hours)
    stmt = select(AppLogEvent).where(AppLogEvent.occurred_at >= since)
    if level:
        levels = [item.strip() for item in level.split(",") if item.strip()]
        stmt = stmt.where(AppLogEvent.level.in_(levels))
    if kind:
        from app.core.text import escape_like

        stmt = stmt.where(AppLogEvent.kind.ilike(escape_like(kind) + "%", escape="\\"))
    if user_id:
        stmt = stmt.where(AppLogEvent.user_id == user_id)
    if trace_id:
        stmt = stmt.where(AppLogEvent.trace_id == trace_id)
    if q:
        from app.core.text import escape_like

        like = "%" + escape_like(q) + "%"
        stmt = stmt.where(
            AppLogEvent.message.ilike(like, escape="\\")
            | AppLogEvent.path.ilike(like, escape="\\")
        )
    rows = (
        await db.scalars(stmt.order_by(AppLogEvent.occurred_at.desc()).limit(limit))
    ).all()

    emails = await _emails_for(db, {r.user_id for r in rows if r.user_id})
    return [_to_log_out(r, emails.get(r.user_id)) for r in rows]


@router.get("/logs/stats", response_model=LogStatsOut)
async def log_stats(
    admin: AdminUser,
    db: DbDep,
    hours: int = Query(default=24, ge=1, le=720),
):
    since = _now() - dt.timedelta(hours=hours)
    rows = (
        await db.scalars(select(AppLogEvent).where(AppLogEvent.occurred_at >= since))
    ).all()

    by_level: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    for r in rows:
        by_level[r.level] = by_level.get(r.level, 0) + 1
        by_kind[r.kind] = by_kind.get(r.kind, 0) + 1
    errors = by_level.get("error", 0) + by_level.get("fatal", 0)

    return LogStatsOut(
        range_hours=hours,
        total=len(rows),
        by_level=by_level,
        top_kinds=[
            {"kind": k, "count": v}
            for k, v in sorted(by_kind.items(), key=lambda kv: kv[1], reverse=True)[:12]
        ],
        error_rate=(errors / len(rows)) if rows else 0.0,
        forwarder=loghub.stats(),
    )


def _to_log_out(r, email: str | None):
    return LogEventOut(
        id=r.id,
        event_id=r.event_id,
        occurred_at=r.occurred_at,
        level=r.level,
        tier=r.tier,
        kind=r.kind,
        message=r.message,
        trace_id=r.trace_id,
        user_id=r.user_id,
        user_email=email,
        source=r.source,
        method=r.method,
        path=r.path,
        status_code=r.status_code,
        duration_ms=r.duration_ms,
        payload=r.payload,
        stack=r.stack,
    )


async def _emails_for(db, user_ids: set) -> dict:
    if not user_ids:
        return {}
    rows = (await db.scalars(select(User).where(User.id.in_(user_ids)))).all()
    return {u.id: u.email for u in rows}


# 사용자 상세
@router.get("/users/{user_id}", response_model=AdminUserDetailOut)
async def user_detail(user_id: str, admin: AdminUser, db: DbDep):
    """사용자 한 명의 계정·구독·활동·보유 프로젝트를 모아 본다
    (기능정의서 v0.2.0 §3.3 사용자 목록·상세).
    """
    target = await get_pub(db, User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    projects = (
        await db.scalars(
            select(Project)
            .where(Project.owner_id == user_id)
            .order_by(Project.updated_at.desc())
            .limit(20)
        )
    ).all()
    gens = (
        await db.scalars(select(Generation).where(Generation.user_id == user_id))
    ).all()
    sub = await db.scalar(select(Subscription).where(Subscription.user_id == user_id))
    sessions = (
        await db.scalar(
            select(func.count())
            .select_from(Session)
            .where(Session.user_id == user_id, Session.revoked.is_(False))
        )
        or 0
    )
    api_keys = (
        await db.scalar(
            select(func.count())
            .select_from(ApiKey)
            .where(ApiKey.user_id == user_id, ApiKey.revoked.is_(False))
        )
        or 0
    )
    activity = (
        await db.scalars(
            select(AppLogEvent)
            .where(AppLogEvent.user_id == user_id)
            .order_by(AppLogEvent.occurred_at.desc())
            .limit(30)
        )
    ).all()

    return AdminUserDetailOut(
        id=target.id,
        email=target.email,
        name=target.name,
        plan=target.plan,
        status=target.status,
        credits=target.credits,
        monthly_used=target.monthly_used,
        monthly_limit=target.monthly_limit,
        email_verified=target.email_verified,
        two_factor_enabled=target.two_factor_enabled,
        is_admin=target.is_admin,
        joined_at=target.created_at,
        last_active_at=target.last_active_at,
        locked_until=target.locked_until,
        failed_login_attempts=target.failed_login_attempts,
        deletion_requested_at=target.deletion_requested_at,
        subscription=(
            {
                "planCode": sub.plan_code,
                "status": sub.status,
                "currentPeriodEnd": (
                    sub.current_period_end.isoformat() if sub.current_period_end else None
                ),
            }
            if sub
            else None
        ),
        projects=[
            {
                "id": p.id,
                "name": p.name,
                "status": p.status,
                "platform": p.platform,
                "updatedAt": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in projects
        ],
        generations={
            "total": len(gens),
            "done": sum(1 for g in gens if g.status == "Done"),
            "failed": sum(1 for g in gens if g.status == "Failed"),
            "warning": sum(1 for g in gens if g.is_warning),
        },
        recent_activity=[_to_log_out(r, target.email) for r in activity],
        sessions=sessions,
        api_keys=api_keys,
    )


@router.post("/users/{user_id}/unlock", response_model=Message)
async def unlock_user(user_id: str, admin: AdminUser, db: DbDep):
    """브루트포스 방어로 잠긴 계정을 관리자가 해제한다.

    잠금은 시간이 지나면 자동으로 풀리지만, 정당한 사용자가 즉시 들어와야 하는
    상황(오타 반복·공유 계정)에서 15분을 기다리게 할 이유는 없다.
    """
    target = await get_pub(db, User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    target.failed_login_attempts = 0
    target.locked_until = None
    db.add(target)
    await _log(db, admin, "user.unlock", target.email, "warning")
    return Message(detail="계정 잠금을 해제했습니다.")
