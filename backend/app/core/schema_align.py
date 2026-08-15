"""레거시 테이블·컬럼을 DA 네이밍으로 맞춘다.

create_all 은 없는 테이블만 만든다. 기존 `users` 가 있으면 빈 `mst_user` 를
옆에 만들지 않도록, 이름 변경을 create_all 보다 먼저 실행한다.
"""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text

logger = logging.getLogger("adg")

# 구 테이블명 → DA 접두어·단수 테이블명 (테이블네이밍.md)
TABLE_RENAMES: dict[str, str] = {
    "users": "mst_user",
    "sessions": "trx_session",
    "email_verifications": "trx_email_verification",
    "password_resets": "trx_password_reset",
    "projects": "trx_project",
    "generations": "trx_generation",
    "design_systems": "trx_design_system",
    "mockups": "trx_mockup",
    "plans": "mst_plan",
    "subscriptions": "trx_subscription",
    "credit_transactions": "trx_credit",
    "payments": "trx_payment",
    "refunds": "trx_refund",
    "announcements": "mst_announcement",
    "audit_logs": "log_audit",
    "feedback": "trx_feedback",
    "app_log_events": "log_app_event",
    "notifications": "trx_notification",
    "export_history": "log_export",
    "api_keys": "trx_api_key",
    "teams": "mst_team",
    "team_memberships": "trx_team_member_map",
    "templates": "mst_template",
    "template_reviews": "trx_template_review",
    "template_purchases": "trx_template_purchase",
    "file_uploads": "trx_file_upload",
}

# 테이블별 구 컬럼 → DA 접미어 컬럼 (컬럼네이밍.md)
COLUMN_RENAMES: dict[str, dict[str, str]] = {
    "mst_user": {
        "id": "user_id",
        "name": "user_nm",
        "avatar": "avatar_url",
        "plan": "plan_cd",
        "credits": "credit_qty",
        "monthly_used": "monthly_used_cnt",
        "monthly_limit": "monthly_limit_cnt",
        "status": "status_cd",
        "email_verified": "is_email_verified",
        "two_factor_enabled": "is_two_factor_enabled",
        "two_factor_backup_codes": "backup_code_json",
        "notification_prefs": "notification_pref_json",
        "language": "language_cd",
        "theme": "theme_cd",
        "failed_login_attempts": "login_fail_cnt",
        "locked_until": "locked_until_at",
    },
    "trx_session": {
        "id": "session_id",
        "device": "device_nm",
        "ip": "ip_addr",
        "location": "location_nm",
        "revoked": "is_revoked",
    },
    "trx_email_verification": {"id": "verification_id"},
    "trx_password_reset": {"id": "reset_id"},
    "trx_project": {
        "id": "project_id",
        "name": "project_nm",
        "description": "project_desc",
        "platform": "platform_cd",
        "status": "status_cd",
        "concept_count": "concept_cnt",
        "variant_count": "variant_cnt",
        "ds_mode": "ds_mode_cd",
        "target_screen": "target_screen_cd",
        "target_screen_title": "target_screen_nm",
        "concept_briefs": "concept_brief_json",
    },
    "trx_generation": {
        "id": "generation_id",
        "kind": "kind_cd",
        "status": "status_cd",
        "stage": "stage_cd",
        "error": "error_desc",
        "warning_reason": "warning_desc",
        "screen": "screen_cd",
        "quota_bucket": "quota_bucket_cd",
        "input_snapshot": "input_snapshot_json",
        "ai_cost_cents": "ai_cost_amt",
    },
    "trx_design_system": {
        "id": "design_system_id",
        "concept_name": "concept_nm",
        "description": "concept_desc",
        "tokens": "token_json",
        "ds_mode": "ds_mode_cd",
        "overridden_fields": "overridden_field_json",
    },
    "trx_mockup": {
        "id": "mockup_id",
        "screen": "screen_cd",
        "screen_title": "screen_nm",
        "kind": "kind_cd",
        "title": "title_nm",
        "variant_label": "variant_nm",
        "node_tree": "node_tree_json",
    },
    "mst_plan": {
        "id": "plan_id",
        "code": "plan_cd",
        "name": "plan_nm",
        "monthly_generations": "monthly_generation_cnt",
        "max_concepts": "max_concept_cnt",
        "max_variants": "max_variant_cnt",
    },
    "trx_subscription": {
        "id": "subscription_id",
        "plan_code": "plan_cd",
        "status": "status_cd",
        "cancel_at_period_end": "is_cancel_at_period_end",
    },
    "trx_credit": {
        "id": "credit_id",
        "type": "type_cd",
        "amount": "credit_qty",
        "balance_after": "balance_qty",
        "note": "note_desc",
    },
    "trx_payment": {
        "id": "payment_id",
        "amount_cents": "amount_amt",
        "currency": "currency_cd",
        "status": "status_cd",
    },
    "trx_refund": {
        "id": "refund_id",
        "amount_cents": "amount_amt",
        "reason": "reason_desc",
        "status": "status_cd",
    },
    "mst_announcement": {
        "id": "announcement_id",
        "title": "title_nm",
        "body": "body_desc",
        "audience": "audience_json",
        "priority": "priority_cd",
        "status": "status_cd",
    },
    "log_audit": {
        "id": "audit_id",
        "actor": "actor_nm",
        "action": "action_cd",
        "target": "target_nm",
        "ip": "ip_addr",
        "severity": "severity_cd",
    },
    "trx_feedback": {
        "id": "feedback_id",
        "category": "category_cd",
        "title": "title_nm",
        "body": "body_desc",
        "status": "status_cd",
        "admin_response": "admin_response_desc",
    },
    "log_app_event": {
        "id": "log_id",
        "level": "level_cd",
        "tier": "tier_cd",
        "kind": "kind_cd",
        "message": "message_desc",
        "source": "source_nm",
        "method": "method_cd",
        "path": "path_nm",
        "payload": "payload_json",
        "stack": "stack_desc",
        "forward_state": "forward_state_cd",
    },
    "trx_notification": {
        "id": "notification_id",
        "category": "category_cd",
        "title": "title_nm",
        "body": "body_desc",
        "href": "href_url",
        "read": "is_read",
    },
    "log_export": {
        "id": "export_id",
        "project_name": "project_nm",
        "format": "format_cd",
        "scope": "scope_cd",
        "screen": "screen_cd",
        "variant_indexes": "variant_index_json",
        "watermark": "is_watermark",
        "expiry_notified": "is_expiry_notified",
    },
    "trx_api_key": {
        "id": "api_key_id",
        "label": "label_nm",
        "prefix": "prefix_nm",
        "call_count": "call_cnt",
        "revoked": "is_revoked",
    },
    "mst_team": {
        "id": "team_id",
        "name": "team_nm",
        "seat_limit": "seat_limit_cnt",
        "description": "team_desc",
    },
    "trx_team_member_map": {
        "id": "membership_id",
        "name": "member_nm",
        "role": "role_cd",
        "status": "status_cd",
    },
    "mst_template": {
        "id": "template_id",
        "author_name": "author_nm",
        "name": "template_nm",
        "description": "template_desc",
        "category": "category_cd",
        "concept_name": "concept_nm",
        "price": "price_amt",
        "downloads": "download_cnt",
        "tokens": "token_json",
        "status": "status_cd",
    },
    "trx_template_review": {
        "id": "review_id",
        "comment": "comment_desc",
    },
    "trx_template_purchase": {"id": "purchase_id"},
    "trx_file_upload": {
        "id": "upload_id",
        "filename": "file_nm",
        "kind": "kind_cd",
        "pages": "page_cnt",
        "extracted_text": "extracted_text_desc",
    },
}


