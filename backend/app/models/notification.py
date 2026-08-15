"""사용자 알림 모델."""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import AuditMixin, pk_column, public_id_column


class Notification(Base, AuditMixin):
    __tablename__ = "trx_notification"

    pk: Mapped[int] = pk_column("notification_id")
    id: Mapped[str] = public_id_column("ntf")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    category: Mapped[str] = mapped_column("category_cd", String(20), default="system")
    title: Mapped[str] = mapped_column("title_nm", String(200))
    body: Mapped[str] = mapped_column("body_desc", Text, default="")
    href: Mapped[str | None] = mapped_column("href_url", String(512), nullable=True)
    read: Mapped[bool] = mapped_column("is_read", Boolean, default=False)
