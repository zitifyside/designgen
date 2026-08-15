"""Export 이력·API Key·팀 등 플랫폼 부가 모델.

기획서 v0.5.0 §7 '데이터 구조' 의 미구현 테이블 중 v1.0 Web App 이 실제로
사용하는 4종(export_history·api_keys·teams·team_memberships)을 구현한다.
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, id_column

# Export 파일 보존 기간 (기능정의서 v0.2.0 §3.1 — 생성 후 7일 경과 시 자동 삭제)
EXPORT_TTL_DAYS = 7


class ExportHistory(Base, TimestampMixin):
    __tablename__ = "export_history"

    id: Mapped[str] = id_column("exp")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    project_name: Mapped[str] = mapped_column(String(200), default="")
    format: Mapped[str] = mapped_column(String(8))  # png | fig | json | css
    scope: Mapped[str] = mapped_column(String(12))  # current | concept | all
    resolution: Mapped[str | None] = mapped_column(String(4), nullable=True)  # 1x|2x|3x
    watermark: Mapped[bool] = mapped_column(Boolean, default=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    download_url: Mapped[str] = mapped_column(String(512), default="")
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    # 만료 24시간 전 안내를 이미 보냈는지 (기능정의서 v0.2.0 §3.1 '자동 만료').
    # 보낸 사실을 기록하지 않으면 화면을 열 때마다 같은 알림이 쌓인다.
    expiry_notified: Mapped[bool] = mapped_column(Boolean, default=False)


class ApiKey(Base, TimestampMixin):
    """사용자 API Key (Public API·MCP 인증용, Pro 이상 발급).

    서비스 내부 Provider Key (LLM·Image Gen 호출용) 와는 별개 체계다
    (기획서 v0.5.0 §4 F-204 제약사항).
    """

    __tablename__ = "api_keys"

    id: Mapped[str] = id_column("ak")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(120), default="")
    prefix: Mapped[str] = mapped_column(String(16), index=True)
    key_hash: Mapped[str] = mapped_column(String(255))
    last_used_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    call_count: Mapped[int] = mapped_column(Integer, default=0)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class Team(Base, TimestampMixin):
    """Team 등급 워크스페이스 (서비스정책서 §2.6·§18.2)."""

    __tablename__ = "teams"

    id: Mapped[str] = id_column("tm")
    name: Mapped[str] = mapped_column(String(120))
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # 기본 정원 5명, 초과 시드는 1인당 월 $9 로 과금한다.
    seat_limit: Mapped[int] = mapped_column(Integer, default=5)
    description: Mapped[str] = mapped_column(Text, default="")


class TeamMembership(Base, TimestampMixin):
    """팀 멤버십. 역할은 Owner·Admin·Member 3종 (서비스정책서 §18.2)."""

    __tablename__ = "team_memberships"

    id: Mapped[str] = id_column("tmm")
    team_id: Mapped[str] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # 미가입자 초대는 이메일만 보관하고 가입 시 user_id 를 연결한다.
    email: Mapped[str] = mapped_column(String(255), index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    role: Mapped[str] = mapped_column(String(10), default="Member")  # Owner|Admin|Member
    status: Mapped[str] = mapped_column(String(10), default="Invited")  # Invited|Active
