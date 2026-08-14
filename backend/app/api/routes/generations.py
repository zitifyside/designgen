"""AI 생성 작업: 시작, 상태 폴링, 취소, 무차감 재시도, 이력."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.core.observability import log_event
from app.models.generation import GEN_KIND_FULL, Generation
from app.models.project import Project
from app.schemas.common import Message
from app.schemas.generation import GenerationOut, GenerationStart
from app.services.ai.pipeline import run_generation
from app.services.ai.placeholder import SCREEN_PRESETS
from app.services.quota import (
    cap_concepts,
    consume_generation,
    ds_mode_for,
    refund_generation,
    variants_for,
)

router = APIRouter(tags=["generations"])


async def _owned_project(db: DbDep, project_id: str, user_id: str) -> Project:
    project = await db.get(Project, project_id)
    if project is None or project.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


async def assert_no_active_generation(db, user_id: str) -> None:
    """Web App 기준 동일 User 의 동시 생성 세션은 1개로 제한한다.

    프로젝트 단위가 아니라 **사용자 단위** 검사다 (기획서 v0.5.0 §4 F-002 제약사항).
    """
    active = await db.scalar(
        select(Generation).where(
            Generation.user_id == user_id,
            Generation.status.in_(("Pending", "Running")),
        )
    )
    if active is not None:
        log_event(
            kind="generation.blocked_concurrent",
            level="warn",
            message="동시 생성 제한으로 차단",
            user_id=user_id,
            payload={"activeGenerationId": active.id},
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 진행 중인 생성이 있습니다. 완료 후 새 생성을 시작해 주세요.",
        )


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
    await assert_no_active_generation(db, user.id)

    if body.requirements_text is not None:
        project.requirements_text = body.requirements_text

    # 등급 게이팅을 적용해 생성 옵션을 확정한다.
    concepts = cap_concepts(user.plan, body.concepts or project.concept_count)
    variants = variants_for(user.plan, body.variants or project.variant_count)
    ds_mode = ds_mode_for(user.plan, body.ds_mode or project.ds_mode)

    target_screen = (body.target_screen or project.target_screen or "").strip()
    target_title = (
        body.target_screen_title
        or SCREEN_PRESETS.get(target_screen)
        or project.target_screen_title
        or target_screen
    )

    if body.concept_briefs is not None:
        project.concept_briefs = [b.model_dump() for b in body.concept_briefs]
    briefs = (project.concept_briefs or [])[:concepts] or None

    project.concept_count = concepts
    project.variant_count = variants
    project.ds_mode = ds_mode
    project.target_screen = target_screen
    project.target_screen_title = target_title if target_screen else ""
    # 화면 미지정이면 Input Analyzer 가 추론한다.
    project.target_screen_inferred = not target_screen

    # 큐에 넣기 전에 쿼터를 선점한다(소진 시 402 발생).
    await consume_generation(db, user)

    gen = Generation(
        project_id=project.id,
        user_id=user.id,
        kind=GEN_KIND_FULL,
        status="Pending",
        stage="InputAnalyzer",
        progress=0,
        input_snapshot={
            "requirements": project.requirements_text,
            "platform": project.platform,
            "concepts": concepts,
            "variants": variants,
            "dsMode": ds_mode,
            "targetScreen": target_screen,
            "conceptBriefs": briefs,
        },
    )
    project.status = "Generating"
    # 재생성은 확정 상태를 되돌린다 — DS 가 교체되므로 잠금이 무의미해진다.
    project.confirmed_concept_id = None
    project.confirmed_concept_label = None
    project.locked_at = None
    db.add(gen)
    await db.flush()
    gen_id = gen.id

    # 워커가 볼 수 있도록 응답 전에 선점 + 작업 행을 커밋한다.
    await db.commit()

    log_event(
        kind="generation.started",
        message="전체 생성 시작",
        user_id=user.id,
        payload={
            "generationId": gen_id,
            "projectId": project.id,
            "concepts": concepts,
            "variants": variants,
            "dsMode": ds_mode,
            "targetScreen": target_screen or "(ai)",
        },
    )
    await db.commit()

    background.add_task(
        run_generation,
        gen_id,
        concepts=concepts,
        variants=variants,
        ds_mode=ds_mode,
        concept_briefs=briefs,
    )
    return GenerationOut.model_validate(gen)


@router.post(
    "/generations/{generation_id}/retry",
    response_model=GenerationOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_generation(
    generation_id: str,
    user: CurrentUser,
    db: DbDep,
    background: BackgroundTasks,
):
    """CSS Fallback 완료(Completed (Warning)) 건의 무차감 재시도 1회.

    월간 한도·크레딧 차감은 원 생성에서 이미 이뤄졌으므로 여기서는 차감하지 않는다
    (기획서 v0.5.0 §4 F-002 제약사항).
    """
    origin = await db.get(Generation, generation_id)
    if origin is None or origin.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generation not found")
    if not origin.is_warning:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="무차감 재시도는 CSS 렌더링으로 대체 완료된 생성에만 제공됩니다.",
        )

    already = await db.scalar(
        select(Generation).where(Generation.retry_of_id == origin.id)
    )
    if already is not None or origin.free_retry_used:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="무차감 재시도는 생성 건당 1회만 제공됩니다.",
        )

    project = await _owned_project(db, origin.project_id, user.id)
    await assert_no_active_generation(db, user.id)

    snapshot = origin.input_snapshot or {}
    concepts = int(snapshot.get("concepts") or project.concept_count)
    variants = int(snapshot.get("variants") or project.variant_count)
    ds_mode = str(snapshot.get("dsMode") or project.ds_mode)
    briefs = snapshot.get("conceptBriefs") or project.concept_briefs or None

    retry = Generation(
        project_id=project.id,
        user_id=user.id,
        kind=origin.kind,
        status="Pending",
        stage="InputAnalyzer",
        progress=0,
        retry_of_id=origin.id,
        free_retry_used=True,
        input_snapshot=snapshot,
    )
    origin.free_retry_used = True
    project.status = "Generating"
    db.add(retry)
    await db.flush()
    retry_id = retry.id
    await db.commit()

    log_event(
        kind="generation.free_retry",
        message="CSS Fallback 건 무차감 재시도",
        user_id=user.id,
        payload={"originGenerationId": origin.id, "retryId": retry_id},
    )
    await db.commit()

    background.add_task(
        run_generation,
        retry_id,
        concepts=concepts,
        variants=variants,
        ds_mode=ds_mode,
        concept_briefs=briefs,
    )
    return GenerationOut.model_validate(retry)


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
        # 화면 추가 생성 취소는 확정 상태로, 전체 생성 취소는 Cancelled 로 되돌린다.
        project.status = (
            "ConceptLocked" if project.confirmed_concept_label else "Cancelled"
        )
    # 환불 정책: 진행률 <30% → 전액 환불(단순화). 무차감 재시도 건은 환불 대상이 아니다.
    refunded = gen.progress < 30 and not gen.free_retry_used
    if refunded:
        refund_generation(user)
    log_event(
        kind="generation.cancelled",
        level="warn",
        message="생성 취소",
        user_id=user.id,
        payload={"generationId": gen.id, "progress": gen.progress, "refunded": refunded},
    )
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
