"""프로젝트 모델."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin, id_column

# 플랫폼: Web | Mobile | Responsive | APP
# 상태:   Draft | InputReady | Generating | Completed | CompletedWarning
#         | ConceptLocked | Failed | Cancelled
#   - CompletedWarning : Renderer 3회 실패 후 CSS Fallback 으로 완료 (기획서 v0.5.0 §4 F-002)
#   - ConceptLocked    : 컨셉 확정 완료. 확정 DS 가 프로젝트의 단일 Token 원천이 된다.

# DS 생성 방식 (기획서 v0.5.0 §4 F-002)
DS_MODE_PER_CONCEPT = "per_concept"  # 컨셉별 DS 생성 — 기본값, 전체 등급
DS_MODE_UNIFIED = "unified"  # 단일 DS 통일 — Pro 이상 한정


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

    # 생성 옵션 스냅샷 (요건 입력 화면에서 확정된 값 — 기능정의서 v0.2.0 §4.1).
    concept_count: Mapped[int] = mapped_column(Integer, default=1)
    variant_count: Mapped[int] = mapped_column(Integer, default=3)
    ds_mode: Mapped[str] = mapped_column(String(20), default=DS_MODE_PER_CONCEPT)
    # 생성 화면: 미지정 시 Input Analyzer 가 추론하고 inferred=True 로 표기한다.
    target_screen: Mapped[str] = mapped_column(String(60), default="")
    target_screen_title: Mapped[str] = mapped_column(String(120), default="")
    target_screen_inferred: Mapped[bool] = mapped_column(Boolean, default=True)
    # 컨셉 직접 입력 모드의 사용자 지정 브리프 [{name, direction, keywords}, ...].
    # 비어 있으면 Concept Engine 이 요건 텍스트에서 컨셉을 자동 추출한다.
    concept_briefs: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # 컨셉 확정 (Concept Locked). design_systems 는 projects 를 참조하므로
    # 역방향 FK 제약을 걸면 순환 의존이 생긴다 — 값만 보관하고 정합은 서비스단에서 지킨다.
    confirmed_concept_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    confirmed_concept_label: Mapped[str | None] = mapped_column(String(1), nullable=True)
    locked_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

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
