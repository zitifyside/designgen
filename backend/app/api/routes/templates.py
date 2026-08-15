"""템플릿 마켓플레이스(둘러보기, 상세, 리뷰). 구매는 스텁 처리됨."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.models.design import DesignSystem
from app.models.project import Project
from app.models.user import User
from app.models.template import Template, TemplateReview
from app.schemas.common import Message
from app.schemas.template import (
    TemplateCreate,
    TemplateOut,
    TemplateReviewIn,
    TemplateReviewOut,
    TemplateReviewsOut,
)
from app.services.quota import require_plan

router = APIRouter(prefix="/templates", tags=["templates"])

# 템플릿 등록·판매는 Pro 이상 (기능정의서 v0.2.0 §5.1 권한 매트릭스).
TEMPLATE_AUTHOR_PLANS = ("Pro", "Team", "Admin")


@router.get("", response_model=list[TemplateOut])
async def list_templates(
    db: DbDep,
    category: str | None = Query(default=None),
    q: str | None = Query(default=None),
):
    stmt = select(Template).where(Template.status == "Approved")
    if category:
        stmt = stmt.where(Template.category == category)
    if q:
        stmt = stmt.where(Template.name.ilike(f"%{q}%"))
    stmt = stmt.order_by(Template.downloads.desc())
    rows = (await db.scalars(stmt)).all()
    return [TemplateOut.model_validate(t) for t in rows]


@router.get("/mine", response_model=list[TemplateOut])
async def list_my_templates(user: CurrentUser, db: DbDep):
    """내가 등록한 템플릿 (심사 상태 포함)."""
    rows = (
        await db.scalars(
            select(Template)
            .where(Template.author_id == user.id)
            .order_by(Template.created_at.desc())
        )
    ).all()
    return [TemplateOut.model_validate(t) for t in rows]


@router.post("", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(body: TemplateCreate, user: CurrentUser, db: DbDep):
    """내 DS 를 마켓에 등록한다 — Pro 이상, Admin 심사 대기(Pending) 상태로 생성된다."""
    require_plan(user, TEMPLATE_AUTHOR_PLANS, "템플릿 등록")

    tokens = None
    concept_name = body.concept_name
    if body.project_id:
        project = await db.get(Project, body.project_id)
        if project is None or project.owner_id != user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        label = (body.concept_label or project.confirmed_concept_label or "A").upper()
        ds = await db.scalar(
            select(DesignSystem).where(
                DesignSystem.project_id == project.id,
                DesignSystem.concept_label == label,
            )
        )
        if ds is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Design system not found"
            )
        tokens = ds.tokens
        concept_name = concept_name or ds.concept_name

    template = Template(
        author_id=user.id,
        author_name=user.name,
        name=body.name,
        description=body.description,
        category=body.category,
        concept_name=concept_name or "",
        price=body.price,
        tokens=tokens,
        status="Pending",
    )
    db.add(template)
    await db.flush()
    return TemplateOut.model_validate(template)


@router.get("/{template_id}", response_model=TemplateOut)
async def get_template(template_id: str, db: DbDep):
    t = await db.get(Template, template_id)
    if t is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return TemplateOut.model_validate(t)


@router.post("/{template_id}/reviews", response_model=Message, status_code=status.HTTP_201_CREATED)
async def add_review(
    template_id: str, body: TemplateReviewIn, user: CurrentUser, db: DbDep
):
    t = await db.get(Template, template_id)
    if t is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    db.add(
        TemplateReview(
            template_id=template_id,
            user_id=user.id,
            rating=body.rating,
            comment=body.comment,
        )
    )
    return Message(detail="Review submitted")


@router.get("/{template_id}/reviews", response_model=TemplateReviewsOut)
async def list_reviews(template_id: str, db: DbDep):
    """리뷰와 평점 분포. 분포는 화면에서 다시 세지 않도록 서버가 만든다."""
    t = await db.get(Template, template_id)
    if t is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    rows = (
        await db.scalars(
            select(TemplateReview)
            .where(TemplateReview.template_id == template_id)
            .order_by(TemplateReview.created_at.desc())
            .limit(50)
        )
    ).all()

    # 작성자 이름을 한 번에 읽는다 (리뷰마다 조회하면 N+1 이다).
    names: dict[str, str] = {}
    if rows:
        users = (
            await db.scalars(
                select(User).where(User.id.in_({r.user_id for r in rows}))
            )
        ).all()
        names = {u.id: u.name for u in users}

    dist = {str(i): 0 for i in range(1, 6)}
    for r in rows:
        key = str(max(1, min(5, r.rating)))
        dist[key] += 1

    return TemplateReviewsOut(
        average=round(sum(r.rating for r in rows) / len(rows), 2) if rows else 0.0,
        total=len(rows),
        distribution=dist,
        reviews=[
            TemplateReviewOut(
                id=r.id,
                author_name=names.get(r.user_id, "알 수 없음"),
                rating=r.rating,
                comment=r.comment,
                created_at=r.created_at,
            )
            for r in rows
        ],
    )


@router.post("/{template_id}/purchase", response_model=Message)
async def purchase_template(template_id: str, user: CurrentUser, db: DbDep):
    # 결제 연동은 의도적으로 비워 둠(app/api/routes/billing.py 참고).
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Template purchase (payment) is not implemented yet.",
    )
