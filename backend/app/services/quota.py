"""생성 쿼터·등급 게이팅 및 크레딧 차감.

차감 우선순위 (서비스 정책 기준):
  1. 월간 무료 제공량 (플랜별 3 / 30 / 무제한)
  2. 구매한 크레딧
  3. 둘 다 소진 → 차단 (402)

생성 유형(전체 생성·화면 추가 생성)은 v1.0 에서 균일 1회로 차감한다
(기획서 v0.5.0 §4 F-002 제약사항 — 차등 단가는 v2.0 검토).
"""
from __future__ import annotations

from fastapi import HTTPException, status

from app.models.billing import CreditTransaction
from app.models.project import DS_MODE_PER_CONCEPT, DS_MODE_UNIFIED
from app.models.user import User

# plan → (monthly_generations[-1=무제한], max_concepts, allowed_variants)
PLAN_LIMITS: dict[str, tuple[int, int, tuple[int, ...]]] = {
    "Free": (3, 1, (3,)),
    "Pro": (30, 3, (3, 5)),
    "Team": (-1, 3, (3, 5)),
    "Admin": (-1, 3, (3, 5)),
}

# 단일 DS 통일 모드는 Pro 이상 한정 (기획서 v0.5.0 §4 F-002).
UNIFIED_DS_PLANS = ("Pro", "Team", "Admin")

# 화면 추가 생성의 구조 변형은 3종 고정 (시안 수 선택 미적용).
SCREEN_ADD_VARIANTS = 3


def plan_limits(plan: str) -> tuple[int, int, tuple[int, ...]]:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["Free"])


def cap_concepts(plan: str, requested: int | None) -> int:
    _, max_concepts, _ = plan_limits(plan)
    if requested is None:
        return max_concepts
    return max(1, min(requested, max_concepts))


def variants_for(plan: str, requested: int | None = None) -> int:
    """시안 수를 확정한다 — Pro·Team 은 3/5 선택, Free 는 3 고정."""
    allowed = plan_limits(plan)[2]
    if requested is None:
        return allowed[0]
    return requested if requested in allowed else allowed[0]


def ds_mode_for(plan: str, requested: str | None) -> str:
    """DS 생성 방식을 확정한다. unified 는 Pro 이상만 허용하며 위반 시 403."""
    if requested in (None, "", DS_MODE_PER_CONCEPT):
        return DS_MODE_PER_CONCEPT
    if requested != DS_MODE_UNIFIED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown ds_mode: {requested}",
        )
    if plan not in UNIFIED_DS_PLANS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="'단일 DS 통일' 모드는 Pro 이상 등급에서만 선택할 수 있습니다.",
        )
    return DS_MODE_UNIFIED


def require_plan(user: User, plans: tuple[str, ...], feature: str) -> None:
    """등급 게이팅 공통 가드."""
    if user.plan not in plans:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{feature} 기능은 {plans[0]} 이상 등급에서 사용할 수 있습니다.",
        )


async def consume_generation(db, user: User, *, note: str = "generation") -> None:
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
                note=note,
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
