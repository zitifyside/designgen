"""결제 스키마. Stripe 연동 흐름은 현재 라우트에서 501을 반환한다."""
from __future__ import annotations

import datetime as dt

from app.schemas.common import CamelModel


class PlanOut(CamelModel):
    code: str
    name: str
    monthly_price_cents: int
    annual_price_cents: int
    monthly_generations: int
    max_concepts: int
    max_variants: int
    credit_unit_cents: int


class SubscriptionOut(CamelModel):
    plan_code: str
    status: str
    current_period_end: dt.datetime | None = None
    cancel_at_period_end: bool = False


class CreditBalanceOut(CamelModel):
    credits: int


class CreditTransactionOut(CamelModel):
    id: str
    type: str
    amount: int
    balance_after: int
    note: str | None = None
    created_at: dt.datetime


class CheckoutIn(CamelModel):
    plan_code: str
    interval: str = "monthly"  # monthly | annual


class CreditPurchaseIn(CamelModel):
    quantity: int  # 추가로 구매할 생성 횟수


class RefundRequestIn(CamelModel):
    payment_id: str | None = None
    amount_cents: int
    reason: str = ""
