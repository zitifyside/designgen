"""생성 쿼터 및 크레딧 차감.

차감 우선순위 (서비스 정책 기준):
  1. 월간 무료 제공량 (플랜별 3 / 30 / 무제한)
  2. 구매한 크레딧
  3. 둘 다 소진 → 차단 (402)
"""
from __future__ import annotations

from fastapi import HTTPException, status

from app.models.billing import CreditTransaction
from app.models.user import User

# plan → (monthly_generations[-1=무제한], max_concepts, max_variants)
PLAN_LIMITS = {
    "Free": (3, 1, 3),
    "Pro": (30, 3, 5),
    "Team": (-1, 3, 5),
    "Admin": (-1, 3, 5),
}


def plan_limits(plan: str) -> tuple[int, int, int]:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["Free"])


def cap_concepts(plan: str, requested: int | None) -> int:
    _, max_concepts, _ = plan_limits(plan)
    if requested is None:
        return max_concepts
    return max(1, min(requested, max_concepts))


def variants_for(plan: str) -> int:
    return plan_limits(plan)[2]


async def consume_generation(db, user: User) -> None:
    """`user`에 대해 생성 1회를 예약하거나 402/403을 발생시킨다.

    감싸는 트랜잭션의 커밋은 호출자가 책임진다.
    """
    monthly_limit, _, _ = plan_limits(user.plan)

    # 무제한 플랜: 사용량만 기록한다.
    if monthly_limit == -1:
        user.monthly_used += 1
        return

    # 1) 월간 무료 제공량.
    if user.monthly_used < monthly_limit:
        user.monthly_used += 1
        return

    # 2) 구매한 크레딧.
    if user.credits > 0:
        user.credits -= 1
        db.add(
            CreditTransaction(
                user_id=user.id,
                type="consumption",
                amount=-1,
                balance_after=user.credits,
                note="generation",
            )
        )
        return

    # 3) 차단.
    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail="Monthly generation limit reached and no credits left. "
        "Purchase credits or upgrade your plan.",
    )


def refund_generation(user: User) -> None:
    """취소/실패 시 생성 1회를 되돌린다 (가장 저렴한 버킷부터)."""
    if user.monthly_used > 0:
        user.monthly_used -= 1
    else:
        user.credits += 1
