"""템플릿 마켓플레이스 모델."""
from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import AuditMixin, pk_column, public_id_column


class Template(Base, AuditMixin):
    __tablename__ = "mst_template"

    pk: Mapped[int] = pk_column("template_id")
    id: Mapped[str] = public_id_column("tpl")
    author_id: Mapped[str | None] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="SET NULL"), nullable=True
    )
    author_name: Mapped[str] = mapped_column("author_nm", String(120))
    name: Mapped[str] = mapped_column("template_nm", String(200))
    description: Mapped[str] = mapped_column("template_desc", Text, default="")
    category: Mapped[str] = mapped_column("category_cd", String(40))
    concept_name: Mapped[str] = mapped_column("concept_nm", String(120), default="")
    price: Mapped[int] = mapped_column("price_amt", Integer, default=0)
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    downloads: Mapped[int] = mapped_column("download_cnt", Integer, default=0)
    tokens: Mapped[dict | None] = mapped_column("token_json", JSON, nullable=True)
    status: Mapped[str] = mapped_column("status_cd", String(20), default="Approved")


class TemplateReview(Base, AuditMixin):
    __tablename__ = "trx_template_review"

    pk: Mapped[int] = pk_column("review_id")
    id: Mapped[str] = public_id_column("trv")
    template_id: Mapped[str] = mapped_column(
        ForeignKey("mst_template.public_id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column("comment_desc", Text, default="")


class TemplatePurchase(Base, AuditMixin):
    __tablename__ = "trx_template_purchase"

    pk: Mapped[int] = pk_column("purchase_id")
    id: Mapped[str] = public_id_column("tpu")
    template_id: Mapped[str] = mapped_column(
        ForeignKey("mst_template.public_id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
