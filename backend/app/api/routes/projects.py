"""프로젝트 CRUD + 즐겨찾기 + 컨셉 확정 + 화면 추가 생성."""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from sqlalchemy import select, update

from app.core.deps import CurrentUser, DbDep
from app.core.observability import log_event
from app.models.design import DesignSystem, Mockup
from app.models.generation import GEN_KIND_SCREEN, Generation
from app.models.project import Project
from app.schemas.common import Message
from app.schemas.generation import GenerationOut
from app.schemas.project import (
    ConceptConfirmIn,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    ScreenAddIn,
    ScreenOut,
)
from app.services.ai.pipeline import run_screen_generation
from app.services.ai.placeholder import SCREEN_PRESETS
from app.services.quota import (
    SCREEN_ADD_VARIANTS,
    cap_concepts,
    consume_generation,
    ds_mode_for,
    variants_for,
)

router = APIRouter(prefix="/projects", tags=["projects"])


async def _owned(db: DbDep, project_id: str, user_id: str) -> Project:
    project = await db.get(Project, project_id)
    if project is None or project.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


# 카드 썸네일용 대표 컬러 순서.
_THUMB_KEYS = ("primary", "secondary", "background", "surface")


async def _out(db, projects: list[Project]) -> list[ProjectOut]:
    """프로젝트 목록에 대표 컬러를 한 번의 조회로 붙인다 (N+1 방지)."""
    ids = [p.id for p in projects]
    palette: dict[str, list[str]] = {}
    if ids:
        rows = (
            await db.scalars(
                select(DesignSystem)
                .where(DesignSystem.project_id.in_(ids))
                .order_by(DesignSystem.concept_label)
            )
        ).all()
        preferred = {p.id: p.confirmed_concept_label or p.thumbnail_concept for p in projects}
        for ds in rows:
            want = preferred.get(ds.project_id)
            if ds.project_id in palette and ds.concept_label != want:
                continue
            colors = (ds.tokens or {}).get("color", {})
            values = [colors.get(k) for k in _THUMB_KEYS]
            palette[ds.project_id] = [v for v in values if isinstance(v, str)]

    out: list[ProjectOut] = []
    for p in projects:
        item = ProjectOut.model_validate(p)
        item.thumbnail_colors = palette.get(p.id, [])
        out.append(item)
    return out


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    user: CurrentUser,
    db: DbDep,
    favorite: bool | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None),
):
    stmt = select(Project).where(Project.owner_id == user.id)
    if favorite is not None:
        stmt = stmt.where(Project.is_favorite == favorite)
    if status_filter:
        stmt = stmt.where(Project.status == status_filter)
    if q:
        stmt = stmt.where(Project.name.ilike(f"%{q}%"))
    stmt = stmt.order_by(Project.updated_at.desc())
    rows = list((await db.scalars(stmt)).all())
    return await _out(db, rows)


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate, user: CurrentUser, db: DbDep):
    target_screen = (body.target_screen or "").strip()
    project = Project(
        owner_id=user.id,
        name=body.name,
        description=body.requirements_text[:80],
        platform=body.platform,
        status="Draft",
        requirements_text=body.requirements_text,
        concept_count=cap_concepts(user.plan, body.concept_count),
        variant_count=variants_for(user.plan, body.variant_count),
        ds_mode=ds_mode_for(user.plan, body.ds_mode),
        target_screen=target_screen,
        target_screen_title=(
            body.target_screen_title or SCREEN_PRESETS.get(target_screen) or target_screen
        ),
        target_screen_inferred=not target_screen,
        concept_briefs=(
            [b.model_dump() for b in body.concept_briefs]
            if body.concept_briefs
            else None
        ),
    )
    db.add(project)
    await db.flush()
    return ProjectOut.model_validate(project)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, user: CurrentUser, db: DbDep):
    project = await _owned(db, project_id, user.id)
    return (await _out(db, [project]))[0]


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str, body: ProjectUpdate, user: CurrentUser, db: DbDep
):
    project = await _owned(db, project_id, user.id)
    patch = body.model_dump(exclude_unset=True)
    # 등급 게이팅이 걸린 필드는 검증 후 반영한다.
    if "ds_mode" in patch:
        patch["ds_mode"] = ds_mode_for(user.plan, patch["ds_mode"])
    if "concept_count" in patch:
        patch["concept_count"] = cap_concepts(user.plan, patch["concept_count"])
    if "variant_count" in patch:
        patch["variant_count"] = variants_for(user.plan, patch["variant_count"])
    if "concept_briefs" in patch and patch["concept_briefs"] is not None:
        patch["concept_briefs"] = [
            b if isinstance(b, dict) else b.model_dump()
            for b in patch["concept_briefs"]
        ]
    if "target_screen" in patch:
        screen = (patch["target_screen"] or "").strip()
        patch["target_screen"] = screen
        patch["target_screen_inferred"] = not screen
        patch.setdefault(
            "target_screen_title", SCREEN_PRESETS.get(screen) or screen
        )
    for field, value in patch.items():
        setattr(project, field, value)
    db.add(project)
    return ProjectOut.model_validate(project)


