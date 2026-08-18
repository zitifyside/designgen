"""DA 잔여 — 활성 뷰 확장 + SCD 이력 컬럼 ADD.

Revision ID: 202608161400
Revises: 202608161200
Create Date: 2026-08-16

ADD 만 한다. 구 컬럼 DROP 은 별도 배포다.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202608161400"
down_revision: Union[str, None] = "202608161200"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PLAN_COLS = (
    ("monthly_generation_cnt", sa.Integer(), "3"),
    ("max_concept_cnt", sa.Integer(), "1"),
    ("max_variant_cnt", sa.Integer(), "3"),
    ("credit_unit_amt", sa.Numeric(15, 0), "0"),
)
_USER_COLS = (
    ("user_nm", sa.String(120), "''"),
    ("is_admin", sa.Boolean(), "0"),
    ("monthly_limit_cnt", sa.Integer(), "3"),
    ("language_cd", sa.String(8), "'ko'"),
    ("theme_cd", sa.String(8), "'system'"),
)


def _add_if_missing(table: str, name: str, col: sa.Column) -> None:
    bind = op.get_bind()
    present = {c["name"] for c in inspect(bind).get_columns(table)} if table in inspect(bind).get_table_names() else set()
    if name in present:
        return
    op.add_column(table, col)


def upgrade() -> None:
    bind = op.get_bind()
    from app.core.soft_delete import create_active_views

    create_active_views(bind)
    names = set(inspect(bind).get_table_names())
    if "log_plan_hist" in names:
        _add_if_missing(
            "log_plan_hist",
            "monthly_generation_cnt",
            sa.Column("monthly_generation_cnt", sa.Integer(), server_default="3"),
        )
        _add_if_missing(
            "log_plan_hist",
            "max_concept_cnt",
            sa.Column("max_concept_cnt", sa.Integer(), server_default="1"),
        )
        _add_if_missing(
            "log_plan_hist",
            "max_variant_cnt",
            sa.Column("max_variant_cnt", sa.Integer(), server_default="3"),
        )
        _add_if_missing(
            "log_plan_hist",
            "credit_unit_amt",
            sa.Column("credit_unit_amt", sa.Numeric(15, 0), server_default="0"),
        )
    if "log_user_hist" in names:
        _add_if_missing(
            "log_user_hist",
            "user_nm",
            sa.Column("user_nm", sa.String(120), server_default=sa.text("''")),
        )
        _add_if_missing(
            "log_user_hist",
            "is_admin",
            sa.Column("is_admin", sa.Boolean(), server_default="0"),
        )
        _add_if_missing(
            "log_user_hist",
            "monthly_limit_cnt",
            sa.Column("monthly_limit_cnt", sa.Integer(), server_default="3"),
        )
        _add_if_missing(
            "log_user_hist",
            "language_cd",
            sa.Column("language_cd", sa.String(8), server_default=sa.text("'ko'")),
        )
        _add_if_missing(
            "log_user_hist",
            "theme_cd",
            sa.Column("theme_cd", sa.String(8), server_default=sa.text("'system'")),
        )


def downgrade() -> None:
    # DROP 은 ADD 와 같은 배포에 넣지 않는다. 롤백 전용 파일 참고.
    pass
