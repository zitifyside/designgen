"""Create designgenerator DB and app role on Mac Mini Postgres. Idempotent.

Password is written only to /tmp/designgenerator_app.secret (mode 600).
Stdout is CREATED | EXISTS | ROLE_EXISTS_NO_PASSWORD — never the secret.
"""
from __future__ import annotations

import os
import secrets
import subprocess
import sys
from pathlib import Path

PSQL = "/opt/homebrew/opt/postgresql@18/bin/psql"
DB_NAME = "designgenerator"
ROLE_NAME = "designgenerator_app"
SECRET_PATH = Path("/tmp/designgenerator_app.secret")
SQL_PATH = Path("/tmp/designgenerator_provision.sql")


def psql(database: str, sql: str) -> str:
    result = subprocess.run(
        [PSQL, "-d", database, "-v", "ON_ERROR_STOP=1", "-Atc", sql],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def psql_file(database: str, path: Path) -> None:
    subprocess.run(
        [PSQL, "-d", database, "-v", "ON_ERROR_STOP=1", "-f", str(path)],
        check=True,
    )


def main() -> int:
    exists_db = psql("postgres", f"SELECT 1 FROM pg_database WHERE datname = '{DB_NAME}'") == "1"
    exists_role = psql("postgres", f"SELECT 1 FROM pg_roles WHERE rolname = '{ROLE_NAME}'") == "1"

    if exists_db and exists_role:
        print("EXISTS")
        return 0

    if exists_role and not exists_db:
        print("ROLE_EXISTS_NO_PASSWORD")
        return 2

    password = secrets.token_urlsafe(32)
    escaped = password.replace("'", "''")
    sql = "\n".join(
        [
            f"CREATE ROLE {ROLE_NAME} LOGIN PASSWORD '{escaped}';",
            f"CREATE DATABASE {DB_NAME} OWNER {ROLE_NAME} ENCODING 'UTF8' TEMPLATE template0;",
            f"GRANT ALL PRIVILEGES ON DATABASE {DB_NAME} TO {ROLE_NAME};",
            f"GRANT CONNECT ON DATABASE {DB_NAME} TO mae_backup;",
            f"REVOKE CONNECT ON DATABASE {DB_NAME} FROM PUBLIC;",
        ]
    )
    SQL_PATH.write_text(sql, encoding="utf-8")
    os.chmod(SQL_PATH, 0o600)
    try:
        psql_file("postgres", SQL_PATH)
        schema_sql = "\n".join(
            [
                f"GRANT ALL ON SCHEMA public TO {ROLE_NAME};",
                "GRANT USAGE ON SCHEMA public TO mae_backup;",
                f"ALTER SCHEMA public OWNER TO {ROLE_NAME};",
                "REVOKE CREATE ON SCHEMA public FROM PUBLIC;",
            ]
        )
        SQL_PATH.write_text(schema_sql, encoding="utf-8")
        psql_file(DB_NAME, SQL_PATH)
    finally:
        if SQL_PATH.exists():
            SQL_PATH.unlink()

    SECRET_PATH.write_text(password, encoding="utf-8")
    os.chmod(SECRET_PATH, 0o600)
    print("CREATED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
