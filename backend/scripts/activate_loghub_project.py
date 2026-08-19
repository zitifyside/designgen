"""Activate Mae loghub project locally. Never print tokens."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ENV_CANDIDATES = (
    Path(r"D:\Project\ContextBuilder\Secrets\env\mae\loghub\.env"),
    Path(r"D:\Project\mae\loghub\.env"),
)
PROJECT_ID = "designgenerator"
BASE = "http://127.0.0.1:8790"


def load_token() -> str:
    for path in ENV_CANDIDATES:
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("LOGHUB_ADMIN_TOKEN="):
                token = line.split("=", 1)[1].strip().strip('"').strip("'")
                if token:
                    return token
    raise SystemExit("admin-token-missing")


def request(method: str, path: str, token: str, body: dict | None = None) -> tuple[int, dict]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={
            "content-type": "application/json",
            "x-mae-admin-token": token,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            payload = json.loads(raw) if raw else {}
            return resp.status, payload
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"error": "http-error"}
        return exc.code, payload


def main() -> int:
    token = load_token()
    status, payload = request("GET", "/admin/projects", token)
    if status != 200:
        print("list-failed", status)
        return 2
    projects = payload.get("projects") or []
    current = next(
        (item for item in projects if item.get("project_id") == PROJECT_ID),
        None,
    )
    if current is None:
        print("project-missing", PROJECT_ID)
        return 3
    print("before", current.get("status"))
    if current.get("status") == "active":
        print("already-active")
        return 0
    status, patched = request(
        "PATCH",
        f"/admin/projects/{PROJECT_ID}",
        token,
        {"status": "active", "owner_note": "Cloud Run live 2026-08-19 — collect logs"},
    )
    if status != 200:
        print("patch-failed", status, patched.get("code") or patched.get("error"))
        return 4
    project = patched.get("project") or patched
    print("after", project.get("status"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
