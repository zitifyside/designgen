"""프로젝트 첨부 파일 메타."""
from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import AuditMixin, pk_column, public_id_column


class FileUpload(Base, AuditMixin):
    __tablename__ = "trx_file_upload"

    pk: Mapped[int] = pk_column("upload_id")
    id: Mapped[str] = public_id_column("fu")
    project_id: Mapped[str] = mapped_column(
        ForeignKey("trx_project.public_id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    filename: Mapped[str] = mapped_column("file_nm", String(160))
    kind: Mapped[str] = mapped_column("kind_cd", String(10))
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    pages: Mapped[int | None] = mapped_column("page_cnt", Integer, nullable=True)
    extracted_text: Mapped[str] = mapped_column("extracted_text_desc", Text, default="")
