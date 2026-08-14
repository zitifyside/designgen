"""관리자 콘솔 스키마."""
from __future__ import annotations

import datetime as dt

from app.schemas.common import CamelModel


class AdminUserOut(CamelModel):
    id: str
    email: str
    name: str
    plan: str
    status: str
    generations: int
    joined_at: dt.datetime
    last_active_at: dt.datetime | None = None


class TierChangeIn(CamelModel):
    plan: str  # Free | Pro | Team | Admin


class SuspendIn(CamelModel):
    suspend: bool
    reason: str = ""


class RefundResolveIn(CamelModel):
    approve: bool
    note: str = ""


class AnnouncementIn(CamelModel):
    title: str
    body: str = ""
    audience: list[str] = ["all"]
    priority: str = "normal"
    status: str = "Draft"
    starts_at: dt.datetime | None = None
    ends_at: dt.datetime | None = None


class AnnouncementOut(AnnouncementIn):
    id: str


class AuditLogOut(CamelModel):
    id: str
    actor: str
    action: str
    target: str
    ip: str | None = None
    severity: str
    at: dt.datetime


class FeedbackOut(CamelModel):
    id: str
    user_email: str
    category: str
    title: str
    body: str
    status: str
    admin_response: str | None = None
    created_at: dt.datetime


class FeedbackResolveIn(CamelModel):
    status: str
    admin_response: str = ""


class KpiOut(CamelModel):
    total_users: int
    active_users: int
    suspended_users: int
    total_projects: int
    generations_total: int
    pending_refunds: int
    open_feedback: int


class DailyPointOut(CamelModel):
    date: str
    generations: int
    failures: int
    ai_cost_cents: int
    signups: int


class StatsOut(CamelModel):
    """DB 가 실제로 아는 값만 집계한다 — 결제 연동 전에는 매출 계열이 0 이다."""

    range_days: int
    daily: list[DailyPointOut]
    plan_distribution: dict[str, int]
    mrr_cents: int
    paid_ratio: float
    arpu_cents: int
    error_rate: float
    ai_cost_total_cents: int
    payments_recorded: int


class HealthComponentOut(CamelModel):
    name: str
    status: str
    detail: str = ""
    latency_ms: int | None = None
