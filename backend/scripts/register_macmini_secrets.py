"""Register Mac Mini designgenerator secrets locally. Never prints the password."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

SSH_KEY = Path.home() / ".ssh" / "id_ed25519_mac"
HOST = "joon@192.168.0.5"
REMOTE_SECRET = "/tmp/designgenerator_app.secret"
LOCAL_SECRET = Path(os.environ["TEMP"]) / "designgenerator_app.secret"
SECRETS_DIR = Path(r"D:\Project\ContextBuilder\Secrets\env\mae\macdb")
ENV_PATH = SECRETS_DIR / "designgenerator.env"
MACDB_ENV = SECRETS_DIR / ".env"
PGPASS = Path.home() / "AppData" / "Roaming" / "postgresql" / "pgpass.conf"
DB_HOST = "192.168.0.5"
DB_PORT = "5432"
DB_NAME = "designgenerator"
DB_USER = "designgenerator_app"


def ssh_base() -> list[str]:
    return ["ssh", "-i", str(SSH_KEY), "-o", "BatchMode=yes", HOST]


def scp_base() -> list[str]:
    return ["scp", "-i", str(SSH_KEY), "-o", "BatchMode=yes"]


def main() -> int:
    subprocess.run(scp_base() + [f"{HOST}:{REMOTE_SECRET}", str(LOCAL_SECRET)], check=True)
    password = LOCAL_SECRET.read_text(encoding="utf-8").strip()
    if not password:
        print("secret file empty", file=sys.stderr)
        return 2

    encoded = quote(password, safe="")
    url = f"postgresql://{DB_USER}:{encoded}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    env_body = "\n".join(
        [
            f"DATABASE_URL={url}",
            "DB_SSL=false",
            f"PGHOST={DB_HOST}",
            f"PGPORT={DB_PORT}",
            f"PGUSER={DB_USER}",
            f"PGDATABASE={DB_NAME}",
            f"PGPASSWORD={password}",
            "",
        ]
    )
    ENV_PATH.write_text(env_body, encoding="utf-8")

    lines = MACDB_ENV.read_text(encoding="utf-8").splitlines()
    out: list[str] = []
    for line in lines:
        if line.startswith("MACDB_BACKUP_DATABASES="):
            key, _, raw = line.partition("=")
            names = [n.strip() for n in raw.split(",") if n.strip()]
            if DB_NAME not in names:
                names.append(DB_NAME)
            names = sorted(set(names))
            out.append(f"{key}={','.join(names)}")
        else:
            out.append(line)
    MACDB_ENV.write_text("\n".join(out) + "\n", encoding="utf-8")

    PGPASS.parent.mkdir(parents=True, exist_ok=True)
    pg_line = f"{DB_HOST}:{DB_PORT}:{DB_NAME}:{DB_USER}:{password}"
    existing = PGPASS.read_text(encoding="utf-8") if PGPASS.is_file() else ""
    pg_lines = [ln for ln in existing.splitlines() if ln.strip()]
    prefix = f"{DB_HOST}:{DB_PORT}:{DB_NAME}:{DB_USER}:"
    pg_lines = [ln for ln in pg_lines if not ln.startswith(prefix)]
    pg_lines.append(pg_line)
    PGPASS.write_text("\n".join(pg_lines) + "\n", encoding="utf-8")

    try:
        LOCAL_SECRET.unlink(missing_ok=True)
    except OSError:
        pass
    subprocess.run(ssh_base() + [f"rm -f {REMOTE_SECRET} /tmp/provision_macmini_postgres.py"], check=False)
    print(f"wrote {ENV_PATH.name}; backup list updated; pgpass line upserted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
