"""결제 모델: 플랜, 구독, 크레딧 원장, 결제, 환불."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.codes import CodedStr
from app.core.database import Base
from app.core.money import IntCents
from app.models.base import AuditMixin, pk_column, public_id_column


class Plan(Base, AuditMixin):
    __tablename__ = "mst_plan"

    pk: Mapped[int] = pk_column("plan_id")
    id: Mapped[str] = public_id_column("plan")
    code: Mapped[str] = mapped_column("plan_cd", CodedStr("USER_PLAN"), unique=True)
    name: Mapped[str] = mapped_column("plan_nm", String(80))
    monthly_price_cents: Mapped[int] = mapped_column(IntCents(), default=0)
    annual_price_cents: Mapped[int] = mapped_column(IntCents(), default=0)
    monthly_generations: Mapped[int] = mapped_column(
        "monthly_generation_cnt", Integer, default=3
    )
    max_concepts: Mapped[int] = mapped_column("max_concept_cnt", Integer, default=1)
    max_variants: Mapped[int] = mapped_column("max_variant_cnt", Integer, default=3)
    credit_unit_cents: Mapped[int] = mapped_column(IntCents(), default=0)


class Subscription(Base, AuditMixin):
    __tablename__ = "trx_subscription"

    pk: Mapped[int] = pk_column("subscription_id")
    id: Mapped[str] = public_id_column("sub")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    plan_code: Mapped[str] = mapped_column("plan_cd", String(20))
    status: Mapped[str] = mapped_column("status_cd", String(20), default="active")
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    current_period_start: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_period_end: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancel_at_period_end: Mapped[bool] = mapped_column(
        "is_cancel_at_period_end", default=False
    )


class CreditTransaction(Base, AuditMixin):
    __tablename__ = "trx_credit"

    pk: Mapped[int] = pk_column("credit_id")
    id: Mapped[str] = public_id_column("ct")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column("type_cd", String(20))
    amount: Mapped[int] = mapped_column("credit_qty", Integer)
    balance_after: Mapped[int] = mapped_column("balance_qty", Integer, default=0)
    note: Mapped[str | None] = mapped_column("note_desc", String(255), nullable=True)
    expires_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Payment(Base, AuditMixin):
    __tablename__ = "trx_payment"

    pk: Mapped[int] = pk_column("payment_id")
    id: Mapped[str] = public_id_column("pay")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    amount_cents: Mapped[int] = mapped_column("amount_amt", IntCents())
    currency: Mapped[str] = mapped_column("currency_cd", String(8), default="krw")
    status: Mapped[str] = mapped_column("status_cd", String(20), default="pending")
    stripe_payment_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    invoice_url: Mapped[str | None] = mapped_column(String(512), nullable=True)


class Refund(Base, AuditMixin):
    __tablename__ = "trx_refund"

    pk: Mapped[int] = pk_column("refund_id")
    id: Mapped[str] = public_id_column("rf")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    payment_id: Mapped[str | None] = mapped_column(
        ForeignKey("trx_payment.public_id", ondelete="SET NULL"), nullable=True
    )
    amount_cents: Mapped[int] = mapped_column("amount_amt", IntCents())
    reason: Mapped[str] = mapped_column("reason_desc", Text, default="")
    status: Mapped[str] = mapped_column("status_cd", String(20), default="Pending")
    resolved_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
