"""플랜, 데모 사용자, 관리자 사용자, 그리고 몇 가지 템플릿을 시드합니다.

실행 방법:  python -m app.seed
멱등성 보장: 반복 실행해도 안전합니다 (자연 키 기준으로 upsert).
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal, init_db
from app.core.security import hash_password
from app.models.billing import Plan
from app.models.template import Template
from app.models.user import User

PLANS = [
    # code, name, monthly_cents, annual_cents, gens(-1=무제한), concepts, variants, credit_unit_cents
    ("Free", "Free", 0, 0, 3, 1, 3, 0),
    ("Pro", "Pro", 2_600_000 // 100, 0, 30, 3, 5, 50),
    ("Team", "Team", 6_700_000 // 100, 0, -1, 3, 5, 30),
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

        # 데모 (Pro) 사용자
        if await db.scalar(select(User).where(User.email == "demo@designgenerator.io")) is None:
            db.add(
                User(
                    email="demo@designgenerator.io", name="안승준",
                    password_hash=hash_password("demo1234"), plan="Pro",
                    credits=78, monthly_used=12, monthly_limit=30, email_verified=True,
                )
            )

        # 관리자 사용자
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
    print("✅ Seed complete — demo@designgenerator.io / demo1234, admin@designgenerator.io / admin1234")


if __name__ == "__main__":
    asyncio.run(seed())
