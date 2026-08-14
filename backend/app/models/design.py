"""디자인 시스템(토큰 세트) 및 목업 모델."""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin, id_column
from app.models.project import DS_MODE_PER_CONCEPT


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

    # 컨셉 확정 후 비확정 컨셉은 읽기 전용으로 보관한다 (기획서 v0.5.0 §7).
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    # DS 생성 방식. unified 모드는 Base DS 1벌을 참조하고 컨셉별 변주만 보관한다.
    ds_mode: Mapped[str] = mapped_column(String(20), default=DS_MODE_PER_CONCEPT)
    base_ds_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # unified 모드에서 Base 대비 덮어쓴 Token 경로 (예: {"color": {"secondary": ..}}).
    overridden_fields: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="design_systems")  # noqa: F821


class Mockup(Base, TimestampMixin):
    """단일 화면(screen)에 대한 구조 변형 시안 1종.

    시안은 서로 다른 화면의 집합이 아니라 **동일 화면의 레이아웃 구조 변형**이다
    (기획서 v0.5.0 §4 F-002). 따라서 screen 축과 index(변형 축)는 직교한다.
    """

    __tablename__ = "mockups"

    id: Mapped[str] = id_column("mk")
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    concept_label: Mapped[str] = mapped_column(String(1))  # 컨셉 라벨: A | B | C
    index: Mapped[int] = mapped_column(Integer, default=0)  # 구조 변형 인덱스 (0-based)

    # 화면 축 — 대표 화면 + 컨셉 확정 후 추가된 화면들.
    screen: Mapped[str] = mapped_column(String(60), default="landing")
    screen_title: Mapped[str] = mapped_column(String(120), default="랜딩")
    screen_order: Mapped[int] = mapped_column(Integer, default=0)

    # 렌더 아키타입: landing|login|dashboard|list|detail
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    variant_label: Mapped[str] = mapped_column(String(120), default="")

    # 선택적 렌더링 산출물 (이미지 URL / Figma 스타일 노드 트리).
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    node_tree: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Renderer 가 Image Gen 실패로 CSS Fallback 렌더링된 시안인지 여부.
    is_fallback: Mapped[bool] = mapped_column(Boolean, default=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped["Project"] = relationship(back_populates="mockups")  # noqa: F821
