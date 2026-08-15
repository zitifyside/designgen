"""논리삭제 글로벌 필터 + 활성 뷰 (DA 논리삭제.md)."""
from __future__ import annotations

from sqlalchemy import event, text
from sqlalchemy.orm import ORMExecuteState, with_loader_criteria

from app.models.base import AuditMixin


_REGISTERED = False


def register_soft_delete(session_cls) -> None:
    global _REGISTERED
    if _REGISTERED:
        return
    _REGISTERED = True

    @event.listens_for(session_cls, "do_orm_execute")
    def _hide_deleted(execute_state: ORMExecuteState) -> None:
        if not execute_state.is_select:
            return
        if execute_state.execution_options.get("include_deleted"):
            return
        execute_state.statement = execute_state.statement.options(
            with_loader_criteria(
                AuditMixin,
                lambda cls: cls.deleted_at.is_(None),
                include_aliases=True,
            )
        )


ACTIVE_VIEWS = (
    ("vw_user_active", "mst_user"),
    ("vw_project_active", "trx_project"),
    ("vw_generation_active", "trx_generation"),
    ("vw_plan_active", "mst_plan"),
    ("vw_template_active", "mst_template"),
)


def create_active_views(conn) -> None:
    for view_nm, table_nm in ACTIVE_VIEWS:
        conn.execute(text(f'DROP VIEW IF EXISTS "{view_nm}"'))
        conn.execute(
            text(
                f'CREATE VIEW "{view_nm}" AS '
                f'SELECT * FROM "{table_nm}" WHERE deleted_at IS NULL'
            )
        )
