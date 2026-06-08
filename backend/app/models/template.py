"""템플릿 마켓플레이스 모델."""
from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin, id_column


class Template(Base, TimestampMixin):
    __tablename__ = "templates"

    id: Mapped[str] = id_column("tpl")
    author_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    author_name: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(40))  # 카테고리: SaaS Dashboard|Ecommerce|Mobile App|Landing Page
    concept_name: Mapped[str] = mapped_column(String(120), default="")
    price: Mapped[int] = mapped_column(Integer, default=0)
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    downloads: Mapped[int] = mapped_column(Integer, default=0)
    tokens: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 마켓플레이스 검수 큐를 위한 리뷰 상태
    status: Mapped[str] = mapped_column(String(20), default="Approved")  # 상태: Pending|Approved|Rejected|RequestChanges


class TemplateReview(Base, TimestampMixin):
    __tablename__ = "template_reviews"

    id: Mapped[str] = id_column("trv")
    template_id: Mapped[str] = mapped_column(
        ForeignKey("templates.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    rating: Mapped[int] = mapped_column(Integer)  # 1..5 (평점)
    comment: Mapped[str] = mapped_column(Text, default="")


class TemplatePurchase(Base, TimestampMixin):
    __tablename__ = "template_purchases"

    id: Mapped[str] = id_column("tpu")
    template_id: Mapped[str] = mapped_column(
        ForeignKey("templates.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
