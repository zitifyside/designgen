"""프로젝트 첨부 파일 메타 (기획서 v0.5.0 §7 `file_uploads`).

원본 바이트는 저장하지 않는다 — 오브젝트 스토리지 연동 전이고 컨테이너
파일시스템은 휘발이라, AI 파이프라인이 실제로 소비하는 추출 텍스트와 메타만 남긴다.
"""
from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, id_column


class FileUpload(Base, TimestampMixin):
    __tablename__ = "file_uploads"

    id: Mapped[str] = id_column("fu")
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(String(40), index=True)

    filename: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(10))  # image | document
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    pages: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # 파이프라인 입력으로 합쳐지는 추출 텍스트 (이미지는 빈 문자열).
    extracted_text: Mapped[str] = mapped_column(Text, default="")
