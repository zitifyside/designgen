"""생성 파이프라인 오케스트레이터.

네 단계(InputAnalyzer → ConceptEngine → LayoutEngine → Renderer)를 구동하면서
진행에 따라 Generation 행의 stage/progress를 갱신하고, 그 결과로 생성된
디자인 시스템 + 목업을 영속화한다.

FastAPI BackgroundTask로 실행된다. 프로덕션에서는 재시도와 우선순위 큐를
갖춘 실제 작업 큐(Redis/Bull, Celery, arq)로 옮기게 된다 — 아래 단계 함수들은
그 교체가 기계적으로 이뤄질 수 있도록 작성되어 있다.

Provider 선택:
  - FAKE_AI_PIPELINE=true  → 결정론적 placeholder 출력(기본값; API 키 없이도
    실행되어 프론트엔드가 처음부터 끝까지 동작한다).
  - FAKE_AI_PIPELINE=false → 설정된 AIProvider를 호출한다. gemini.py / codex.py의
    실제 프롬프트가 작성되기 전까지는 NotImplementedError를 발생시키며,
    해당 생성은 명확한 메시지와 함께 Failed로 표시된다.
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import delete

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.design import DesignSystem, Mockup
from app.models.generation import Generation
from app.models.notification import Notification
from app.models.project import Project
from app.models.user import User
from app.services.ai.base import AIProvider
from app.services.ai.codex import CodexProvider
from app.services.ai.gemini import GeminiProvider
from app.services.ai.placeholder import placeholder_concepts, placeholder_layouts
from app.services.quota import refund_generation

# 단계 → 누적 진행률 체크포인트(%)
STAGE_PROGRESS = {
    "InputAnalyzer": 15,
    "ConceptEngine": 40,
    "LayoutEngine": 70,
    "Renderer": 95,
    "Done": 100,
}


def get_provider(name: str = "gemini") -> AIProvider:
    return {"gemini": GeminiProvider, "codex": CodexProvider}.get(
        name, GeminiProvider
    )()


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


async def run_generation(
    generation_id: str,
    *,
    concepts: int,
    variants: int,
    provider_name: str = "gemini",
) -> None:
    """백그라운드 작업의 진입점. 자체 DB 세션을 소유한다."""
    async with AsyncSessionLocal() as db:
        gen = await db.get(Generation, generation_id)
        if gen is None or gen.status in ("Cancelled", "Done"):
            return
        project = await db.get(Project, gen.project_id)
        if project is None:
            return

        gen.status = "Running"
        gen.started_at = _now()
        await db.commit()

        try:
            if settings.fake_ai_pipeline:
                concept_sets, layouts_by_concept = await _run_fake(concepts, variants)
            else:
                concept_sets, layouts_by_concept = await _run_real(
                    gen, project, concepts, variants, provider_name, db
                )

            await _set_stage(db, gen, "Renderer")

            # 디자인 시스템 + 목업을 영속화(이전 출력이 있으면 교체).
            # 명시적 삭제 — 비동기 세션은 관계를 지연 로딩할 수 없다.
            await db.execute(
                delete(DesignSystem).where(DesignSystem.project_id == project.id)
            )
            await db.execute(delete(Mockup).where(Mockup.project_id == project.id))
            await db.flush()

            for c in concept_sets:
                db.add(
                    DesignSystem(
                        project_id=project.id,
                        concept_label=c["conceptLabel"],
                        concept_name=c["conceptName"],
                        description=c.get("description", ""),
                        tokens=c["tokens"],
                    )
                )
            for c in concept_sets:
                for idx, layout in enumerate(layouts_by_concept[c["conceptLabel"]]):
                    db.add(
                        Mockup(
                            project_id=project.id,
                            concept_label=c["conceptLabel"],
                            index=idx,
                            kind=layout["kind"],
                            title=layout["title"],
                            node_tree=layout.get("nodeTree"),
                        )
                    )

            gen.status = "Done"
            gen.stage = "Done"
            gen.progress = 100
            gen.completed_at = _now()
            project.status = "Completed"
            db.add(
                Notification(
                    user_id=gen.user_id,
                    category="generation",
                    title="시안 생성 완료",
                    body=f"프로젝트 '{project.name}' 의 시안이 준비되었습니다.",
                    href=f"/projects/{project.id}",
                )
            )
            await db.commit()

        except Exception as exc:  # noqa: BLE001 — 실패를 기록하되 워커를 중단시키지 않음
            await db.rollback()
            gen = await db.get(Generation, generation_id)
            if gen is not None and gen.status != "Cancelled":
                gen.status = "Failed"
                if isinstance(exc, NotImplementedError):
                    gen.error = (
                        "AI provider not implemented yet. Set FAKE_AI_PIPELINE=true, "
                        "or implement the prompts in app/services/ai/."
                    )
                else:
                    gen.error = str(exc) or exc.__class__.__name__
                gen.completed_at = _now()
                proj = await db.get(Project, gen.project_id)
                if proj is not None:
                    proj.status = "Failed"
                # 시스템 장애 시 예약된 생성 횟수를 환불한다.
                user = await db.get(User, gen.user_id)
                if user is not None:
                    refund_generation(user)
                await db.commit()


async def _set_stage(db, gen: Generation, stage: str) -> None:
    gen.stage = stage
    gen.progress = STAGE_PROGRESS.get(stage, gen.progress)
    await db.commit()


async def _run_fake(concepts: int, variants: int):
    concept_sets = placeholder_concepts(concepts)
    layouts_by_concept = {
        c["conceptLabel"]: placeholder_layouts(variants) for c in concept_sets
    }
    return concept_sets, layouts_by_concept


async def _run_real(gen, project, concepts, variants, provider_name, db):
    provider = get_provider(provider_name)

    await _set_stage(db, gen, "InputAnalyzer")
    analysis = await provider.analyze_input(project.requirements_text, project.platform)

    await _set_stage(db, gen, "ConceptEngine")
    concept_sets = await provider.generate_concepts(analysis, concepts)

    await _set_stage(db, gen, "LayoutEngine")
    layouts_by_concept = {}
    for c in concept_sets:
        layouts = await provider.generate_layouts(c, variants)
        # 레이아웃별 Stage 4 렌더(산출물은 nodeTree/imageUrl에 첨부된다).
        for layout in layouts:
            artifact = await provider.render(layout, c["tokens"])
            layout.setdefault("nodeTree", artifact.get("nodeTree"))
        layouts_by_concept[c["conceptLabel"]] = layouts
    return concept_sets, layouts_by_concept
