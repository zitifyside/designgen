"""Insert extra demo projects/mockups on Mac Mini Postgres. Never print secrets."""
from __future__ import annotations

import asyncio
import datetime as dt
import os
import sys
from pathlib import Path

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SECRETS = Path(r"D:\Project\ContextBuilder\Secrets\env\mae\macdb\designgenerator.env")
DEMO_EMAIL = "demo@designgenerator.io"

SPECS = [
    {
        "name": "아웃도어 캠핑 랜딩",
        "requirements": "주말 캠핑 용품 쇼핑몰 랜딩. 흙빛 톤, 넓은 히어로, 제품 3종 카드.",
        "platform": "Web",
        "screen": "landing",
        "concept_count": 2,
        "variant_count": 3,
        "ds_mode": "per_concept",
    },
    {
        "name": "파스텔 헬스케어 로그인",
        "requirements": "병원 예약 앱 로그인. 부드러운 파스텔, 큰 입력, 소셜 로그인.",
        "platform": "Mobile",
        "screen": "login",
        "concept_count": 1,
        "variant_count": 3,
        "ds_mode": "per_concept",
        "concept_pick": "C",
    },
    {
        "name": "핀테크 운영 대시보드",
        "requirements": "자산 운영 콘솔. 지표 카드, 거래 차트, 밀도 높은 표. 신뢰감 있는 블루.",
        "platform": "Web",
        "screen": "dashboard",
        "concept_count": 3,
        "variant_count": 3,
        "ds_mode": "per_concept",
    },
    {
        "name": "계정 설정 상세",
        "requirements": "계정 프로필 상세. 좌측 내비, 요약 헤더, 탭 본문. 저장·취소 액션.",
        "platform": "Web",
        "screen": "detail",
        "concept_count": 2,
        "variant_count": 3,
        "ds_mode": "per_concept",
    },
]


def load_url() -> str:
    for line in SECRETS.read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("DATABASE_URL missing")


def pick_concepts(all_concepts: list[dict], spec: dict) -> list[dict]:
    label = spec.get("concept_pick")
    if not label:
        return all_concepts
    chosen = next(item for item in all_concepts if item["conceptLabel"] == label)
    chosen = dict(chosen)
    chosen["conceptLabel"] = "A"
    return [chosen]


async def main() -> int:
    os.environ["DATABASE_URL"] = load_url()
    from app.core.database import AsyncSessionLocal
    from app.models.design import DesignSystem, Mockup
    from app.models.generation import Generation
    from app.models.project import Project
    from app.models.user import User
    from app.services.ai.placeholder import (
        SCREEN_PRESETS,
        placeholder_concepts,
        placeholder_layouts,
    )

    now = dt.datetime.now(dt.timezone.utc)
    async with AsyncSessionLocal() as db:
        owner = await db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if owner is None:
            raise SystemExit("demo user missing")

        created = 0
        for offset, spec in enumerate(SPECS, start=1):
            exists = await db.scalar(
                select(Project).where(
                    Project.owner_id == owner.id,
                    Project.name == spec["name"],
                    Project.deleted_at.is_(None),
                )
            )
            if exists is not None:
                print("skip", spec["name"])
                continue

            screen = spec["screen"]
            screen_title = SCREEN_PRESETS[screen]
            stamped = now - dt.timedelta(minutes=offset * 7)
            project = Project(
                owner_id=owner.id,
                name=spec["name"],
                description=spec["requirements"][:80],
                platform=spec["platform"],
                status="Completed",
                requirements_text=spec["requirements"],
                concept_count=spec["concept_count"],
                variant_count=spec["variant_count"],
                ds_mode=spec["ds_mode"],
                target_screen=screen,
                target_screen_title=screen_title,
                target_screen_inferred=False,
                thumbnail_concept="A",
                thumbnail_mockup=0,
                created_at=stamped,
                updated_at=stamped,
            )
            db.add(project)
            await db.flush()

            pool = placeholder_concepts(3, spec["ds_mode"])
            concepts = pick_concepts(pool, spec)[: spec["concept_count"]]
            layouts = placeholder_layouts(
                spec["variant_count"], screen=screen, screen_title=screen_title
            )
            for concept in concepts:
                extra = concept.get("overriddenFields") or None
                db.add(
                    DesignSystem(
                        project_id=project.id,
                        concept_label=concept["conceptLabel"],
                        concept_name=concept["conceptName"],
                        description=concept["description"],
                        tokens=concept["tokens"],
                        ds_mode=spec["ds_mode"],
                        overridden_fields=extra,
                        created_at=stamped,
                        updated_at=stamped,
                    )
                )
                for idx, layout in enumerate(layouts):
                    db.add(
                        Mockup(
                            project_id=project.id,
                            concept_label=concept["conceptLabel"],
                            index=idx,
                            screen=layout["screen"],
                            screen_title=layout["screenTitle"],
                            screen_order=0,
                            kind=layout["kind"],
                            title=f"{spec['name']} · {layout['title']}",
                            variant_label=layout["variantLabel"],
                            node_tree={
                                "creativeDirection": concept["description"],
                            },
                            is_fallback=True,
                            created_at=stamped,
                            updated_at=stamped,
                        )
                    )

            db.add(
                Generation(
                    project_id=project.id,
                    user_id=owner.id,
                    kind="full",
                    status="Done",
                    stage="Done",
                    progress=100,
                    quota_bucket="monthly",
                    input_snapshot={
                        "requirements": spec["requirements"],
                        "platform": spec["platform"],
                        "concepts": spec["concept_count"],
                        "variants": spec["variant_count"],
                        "dsMode": spec["ds_mode"],
                        "targetScreen": screen,
                    },
                    started_at=stamped,
                    completed_at=stamped,
                    created_at=stamped,
                    updated_at=stamped,
                )
            )
            created += 1
            print("created", spec["name"], "mockups", len(concepts) * len(layouts))

        await db.commit()
        print("created-projects", created)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
