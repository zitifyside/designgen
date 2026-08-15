"""Export 실행·이력·다운로드.

기능정의서 v0.2.0 §3.1 'Export 대상 선택 / 형식 선택 / 실행·이력' 을 구현한다.
파일은 생성 후 7일 경과 시 만료되며, 만료 건은 이력에만 남고 다운로드는 410 이다.
"""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.core.observability import log_event
from app.core.config import settings
from app.models.design import DesignSystem, Mockup
from app.models.platform import EXPORT_TTL_DAYS, ExportHistory
from app.models.project import Project
from app.schemas.common import Message
from app.schemas.platform import ExportCreate, ExportEstimateOut, ExportOut
from app.services.export import (
    CONTENT_TYPES,
    FILE_SUFFIX,
    PRO_ONLY_FORMATS,
    PRO_PLANS,
    build_metadata,
    build_svg_preview,
    to_css_variables,
    to_dtcg,
)

router = APIRouter(tags=["exports"])


async def _owned_project(db: DbDep, project_id: str, user_id: str) -> Project:
    project = await db.get(Project, project_id)
    if project is None or project.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


async def _collect(db, project: Project, body: ExportCreate):
    """Export 대상 범위에 해당하는 DS·목업을 모은다."""
    concept_label = (
        (body.concept_label or project.confirmed_concept_label or "A").upper()
    )
    ds = await db.scalar(
        select(DesignSystem).where(
            DesignSystem.project_id == project.id,
            DesignSystem.concept_label == concept_label,
        )
    )
    if ds is None:
        ds = await db.scalar(
            select(DesignSystem)
            .where(DesignSystem.project_id == project.id)
            .order_by(DesignSystem.concept_label)
        )
    if ds is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Export 할 디자인 시스템이 없습니다. 먼저 시안을 생성해 주세요.",
        )

    stmt = select(Mockup).where(Mockup.project_id == project.id)
    if body.scope != "all":
        stmt = stmt.where(Mockup.concept_label == ds.concept_label)
    if body.scope == "current" and body.screen:
        stmt = stmt.where(Mockup.screen == body.screen)
    stmt = stmt.order_by(Mockup.screen_order, Mockup.index)
    mockups = (await db.scalars(stmt)).all()

    # 시안을 직접 고른 경우에는 그 선택이 범위 규칙보다 우선한다.
    # 시안 번호는 **화면 안에서의 순번**이라, 화면을 함께 지정하지 않으면 다른 화면의
    # 같은 번호까지 걸린다. 그래서 번호를 줄 때는 화면도 함께 받는다.
    if body.variant_indexes:
        wanted = set(body.variant_indexes)
        picked = [
            m
            for m in mockups
            if m.index in wanted and (not body.screen or m.screen == body.screen)
        ]
        if picked:
            return ds, picked

    if body.scope == "current":
        mockups = mockups[:1]
    return ds, mockups


def _render(fmt: str, project: Project, ds: DesignSystem, mockups, watermark: bool) -> str:
    payload = [
        {
            "screen": m.screen,
            "screenTitle": m.screen_title,
            "title": m.title,
            "variantLabel": m.variant_label,
            "kind": m.kind,
            "index": m.index,
        }
        for m in mockups
    ]
    if fmt == "json":
        return build_metadata(
            project_name=project.name,
            concept_label=ds.concept_label,
            tokens=ds.tokens or {},
            mockups=payload,
        )
    if fmt == "css":
        return to_css_variables(ds.tokens or {})
    return build_svg_preview(
        project_name=project.name,
        concept_name=ds.concept_name,
        tokens=ds.tokens or {},
        mockups=payload,
        watermark=watermark,
    )


@router.post(
    "/projects/{project_id}/exports/estimate", response_model=ExportEstimateOut
)
async def estimate_export(
    project_id: str, body: ExportCreate, user: CurrentUser, db: DbDep
):
    """내보내기 전에 크기와 호환성을 알려 준다. 이력에는 남기지 않는다."""
    project = await _owned_project(db, project_id, user.id)
    ds, mockups = await _collect(db, project, body)

    watermark = body.format == "png" and user.plan not in PRO_PLANS
    # 등급 제한은 여기서 막지 않는다 — 고르기 전에 무엇을 얻는지 보여 주는 게 목적이고,
    # 실제 차단은 생성 시점(create_export)이 한다.
    content = _render(body.format, project, ds, mockups, watermark)

    warnings: list[str] = []
    if body.format in PRO_ONLY_FORMATS and user.plan not in PRO_PLANS:
        warnings.append("이 형식은 Pro 이상에서 내려받을 수 있습니다.")
    if not mockups:
        warnings.append("대상 시안이 없습니다. 먼저 시안을 생성해 주세요.")
    if body.format == "json":
        missing = [
            k for k in ("color", "typography", "spacing") if k not in (ds.tokens or {})
        ]
        if missing:
            warnings.append(
                "DTCG 필수 카테고리가 비어 있습니다: " + ", ".join(missing)
            )
    if body.format == "fig":
        warnings.append(
            "현재 빌드의 .fig 는 SVG + 메타데이터로 산출됩니다. "
            "Figma 에서 열리지 않으면 .png 로 대신 받을 수 있습니다."
        )
    if watermark:
        warnings.append("Free 등급 PNG 에는 워터마크가 들어갑니다.")

    return ExportEstimateOut(
        format=body.format,
        scope=body.scope,
        mockup_count=len(mockups),
        size_bytes=len(content.encode("utf-8")),
        watermark=watermark,
        warnings=warnings,
    )


