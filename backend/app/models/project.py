"""프로젝트 모델."""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, id_column

# 플랫폼: Web | Mobile | Responsive | APP
# 상태:   Draft | InputReady | Generating | Completed | Failed | Cancelled


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[str] = id_column("p")
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(String(500), default="")
    platform: Mapped[str] = mapped_column(String(20), default="Web")
    status: Mapped[str] = mapped_column(String(20), default="Draft")
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    requirements_text: Mapped[str] = mapped_column(Text, default="")

    # 썸네일 포인터 (컨셉 라벨 + 목업 인덱스), 프론트엔드 모델과 동일.
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
