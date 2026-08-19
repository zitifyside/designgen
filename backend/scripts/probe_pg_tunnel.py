"""Local probe: cloudflared access tcp -> check_db. Never prints secrets."""
from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse, urlunparse

SECRETS = Path(r"D:\Project\ContextBuilder\Secrets\env\mae\macdb\designgenerator.env")
VENV_PY = Path(r"D:\Project\designgenerator\backend\.venv\Scripts\python.exe")
CHECK = Path(r"D:\Project\designgenerator\backend\scripts\check_db.py")
LOCAL_PORT = 15432


def load_env() -> dict[str, str]:
    data: dict[str, str] = {}
    for line in SECRETS.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        data[key.strip()] = val.strip()
    return data


def wait_port(port: int, timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket() as sock:
            sock.settimeout(0.5)
            try:
                sock.connect(("127.0.0.1", port))
                return True
            except OSError:
                time.sleep(0.3)
    return False


def rewrite_url(url: str, port: int) -> str:
    parsed = urlparse(url)
    host = f"127.0.0.1:{port}"
    return urlunparse(parsed._replace(netloc=f"{parsed.username}:{parsed.password}@{host}"))


def main() -> int:
    env_file = load_env()
    hostname = env_file.get("PG_TUNNEL_HOSTNAME", "")
    db_url = env_file.get("DATABASE_URL", "")
    if not hostname or not db_url:
        print("missing-hostname-or-url", file=sys.stderr)
        return 2
    proc = subprocess.Popen(
        [
            "cloudflared",
            "access",
            "tcp",
            "--hostname",
            hostname,
            "--url",
            f"127.0.0.1:{LOCAL_PORT}",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        if not wait_port(LOCAL_PORT, 25):
            err = ""
            if proc.poll() is not None and proc.stderr:
                err = proc.stderr.read()[-500:]
            print("access-tcp-port-not-open")
            if err:
                print(err)
            return 3
        print("access-tcp-listening")
        check_url = rewrite_url(db_url, LOCAL_PORT)
        env = os.environ.copy()
        env["CHECK_DATABASE_URL"] = check_url
        env["DATABASE_URL"] = check_url
        env["PGSSLMODE"] = "disable"
        env["PYTHONUTF8"] = "1"
        completed = subprocess.run(
            [str(VENV_PY), str(CHECK)],
            cwd=str(CHECK.parent.parent),
            env=env,
        )
        return completed.returncode
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    raise SystemExit(main())
