"""프로젝트 스키마."""
from __future__ import annotations

import datetime as dt

from pydantic import Field

from app.schemas.common import CamelModel


class ProjectCreate(CamelModel):
    name: str = Field(min_length=1, max_length=200)
    requirements_text: str = Field(default="", max_length=10_000)
    platform: str = "Web"


class ProjectUpdate(CamelModel):
    name: str | None = None
    description: str | None = None
    platform: str | None = None
    status: str | None = None
    is_favorite: bool | None = None
    requirements_text: str | None = None


class ProjectOut(CamelModel):
    id: str
    owner_id: str
    name: str
    description: str
    platform: str
    status: str
    is_favorite: bool
    requirements_text: str
    created_at: dt.datetime
    updated_at: dt.datetime
    thumbnail_concept: str
    thumbnail_mockup: int
