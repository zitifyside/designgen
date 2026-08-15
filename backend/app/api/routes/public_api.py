"""Public API — API Key 인증으로 접근하는 읽기 전용 표면.

기획서 v0.5.0 §4 F-204 의 MCP Tool 과 1:1 로 대응한다. MCP Server 는 이 REST 를
감싸는 얇은 어댑터이므로, 계약을 한 곳(여기)에만 두어 두 표면이 갈라지지 않게 한다.

| MCP Tool                | 여기 대응                                   |
|-------------------------|---------------------------------------------|
| `list_projects`         | GET /public/projects                        |
| `get_design_tokens`     | GET /public/projects/{id}/tokens            |
| `get_mockup_context`    | GET /public/projects/{id}/mockups           |
| `get_component_styles`  | GET /public/projects/{id}/components        |
| `subscribe_token_changes` | 미구현 (WebSocket — v1.0 로드맵)          |

읽기 전용이다. 생성·수정은 웹 세션(JWT)에서만 하며, 유출된 키로 자원이 바뀌는 일이
없게 한다.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import ApiKeyUser, DbDep
from app.core.identity import get_pub
from app.core.observability import log_event
from app.models.design import DesignSystem, Mockup
from app.models.project import Project
from app.services.export import to_dtcg

router = APIRouter(prefix="/public", tags=["public-api"])


async def _owned(db: DbDep, project_id: str, user_id: str) -> Project:
    project = await get_pub(db, Project, project_id)
    if project is None or project.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


async def _design_system(db, project: Project, concept: str | None) -> DesignSystem:
    label = (concept or project.confirmed_concept_label or "A").upper()
    ds = await db.scalar(
        select(DesignSystem).where(
            DesignSystem.project_id == project.id,
            DesignSystem.concept_label == label,
        )
    )
    if ds is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 컨셉의 디자인 시스템이 없습니다.",
        )
    return ds


@router.get("/projects")
async def list_projects(user: ApiKeyUser, db: DbDep):
    """MCP `list_projects` — 내 프로젝트 목록."""
    rows = (
        await db.scalars(
            select(Project)
            .where(Project.owner_id == user.id)
            .order_by(Project.updated_at.desc())
        )
    ).all()
    log_event(
        kind="public_api.list_projects",
        message="Public API 프로젝트 목록 조회",
        user_id=user.id,
        payload={"count": len(rows)},
    )
    return {
        "projects": [
            {
                "id": p.id,
                "name": p.name,
                "platform": p.platform,
                "status": p.status,
                "confirmedConcept": p.confirmed_concept_label,
                "targetScreen": p.target_screen,
                "updatedAt": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in rows
        ]
    }


@router.get("/projects/{project_id}/tokens")
async def get_design_tokens(
    project_id: str,
    user: ApiKeyUser,
    db: DbDep,
    concept: str | None = Query(default=None, max_length=1),
):
    """MCP `get_design_tokens` — W3C DTCG 표준 JSON.

    컨셉을 지정하지 않으면 확정 컨셉을 쓴다 — 코딩 도구는 보통 "이 프로젝트의
    확정 토큰"을 원하지 어느 컨셉인지까지 알고 있지 않다.
    """
    project = await _owned(db, project_id, user.id)
    ds = await _design_system(db, project, concept)
    log_event(
        kind="public_api.get_design_tokens",
        message="Public API 토큰 조회",
        user_id=user.id,
        payload={"projectId": project.id, "concept": ds.concept_label},
    )
    return {
        "projectId": project.id,
        "projectName": project.name,
        "concept": {"label": ds.concept_label, "name": ds.concept_name},
        "dsMode": ds.ds_mode,
        "tokens": to_dtcg(ds.tokens or {}),
    }


@router.get("/projects/{project_id}/mockups")
async def get_mockup_context(
    project_id: str,
    user: ApiKeyUser,
    db: DbDep,
    concept: str | None = Query(default=None, max_length=1),
    screen: str | None = Query(default=None, max_length=60),
):
    """MCP `get_mockup_context` — 화면·구조 변형 목록.

    시안은 **동일 화면의 구조 변형**이므로 screen 축과 variantIndex 를 분리해 준다.
    코딩 도구가 "어떤 화면의 몇 번째 변형인지"를 그대로 프롬프트에 쓸 수 있게 한다.
    """
    project = await _owned(db, project_id, user.id)
    label = (concept or project.confirmed_concept_label or "A").upper()

    stmt = select(Mockup).where(
        Mockup.project_id == project.id, Mockup.concept_label == label
    )
    if screen:
        stmt = stmt.where(Mockup.screen == screen)
    rows = (await db.scalars(stmt.order_by(Mockup.screen_order, Mockup.index))).all()

    screens: dict[str, dict] = {}
    for m in rows:
        entry = screens.setdefault(
            m.screen,
            {"screen": m.screen, "title": m.screen_title, "archetype": m.kind, "variants": []},
        )
        entry["variants"].append(
            {
                "variantIndex": m.index,
                "title": m.title,
                "structure": m.variant_label,
                "isFallback": m.is_fallback,
            }
        )

    log_event(
        kind="public_api.get_mockup_context",
        message="Public API 시안 컨텍스트 조회",
        user_id=user.id,
        payload={"projectId": project.id, "concept": label, "screens": len(screens)},
    )
    return {
        "projectId": project.id,
        "concept": label,
        "screens": list(screens.values()),
    }


@router.get("/projects/{project_id}/components")
async def get_component_styles(
    project_id: str,
    user: ApiKeyUser,
    db: DbDep,
    concept: str | None = Query(default=None, max_length=1),
):
    """MCP `get_component_styles` — 컴포넌트별 해석된 스타일 값.

    Token 원본만 주면 도구가 매번 같은 계산(스케일·라운드·그림자 매핑)을 다시 한다.
    여기서 **해석된 최종 값**까지 내려 준다.
    """
    project = await _owned(db, project_id, user.id)
    ds = await _design_system(db, project, concept)
    tokens = ds.tokens or {}
    color = tokens.get("color", {})
    typo = tokens.get("typography", {})
    border = tokens.get("border", {})
    spacing = tokens.get("spacing", {})
    components = tokens.get("components", {})
    base_unit = spacing.get("baseUnit", 8)

    radius_button = {
        "pill": "999px",
        "square": "4px",
    }.get(components.get("buttonVariant"), f"{border.get('radiusMd', 8)}px")

    log_event(
        kind="public_api.get_component_styles",
        message="Public API 컴포넌트 스타일 조회",
        user_id=user.id,
        payload={"projectId": project.id, "concept": ds.concept_label},
    )
    return {
        "projectId": project.id,
        "concept": ds.concept_label,
        "components": {
            "button": {
                "background": color.get("primary"),
                "color": "#FFFFFF",
                "borderRadius": radius_button,
                "paddingY": f"{base_unit * 1.5}px",
                "paddingX": f"{base_unit * 3}px",
                "fontWeight": (typo.get("weights") or {}).get("bold"),
                "variant": components.get("buttonVariant"),
            },
            "input": {
                "background": (
                    color.get("surface")
                    if components.get("inputStyle") != "filled"
                    else f"{color.get('neutral')}1A"
                ),
                "borderWidth": f"{border.get('width', 1)}px",
                "borderStyle": border.get("style", "solid"),
                "borderRadius": f"{border.get('radiusSm', 6)}px",
                "style": components.get("inputStyle"),
            },
            "card": {
                "background": color.get("surface"),
                "borderRadius": f"{border.get('radiusMd', 10)}px",
                "padding": f"{base_unit * 3}px",
                "elevation": components.get("cardElevation"),
                "shadowPreset": (tokens.get("shadow") or {}).get("preset"),
            },
            "typography": {
                "fontFamily": typo.get("fontFamily"),
                "baseSize": f"{typo.get('baseSize', 14)}px",
                "scale": typo.get("scale"),
                "lineHeight": typo.get("lineHeight"),
            },
        },
    }
