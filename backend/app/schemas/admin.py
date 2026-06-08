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
