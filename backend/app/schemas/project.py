"""프로젝트 스키마."""
from __future__ import annotations

import datetime as dt

from pydantic import Field

from app.schemas.common import CamelModel


class ConceptBrief(CamelModel):
    """컨셉 직접 입력 모드에서 User 가 지정하는 컨셉 방향성."""

    name: str = Field(default="", max_length=60)
    direction: str = Field(default="", max_length=400)
    keywords: str = Field(default="", max_length=120)


class ProjectCreate(CamelModel):
    # 임시저장은 필수값을 강제하지 않는다. 빈 이름은 서버가 자리표시로 채운다.
    name: str = Field(default="", max_length=200)
    requirements_text: str = Field(default="", max_length=10_000)
    platform: str = "Web"
    # 요건 입력 화면에서 확정되는 생성 옵션 (기능정의서 v0.2.0 §4.1).
    concept_count: int | None = Field(default=None, ge=1, le=3)
    variant_count: int | None = Field(default=None)  # 방향당 시안 수: 3 | 6
    ds_mode: str | None = None  # per_concept | unified
    target_screen: str | None = Field(default=None, max_length=60)
    target_screen_title: str | None = Field(default=None, max_length=120)
    concept_briefs: list[ConceptBrief] | None = None


class ProjectUpdate(CamelModel):
    name: str | None = None
    description: str | None = None
    platform: str | None = None
    is_favorite: bool | None = None
    requirements_text: str | None = None
    concept_count: int | None = None
    variant_count: int | None = None
    ds_mode: str | None = None
    target_screen: str | None = None
    target_screen_title: str | None = None
    concept_briefs: list[ConceptBrief] | None = None


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

    concept_count: int
    variant_count: int
    ds_mode: str
    target_screen: str
    target_screen_title: str
    target_screen_inferred: bool
    concept_briefs: list[ConceptBrief] | None = None
    confirmed_concept_id: str | None = None
    confirmed_concept_label: str | None = None
    locked_at: dt.datetime | None = None
    # 목록 카드용 대표 컬러 (확정 컨셉 우선). DS 미생성 프로젝트는 빈 배열이다.
    thumbnail_colors: list[str] = []


class ConceptConfirmIn(CamelModel):
    concept_label: str = Field(min_length=1, max_length=1)


class ScreenAddIn(CamelModel):
    """화면 추가 생성 요청 (기획서 v0.5.0 §4 '화면 추가 생성')."""

    screen: str = Field(min_length=1, max_length=60)
    screen_title: str | None = Field(default=None, max_length=120)
    description: str = Field(default="", max_length=1_000)


class ScreenOut(CamelModel):
    screen: str
    screen_title: str
    order: int
    variant_count: int
    is_primary: bool
