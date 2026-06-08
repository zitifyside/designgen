"""AI 생성 작업 모델 (4단계 파이프라인을 오케스트레이션)."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin, id_column

# 상태: Pending | Running | Done | Failed | Cancelled
# 단계:  InputAnalyzer | ConceptEngine | LayoutEngine | Renderer | Done


class Generation(Base, TimestampMixin):
    __tablename__ = "generations"

    id: Mapped[str] = id_column("gen")
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="Pending")
    stage: Mapped[str] = mapped_column(String(20), default="InputAnalyzer")
    progress: Mapped[int] = mapped_column(Integer, default=0)  # 0..100 (진행률)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

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
