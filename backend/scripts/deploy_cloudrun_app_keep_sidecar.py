"""Rebuild Cloud Run app image and swap only the app container. Keep sidecar."""
from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

GCLOUD = Path(r"C:\Users\Joon\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd")
BACKEND = Path(__file__).resolve().parents[1]
SERVICE = "adg-api"
PROJECT = "design-gen-zitify"
REGION = "asia-northeast3"
ACCOUNT = "zitifycorp@gmail.com"
IMAGE_REPO = (
    "asia-northeast3-docker.pkg.dev/design-gen-zitify/"
    "cloud-run-source-deploy/adg-api"
)


def gcloud(args: list[str], *, capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(GCLOUD), *args],
        check=True,
        text=True,
        capture_output=capture,
    )


def main() -> int:
    tag = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    image = f"{IMAGE_REPO}:{tag}"
    previous = gcloud(
        [
            "run",
            "services",
            "describe",
            SERVICE,
            "--project",
            PROJECT,
            "--region",
            REGION,
            "--account",
            ACCOUNT,
            "--format",
            "value(status.latestReadyRevisionName)",
        ]
    ).stdout.strip()
    print("prev", previous)
    print("build-start")
    gcloud(
        [
            "builds",
            "submit",
            str(BACKEND),
            f"--tag={image}",
            f"--project={PROJECT}",
            f"--account={ACCOUNT}",
            "--quiet",
        ],
        capture=False,
    )
    print("update-app-image")
    gcloud(
        [
            "run",
            "services",
            "update",
            SERVICE,
            "--container=app",
            f"--image={image}",
            f"--project={PROJECT}",
            f"--region={REGION}",
            f"--account={ACCOUNT}",
            "--quiet",
        ],
        capture=False,
    )
    for _ in range(60):
        raw = gcloud(
            [
                "run",
                "services",
                "describe",
                SERVICE,
                "--project",
                PROJECT,
                "--region",
                REGION,
                "--account",
                ACCOUNT,
                "--format",
                "json",
            ]
        ).stdout
        data = json.loads(raw)
        ready = data["status"].get("latestReadyRevisionName") or ""
        conds = {
            item.get("type"): item.get("status")
            for item in data["status"].get("conditions", [])
        }
        names = [
            item.get("name")
            for item in data["spec"]["template"]["spec"]["containers"]
        ]
        print("wait", "ncont", len(names), "ready", ready, "Ready", conds.get("Ready"))
        if (
            conds.get("Ready") == "True"
            and len(names) == 2
            and "cloudflared" in names
            and ready
            and ready != previous
        ):
            print("ready", ready)
            return 0
        time.sleep(5)
    print("revision-not-ready", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