@router.delete("/{project_id}", response_model=Message)
async def delete_project(project_id: str, user: CurrentUser, db: DbDep):
    project = await _owned(db, project_id, user.id)
    await db.delete(project)
    return Message(detail="Project deleted")


@router.post("/{project_id}/favorite", response_model=ProjectOut)
async def toggle_favorite(project_id: str, user: CurrentUser, db: DbDep):
    project = await _owned(db, project_id, user.id)
    project.is_favorite = not project.is_favorite
    db.add(project)
    return ProjectOut.model_validate(project)


@router.post("/{project_id}/duplicate", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def duplicate_project(project_id: str, user: CurrentUser, db: DbDep):
    src = await _owned(db, project_id, user.id)
    copy = Project(
        owner_id=user.id,
        name=f"{src.name} (사본)",
        description=src.description,
        platform=src.platform,
        status="Draft",
        requirements_text=src.requirements_text,
        concept_count=src.concept_count,
        variant_count=src.variant_count,
        ds_mode=src.ds_mode,
        target_screen=src.target_screen,
        target_screen_title=src.target_screen_title,
        target_screen_inferred=src.target_screen_inferred,
        concept_briefs=src.concept_briefs,
    )
    db.add(copy)
    await db.flush()
    return ProjectOut.model_validate(copy)


# --- 컨셉 확정 (Concept Locked) ----------------------------------------------


@router.post("/{project_id}/confirm-concept", response_model=ProjectOut)
async def confirm_concept(
    project_id: str, body: ConceptConfirmIn, user: CurrentUser, db: DbDep
):
    """확정 컨셉의 DS 를 프로젝트의 단일 Token 원천으로 잠그고,
    나머지 컨셉은 읽기 전용으로 보관한다 (기획서 v0.5.0 §4 F-002).
    """
    project = await _owned(db, project_id, user.id)
    if project.status not in ("Completed", "CompletedWarning", "ConceptLocked"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="생성이 완료된 프로젝트에서만 컨셉을 확정할 수 있습니다.",
        )

    label = body.concept_label.upper()
    target = await db.scalar(
        select(DesignSystem).where(
            DesignSystem.project_id == project.id,
            DesignSystem.concept_label == label,
        )
    )
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Concept not found"
        )

    await db.execute(
        update(DesignSystem)
        .where(DesignSystem.project_id == project.id)
        .values(is_archived=True)
    )
    target.is_archived = False

    project.confirmed_concept_id = target.id
    project.confirmed_concept_label = label
    project.locked_at = dt.datetime.now(dt.timezone.utc)
    project.status = "ConceptLocked"
    project.thumbnail_concept = label
    db.add(project)
    log_event(
        kind="project.concept_confirmed",
        message="컨셉 확정",
        user_id=user.id,
        payload={"projectId": project.id, "conceptLabel": label},
    )
    return ProjectOut.model_validate(project)


