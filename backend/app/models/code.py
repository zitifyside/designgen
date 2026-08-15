"""공통 코드 테이블 (DA 운영/코드테이블.md — 2단계 group → code)."""
from __future__ import annotations

from sqlalchemy import Boolean, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import AuditMixin, pk_column, public_id_column


class CodeGroup(Base, AuditMixin):
    __tablename__ = "code_group"

    pk: Mapped[int] = pk_column("group_id")
    id: Mapped[str] = public_id_column("cg")
    group_cd: Mapped[str] = mapped_column(String(30), unique=True)
    group_nm: Mapped[str] = mapped_column(String(100))
    group_desc: Mapped[str] = mapped_column(String(500), default="")


class CodeCommon(Base, AuditMixin):
    __tablename__ = "code_common"
    __table_args__ = (
        UniqueConstraint("group_cd", "code_value", name="uk_code_common_group_value"),
    )

    pk: Mapped[int] = pk_column("code_id")
    id: Mapped[str] = public_id_column("cc")
    group_cd: Mapped[str] = mapped_column(String(30), index=True)
    code_value: Mapped[str] = mapped_column(String(10))
    code_nm: Mapped[str] = mapped_column(String(100))
    code_desc: Mapped[str] = mapped_column(String(500), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
