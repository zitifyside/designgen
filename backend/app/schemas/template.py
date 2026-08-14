"""템플릿 마켓플레이스 스키마."""
from __future__ import annotations

import datetime as dt

from pydantic import Field

from app.schemas.common import CamelModel


class TemplateOut(CamelModel):
    id: str
    name: str
    author_id: str | None = None
    author_name: str
    category: str
    price: int
    rating: float
    downloads: int
    description: str
    concept_name: str
    status: str
    created_at: dt.datetime


class TemplateCreate(CamelModel):
    name: str = Field(min_length=1, max_length=200)
    category: str
    description: str = ""
    concept_name: str = ""
    price: int = Field(default=0, ge=0)
    # 등록 시 현재 프로젝트의 확정 DS Token 을 자동 추출한다 (기능정의서 v0.2.0 §3.1).
    project_id: str | None = None
    concept_label: str | None = Field(default=None, max_length=1)


class TemplateReviewIn(CamelModel):
    rating: int = Field(ge=1, le=5)
    comment: str = ""


class TemplateModerateIn(CamelModel):
    status: str = Field(pattern="^(Approved|Rejected|RequestChanges)$")
    reason: str = Field(default="", max_length=500)
