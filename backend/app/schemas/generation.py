"""생성 작업 스키마."""
from __future__ import annotations

import datetime as dt

from pydantic import Field

from app.schemas.common import CamelModel
from app.schemas.project import ConceptBrief


class GenerationStart(CamelModel):
    # 선택적 오버라이드. 없으면 프로젝트에 저장된 값을 사용한다.
    requirements_text: str | None = None
    concepts: int | None = Field(default=None, ge=1, le=3)  # 컨셉 수 (플랜 상한 적용)
    variants: int | None = None  # 시안 수 3 | 5 (Free 는 3 고정)
    ds_mode: str | None = None  # per_concept | unified (unified 는 Pro 이상)
    target_screen: str | None = Field(default=None, max_length=60)
    target_screen_title: str | None = Field(default=None, max_length=120)
    concept_briefs: list[ConceptBrief] | None = None


class GenerationOut(CamelModel):
    id: str
    project_id: str
    kind: str
    status: str
    stage: str
    progress: int
    error: str | None = None
    is_warning: bool = False
    warning_reason: str | None = None
    retry_of_id: str | None = None
    free_retry_used: bool = False
    screen: str | None = None
    started_at: dt.datetime | None = None
    completed_at: dt.datetime | None = None
