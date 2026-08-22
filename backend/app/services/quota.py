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

from app.core.observability import log_event
from app.models.billing import CreditTransaction
from app.models.project import DS_MODE_PER_CONCEPT, DS_MODE_UNIFIED
from app.models.user import User

# plan → (monthly_generations[-1=무제한], max_concepts, allowed_variants)
PLAN_LIMITS: dict[str, tuple[int, int, tuple[int, ...]]] = {
    "Free": (3, 1, (3,)),
    "Pro": (30, 3, (3, 6)),
    "Team": (-1, 3, (3, 6)),
    "Admin": (-1, 3, (3, 6)),
}

# 단일 DS 통일 모드는 Pro 이상 한정 (기획서 v0.5.0 §4 F-002).
UNIFIED_DS_PLANS = ("Pro", "Team", "Admin")

# 화면 추가 생성의 구조 변형은 3종 고정 (시안 수 선택 미적용).
SCREEN_ADD_VARIANTS = 3

QUOTA_MONTHLY = "monthly"
QUOTA_CREDIT = "credit"
QUOTA_UNLIMITED = "unlimited"


def plan_limits(plan: str) -> tuple[int, int, tuple[int, ...]]:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["Free"])


def cap_concepts(plan: str, requested: int | None) -> int:
    _, max_concepts, _ = plan_limits(plan)
    if requested is None:
        return max_concepts
    return max(1, min(requested, max_concepts))


def variants_for(plan: str, requested: int | None = None) -> int:
    """시안 수를 확정한다 — Pro·Team 은 3/6 선택, Free 는 3 고정.

    한 방향(컨셉)당 뽑는 완성 페이지 시안의 개수다.
    """
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


async def consume_generation(db, user: User, *, note: str = "generation") -> str:
    """`user`에 대해 생성 1회를 예약하거나 402/403을 발생시킨다.

    깎은 버킷 이름을 돌려준다. 환불은 그 이름을 그대로 넘긴다.
    감싸는 트랜잭션의 커밋은 호출자가 책임진다.
    """
    from app.core.identity import get_pub

    locked = await get_pub(db, type(user), user.id, for_update=True)
    if locked is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.monthly_used = locked.monthly_used
    user.credits = locked.credits
    user.plan = locked.plan

    monthly_limit, _, _ = plan_limits(user.plan)

    # 무제한 플랜: 사용량만 기록한다.
    if monthly_limit == -1:
        user.monthly_used += 1
        return QUOTA_UNLIMITED

    # 1) 월간 무료 제공량.
    if user.monthly_used < monthly_limit:
        user.monthly_used += 1
        return QUOTA_MONTHLY

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
        return QUOTA_CREDIT

    # 3) 차단.
    log_event(
        kind="quota.exhausted",
        level="warn",
        message="월간 한도·크레딧 소진으로 생성 차단",
        user_id=user.id,
        payload={"plan": user.plan, "monthlyUsed": user.monthly_used, "credits": user.credits},
    )
    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail="Monthly generation limit reached and no credits left. "
        "Purchase credits or upgrade your plan.",
    )


def refund_generation(user: User, bucket: str | None = None, db=None) -> None:
    """취소/실패 시 생성 1회를 그 때 깎은 버킷으로 되돌린다."""
    if bucket == QUOTA_CREDIT:
        user.credits += 1
        if db is not None:
            db.add(
                CreditTransaction(
                    user_id=user.id,
                    type="refund",
                    amount=1,
                    balance_after=user.credits,
                    note="generation_refund",
                )
            )
        return
    if bucket == QUOTA_UNLIMITED:
        if user.monthly_used > 0:
            user.monthly_used -= 1
        return
    # monthly 또는 구 데이터(버킷 없음) — 월간을 우선 되돌린다.
    # 구 데이터에서 크레딧을 깎았다면 월한이 차 있으므로 monthly_used>0 이다.
    # 그 경우 월간을 되돌리면 한 칸이 생긴다. 버킷을 모르면 그 편이
    # 크레딧을 유령 지급하는 것보다 안전하다. 신규 건은 버킷이 있다.
    if user.monthly_used > 0:
        user.monthly_used -= 1
        return
    user.credits += 1
    if db is not None:
        db.add(
            CreditTransaction(
                user_id=user.id,
                type="refund",
                amount=1,
                balance_after=user.credits,
                note="generation_refund",
            )
        )
