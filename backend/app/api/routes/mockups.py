"""프로젝트별 목업."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.models.design import Mockup
from app.models.project import Project
from app.schemas.design import MockupOut

router = APIRouter(prefix="/projects/{project_id}/mockups", tags=["mockups"])


async def _owned_project(db: DbDep, project_id: str, user_id: str) -> Project:
    project = await db.get(Project, project_id)
    if project is None or project.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.get("", response_model=list[MockupOut])
async def list_mockups(
    project_id: str,
    user: CurrentUser,
    db: DbDep,
    concept: str | None = Query(default=None),
    screen: str | None = Query(default=None),
):
    await _owned_project(db, project_id, user.id)
    stmt = select(Mockup).where(Mockup.project_id == project_id)
    if concept:
        stmt = stmt.where(Mockup.concept_label == concept.upper())
    if screen:
        stmt = stmt.where(Mockup.screen == screen)
    stmt = stmt.order_by(Mockup.screen_order, Mockup.concept_label, Mockup.index)
    rows = (await db.scalars(stmt)).all()
    return [MockupOut.model_validate(m) for m in rows]


@router.post("/{mockup_id}/favorite", response_model=MockupOut)
async def toggle_mockup_favorite(
    project_id: str, mockup_id: str, user: CurrentUser, db: DbDep
):
    await _owned_project(db, project_id, user.id)
    mk = await db.get(Mockup, mockup_id)
    if mk is None or mk.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mockup not found")
    mk.is_favorite = not mk.is_favorite
    db.add(mk)
    return MockupOut.model_validate(mk)