def needs_identity_rebuild(conn) -> bool:
    """이전 세대(문자열 PK) 스키마면 테이블을 다시 만든다."""
    inspector = inspect(conn)
    names = set(inspector.get_table_names())
    if "users" in names and "mst_user" not in names:
        return False
    if "mst_user" not in names:
        return False
    cols = {c["name"]: c for c in inspector.get_columns("mst_user")}
    if "public_id" not in cols:
        return True
    pk = cols.get("user_id")
    if pk is None:
        return True
    return "INT" not in str(pk["type"]).upper()


def wipe_domain_tables(conn) -> list[str]:
    """SQLite 전용. Postgres 에서 부르면 거부한다."""
    if conn.dialect.name != "sqlite":
        raise RuntimeError("wipe_domain_tables 는 SQLite 전용이다")
    inspector = inspect(conn)
    dropped: list[str] = []
    conn.execute(text("PRAGMA foreign_keys=OFF"))
    for view in inspector.get_view_names():
        conn.execute(text(f'DROP VIEW IF EXISTS "{view}"'))
        dropped.append(f"view:{view}")
    names = inspector.get_table_names()
    prefixes = ("mst_", "trx_", "log_", "code_")
    legacy = set(TABLE_RENAMES)
    for name in names:
        if name.startswith(prefixes) or name in legacy:
            conn.execute(text(f'DROP TABLE IF EXISTS "{name}"'))
            dropped.append(name)
    return dropped


def align_legacy_schema(conn) -> list[str]:
    """구 테이블·컬럼 이름을 새 규칙으로 바꾼다. 추가만 하는 단계는 호출측."""
    changed: list[str] = []
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())

    for old, new in TABLE_RENAMES.items():
        if old in tables and new not in tables:
            conn.execute(text(f'ALTER TABLE "{old}" RENAME TO "{new}"'))
            changed.append(f"table {old}->{new}")
            tables.discard(old)
            tables.add(new)

    inspector = inspect(conn)
    for table, mapping in COLUMN_RENAMES.items():
        if table not in set(inspector.get_table_names()):
            continue
        present = {c["name"] for c in inspector.get_columns(table)}
        for old, new in mapping.items():
            if old in present and new not in present:
                conn.execute(
                    text(f'ALTER TABLE "{table}" RENAME COLUMN "{old}" TO "{new}"')
                )
                changed.append(f"{table}.{old}->{new}")
    return changed
