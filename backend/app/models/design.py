"""디자인 시스템(토큰 세트) 및 목업 모델."""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.codes import CodedStr
from app.core.database import Base
from app.models.base import AuditMixin, pk_column, public_id_column
from app.models.project import DS_MODE_PER_CONCEPT


class DesignSystem(Base, AuditMixin):
    """프로젝트의 A/B/C 컨셉 토큰 세트 중 하나 (W3C DTCG 스타일 JSON)."""

    __tablename__ = "trx_design_system"

    pk: Mapped[int] = pk_column("design_system_id")
    id: Mapped[str] = public_id_column("ds")
    project_id: Mapped[str] = mapped_column(
        ForeignKey("trx_project.public_id", ondelete="CASCADE"), index=True
    )
    concept_label: Mapped[str] = mapped_column(String(1))
    concept_name: Mapped[str] = mapped_column("concept_nm", String(120))
    description: Mapped[str] = mapped_column("concept_desc", Text, default="")
    tokens: Mapped[dict] = mapped_column("token_json", JSON, default=dict)
    is_modified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    ds_mode: Mapped[str] = mapped_column(
        "ds_mode_cd", CodedStr("DS_MODE", length=20), default=DS_MODE_PER_CONCEPT
    )
    base_ds_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    overridden_fields: Mapped[dict | None] = mapped_column(
        "overridden_field_json", JSON, nullable=True
    )

    project: Mapped["Project"] = relationship(back_populates="design_systems")  # noqa: F821


class Mockup(Base, AuditMixin):
    """단일 화면(screen)에 대한 구조 변형 시안 1종."""

    __tablename__ = "trx_mockup"

    pk: Mapped[int] = pk_column("mockup_id")
    id: Mapped[str] = public_id_column("mk")
    project_id: Mapped[str] = mapped_column(
        ForeignKey("trx_project.public_id", ondelete="CASCADE"), index=True
    )
    concept_label: Mapped[str] = mapped_column(String(1))
    index: Mapped[int] = mapped_column(Integer, default=0)
    screen: Mapped[str] = mapped_column("screen_cd", String(60), default="main")
    screen_title: Mapped[str] = mapped_column("screen_nm", String(120), default="메인")
    screen_order: Mapped[int] = mapped_column(Integer, default=0)
    kind: Mapped[str] = mapped_column("kind_cd", CodedStr("MOCKUP_KIND", length=20))
    title: Mapped[str] = mapped_column("title_nm", String(200))
    variant_label: Mapped[str] = mapped_column("variant_nm", String(120), default="")
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    node_tree: Mapped[dict | None] = mapped_column(
        "node_tree_json", JSON, nullable=True
    )
    is_fallback: Mapped[bool] = mapped_column(Boolean, default=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped["Project"] = relationship(back_populates="mockups")  # noqa: F821
