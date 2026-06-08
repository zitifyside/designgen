"""생성 작업 스키마."""
from __future__ import annotations

import datetime as dt

from app.schemas.common import CamelModel


class GenerationStart(CamelModel):
    # 선택적 오버라이드. 없으면 프로젝트에 저장된 요구사항을 사용한다.
    requirements_text: str | None = None
    concepts: int | None = None  # 생성할 컨셉 수 (플랜 상한 적용)


class GenerationOut(CamelModel):
    id: str
    project_id: str
    status: str
    stage: str
    progress: int
    error: str | None = None
    started_at: dt.datetime | None = None
    completed_at: dt.datetime | None = None
