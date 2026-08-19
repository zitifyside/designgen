"""Docker cloudflared (no cert.pem) -> check_db. Never prints secrets."""
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
LOCAL_PORT = 15433
CONTAINER = "adg-cf-docker-probe"


def load_env() -> dict[str, str]:
    data: dict[str, str] = {}
    for line in SECRETS.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        data[key.strip()] = val.strip()
    return data


def wait_port(port: int, timeout: float = 30.0) -> bool:
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
    db_url = env_file.get("CLOUDRUN_DATABASE_URL") or env_file.get("DATABASE_URL", "")
    if not hostname or not db_url:
        print("missing-hostname-or-url", file=sys.stderr)
        return 2
    subprocess.run(["docker", "rm", "-f", CONTAINER], capture_output=True, check=False)
    started = subprocess.run(
        [
            "docker",
            "run",
            "-d",
            "--name",
            CONTAINER,
            "-p",
            f"127.0.0.1:{LOCAL_PORT}:5432",
            "cloudflare/cloudflared:latest",
            "access",
            "tcp",
            "--hostname",
            hostname,
            "--url",
            "0.0.0.0:5432",
        ],
        capture_output=True,
        text=True,
    )
    if started.returncode != 0:
        print("docker-run-failed")
        return 4
    try:
        time.sleep(2)
        inspect = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Running}} {{.State.ExitCode}}", CONTAINER],
            capture_output=True,
            text=True,
            check=True,
        )
        state = inspect.stdout.strip()
        if not state.startswith("true"):
            print("container-exited", state)
            return 5
        if not wait_port(LOCAL_PORT, 25):
            print("access-tcp-port-not-open")
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
        subprocess.run(["docker", "rm", "-f", CONTAINER], capture_output=True, check=False)


if __name__ == "__main__":
    raise SystemExit(main())
