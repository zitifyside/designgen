"""알림 스키마."""
from __future__ import annotations

import datetime as dt

from app.schemas.common import CamelModel


class NotificationOut(CamelModel):
    id: str
    category: str
    title: str
    body: str
    read: bool
    created_at: dt.datetime
    href: str | None = None
