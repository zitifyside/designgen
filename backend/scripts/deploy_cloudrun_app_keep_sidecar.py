"""Rebuild Cloud Run app image and swap only the app container. Keep sidecar."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

import yaml

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


def export_spec() -> dict:
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
            "export",
        ]
    ).stdout
    return yaml.safe_load(raw)


def set_app_image(spec: dict, image: str) -> dict:
    containers = spec["spec"]["template"]["spec"]["containers"]
    app = next((item for item in containers if item.get("name") == "app"), None)
    if app is None:
        raise SystemExit("app-container-missing")
    app["image"] = image
    spec.pop("status", None)
    names = [item.get("name") for item in containers]
    if "cloudflared" not in names:
        raise SystemExit("sidecar-missing")
    return spec


def replace(spec: dict) -> None:
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".yaml",
        delete=False,
        encoding="utf-8",
    ) as handle:
        yaml.safe_dump(spec, handle, sort_keys=False, allow_unicode=True)
        path = handle.name
    try:
        gcloud(
            [
                "run",
                "services",
                "replace",
                path,
                "--project",
                PROJECT,
                "--region",
                REGION,
                "--account",
                ACCOUNT,
            ],
            capture=False,
        )
    finally:
        Path(path).unlink(missing_ok=True)


def main() -> int:
    skip_build = "--image" in sys.argv
    if skip_build:
        image = sys.argv[sys.argv.index("--image") + 1]
    else:
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
    if not skip_build:
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
    print("replace-app-image")
    spec = set_app_image(export_spec(), image)
    replace(spec)
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
