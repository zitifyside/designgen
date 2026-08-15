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
    # 최근 1일·30일 안에 접속한 사용자 수 (기능정의서 §3.3 '핵심 지표 카드').
    dau: int = 0
    mau: int = 0
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


class LogEventOut(CamelModel):
    id: str
    event_id: str
    occurred_at: dt.datetime
    level: str
    tier: str
    kind: str
    message: str | None = None
    trace_id: str | None = None
    user_id: str | None = None
    user_email: str | None = None
    source: str | None = None
    method: str | None = None
    path: str | None = None
    status_code: int | None = None
    duration_ms: int | None = None
    payload: dict | None = None
    stack: str | None = None


class LogStatsOut(CamelModel):
    """운영 콘솔용 로그 요약. forwarder 는 허브 전송기 상태다."""

    range_hours: int
    total: int
    by_level: dict[str, int]
    top_kinds: list[dict]
    error_rate: float
    forwarder: dict


class AdminUserDetailOut(CamelModel):
    id: str
    email: str
    name: str
    plan: str
    status: str
    credits: int
    monthly_used: int
    monthly_limit: int
    email_verified: bool
    two_factor_enabled: bool
    is_admin: bool
    joined_at: dt.datetime
    last_active_at: dt.datetime | None = None
    locked_until: dt.datetime | None = None
    failed_login_attempts: int = 0
    deletion_requested_at: dt.datetime | None = None
    subscription: dict | None = None
    projects: list[dict] = []
    generations: dict = {}
    recent_activity: list[LogEventOut] = []
    sessions: int = 0
    api_keys: int = 0
