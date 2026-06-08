"""결제.

읽기 전용 엔드포인트(요금제, 현재 구독, 크레딧 잔액, 원장)는 DB를 대상으로
구현되어 있다. 금전이 오가는 모든 것 — Stripe 체크아웃, 크레딧 구매, 환불,
webhook — 은 의도적으로 비워 두었으며 501을 반환한다. 직접 Stripe 연동으로
채워 넣으면 된다. 영속화 모델은 app/models/billing.py에 이미 존재한다.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.models.billing import CreditTransaction, Plan, Subscription
from app.schemas.billing import (
    CheckoutIn,
    CreditBalanceOut,
    CreditPurchaseIn,
    CreditTransactionOut,
    PlanOut,
    RefundRequestIn,
    SubscriptionOut,
)

router = APIRouter(tags=["billing"])

_NOT_IMPLEMENTED = "Payment flow is not implemented yet (Stripe wiring is a stub)."


# ── 읽기 전용 (구현됨) ────────────────────────────────────────
@router.get("/plans", response_model=list[PlanOut])
async def list_plans(db: DbDep):
    rows = (await db.scalars(select(Plan).order_by(Plan.monthly_price_cents))).all()
    return [PlanOut.model_validate(p) for p in rows]


@router.get("/subscriptions/current", response_model=SubscriptionOut)
async def current_subscription(user: CurrentUser, db: DbDep):
    sub = await db.scalar(
        select(Subscription)
        .where(Subscription.user_id == user.id)
        .order_by(Subscription.created_at.desc())
    )
    if sub is None:
        # 기본값: 모든 사용자는 Stripe 구독 없이 최소한 자신의 요금제 코드를 가진다.
        return SubscriptionOut(plan_code=user.plan, status="active")
    return SubscriptionOut.model_validate(sub)


@router.get("/credits/balance", response_model=CreditBalanceOut)
async def credit_balance(user: CurrentUser):
    return CreditBalanceOut(credits=user.credits)


@router.get("/credits/transactions", response_model=list[CreditTransactionOut])
async def credit_transactions(user: CurrentUser, db: DbDep):
    rows = (
        await db.scalars(
            select(CreditTransaction)
            .where(CreditTransaction.user_id == user.id)
            .order_by(CreditTransaction.created_at.desc())
        )
    ).all()
    return [CreditTransactionOut.model_validate(t) for t in rows]


# ── 금전 이동 (스텁 → 501) ───────────────────────────────────
@router.post("/subscriptions/checkout")
async def checkout(body: CheckoutIn, user: CurrentUser):
    # TODO: Stripe Checkout Session을 생성하고 그 URL을 반환한다.
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_NOT_IMPLEMENTED)


@router.post("/subscriptions/cancel")
async def cancel_subscription(user: CurrentUser):
    # TODO: Stripe를 통해 cancel_at_period_end를 설정한다.
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_NOT_IMPLEMENTED)


@router.post("/credits/purchase")
async def purchase_credits(body: CreditPurchaseIn, user: CurrentUser):
    # TODO: Stripe로 결제한 뒤 CreditTransaction(type="purchase")을 추가한다.
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_NOT_IMPLEMENTED)


@router.post("/refunds/request")
async def request_refund(body: RefundRequestIn, user: CurrentUser):
    # TODO: 관리자 검토를 위해 Refund(status="Pending") 행을 생성한다.
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_NOT_IMPLEMENTED)


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    # TODO: Stripe-Signature를 검증한 뒤 checkout.session.completed,
    # invoice.paid, customer.subscription.updated, charge.failed 등을 처리한다.
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_NOT_IMPLEMENTED)
