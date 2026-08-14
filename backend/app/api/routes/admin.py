"""관리자 콘솔: 사용자, 통계, 환불, 공지, 감사 로그, 피드백."""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.deps import AdminUser, DbDep
from app.models.admin import Announcement, AuditLog, Feedback
from app.models.billing import Payment, Plan, Refund, Subscription
from app.models.generation import Generation
from app.models.notification import Notification
from app.models.project import Project
from app.models.template import Template
from app.models.user import User
from app.core.config import settings
from app.schemas.admin import (
    AdminUserOut,
    DailyPointOut,
    HealthComponentOut,
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
from app.services.quota import plan_limits

router = APIRouter(prefix="/admin", tags=["admin"])


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


async def _log(db, admin: User, action: str, target: str, severity: str = "info") -> None:
    db.add(
        AuditLog(actor=admin.email, action=action, target=target, severity=severity)
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
):
    stmt = select(User)
    if q:
        stmt = stmt.where((User.email.ilike(f"%{q}%")) | (User.name.ilike(f"%{q}%")))
    if plan:
        stmt = stmt.where(User.plan == plan)
    if user_status:
        stmt = stmt.where(User.status == user_status)
    stmt = stmt.order_by(User.created_at.desc())
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
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    target.plan = body.plan
    target.monthly_limit = plan_limits(body.plan)[0]
    target.is_admin = body.plan == "Admin"
    await _log(db, admin, "USER_TIER_CHANGE", f"{user_id} → {body.plan}")
    return Message(detail="Tier updated")


@router.patch("/users/{user_id}/suspend", response_model=Message)
async def suspend_user(user_id: str, body: SuspendIn, admin: AdminUser, db: DbDep):
    target = await db.get(User, user_id)
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
    r = await db.get(Refund, refund_id)
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
    a = await db.get(Announcement, announcement_id)
    if a is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")
    for field, value in body.model_dump().items():
        setattr(a, field, value)
    db.add(a)
    return AnnouncementOut.model_validate(a)


@router.delete("/announcements/{announcement_id}", response_model=Message)
async def delete_announcement(announcement_id: str, admin: AdminUser, db: DbDep):
    a = await db.get(Announcement, announcement_id)
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
    f = await db.get(Feedback, feedback_id)
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
    t = await db.get(Template, template_id)
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
                detail=settings.database_url.split("://", 1)[0], latency_ms=latency,
            )
        )
    except Exception as exc:  # noqa: BLE001
        out.append(HealthComponentOut(name="Database", status="down", detail=str(exc)[:120]))

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
