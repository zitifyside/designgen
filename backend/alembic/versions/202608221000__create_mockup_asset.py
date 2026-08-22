"""시안 이미지 에셋 테이블 신설.

Revision ID: 202608221000
Revises: 202608161400
Create Date: 2026-08-22

Stage 4 Renderer 가 완성 페이지 마크업을 내면서 그 안의 사진·일러스트를
담을 곳이 필요해졌다. Cloud Run 파일시스템은 배포마다 사라지고 오브젝트
스토리지는 아직 없으므로, 시안과 수명을 같이 하도록 DB 에 둔다.

이미 있으면 만들지 않는다 — 재실행해도 같은 결과여야 한다.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202608221000"
down_revision: Union[str, None] = "202608161400"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "trx_mockup_asset"


def upgrade() -> None:
    bind = op.get_bind()
    if _TABLE in inspect(bind).get_table_names():
        return

    op.create_table(
        _TABLE,
        sa.Column(
            "mockup_asset_id",
            sa.BigInteger().with_variant(sa.Integer, "sqlite"),
            sa.Identity(),
            primary_key=True,
        ),
        sa.Column("public_id", sa.String(40), nullable=False),
        sa.Column("project_id", sa.String(40), nullable=False),
        sa.Column("slot_cd", sa.String(60), nullable=False, server_default=""),
        sa.Column("mime_cd", sa.String(60), nullable=False, server_default="image/png"),
        sa.Column("asset_bin", sa.LargeBinary(), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prompt_txt", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("created_by", sa.String(40), nullable=False, server_default="system"),
        sa.Column("updated_by", sa.String(40), nullable=False, server_default="system"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.String(40), nullable=True),
        sa.ForeignKeyConstraint(
            ["project_id"], ["trx_project.public_id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ux_mockup_asset_public_id", _TABLE, ["public_id"], unique=True
    )
    op.create_index("ix_mockup_asset_project_id", _TABLE, ["project_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if _TABLE not in inspect(bind).get_table_names():
        return
    op.drop_index("ix_mockup_asset_project_id", table_name=_TABLE)
    op.drop_index("ux_mockup_asset_public_id", table_name=_TABLE)
    op.drop_table(_TABLE)
