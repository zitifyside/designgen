"""프로젝트별 디자인 시스템(토큰 세트)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.models.design import DesignSystem
from app.models.project import Project
from app.schemas.design import DesignSystemOut, DesignSystemUpdate

router = APIRouter(prefix="/projects/{project_id}/design-systems", tags=["design-systems"])


async def _owned_project(db: DbDep, project_id: str, user_id: str) -> Project:
    project = await db.get(Project, project_id)
    if project is None or project.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


@router.get("", response_model=list[DesignSystemOut])
async def list_design_systems(project_id: str, user: CurrentUser, db: DbDep):
    await _owned_project(db, project_id, user.id)
    rows = (
        await db.scalars(
            select(DesignSystem)
            .where(DesignSystem.project_id == project_id)
            .order_by(DesignSystem.concept_label)
        )
    ).all()
    return [DesignSystemOut.model_validate(d) for d in rows]


@router.get("/{concept_label}", response_model=DesignSystemOut)
async def get_design_system(
    project_id: str, concept_label: str, user: CurrentUser, db: DbDep
):
    await _owned_project(db, project_id, user.id)
    ds = await db.scalar(
        select(DesignSystem).where(
            DesignSystem.project_id == project_id,
            DesignSystem.concept_label == concept_label.upper(),
        )
    )
    if ds is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design system not found")
    return DesignSystemOut.model_validate(ds)


@router.patch("/{concept_label}", response_model=DesignSystemOut)
async def update_design_system(
    project_id: str,
    concept_label: str,
    body: DesignSystemUpdate,
    user: CurrentUser,
    db: DbDep,
):
    await _owned_project(db, project_id, user.id)
    ds = await db.scalar(
        select(DesignSystem).where(
            DesignSystem.project_id == project_id,
            DesignSystem.concept_label == concept_label.upper(),
        )
    )
    if ds is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design system not found")

    ds.tokens = _deep_merge(ds.tokens or {}, body.tokens)
    if body.concept_name is not None:
        ds.concept_name = body.concept_name
    if body.description is not None:
        ds.description = body.description
    ds.is_modified = True
    db.add(ds)
    return DesignSystemOut.model_validate(ds)
