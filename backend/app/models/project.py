"""프로젝트 모델."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base
from app.core.codes import CodedStr
from app.models.base import AuditMixin, pk_column, public_id_column

DS_MODE_PER_CONCEPT = "per_concept"
DS_MODE_UNIFIED = "unified"


class Project(Base, AuditMixin):
    __tablename__ = "trx_project"
    __table_args__ = (
        Index("ix_trx_project_owner_status", "owner_id", "status_cd", "deleted_at"),
    )

    pk: Mapped[int] = pk_column("project_id")
    id: Mapped[str] = public_id_column("p")
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column("project_nm", String(200))
    description: Mapped[str] = mapped_column("project_desc", String(500), default="")
    platform: Mapped[str] = mapped_column("platform_cd", String(20), default="Web")
    status: Mapped[str] = mapped_column(
        "status_cd", CodedStr("PROJECT_STATUS"), default="Draft"
    )
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    requirements_text: Mapped[str] = mapped_column(Text, default="")

    concept_count: Mapped[int] = mapped_column("concept_cnt", Integer, default=1)
    variant_count: Mapped[int] = mapped_column("variant_cnt", Integer, default=3)
    ds_mode: Mapped[str] = mapped_column(
        "ds_mode_cd", String(20), default=DS_MODE_PER_CONCEPT
    )
    target_screen: Mapped[str] = mapped_column("target_screen_cd", String(60), default="")
    target_screen_title: Mapped[str] = mapped_column(
        "target_screen_nm", String(120), default=""
    )
    target_screen_inferred: Mapped[bool] = mapped_column(Boolean, default=True)
    concept_briefs: Mapped[list | None] = mapped_column(
        "concept_brief_json", JSON, nullable=True
    )

    confirmed_concept_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    confirmed_concept_label: Mapped[str | None] = mapped_column(String(1), nullable=True)
    locked_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    thumbnail_concept: Mapped[str] = mapped_column(String(1), default="A")
    thumbnail_mockup: Mapped[int] = mapped_column(default=0)

    design_systems: Mapped[list["DesignSystem"]] = relationship(  # noqa: F821
        back_populates="project", cascade="all, delete-orphan"
    )
    mockups: Mapped[list["Mockup"]] = relationship(  # noqa: F821
        back_populates="project", cascade="all, delete-orphan"
    )
    generations: Mapped[list["Generation"]] = relationship(  # noqa: F821
        back_populates="project", cascade="all, delete-orphan"
    )
