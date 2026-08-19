"""Test cloudflared access tcp from a clean container (no cert.pem)."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SECRETS = Path(r"D:\Project\ContextBuilder\Secrets\env\mae\macdb\designgenerator.env")


def hostname() -> str:
    for line in SECRETS.read_text(encoding="utf-8").splitlines():
        if line.startswith("PG_TUNNEL_HOSTNAME="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("missing-hostname")


def main() -> int:
    host = hostname()
    completed = subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "--name",
            "adg-cf-probe",
            "cloudflare/cloudflared:latest",
            "access",
            "tcp",
            "--hostname",
            host,
            "--url",
            "127.0.0.1:5432",
        ],
        capture_output=True,
        text=True,
        timeout=25,
    )
    err = (completed.stderr or "") + (completed.stdout or "")
    lowered = err.lower()
    if "login" in lowered or "authenticate" in lowered or "access" in lowered:
        print("needs-login")
    elif completed.returncode == 0:
        print("ok")
    else:
        print("failed")
    # never print hostname or full stderr (may contain host)
    if "error" in lowered:
        print("has-error")
    print("exit", completed.returncode)
    # print only redacted last line keywords
    for key in ("403", "401", "404", "websocket", "connected", "listening", "denied"):
        if key in lowered:
            print("kw", key)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.TimeoutExpired:
        print("timeout-running")  # likely listening = unauthenticated TCP works
        raise SystemExit(0)
