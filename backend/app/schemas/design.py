"""디자인 시스템 및 목업 스키마.

`tokens`는 프론트엔드의 `DesignTokens` 형태(color / typography / spacing /
border / shadow / components)에 맞춘 자유 형식 dict로 유지한다. 모든 중첩
필드를 여기서 검증하면 API가 토큰 스키마와 강하게 결합되므로, JSON 그대로
전달하고 토큰 구조는 디자인 생성기가 소유하도록 한다.
"""
from __future__ import annotations

from typing import Any

from app.schemas.common import CamelModel


class DesignSystemOut(CamelModel):
    id: str
    project_id: str
    concept_label: str
    concept_name: str
    description: str
    tokens: dict[str, Any]
    is_modified: bool
    is_archived: bool
    ds_mode: str
    base_ds_id: str | None = None
    overridden_fields: dict[str, Any] | None = None


class DesignSystemUpdate(CamelModel):
    # 부분 토큰 패치. 서버 측에서 기존 토큰 트리에 병합된다.
    tokens: dict[str, Any]
    concept_name: str | None = None
    description: str | None = None


class MockupOut(CamelModel):
    id: str
    project_id: str
    concept_label: str
    index: int
    screen: str
    screen_title: str
    screen_order: int
    kind: str
    title: str
    variant_label: str
    image_url: str | None = None
    is_fallback: bool
    is_favorite: bool
