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
# 진행 중인 생성이 끝나기를 기다리는 시간. 길게 잡으면 배포가 그만큼 매달리므로,
# 한 생성이 대개 끝나는 시간(실측 26분)보다 짧게 두고 못 기다리면 사유를 남긴 뒤
# 사람이 다시 올리게 한다 — 배포가 30분 멈춰 있는 것보다 낫다.
RELAY_WAIT_MINUTES = 10
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


def say(*parts: object) -> None:
    """진행 로그. 반드시 흘려보낸다.

    맨 print 는 파일·파이프로 리다이렉트되면 블록 버퍼링이라 배포가 끝날
    때까지 0바이트다. 그러면 지켜보는 쪽에서 "도는 중" 과 "멈춤" 이 구분되지
    않는다 — 실제로 18분을 멈춘 줄 알고 들여다봤다.
    """
    print(*parts, flush=True)


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
        say("relay-restart skipped (script missing)")
        return
    say("relay-restart")
    # ⚠ 파이프로 받지 않는다. start_relay.ps1 은 uvicorn·cloudflared 를 백그라운드로
    # 띄우는데, 그 자식들이 파이프 핸들을 물고 있으면 PowerShell 이 끝난 뒤에도
    # `subprocess.run` 이 타임아웃까지 매달린다 — 실제로 배포가 18분을 더 걸렸고,
    # 그동안 아무 출력도 없어 멈춘 것처럼 보였다. 파일로 받으면 핸들 상속과
    # 무관하게 프로세스 종료만 기다린다.
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".log", delete=False, encoding="utf-8"
    ) as handle:
        log_path = Path(handle.name)
    try:
        with log_path.open("w", encoding="utf-8") as sink:
            completed = subprocess.run(
                [
                    "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                    "-File", str(RELAY_SCRIPT), "-Restart",
                    "-WaitMinutes", str(RELAY_WAIT_MINUTES),
                ],
                stdin=subprocess.DEVNULL,
                stdout=sink,
                stderr=subprocess.STDOUT,
                # 대기 시간 + 기동 시간. 스크립트가 먼저 포기하도록 여유를 준다.
                timeout=RELAY_WAIT_MINUTES * 60 + 120,
                check=False,
            )
        lines = [
            line.strip()
            for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines()
            if line.strip()
        ]
    except subprocess.TimeoutExpired:
        say(f"relay-restart TIMEOUT ({RELAY_WAIT_MINUTES}분 초과) — 옛 코드가 남아 있다.")
        say("  잡이 끝난 뒤 start_relay.ps1 -Restart 를 직접 돌려라.")
        return
    except Exception as exc:  # noqa: BLE001
        say(f"relay-restart failed: {type(exc).__name__}")
        return
    finally:
        # 백그라운드로 뜬 uvicorn·cloudflared 가 이 파일 핸들을 물려받아 아직
        # 쥐고 있을 수 있다(Windows 는 사용 중인 파일을 못 지운다). 임시 로그
        # 하나 못 지웠다고 배포를 실패로 만들지 않는다 — OS 가 알아서 치운다.
        try:
            log_path.unlink(missing_ok=True)
        except OSError:
            pass

    say("relay:", " | ".join(lines[-2:]) if lines else f"exit {completed.returncode}")
    if completed.returncode != 0:
        # 조용히 넘어가면 옛 코드가 남은 채 "배포 성공" 이 되고, 그게 나중에
        # unknown op 으로 돌아온다.
        say("relay-restart FAILED — 옛 코드가 남아 있다. 잡이 끝난 뒤 다시 올려라:")
        say("  ", " | ".join(lines[-3:]) or f"exit {completed.returncode}")


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
    say("prev", previous)
    if not skip_build:
        say("build-start")
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
    say("replace-app-image")
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
        say("wait", "ncont", len(names), "ready", ready, "Ready", conds.get("Ready"))
        if (
            conds.get("Ready") == "True"
            and len(names) == 2
            and "cloudflared" in names
            and ready
            and ready != previous
        ):
            say("ready", ready)
            restart_relay()
            return 0
        time.sleep(5)
    print("revision-not-ready", file=sys.stderr, flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
