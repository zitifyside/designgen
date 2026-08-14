"""프로젝트별 디자인 시스템(토큰 세트)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.models.design import DesignSystem
from app.models.project import DS_MODE_UNIFIED, Project
from app.schemas.design import DesignSystemOut, DesignSystemUpdate

router = APIRouter(prefix="/projects/{project_id}/design-systems", tags=["design-systems"])


async def _owned_project(db: DbDep, project_id: str, user_id: str) -> Project:
    project = await db.get(Project, project_id)
    if project is None or project.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


# Free 등급은 Color 만 수정할 수 있다 (기능정의서 v0.2.0 §5.1 권한 매트릭스).
FREE_EDITABLE_TOKEN_CATEGORIES = {"color"}
FULL_TOKEN_EDIT_PLANS = ("Pro", "Team", "Admin")


def _assert_editable_categories(plan: str, patch: dict[str, Any]) -> None:
    if plan in FULL_TOKEN_EDIT_PLANS:
        return
    blocked = sorted(set(patch) - FREE_EDITABLE_TOKEN_CATEGORIES)
    if blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Free 등급은 Color 토큰만 수정할 수 있습니다. "
                f"제한된 항목: {', '.join(blocked)}"
            ),
        )


# 단일 DS 통일 모드에서 컨셉별로 달라지는 강조색 — 공유 대상에서 제외한다.
ACCENT_COLOR_KEYS = ("secondary", "info")


def _strip_accent_fields(patch: dict[str, Any]) -> dict[str, Any]:
    """컨셉별 변주 항목(강조색)을 제거한 공유 패치를 만든다."""
    shared = {k: v for k, v in patch.items() if k != "color"}
    color = patch.get("color")
    if isinstance(color, dict):
        rest = {k: v for k, v in color.items() if k not in ACCENT_COLOR_KEYS}
        if rest:
            shared["color"] = rest
    return shared


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
    if ds.is_archived:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="컨셉 확정 후 비확정 컨셉은 읽기 전용입니다. 확정 해제 후 수정해 주세요.",
        )
    _assert_editable_categories(user.plan, body.tokens)

    ds.tokens = _deep_merge(ds.tokens or {}, body.tokens)
    if body.concept_name is not None:
        ds.concept_name = body.concept_name
    if body.description is not None:
        ds.description = body.description
    ds.is_modified = True
    db.add(ds)

    # 단일 DS 통일 모드에서 Base Token 은 전 컨셉 공통 고정이므로,
    # 강조색(컨셉별 변주 항목)을 제외한 수정은 형제 컨셉에도 함께 반영한다
    # (기획서 v0.5.0 §4 F-002 — Typography·Spacing 등 Base 항목은 3컨셉 공통).
    if ds.ds_mode == DS_MODE_UNIFIED:
        shared = _strip_accent_fields(body.tokens)
        if shared:
            siblings = (
                await db.scalars(
                    select(DesignSystem).where(
                        DesignSystem.project_id == project_id,
                        DesignSystem.concept_label != ds.concept_label,
                    )
                )
            ).all()
            for sib in siblings:
                sib.tokens = _deep_merge(sib.tokens or {}, shared)
                sib.is_modified = True
                db.add(sib)

    return DesignSystemOut.model_validate(ds)
