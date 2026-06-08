"""결제 모델: 플랜, 구독, 크레딧 원장, 결제, 환불.

참고: Stripe 연동(체크아웃, 웹훅, 환불 실행)은 의도적으로
app/services/billing_service.py와 결제 라우트에 스텁으로 남겨 두었다.
이 모델들은 영속화 구조를 정의하여 추후 연동을 채워 넣을 수 있도록 한다.
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, id_column


class Plan(Base, TimestampMixin):
    __tablename__ = "plans"

    id: Mapped[str] = id_column("plan")
    code: Mapped[str] = mapped_column(String(20), unique=True)  # 코드: Free|Pro|Team
    name: Mapped[str] = mapped_column(String(80))
    monthly_price_cents: Mapped[int] = mapped_column(Integer, default=0)
    annual_price_cents: Mapped[int] = mapped_column(Integer, default=0)
    monthly_generations: Mapped[int] = mapped_column(Integer, default=3)  # -1 = 무제한
    max_concepts: Mapped[int] = mapped_column(Integer, default=1)
    max_variants: Mapped[int] = mapped_column(Integer, default=3)
    credit_unit_cents: Mapped[int] = mapped_column(Integer, default=0)  # 추가 생성당 가격


class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"

    id: Mapped[str] = id_column("sub")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    plan_code: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="active")  # 상태: active|past_due|paused|cancelled
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    current_period_start: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_period_end: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancel_at_period_end: Mapped[bool] = mapped_column(default=False)


class CreditTransaction(Base, TimestampMixin):
    __tablename__ = "credit_transactions"

    id: Mapped[str] = id_column("ct")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # 유형: purchase | consumption | refund | bonus
    type: Mapped[str] = mapped_column(String(20))
    amount: Mapped[int] = mapped_column(Integer)  # +크레딧 / -크레딧
    balance_after: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expires_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"

    id: Mapped[str] = id_column("pay")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(8), default="krw")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    stripe_payment_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    invoice_url: Mapped[str | None] = mapped_column(String(512), nullable=True)


class Refund(Base, TimestampMixin):
    __tablename__ = "refunds"

    id: Mapped[str] = id_column("rf")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    payment_id: Mapped[str | None] = mapped_column(
        ForeignKey("payments.id", ondelete="SET NULL"), nullable=True
    )
    amount_cents: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="Pending")  # 상태: Pending|Approved|Rejected
    resolved_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
