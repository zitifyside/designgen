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


# MST/TRX/CODE 논리삭제 대상. LOG 는 파기 대상이라 뷰를 두지 않는다.
ACTIVE_VIEWS = (
    ("vw_user_active", "mst_user"),
    ("vw_plan_active", "mst_plan"),
    ("vw_announcement_active", "mst_announcement"),
    ("vw_template_active", "mst_template"),
    ("vw_team_active", "mst_team"),
    ("vw_project_active", "trx_project"),
    ("vw_generation_active", "trx_generation"),
    ("vw_design_system_active", "trx_design_system"),
    ("vw_mockup_active", "trx_mockup"),
    ("vw_subscription_active", "trx_subscription"),
    ("vw_credit_active", "trx_credit"),
    ("vw_payment_active", "trx_payment"),
    ("vw_refund_active", "trx_refund"),
    ("vw_feedback_active", "trx_feedback"),
    ("vw_notification_active", "trx_notification"),
    ("vw_file_upload_active", "trx_file_upload"),
    ("vw_template_review_active", "trx_template_review"),
    ("vw_template_purchase_active", "trx_template_purchase"),
    ("vw_api_key_active", "trx_api_key"),
    ("vw_team_member_active", "trx_team_member_map"),
    ("vw_session_active", "trx_session"),
    ("vw_email_verification_active", "trx_email_verification"),
    ("vw_password_reset_active", "trx_password_reset"),
    ("vw_code_group_active", "code_group"),
    ("vw_code_common_active", "code_common"),
)


ALL_VIEWS = tuple(
    (name.replace("_active", "_all"), table) for name, table in ACTIVE_VIEWS
)


def create_active_views(conn) -> None:
    """활성 뷰 + 관리자 전체 뷰 (논리삭제.md §4)."""
    for view_nm, table_nm in ACTIVE_VIEWS:
        conn.execute(text(f'DROP VIEW IF EXISTS "{view_nm}"'))
        conn.execute(
            text(
                f'CREATE VIEW "{view_nm}" AS '
                f'SELECT * FROM "{table_nm}" WHERE deleted_at IS NULL'
            )
        )
    for view_nm, table_nm in ALL_VIEWS:
        conn.execute(text(f'DROP VIEW IF EXISTS "{view_nm}"'))
        conn.execute(text(f'CREATE VIEW "{view_nm}" AS SELECT * FROM "{table_nm}"'))
