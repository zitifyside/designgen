"""AI 생성 작업: 시작, 상태 폴링, 취소, 이력."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.models.generation import Generation
from app.models.project import Project
from app.schemas.common import Message
from app.schemas.generation import GenerationOut, GenerationStart
from app.services.ai.pipeline import run_generation
from app.services.quota import (
    cap_concepts,
    consume_generation,
    refund_generation,
    variants_for,
)

router = APIRouter(tags=["generations"])


async def _owned_project(db: DbDep, project_id: str, user_id: str) -> Project:
    project = await db.get(Project, project_id)
    if project is None or project.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post(
    "/projects/{project_id}/generate",
    response_model=GenerationOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_generation(
    project_id: str,
    body: GenerationStart,
    user: CurrentUser,
    db: DbDep,
    background: BackgroundTasks,
):
    project = await _owned_project(db, project_id, user.id)

    # 사용자/프로젝트당 동시에 하나의 생성 작업만 진행한다.
    active = await db.scalar(
        select(Generation).where(
            Generation.project_id == project_id,
            Generation.status.in_(("Pending", "Running")),
        )
    )
    if active is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A generation is already in progress for this project",
        )

    if body.requirements_text is not None:
        project.requirements_text = body.requirements_text

    concepts = cap_concepts(user.plan, body.concepts)
    variants = variants_for(user.plan)

    # 큐에 넣기 전에 쿼터를 선점한다(소진 시 402 발생).
    await consume_generation(db, user)

    gen = Generation(
        project_id=project.id,
        user_id=user.id,
        status="Pending",
        stage="InputAnalyzer",
        progress=0,
        input_snapshot={
            "requirements": project.requirements_text,
            "platform": project.platform,
            "concepts": concepts,
            "variants": variants,
        },
    )
    project.status = "Generating"
    db.add(gen)
    await db.flush()
    gen_id = gen.id

    # 워커가 볼 수 있도록 응답 전에 선점 + 작업 행을 커밋한다.
    await db.commit()

    background.add_task(
        run_generation, gen_id, concepts=concepts, variants=variants
    )
    return GenerationOut.model_validate(gen)


@router.get("/generations/{generation_id}/status", response_model=GenerationOut)
async def generation_status(generation_id: str, user: CurrentUser, db: DbDep):
    gen = await db.get(Generation, generation_id)
    if gen is None or gen.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generation not found")
    return GenerationOut.model_validate(gen)


@router.post("/generations/{generation_id}/cancel", response_model=Message)
async def cancel_generation(generation_id: str, user: CurrentUser, db: DbDep):
    gen = await db.get(Generation, generation_id)
    if gen is None or gen.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generation not found")
    if gen.status in ("Done", "Failed", "Cancelled"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Generation already finished")

    gen.status = "Cancelled"
    project = await db.get(Project, gen.project_id)
    if project is not None:
        project.status = "Cancelled"
    # 환불 정책: 진행률 <30% → 전액 환불(단순화).
    if gen.progress < 30:
        refund_generation(user)
    return Message(detail="Generation cancelled")


@router.get("/projects/{project_id}/generations", response_model=list[GenerationOut])
async def generation_history(project_id: str, user: CurrentUser, db: DbDep):
    await _owned_project(db, project_id, user.id)
    rows = (
        await db.scalars(
            select(Generation)
            .where(Generation.project_id == project_id)
            .order_by(Generation.created_at.desc())
        )
    ).all()
    return [GenerationOut.model_validate(g) for g in rows]
