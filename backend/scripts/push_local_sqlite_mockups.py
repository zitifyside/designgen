"""Copy local SQLite project/mockup rows onto Mac Mini Postgres. Never print secrets."""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
import sqlite3
import sys
from pathlib import Path

from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SECRETS = Path(r"D:\Project\ContextBuilder\Secrets\env\mae\macdb\designgenerator.env")
SQLITE = ROOT / "designgen.db"
PK = {
    "trx_project": "project_id",
    "trx_design_system": "design_system_id",
    "trx_mockup": "mockup_id",
    "trx_generation": "generation_id",
}
JSON_COLS = {
    "concept_brief_json",
    "token_json",
    "overridden_field_json",
    "node_tree_json",
    "input_snapshot_json",
}
BOOL_COLS = {
    "is_favorite",
    "is_target_screen_inferred",
    "is_modified",
    "is_archived",
    "is_fallback",
    "is_warning",
    "is_free_retry_used",
}
TIME_COLS = {
    "created_at",
    "updated_at",
    "deleted_at",
    "locked_at",
    "started_at",
    "completed_at",
}
USER_COLS = {"owner_id", "user_id", "created_by", "updated_by", "deleted_by"}


def load_url() -> str:
    for line in SECRETS.read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("DATABASE_URL missing")


def parse_time(value):
    if value is None or value == "":
        return None
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=dt.timezone.utc)
        return value
    text_value = str(value).replace("Z", "+00:00")
    parsed = dt.datetime.fromisoformat(text_value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed


def parse_json(value):
    if value is None or value == "":
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    text_value = str(value)
    if text_value in {"null", "None"}:
        return None
    return json.loads(text_value)


def remap(row: dict, user_map: dict[str, str]) -> dict:
    out = dict(row)
    for col in USER_COLS:
        if col in out and out[col] in user_map:
            out[col] = user_map[out[col]]
    for col in JSON_COLS:
        if col in out:
            parsed = parse_json(out[col])
            out[col] = None if parsed is None else json.dumps(parsed, ensure_ascii=False)
    for col in BOOL_COLS:
        if col in out and out[col] is not None:
            out[col] = bool(out[col])
    for col in TIME_COLS:
        if col in out:
            out[col] = parse_time(out[col])
    return out


async def main() -> int:
    os.environ["DATABASE_URL"] = load_url()
    from app.core.database import AsyncSessionLocal

    sqlite = sqlite3.connect(str(SQLITE))
    sqlite.row_factory = sqlite3.Row
    sqlite_users = {
        row["email"]: row["public_id"]
        for row in sqlite.execute("select email, public_id from mst_user")
    }

    async with AsyncSessionLocal() as db:
        pg_users = {
            row[0]: row[1]
            for row in (
                await db.execute(text("select email, public_id from mst_user"))
            ).all()
        }
        user_map = {
            sqlite_users[email]: pg_users[email]
            for email in sqlite_users
            if email in pg_users
        }
        print("user-map-count", len(user_map))

        order = ["trx_project", "trx_design_system", "trx_mockup", "trx_generation"]
        for table in order:
            pk = PK[table]
            cols = [
                item[1]
                for item in sqlite.execute(f"pragma table_info({table})")
                if item[1] != pk
            ]
            rows = [remap(dict(item), user_map) for item in sqlite.execute(f"select * from {table}")]
            inserted = 0
            skipped = 0
            for row in rows:
                payload = {col: row[col] for col in cols}
                exists = await db.scalar(
                    text(f"select 1 from {table} where public_id = :id"),
                    {"id": payload["public_id"]},
                )
                if exists:
                    skipped += 1
                    continue
                placeholders = ", ".join(f":{col}" for col in cols)
                colnames = ", ".join(cols)
                await db.execute(
                    text(f"insert into {table} ({colnames}) values ({placeholders})"),
                    payload,
                )
                inserted += 1
            print(table, "inserted", inserted, "skipped", skipped)
        await db.commit()
        mockup_n = await db.scalar(text("select count(*) from trx_mockup where deleted_at is null"))
        project_n = await db.scalar(text("select count(*) from trx_project where deleted_at is null"))
        print("pg-projects", int(project_n or 0), "pg-mockups", int(mockup_n or 0))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
