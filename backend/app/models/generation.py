"""AI 생성 작업 모델 (4단계 파이프라인을 오케스트레이션)."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base
from app.core.codes import CodedStr
from app.models.base import AuditMixin, pk_column, public_id_column

GEN_KIND_FULL = "full"
GEN_KIND_SCREEN = "screen_add"


class Generation(Base, AuditMixin):
    __tablename__ = "trx_generation"
    __table_args__ = (
        Index("ix_trx_generation_user_status", "user_id", "status_cd", "created_at"),
    )

    pk: Mapped[int] = pk_column("generation_id")
    id: Mapped[str] = public_id_column("gen")
    project_id: Mapped[str] = mapped_column(
        ForeignKey("trx_project.public_id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column("kind_cd", String(20), default=GEN_KIND_FULL)
    status: Mapped[str] = mapped_column(
        "status_cd", CodedStr("GEN_STATUS"), default="Pending"
    )
    stage: Mapped[str] = mapped_column("stage_cd", String(20), default="InputAnalyzer")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column("error_desc", Text, nullable=True)

    is_warning: Mapped[bool] = mapped_column(Boolean, default=False)
    warning_reason: Mapped[str | None] = mapped_column(
        "warning_desc", String(200), nullable=True
    )
    retry_of_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    free_retry_used: Mapped[bool] = mapped_column(Boolean, default=False)
    screen: Mapped[str | None] = mapped_column("screen_cd", String(60), nullable=True)
    quota_bucket: Mapped[str | None] = mapped_column(
        "quota_bucket_cd", String(16), nullable=True
    )
    input_snapshot: Mapped[dict | None] = mapped_column(
        "input_snapshot_json", JSON, nullable=True
    )
    ai_cost_cents: Mapped[int] = mapped_column("ai_cost_amt", Integer, default=0)

    started_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    project: Mapped["Project"] = relationship(back_populates="generations")  # noqa: F821
