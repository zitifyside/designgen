"""DA identity PK + public_id + SCD hist + active views.

Revision ID: 202608161200
Revises:
Create Date: 2026-08-16

ADD 단계. 문자열 PK 를 BIGINT 로 바꾸는 DROP 은 별도 배포다.
SQLite 휘발 DB 는 init_db 가 스키마를 다시 만든다.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "202608161200"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    from app.core.database import Base
    from app import models  # noqa: F401
    from app.core.soft_delete import create_active_views

    Base.metadata.create_all(bind)
    create_active_views(bind)


def downgrade() -> None:
    # DROP 은 ADD 와 같은 배포에 넣지 않는다. 롤백 전용.
    for view in (
        "vw_user_active",
        "vw_project_active",
        "vw_generation_active",
        "vw_plan_active",
        "vw_template_active",
    ):
        op.execute(f'DROP VIEW IF EXISTS "{view}"')
    op.drop_table("log_user_hist")
    op.drop_table("log_plan_hist")
