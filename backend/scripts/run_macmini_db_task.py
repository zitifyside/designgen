"""Load Mac Mini DATABASE_URL from Secrets without printing it, then run check_db/alembic/seed."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ENV_PATH = Path(r"D:\Project\ContextBuilder\Secrets\env\mae\macdb\designgenerator.env")
BACKEND = Path(r"D:\Project\designgenerator\backend")
VENV_PY = BACKEND / ".venv" / "Scripts" / "python.exe"


def load_database_url() -> str:
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("DATABASE_URL missing in secrets file")


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else "check"
    url = load_database_url()
    env = os.environ.copy()
    env["DATABASE_URL"] = url
    env["CHECK_DATABASE_URL"] = url
    env["PGSSLMODE"] = "disable"
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    if action == "check":
        cmd = [str(VENV_PY), "scripts/check_db.py"]
    elif action == "alembic":
        cmd = [str(VENV_PY), "-m", "alembic", "upgrade", "head"]
    elif action == "seed":
        cmd = [str(VENV_PY), "-m", "app.seed"]
    else:
        raise SystemExit(f"unknown action {action}")
    completed = subprocess.run(cmd, cwd=str(BACKEND), env=env)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
