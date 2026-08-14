"""생성 파이프라인 오케스트레이터.

전체 생성은 네 단계(InputAnalyzer → ConceptEngine → LayoutEngine → Renderer)를
구동하고, **화면 추가 생성**은 확정 Token 을 주입하여 Layout Engine → Renderer 만
실행하는 경량 2단계 경로를 쓴다 (기획서 v0.5.0 §4 '화면 추가 생성').

진행에 따라 Generation 행의 stage/progress 를 갱신하고, 결과로 생성된
디자인 시스템 + 목업을 영속화한다.

FastAPI BackgroundTask로 실행된다. 프로덕션에서는 재시도와 우선순위 큐를
갖춘 실제 작업 큐(arq, Celery)로 옮기게 된다 — 아래 단계 함수들은 그 교체가
기계적으로 이뤄질 수 있도록 작성되어 있다.

Provider 선택:
  - FAKE_AI_PIPELINE=true  → 결정론적 placeholder 출력(기본값; API 키 없이도
    실행되어 프론트엔드가 처음부터 끝까지 동작한다).
  - FAKE_AI_PIPELINE=false → 설정된 AIProvider를 호출한다. Renderer 가 3회
    실패하면 Token 기반 CSS 렌더링으로 Fallback 하고 Completed (Warning) 으로
    마감한다 (기획서 v0.5.0 §6 시나리오 4).
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.design import DesignSystem, Mockup
from app.models.generation import Generation
from app.models.notification import Notification
from app.models.project import DS_MODE_UNIFIED, Project
from app.models.user import User
from app.services.ai.base import AIProvider
from app.services.ai.codex import CodexProvider
from app.services.ai.gemini import GeminiProvider
from app.services.ai.placeholder import (
    archetype_for,
    infer_target_screen,
    placeholder_concepts,
    placeholder_layouts,
)
from app.services.quota import refund_generation

# 단계 → 누적 진행률 체크포인트(%)
STAGE_PROGRESS = {
    "InputAnalyzer": 15,
    "ConceptEngine": 40,
    "LayoutEngine": 70,
    "Renderer": 95,
    "Done": 100,
}

# 경량(화면 추가) 파이프라인은 Layout Engine 부터 시작한다.
SCREEN_STAGE_PROGRESS = {"LayoutEngine": 45, "Renderer": 90, "Done": 100}

RENDER_MAX_ATTEMPTS = 3
FALLBACK_REASON = (
    "Image Gen 3회 실패로 Token 기반 CSS 렌더링으로 대체했습니다. "
    "콘텐츠 슬롯은 단색 Placeholder 로 표시됩니다."
)


def get_provider(name: str = "gemini") -> AIProvider:
    return {"gemini": GeminiProvider, "codex": CodexProvider}.get(
        name, GeminiProvider
    )()


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


# --- 전체 생성 (4단계) --------------------------------------------------------


async def run_generation(
    generation_id: str,
    *,
    concepts: int,
    variants: int,
    ds_mode: str = "per_concept",
    concept_briefs: list[dict] | None = None,
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
            await _set_stage(db, gen, "InputAnalyzer")

            # 생성 화면 미지정 시 Input Analyzer 가 대표 화면을 추론한다.
            screen, screen_title = project.target_screen, project.target_screen_title
            if not screen:
                screen, screen_title = infer_target_screen(
                    project.requirements_text, project.platform
                )
                project.target_screen = screen
                project.target_screen_title = screen_title
                project.target_screen_inferred = True

            if settings.fake_ai_pipeline:
                concept_sets, layouts_by_concept, fallback = await _run_fake(
                    concepts, variants, ds_mode, screen, screen_title, concept_briefs
                )
            else:
                concept_sets, layouts_by_concept, fallback = await _run_real(
                    gen, project, concepts, variants, ds_mode,
                    screen, screen_title, concept_briefs, provider_name, db,
                )

            await _set_stage(db, gen, "Renderer")

            # 디자인 시스템 + 목업을 영속화(이전 출력이 있으면 교체).
            # 명시적 삭제 — 비동기 세션은 관계를 지연 로딩할 수 없다.
            await db.execute(
                delete(DesignSystem).where(DesignSystem.project_id == project.id)
            )
            await db.execute(delete(Mockup).where(Mockup.project_id == project.id))
            await db.flush()

            base_ds_id: str | None = None
            for c in concept_sets:
                ds = DesignSystem(
                    project_id=project.id,
                    concept_label=c["conceptLabel"],
                    concept_name=c["conceptName"],
                    description=c.get("description", ""),
                    tokens=c["tokens"],
                    ds_mode=ds_mode,
                    overridden_fields=c.get("overriddenFields"),
                )
                db.add(ds)
                await db.flush()
                if ds_mode == DS_MODE_UNIFIED:
                    if base_ds_id is None:
                        base_ds_id = ds.id  # 첫 컨셉이 Base DS 다.
                    else:
                        ds.base_ds_id = base_ds_id

            for c in concept_sets:
                for idx, layout in enumerate(layouts_by_concept[c["conceptLabel"]]):
                    db.add(
                        Mockup(
                            project_id=project.id,
                            concept_label=c["conceptLabel"],
                            index=idx,
                            screen=layout.get("screen", screen),
                            screen_title=layout.get("screenTitle", screen_title),
                            screen_order=0,  # 대표 화면은 항상 첫 화면이다.
                            kind=layout["kind"],
                            title=layout["title"],
                            variant_label=layout.get("variantLabel", ""),
                            node_tree=layout.get("nodeTree"),
                            is_fallback=bool(layout.get("isFallback")),
                        )
                    )

            gen.status = "Done"
            gen.stage = "Done"
            gen.progress = 100
            gen.is_warning = fallback
            gen.warning_reason = FALLBACK_REASON if fallback else None
            gen.completed_at = _now()
            project.status = "CompletedWarning" if fallback else "Completed"
            db.add(
                Notification(
                    user_id=gen.user_id,
                    category="generation",
                    title="시안 생성 완료" if not fallback else "시안 생성 완료 (일부 대체)",
                    body=(
                        f"프로젝트 '{project.name}' 의 시안이 준비되었습니다."
                        if not fallback
                        else f"프로젝트 '{project.name}' 의 시안이 CSS 렌더링으로 대체 완료되었습니다."
                    ),
                    href=f"/projects/{project.id}",
                )
            )
            await db.commit()

        except Exception as exc:  # noqa: BLE001 — 실패를 기록하되 워커를 중단시키지 않음
            await _fail(db, generation_id, exc, reset_project_status="Failed")


# --- 화면 추가 생성 (경량 2단계) ----------------------------------------------


async def run_screen_generation(
    generation_id: str,
    *,
    screen: str,
    screen_title: str,
    variants: int = 3,
    provider_name: str = "gemini",
) -> None:
    """확정 DS Token 을 주입하여 Layout Engine → Renderer 만 실행한다.

    실패해도 기존 화면·DS 는 영향을 받지 않는다 (기획서 v0.5.0 §4 제약사항).
    """
    async with AsyncSessionLocal() as db:
        gen = await db.get(Generation, generation_id)
        if gen is None or gen.status in ("Cancelled", "Done"):
            return
        project = await db.get(Project, gen.project_id)
        if project is None:
            return

        gen.status = "Running"
        gen.stage = "LayoutEngine"
        gen.progress = SCREEN_STAGE_PROGRESS["LayoutEngine"]
        gen.started_at = _now()
        await db.commit()

        try:
            confirmed = await db.scalar(
                select(DesignSystem).where(
                    DesignSystem.project_id == project.id,
                    DesignSystem.concept_label == project.confirmed_concept_label,
                )
            )
            if confirmed is None:
                raise RuntimeError("확정된 컨셉의 디자인 시스템을 찾을 수 없습니다.")

            if settings.fake_ai_pipeline:
                layouts = placeholder_layouts(variants, screen, screen_title)
                fallback = False
            else:
                provider = get_provider(provider_name)
                concept = {
                    "conceptLabel": confirmed.concept_label,
                    "conceptName": confirmed.concept_name,
                    "tokens": confirmed.tokens,
                    "targetScreen": screen,
                    "targetScreenTitle": screen_title,
                }
                layouts = await provider.generate_layouts(concept, variants)
                layouts = _normalize_layouts(layouts, variants, screen, screen_title)
                fallback = await _render_layouts(provider, layouts, confirmed.tokens)

            gen.stage = "Renderer"
            gen.progress = SCREEN_STAGE_PROGRESS["Renderer"]
            await db.commit()

            # 같은 화면이 이미 있으면 교체한다 (동일 화면 재생성).
            await db.execute(
                delete(Mockup).where(
                    Mockup.project_id == project.id, Mockup.screen == screen
                )
            )
            await db.flush()

            max_order = await db.scalar(
                select(Mockup.screen_order)
                .where(Mockup.project_id == project.id)
                .order_by(Mockup.screen_order.desc())
                .limit(1)
            )
            next_order = (max_order or 0) + 1

            for idx, layout in enumerate(layouts):
                db.add(
                    Mockup(
                        project_id=project.id,
                        concept_label=confirmed.concept_label,
                        index=idx,
                        screen=screen,
                        screen_title=screen_title,
                        screen_order=next_order,
                        kind=layout["kind"],
                        title=layout["title"],
                        variant_label=layout.get("variantLabel", ""),
                        node_tree=layout.get("nodeTree"),
                        is_fallback=bool(layout.get("isFallback")),
                    )
                )

            gen.status = "Done"
            gen.stage = "Done"
            gen.progress = 100
            gen.is_warning = fallback
            gen.warning_reason = FALLBACK_REASON if fallback else None
            gen.completed_at = _now()
            # 화면 추가 후에도 프로젝트는 컨셉 확정 상태를 유지한다.
            project.status = "ConceptLocked"
            db.add(
                Notification(
                    user_id=gen.user_id,
                    category="generation",
                    title="화면 추가 생성 완료",
                    body=f"'{project.name}' 에 '{screen_title}' 화면이 추가되었습니다.",
                    href=f"/projects/{project.id}",
                )
            )
            await db.commit()

        except Exception as exc:  # noqa: BLE001
            # 기존 화면은 그대로 두고 프로젝트 상태를 확정 상태로 되돌린다.
            await _fail(db, generation_id, exc, reset_project_status="ConceptLocked")


# --- 공통 헬퍼 ---------------------------------------------------------------


async def _fail(db, generation_id: str, exc: Exception, *, reset_project_status: str):
    await db.rollback()
    gen = await db.get(Generation, generation_id)
    if gen is None or gen.status == "Cancelled":
        return
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
        proj.status = reset_project_status
    # 시스템 장애 시 예약된 생성 횟수를 환불한다. 무차감 재시도 건은 예외다.
    if not gen.free_retry_used:
        user = await db.get(User, gen.user_id)
        if user is not None:
            refund_generation(user)
    await db.commit()


async def _set_stage(db, gen: Generation, stage: str) -> None:
    gen.stage = stage
    gen.progress = STAGE_PROGRESS.get(stage, gen.progress)
    await db.commit()


async def _run_fake(
    concepts: int,
    variants: int,
    ds_mode: str,
    screen: str,
    screen_title: str,
    concept_briefs: list[dict] | None = None,
):
    concept_sets = placeholder_concepts(concepts, ds_mode, concept_briefs)
    layouts_by_concept = {
        c["conceptLabel"]: placeholder_layouts(variants, screen, screen_title)
        for c in concept_sets
    }
    return concept_sets, layouts_by_concept, False


async def _run_real(
    gen, project, concepts, variants, ds_mode, screen, screen_title,
    concept_briefs, provider_name, db,
):
    provider = get_provider(provider_name)

    analysis = await provider.analyze_input(project.requirements_text, project.platform)
    analysis.setdefault("dsMode", ds_mode)
    analysis.setdefault("targetScreen", screen)
    analysis.setdefault("targetScreenTitle", screen_title)
    if concept_briefs:
        # 사용자가 컨셉 방향성을 직접 지정한 경우 Concept Engine 에 그대로 전달한다.
        analysis["conceptBriefs"] = concept_briefs

    await _set_stage(db, gen, "ConceptEngine")
    concept_sets = await provider.generate_concepts(analysis, concepts)

    await _set_stage(db, gen, "LayoutEngine")
    layouts_by_concept: dict[str, list[dict]] = {}
    fallback = False
    for c in concept_sets:
        c.setdefault("targetScreen", screen)
        c.setdefault("targetScreenTitle", screen_title)
        layouts = await provider.generate_layouts(c, variants)
        layouts = _normalize_layouts(layouts, variants, screen, screen_title)
        if await _render_layouts(provider, layouts, c["tokens"]):
            fallback = True
        layouts_by_concept[c["conceptLabel"]] = layouts
    return concept_sets, layouts_by_concept, fallback


def _normalize_layouts(
    layouts: list[dict], variants: int, screen: str, screen_title: str
) -> list[dict]:
    """Provider 출력에 화면 축·변형 라벨을 보강한다.

    Provider 가 화면 축을 빠뜨려도 시안이 '동일 화면의 구조 변형'이라는 정의를
    깨지 않도록 서버가 강제한다.
    """
    reference = placeholder_layouts(variants, screen, screen_title)
    normalized: list[dict] = []
    for idx, layout in enumerate(layouts[:variants]):
        ref = reference[min(idx, len(reference) - 1)]
        merged = dict(layout)
        merged["screen"] = screen
        merged["screenTitle"] = screen_title
        merged["kind"] = archetype_for(screen, screen_title)
        merged.setdefault("title", ref["title"])
        merged.setdefault("variantLabel", ref["variantLabel"])
        normalized.append(merged)
    return normalized


async def _render_layouts(provider: AIProvider, layouts: list[dict], tokens: dict) -> bool:
    """레이아웃별 Stage 4 렌더. 3회 실패 시 CSS Fallback 으로 표시한다.

    반환: 하나라도 Fallback 이 발생했는지 여부.
    """
    fallback_used = False
    for layout in layouts:
        for attempt in range(1, RENDER_MAX_ATTEMPTS + 1):
            try:
                artifact = await provider.render(layout, tokens)
                if artifact.get("nodeTree") is not None:
                    layout["nodeTree"] = artifact["nodeTree"]
                if artifact.get("imageUrl"):
                    layout["imageUrl"] = artifact["imageUrl"]
                break
            except NotImplementedError:
                raise
            except Exception:  # noqa: BLE001 — 재시도 후 Fallback
                if attempt == RENDER_MAX_ATTEMPTS:
                    layout["isFallback"] = True
                    fallback_used = True
    return fallback_used