@router.post(
    "/projects/{project_id}/exports",
    response_model=ExportOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_export(
    project_id: str, body: ExportCreate, user: CurrentUser, db: DbDep
):
    project = await _owned_project(db, project_id, user.id)

    if body.format in PRO_ONLY_FORMATS and user.plan not in PRO_PLANS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=".fig·.json·.css Export 는 Pro 이상 등급에서 제공됩니다.",
        )

    ds, mockups = await _collect(db, project, body)
    # Free 등급 PNG 는 워터마크가 강제된다.
    watermark = body.format == "png" and user.plan not in PRO_PLANS
    content = _render(body.format, project, ds, mockups, watermark)

    row = ExportHistory(
        user_id=user.id,
        project_id=project.id,
        project_name=project.name,
        format=body.format,
        scope=body.scope,
        resolution=body.resolution if body.format == "png" else None,
        watermark=watermark,
        size_bytes=len(content.encode("utf-8")),
        expires_at=_now() + dt.timedelta(days=EXPORT_TTL_DAYS),
    )
    db.add(row)
    await db.flush()
    row.download_url = f"{settings.api_v1_prefix}/exports/{row.id}/download"
    log_event(
        kind="export.created",
        message=f"Export 생성 ({body.format})",
        user_id=user.id,
        payload={
            "projectId": project.id, "format": body.format, "scope": body.scope,
            "watermark": watermark, "sizeBytes": row.size_bytes,
        },
    )
    return ExportOut.model_validate(row)


@router.get("/exports", response_model=list[ExportOut])
async def list_exports(
    user: CurrentUser,
    db: DbDep,
    project_id: str | None = Query(default=None, alias="projectId"),
):
    """최근 7일 Export 이력 (기능정의서 v0.2.0 §3.1)."""
    stmt = select(ExportHistory).where(
        ExportHistory.user_id == user.id,
        ExportHistory.expires_at > _now(),
    )
    if project_id:
        stmt = stmt.where(ExportHistory.project_id == project_id)
    rows = (await db.scalars(stmt.order_by(ExportHistory.created_at.desc()))).all()
    return [ExportOut.model_validate(r) for r in rows]


@router.get("/exports/{export_id}/download")
async def download_export(export_id: str, user: CurrentUser, db: DbDep):
    row = await db.get(ExportHistory, export_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")
    expires_at = row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=dt.timezone.utc)
    if expires_at <= _now():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Export 파일이 만료되었습니다 (보존 기간 7일). 다시 내보내 주세요.",
        )

    project = await db.get(Project, row.project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    ds, mockups = await _collect(
        db, project, ExportCreate(format=row.format, scope=row.scope)
    )
    content = _render(row.format, project, ds, mockups, row.watermark)
    filename = f"{project.name}_{ds.concept_label}.{FILE_SUFFIX[row.format]}"
    return Response(
        content=content,
        media_type=CONTENT_TYPES[row.format],
        headers={
            "Content-Disposition": f'attachment; filename="{_ascii_name(filename)}"'
        },
    )


@router.get("/projects/{project_id}/tokens.json")
async def project_tokens(
    project_id: str,
    user: CurrentUser,
    db: DbDep,
    concept: str | None = Query(default=None),
):
    """확정(또는 지정) 컨셉의 W3C DTCG Token 을 그대로 반환한다.

    MCP Server 의 `get_design_tokens` 가 사용할 동일 표현이다.
    """
    project = await _owned_project(db, project_id, user.id)
    label = (concept or project.confirmed_concept_label or "A").upper()
    ds = await db.scalar(
        select(DesignSystem).where(
            DesignSystem.project_id == project.id,
            DesignSystem.concept_label == label,
        )
    )
    if ds is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design system not found")
    return to_dtcg(ds.tokens or {})


@router.delete("/exports/{export_id}", response_model=Message)
async def delete_export(export_id: str, user: CurrentUser, db: DbDep):
    row = await db.get(ExportHistory, export_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")
    await db.delete(row)
    return Message(detail="Export deleted")


def _ascii_name(value: str) -> str:
    """Content-Disposition 헤더 안전용 — 비ASCII 문자를 치환한다."""
    return "".join(ch if ch.isascii() and ch not in '"\\' else "_" for ch in value)
