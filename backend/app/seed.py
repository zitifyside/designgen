"""플랜, 데모 사용자, 관리자 사용자, 그리고 몇 가지 템플릿을 시드합니다.

실행 방법:  python -m app.seed
멱등성 보장: 반복 실행해도 안전합니다 (자연 키 기준으로 upsert).
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.codes import CODE_MAP
from app.core.config import settings
from app.core.database import AsyncSessionLocal, init_db
from app.core.security import hash_password
from app.models.billing import Plan
from app.models.code import CodeCommon, CodeGroup
from app.models.template import Template
from app.models.user import Session, User

# code_value = C010101, code_nm = API 문자열 (DA 코드테이블.md)
_CODE_GROUP_NM = {
    "USER_PLAN": "사용자 등급",
    "USER_STATUS": "사용자 상태",
    "PROJECT_STATUS": "프로젝트 상태",
    "GEN_STATUS": "생성 작업 상태",
}
CODE_GROUPS = [
    (
        group_cd,
        _CODE_GROUP_NM[group_cd],
        [(code, api, i) for i, (api, code) in enumerate(mapping.items(), start=1)],
    )
    for group_cd, mapping in CODE_MAP.items()
]

# 문서·로그인 화면에 적혀 있던 데모 계정. 운영에서는 만들지도, 받지도 않는다.
SEED_ACCOUNT_EMAILS = frozenset(
    {"demo@designgenerator.io", "admin@designgenerator.io"}
)

PLANS = [
    # code, name, monthly_cents, annual_cents, gens(-1=무제한), concepts, variants, credit_unit_cents
    # 단가는 USD 센트 기준 — 서비스정책서 9장 (Pro $19/월·연 $190, Team $49/월·연 $490)
    ("Free", "Free", 0, 0, 3, 1, 3, 0),
    ("Pro", "Pro", 1_900, 19_000, 30, 3, 5, 50),
    ("Team", "Team", 4_900, 49_000, -1, 3, 5, 30),
]

TEMPLATES = [
    ("Lux Banking UI", "Fintech Studio", "SaaS Dashboard", 39, 4.8, 1240, "프리미엄 핀테크 대시보드", "Trust Blue"),
    ("Outdoor Marketplace", "Nine Studio", "Ecommerce", 25, 4.6, 880, "아웃도어 커머스 랜딩", "Earthy Warm"),
    ("Pastel Health App", "Solo.io", "Mobile App", 0, 4.9, 3100, "헬스케어 모바일 UI", "Soft Pastel"),
    ("Bold Launch Page", "BigCo", "Landing Page", 15, 4.4, 620, "임팩트 있는 제품 출시 랜딩", "Bold Vibrant"),
]


async def seed() -> None:
    await init_db()
    async with AsyncSessionLocal() as db:
        for group_cd, group_nm, codes in CODE_GROUPS:
            group = await db.scalar(select(CodeGroup).where(CodeGroup.group_cd == group_cd))
            if group is None:
                db.add(CodeGroup(group_cd=group_cd, group_nm=group_nm))
            for value, nm, order in codes:
                row = await db.scalar(
                    select(CodeCommon).where(
                        CodeCommon.group_cd == group_cd,
                        CodeCommon.code_value == value,
                    )
                )
                if row is None:
                    db.add(
                        CodeCommon(
                            group_cd=group_cd,
                            code_value=value,
                            code_nm=nm,
                            sort_order=order,
                        )
                    )

        # 플랜
        for code, name, m, a, gens, concepts, variants, unit in PLANS:
            plan = await db.scalar(select(Plan).where(Plan.code == code))
            if plan is None:
                db.add(
                    Plan(
                        code=code, name=name, monthly_price_cents=m, annual_price_cents=a,
                        monthly_generations=gens, max_concepts=concepts,
                        max_variants=variants, credit_unit_cents=unit,
                    )
                )
            else:
                # 재실행 시 기존 행도 표준 값으로 갱신한다 (구 시드의 원화값 오저장 정정 포함).
                plan.name = name
                plan.monthly_price_cents = m
                plan.annual_price_cents = a
                plan.monthly_generations = gens
                plan.max_concepts = concepts
                plan.max_variants = variants
                plan.credit_unit_cents = unit

        # 데모·관리자 계정은 로컬·테스트에서만 채운다.
        # 운영에 올리면 문서에 적힌 비밀번호로 관리자 콘솔이 열린다.
        if settings.environment != "production":
            if await db.scalar(select(User).where(User.email == "demo@designgenerator.io")) is None:
                db.add(
                    User(
                        email="demo@designgenerator.io", name="안승준",
                        password_hash=hash_password("demo1234"), plan="Pro",
                        credits=78, monthly_used=12, monthly_limit=30, email_verified=True,
                    )
                )

            if await db.scalar(select(User).where(User.email == "admin@designgenerator.io")) is None:
                db.add(
                    User(
                        email="admin@designgenerator.io", name="Admin",
                        password_hash=hash_password("admin1234"), plan="Admin",
                        is_admin=True, monthly_limit=-1, email_verified=True,
                    )
                )

        # 템플릿
        for name, author, cat, price, rating, downloads, desc, concept in TEMPLATES:
            if await db.scalar(select(Template).where(Template.name == name)) is None:
                db.add(
                    Template(
                        name=name, author_name=author, category=cat, price=price,
                        rating=rating, downloads=downloads, description=desc,
                        concept_name=concept, status="Approved",
                    )
                )

        await db.commit()
    if settings.environment == "production":
        print("Seed complete — production (plans/templates only, no demo accounts)")
    else:
        print("Seed complete — demo@designgenerator.io / demo1234, admin@designgenerator.io / admin1234")


async def lock_published_seed_accounts() -> int:
    """운영에 남아 있는 공개 시드 계정을 정지하고 세션을 폐기한다.

    콜드 스타트 전 이미 떠 있는 인스턴스의 JWT 를 즉시 무효로 만든다.
    """
    if settings.environment != "production":
        return 0
    locked = 0
    async with AsyncSessionLocal() as db:
        rows = (
            await db.scalars(select(User).where(User.email.in_(tuple(SEED_ACCOUNT_EMAILS))))
        ).all()
        for user in rows:
            user.status = "Suspended"
            sessions = (
                await db.scalars(select(Session).where(Session.user_id == user.id))
            ).all()
            for session in sessions:
                session.revoked = True
            locked += 1
        if locked:
            await db.commit()
    return locked


if __name__ == "__main__":
    asyncio.run(seed())
