"""첨부 파일 스키마."""
from __future__ import annotations

import datetime as dt

from app.schemas.common import CamelModel


class FileUploadOut(CamelModel):
    id: str
    project_id: str
    filename: str
    kind: str  # image | document
    content_type: str
    size_bytes: int
    pages: int | None = None
    # 분석에 실제로 들어간 텍스트 분량 (원문은 응답에 싣지 않는다).
    extracted_chars: int
    created_at: dt.datetime
