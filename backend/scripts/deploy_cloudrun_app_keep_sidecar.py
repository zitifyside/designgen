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
RELAY_WAIT_MINUTES = 25
RELAY_SCRIPT = Path(__file__).resolve().parent / "start_relay.ps1"
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


def restart_relay() -> None:
    """릴레이를 함께 재기동한다.

    릴레이는 이 PC 에서 도는 별개 프로세스라, 컨테이너만 새로 올리면 옛 코드가
    남는다. 계약이 바뀐 배포에서는 그게 `unknown op: ...` 로 터진다 —
    2026-08-22 `complete_json` 에서 실제로 겪었다. 사람이 기억해야 하는 절차는
    언젠가 빠지므로 배포에 묶는다.

    ⚠ **진행 중인 생성을 끊지 않는다.** 릴레이의 잡 목록은 메모리에만 있어
    재기동하면 그 생성이 통째로 사라진다 — 2026-08-22 에 배포 한 번으로 27분짜리
    생성을 날렸다. start_relay.ps1 이 잡이 빌 때까지 기다리므로 여기서는 그
    대기 시간을 넉넉히 잡아 준다.

    실패해도 배포 자체는 성공으로 둔다. 컨테이너는 이미 떴고, 릴레이는 손으로
    다시 올릴 수 있다. 여기서 배포를 실패로 만들면 원인을 더 헷갈리게 한다.
    다만 **왜 못 올렸는지는 반드시 찍는다** — 조용히 넘어가면 옛 코드가 남은
    채로 "배포 성공" 이 되고, 그게 unknown op 으로 돌아온다.
    """
    if not RELAY_SCRIPT.is_file():
        print("relay-restart skipped (script missing)")
        return
    print("relay-restart")
    try:
        completed = subprocess.run(
            [
                "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                "-File", str(RELAY_SCRIPT), "-Restart",
                "-WaitMinutes", str(RELAY_WAIT_MINUTES),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            # 대기 시간 + 기동 시간. 스크립트가 먼저 포기하도록 여유를 준다.
            timeout=RELAY_WAIT_MINUTES * 60 + 120,
            check=False,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"relay-restart failed: {type(exc).__name__}")
        return
    lines = (completed.stdout or "").strip().splitlines()
    print("relay:", " | ".join(lines[-2:]) if lines else f"exit {completed.returncode}")
    if completed.returncode != 0:
        why = (completed.stderr or "").strip().splitlines()
        print("relay-restart FAILED — 옛 코드가 남아 있다. 잡이 끝난 뒤 다시 올려라:")
        print("  ", " | ".join((why or lines)[-3:]) or f"exit {completed.returncode}")


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
            restart_relay()
            return 0
        time.sleep(5)
    print("revision-not-ready", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
