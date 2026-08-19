"""Hit Cloud Run health and a DB-backed route. No secrets."""
from __future__ import annotations

import json
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

GCLOUD = Path(r"C:\Users\Joon\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd")


def main() -> None:
    raw = subprocess.check_output(
        [
            str(GCLOUD),
            "run",
            "services",
            "describe",
            "adg-api",
            "--project",
            "design-gen-zitify",
            "--region",
            "asia-northeast3",
            "--account",
            "zitifycorp@gmail.com",
            "--format",
            "json",
        ]
    )
    data = json.loads(raw.decode("utf-8-sig"))
    url = data["status"]["url"].rstrip("/")
    host = url.split("://", 1)[-1]
    print("host", host)
    print("rev", data["status"].get("latestReadyRevisionName"))
    print("ncont", len(data["spec"]["template"]["spec"]["containers"]))
    names = [c.get("name") for c in data["spec"]["template"]["spec"]["containers"]]
    print("containers", names)
    for path in ("/api/v1/health", "/api/v1/announcements"):
        req = urllib.request.Request(url + path, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read()
                kind = "json" if body[:1] in (b"{", b"[") else "other"
                print("http", path, resp.status, "len", len(body), kind)
        except urllib.error.HTTPError as exc:
            print("http", path, exc.code, "len", len(exc.read() or b""))
        except Exception as exc:  # noqa: BLE001
            print("http", path, type(exc).__name__)


if __name__ == "__main__":
    main()
