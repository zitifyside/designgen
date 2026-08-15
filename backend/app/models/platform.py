"""Export 이력·API Key·팀 등 플랫폼 부가 모델."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import AuditMixin, TimestampMixin, pk_column, public_id_column

EXPORT_TTL_DAYS = 7


class ExportHistory(Base, TimestampMixin):
    __tablename__ = "log_export"

    pk: Mapped[int] = pk_column("export_id")
    id: Mapped[str] = public_id_column("exp")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("trx_project.public_id", ondelete="CASCADE"), index=True
    )
    project_name: Mapped[str] = mapped_column("project_nm", String(200), default="")
    format: Mapped[str] = mapped_column("format_cd", String(8))
    scope: Mapped[str] = mapped_column("scope_cd", String(12))
    resolution: Mapped[str | None] = mapped_column(String(4), nullable=True)
    concept_label: Mapped[str | None] = mapped_column(String(1), nullable=True)
    screen: Mapped[str | None] = mapped_column("screen_cd", String(60), nullable=True)
    variant_indexes: Mapped[list | None] = mapped_column(
        "variant_index_json", JSON, nullable=True
    )
    watermark: Mapped[bool] = mapped_column("is_watermark", Boolean, default=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    download_url: Mapped[str] = mapped_column(String(512), default="")
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    expiry_notified: Mapped[bool] = mapped_column(
        "is_expiry_notified", Boolean, default=False
    )


class ApiKey(Base, AuditMixin):
    __tablename__ = "trx_api_key"

    pk: Mapped[int] = pk_column("api_key_id")
    id: Mapped[str] = public_id_column("ak")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column("label_nm", String(120), default="")
    prefix: Mapped[str] = mapped_column("prefix_nm", String(16), index=True)
    key_hash: Mapped[str] = mapped_column(String(255))
    last_used_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    call_count: Mapped[int] = mapped_column("call_cnt", Integer, default=0)
    revoked: Mapped[bool] = mapped_column("is_revoked", Boolean, default=False)


class Team(Base, AuditMixin):
    __tablename__ = "mst_team"

    pk: Mapped[int] = pk_column("team_id")
    id: Mapped[str] = public_id_column("tm")
    name: Mapped[str] = mapped_column("team_nm", String(120))
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    seat_limit: Mapped[int] = mapped_column("seat_limit_cnt", Integer, default=5)
    description: Mapped[str] = mapped_column("team_desc", Text, default="")


class TeamMembership(Base, AuditMixin):
    __tablename__ = "trx_team_member_map"

    pk: Mapped[int] = pk_column("membership_id")
    id: Mapped[str] = public_id_column("tmm")
    team_id: Mapped[str] = mapped_column(
        ForeignKey("mst_team.public_id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), nullable=True, index=True
    )
    email: Mapped[str] = mapped_column(String(255), index=True)
    name: Mapped[str] = mapped_column("member_nm", String(120), default="")
    role: Mapped[str] = mapped_column("role_cd", String(10), default="Member")
    status: Mapped[str] = mapped_column("status_cd", String(10), default="Invited")
