"""디자인 시스템(토큰 세트) 및 목업 모델."""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin, id_column


class DesignSystem(Base, TimestampMixin):
    """프로젝트의 A/B/C 컨셉 토큰 세트 중 하나 (W3C DTCG 스타일 JSON)."""

    __tablename__ = "design_systems"

    id: Mapped[str] = id_column("ds")
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    concept_label: Mapped[str] = mapped_column(String(1))  # 컨셉 라벨: A | B | C
    concept_name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    tokens: Mapped[dict] = mapped_column(JSON, default=dict)
    is_modified: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped["Project"] = relationship(back_populates="design_systems")  # noqa: F821


class Mockup(Base, TimestampMixin):
    __tablename__ = "mockups"

    id: Mapped[str] = id_column("mk")
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    concept_label: Mapped[str] = mapped_column(String(1))  # 컨셉 라벨: A | B | C
    index: Mapped[int] = mapped_column(Integer, default=0)
    kind: Mapped[str] = mapped_column(String(20))  # 종류: landing|dashboard|pricing|signup|settings
    title: Mapped[str] = mapped_column(String(200))
    # 선택적 렌더링 산출물 (이미지 URL / Figma 스타일 노드 트리).
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    node_tree: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped["Project"] = relationship(back_populates="mockups")  # noqa: F821