@router.post("/{project_id}/unlock-concept", response_model=ProjectOut)
async def unlock_concept(project_id: str, user: CurrentUser, db: DbDep):
    """확정 해제. 기존 추가 화면은 유지된다 (기획서 v0.5.0 §4 상태 전이)."""
    project = await _owned(db, project_id, user.id)
    if project.status != "ConceptLocked":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="확정된 컨셉이 없습니다."
        )

    await db.execute(
        update(DesignSystem)
        .where(DesignSystem.project_id == project.id)
        .values(is_archived=False)
    )
    project.confirmed_concept_id = None
    project.confirmed_concept_label = None
    project.locked_at = None
    project.status = "Completed"
    db.add(project)
    log_event(
        kind="project.concept_unlocked",
        message="컨셉 확정 해제",
        user_id=user.id,
        payload={"projectId": project.id},
    )
    return ProjectOut.model_validate(project)


# --- 화면 추가 생성 (경량 파이프라인) ------------------------------------------


@router.get("/{project_id}/screens", response_model=list[ScreenOut])
async def list_screens(project_id: str, user: CurrentUser, db: DbDep):
    project = await _owned(db, project_id, user.id)
    rows = (
        await db.scalars(
            select(Mockup)
            .where(Mockup.project_id == project.id)
            .order_by(Mockup.screen_order, Mockup.index)
        )
    ).all()

    # 변형 수는 컨셉 축과 직교하므로 화면별 index 집합의 크기로 센다.
    meta: dict[str, tuple[str, int, set[int]]] = {}
    for m in rows:
        title, order, indices = meta.setdefault(
            m.screen, (m.screen_title, m.screen_order, set())
        )
        indices.add(m.index)
    return [
        ScreenOut(
            screen=screen,
            screen_title=title,
            order=order,
            variant_count=len(indices),
            is_primary=order == 0,
        )
        for screen, (title, order, indices) in sorted(
            meta.items(), key=lambda kv: kv[1][1]
        )
    ]


@router.post(
    "/{project_id}/screens",
    response_model=GenerationOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def add_screen(
    project_id: str,
    body: ScreenAddIn,
    user: CurrentUser,
    db: DbDep,
    background: BackgroundTasks,
):
    """컨셉 확정 후 확정 Token 을 주입한 경량 파이프라인으로 화면을 추가한다.

    월간 생성 한도·크레딧은 전체 생성과 동일하게 1회 차감한다 (v1.0 균일제).
    """
    # 순환 import 방지를 위해 지역 import 한다.
    from app.api.routes.generations import assert_no_active_generation

    project = await _owned(db, project_id, user.id)
    if project.status != "ConceptLocked" or not project.confirmed_concept_label:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="화면 추가 생성은 컨셉 확정 이후에만 가능합니다.",
        )
    await assert_no_active_generation(db, user.id)

    screen = body.screen.strip().lower().replace(" ", "-")[:60]
    screen_title = (
        body.screen_title or SCREEN_PRESETS.get(screen) or body.screen.strip()
    )[:120]

    await consume_generation(db, user, note="screen_add")

    gen = Generation(
        project_id=project.id,
        user_id=user.id,
        kind=GEN_KIND_SCREEN,
        status="Pending",
        stage="LayoutEngine",
        progress=0,
        screen=screen,
        input_snapshot={
            "screen": screen,
            "screenTitle": screen_title,
            "description": body.description,
            "conceptLabel": project.confirmed_concept_label,
            "variants": SCREEN_ADD_VARIANTS,
        },
    )
    project.status = "Generating"
    db.add(gen)
    await db.flush()
    gen_id = gen.id
    log_event(
        kind="generation.screen_added",
        message="화면 추가 생성 시작",
        user_id=user.id,
        payload={"projectId": project.id, "screen": screen, "generationId": gen_id},
    )
    await db.commit()

    background.add_task(
        run_screen_generation,
        gen_id,
        screen=screen,
        screen_title=screen_title,
        variants=SCREEN_ADD_VARIANTS,
    )
    return GenerationOut.model_validate(gen)
