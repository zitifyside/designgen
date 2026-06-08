"""공통 스키마 베이스. Next.js 프론트엔드에 맞춰 camelCase로 직렬화한다."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class Message(CamelModel):
    detail: str


class Page(CamelModel):
    """범용 페이지네이션 래퍼."""

    total: int
    page: int
    page_size: int
    items: list
