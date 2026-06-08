"""프로젝트 CRUD + 즐겨찾기."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.models.project import Project
from app.schemas.common import Message
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


async def _owned(db: DbDep, project_id: str, user_id: str) -> Project:
    project = await db.get(Project, project_id)
    if project is None or project.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


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
    rows = (await db.scalars(stmt)).all()
    return [ProjectOut.model_validate(p) for p in rows]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate, user: CurrentUser, db: DbDep):
    project = Project(
        owner_id=user.id,
        name=body.name,
        description=body.requirements_text[:80],
        platform=body.platform,
        status="Draft",
        requirements_text=body.requirements_text,
    )
    db.add(project)
    await db.flush()
    return ProjectOut.model_validate(project)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, user: CurrentUser, db: DbDep):
    return ProjectOut.model_validate(await _owned(db, project_id, user.id))


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str, body: ProjectUpdate, user: CurrentUser, db: DbDep
):
    project = await _owned(db, project_id, user.id)
    for field, value in body.model_dump(exclude_unset=True).items():
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
    )
    db.add(copy)
    await db.flush()
    return ProjectOut.model_validate(copy)
