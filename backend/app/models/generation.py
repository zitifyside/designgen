"""AI 생성 작업 모델 (4단계 파이프라인을 오케스트레이션)."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin, id_column

# 상태: Pending | Running | Done | Failed | Cancelled
# 단계:  InputAnalyzer | ConceptEngine | LayoutEngine | Renderer | Done

# 생성 유형 (기획서 v0.5.0 §4)
GEN_KIND_FULL = "full"  # 전체 생성 — 4단계 파이프라인
GEN_KIND_SCREEN = "screen_add"  # 화면 추가 생성 — Layout Engine → Renderer 경량 2단계


class Generation(Base, TimestampMixin):
    __tablename__ = "generations"

    id: Mapped[str] = id_column("gen")
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(20), default=GEN_KIND_FULL)
    status: Mapped[str] = mapped_column(String(20), default="Pending")
    stage: Mapped[str] = mapped_column(String(20), default="InputAnalyzer")
    progress: Mapped[int] = mapped_column(Integer, default=0)  # 0..100 (진행률)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Renderer 가 Image Gen 3회 실패 후 CSS Fallback 으로 완료한 경우 (Completed (Warning)).
    # 월간 한도·크레딧 차감은 유지하되 동일 입력 [다시 시도] 1회를 무차감 제공한다.
    is_warning: Mapped[bool] = mapped_column(Boolean, default=False)
    warning_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # 무차감 재시도로 생성된 작업이면 원본 생성 ID 를 가리킨다.
    retry_of_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    free_retry_used: Mapped[bool] = mapped_column(Boolean, default=False)

    # 화면 추가 생성 대상 화면 (kind == screen_add 일 때만 채워진다).
    screen: Mapped[str | None] = mapped_column(String(60), nullable=True)

    # 요청 입력값 스냅샷 + 파이프라인이 단계별로 저장하는 산출물.
    input_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ai_cost_cents: Mapped[int] = mapped_column(Integer, default=0)

    started_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    project: Mapped["Project"] = relationship(back_populates="generations")  # noqa: F821
