"""SCD Type 2 이력 (DA 이력관리.md) — 플랜 단가·사용자 등급."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.money import IntCents
from app.models.base import TimestampMixin, pk_column, public_id_column


class PlanHist(Base, TimestampMixin):
    __tablename__ = "log_plan_hist"

    pk: Mapped[int] = pk_column("hist_id")
    id: Mapped[str] = public_id_column("ph")
    plan_public_id: Mapped[str] = mapped_column(String(40), index=True)
    plan_cd: Mapped[str] = mapped_column(String(10))
    plan_nm: Mapped[str] = mapped_column(String(80))
    monthly_price_cents: Mapped[int] = mapped_column("monthly_price_amt", IntCents(), default=0)
    annual_price_cents: Mapped[int] = mapped_column("annual_price_amt", IntCents(), default=0)
    monthly_generations: Mapped[int] = mapped_column(
        "monthly_generation_cnt", Integer, default=3
    )
    max_concepts: Mapped[int] = mapped_column("max_concept_cnt", Integer, default=1)
    max_variants: Mapped[int] = mapped_column("max_variant_cnt", Integer, default=3)
    credit_unit_cents: Mapped[int] = mapped_column("credit_unit_amt", IntCents(), default=0)
    valid_from_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    valid_to_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    change_reason_cd: Mapped[str | None] = mapped_column(String(10), nullable=True)


class UserHist(Base, TimestampMixin):
    __tablename__ = "log_user_hist"

    pk: Mapped[int] = pk_column("hist_id")
    id: Mapped[str] = public_id_column("uh")
    user_public_id: Mapped[str] = mapped_column(String(40), index=True)
    user_nm: Mapped[str] = mapped_column(String(120), default="", server_default="")
    plan_cd: Mapped[str] = mapped_column(String(20))
    status_cd: Mapped[str] = mapped_column(String(20))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    monthly_limit_cnt: Mapped[int] = mapped_column(Integer, default=3, server_default="3")
    language_cd: Mapped[str] = mapped_column(
        String(8), default="ko", server_default="ko"
    )
    theme_cd: Mapped[str] = mapped_column(
        String(8), default="system", server_default="system"
    )
    valid_from_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    valid_to_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    change_reason_cd: Mapped[str | None] = mapped_column(String(10), nullable=True)
