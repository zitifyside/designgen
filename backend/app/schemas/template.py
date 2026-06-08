"""템플릿 마켓플레이스 스키마."""
from __future__ import annotations

from pydantic import Field

from app.schemas.common import CamelModel


class TemplateOut(CamelModel):
    id: str
    name: str
    author_name: str
    category: str
    price: int
    rating: float
    downloads: int
    description: str
    concept_name: str


class TemplateCreate(CamelModel):
    name: str = Field(min_length=1, max_length=200)
    category: str
    description: str = ""
    concept_name: str = ""
    price: int = 0


class TemplateReviewIn(CamelModel):
    rating: int = Field(ge=1, le=5)
    comment: str = ""
