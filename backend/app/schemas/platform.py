"""Export 이력·API Key·팀 스키마."""
from __future__ import annotations

import datetime as dt

from pydantic import EmailStr, Field

from app.schemas.common import CamelModel


class ExportCreate(CamelModel):
    format: str = Field(pattern="^(png|fig|json|css)$")
    scope: str = Field(default="current", pattern="^(current|concept|all)$")
    resolution: str | None = Field(default=None, pattern="^(1x|2x|3x)$")
    concept_label: str | None = Field(default=None, max_length=1)
    screen: str | None = Field(default=None, max_length=60)


class ExportOut(CamelModel):
    id: str
    project_id: str
    project_name: str
    format: str
    scope: str
    resolution: str | None = None
    watermark: bool
    size_bytes: int
    download_url: str
    created_at: dt.datetime
    expires_at: dt.datetime


class ApiKeyCreate(CamelModel):
    label: str = Field(min_length=1, max_length=120)


class ApiKeyOut(CamelModel):
    id: str
    label: str
    prefix: str
    last_used_at: dt.datetime | None = None
    call_count: int
    revoked: bool
    created_at: dt.datetime


class ApiKeyIssued(ApiKeyOut):
    """발급 직후 1회만 평문 키를 반환한다."""

    key: str


class TeamCreate(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)


class TeamMemberInvite(CamelModel):
    email: EmailStr
    name: str = Field(default="", max_length=120)
    role: str = Field(default="Member", pattern="^(Admin|Member)$")


class TeamMemberRoleUpdate(CamelModel):
    role: str = Field(pattern="^(Admin|Member)$")


class TeamMemberOut(CamelModel):
    id: str
    email: str
    name: str
    role: str
    status: str
    created_at: dt.datetime


class TeamOut(CamelModel):
    id: str
    name: str
    description: str
    owner_id: str
    seat_limit: int
    seats_used: int
    my_role: str
    members: list[TeamMemberOut] = []
