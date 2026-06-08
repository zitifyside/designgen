"""템플릿 마켓플레이스(둘러보기, 상세, 리뷰). 구매는 스텁 처리됨."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.models.template import Template, TemplateReview
from app.schemas.common import Message
from app.schemas.template import TemplateOut, TemplateReviewIn

router = APIRouter(prefix="/templates", tags=["templates"])


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


@router.post("/{template_id}/purchase", response_model=Message)
async def purchase_template(template_id: str, user: CurrentUser, db: DbDep):
    # 결제 연동은 의도적으로 비워 둠(app/api/routes/billing.py 참고).
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Template purchase (payment) is not implemented yet.",
    )
