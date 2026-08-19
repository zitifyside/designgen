"""Flip Cloud Run AI flags. Keep sidecar. Never print secrets."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import yaml

GCLOUD = Path(r"C:\Users\Joon\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd")
SERVICE = "adg-api"
PROJECT = "design-gen-zitify"
REGION = "asia-northeast3"
ACCOUNT = "zitifycorp@gmail.com"
UPDATES = {
    "FAKE_AI_PIPELINE": "false",
    "AI_PROVIDER": "gemini",
}


def gcloud(args: list[str], *, capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run([str(GCLOUD), *args], check=True, text=True, capture_output=capture)


def main() -> int:
    exported = yaml.safe_load(
        gcloud(
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
    )
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
    containers = exported["spec"]["template"]["spec"]["containers"]
    app = next((item for item in containers if item.get("name") == "app"), containers[0])
    env = list(app.get("env") or [])
    names = {item.get("name") for item in env}
    for key, value in UPDATES.items():
        found = False
        for item in env:
            if item.get("name") == key:
                item["value"] = value
                found = True
                break
        if not found:
            env.append({"name": key, "value": value})
    app["env"] = env
    exported.pop("status", None)
    print("prev", previous)
    print("ncont", len(containers))
    print("has-gemini-key", "GEMINI_API_KEY" in names)
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".yaml",
        delete=False,
        encoding="utf-8",
    ) as handle:
        yaml.safe_dump(exported, handle, sort_keys=False, allow_unicode=True)
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
    for _ in range(48):
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
        conds = {item.get("type"): item.get("status") for item in data["status"].get("conditions", [])}
        ncont = len(data["spec"]["template"]["spec"]["containers"])
        print("wait", "ncont", ncont, "ready", ready, "Ready", conds.get("Ready"))
        if conds.get("Ready") == "True" and ncont == 2 and ready and ready != previous:
            print("ready", ready)
            return 0
        time.sleep(5)
    print("revision-not-ready", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
