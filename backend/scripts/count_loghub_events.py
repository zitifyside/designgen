"""Count loghub events for designgenerator. Never print payloads or tokens."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

ENV_CANDIDATES = (
    Path(r"D:\Project\ContextBuilder\Secrets\env\mae\loghub\.env"),
    Path(r"D:\Project\mae\loghub\.env"),
)
BASE = "http://127.0.0.1:8790"
PROJECT_ID = "designgenerator"


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


def main() -> None:
    token = load_token()
    url = f"{BASE}/admin/logs?project_id={PROJECT_ID}&limit=20"
    req = urllib.request.Request(
        url,
        headers={"x-mae-admin-token": token},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        print("logs-failed", exc.code)
        return
    events = payload.get("events") or []
    print("count", len(events))
    kinds = sorted({str(item.get("kind") or item.get("event_kind") or "-") for item in events})
    print("kinds", ",".join(kinds)[:200])


if __name__ == "__main__":
    main()
