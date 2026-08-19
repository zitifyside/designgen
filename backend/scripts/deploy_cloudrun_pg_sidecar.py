"""Attach cloudflared sidecar and point DATABASE_URL at localhost. Never print secrets."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import yaml

GCLOUD = Path(r"C:\Users\Joon\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd")
SECRETS = Path(r"D:\Project\ContextBuilder\Secrets\env\mae\macdb\designgenerator.env")
SERVICE = "adg-api"
PROJECT = "design-gen-zitify"
REGION = "asia-northeast3"
ACCOUNT = "zitifycorp@gmail.com"
SIDECAR_IMAGE = "cloudflare/cloudflared:latest"


def load_env() -> dict[str, str]:
    data: dict[str, str] = {}
    for line in SECRETS.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        data[key.strip()] = val.strip()
    return data


def gcloud(args: list[str], *, capture: bool = True) -> subprocess.CompletedProcess[str]:
    cmd = [str(GCLOUD), *args]
    return subprocess.run(cmd, check=True, text=True, capture_output=capture)


def describe_export() -> dict:
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


def mutate(spec: dict, db_url: str, hostname: str) -> dict:
    template = spec["spec"]["template"]
    annotations = dict(template.setdefault("metadata", {}).setdefault("annotations", {}))
    annotations["run.googleapis.com/execution-environment"] = "gen2"
    annotations["run.googleapis.com/container-dependencies"] = json.dumps(
        {"app": ["cloudflared"]},
        separators=(",", ":"),
    )
    template["metadata"]["annotations"] = annotations

    containers = template["spec"]["containers"]
    app = containers[0]
    app["name"] = "app"
    env = list(app.get("env") or [])
    found = False
    for item in env:
        if item.get("name") == "DATABASE_URL":
            item["value"] = db_url
            found = True
            break
    if not found:
        env.append({"name": "DATABASE_URL", "value": db_url})
    app["env"] = env

    sidecar = {
        "name": "cloudflared",
        "image": SIDECAR_IMAGE,
        "args": [
            "access",
            "tcp",
            "--hostname",
            hostname,
            "--url",
            "0.0.0.0:5432",
        ],
        "resources": {"limits": {"cpu": "500m", "memory": "128Mi"}},
        # depends_on 대상은 Cloud Run 이 startupProbe 를 요구한다.
        # probe 는 컨테이너 IP 로 붙으므로 127.0.0.1 전용 바인드는 실패한다.
        "startupProbe": {
            "tcpSocket": {"port": 5432},
            "periodSeconds": 1,
            "timeoutSeconds": 1,
            "failureThreshold": 60,
        },
    }
    others = [item for item in containers[1:] if item.get("name") != "cloudflared"]
    template["spec"]["containers"] = [app, sidecar, *others]
    spec.pop("status", None)
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


def wait_ready(previous: str) -> str:
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
        status = data.get("status", {})
        ready = status.get("latestReadyRevisionName") or ""
        conds = {item.get("type"): item.get("status") for item in status.get("conditions", [])}
        ncont = len(data["spec"]["template"]["spec"]["containers"])
        print("wait", "ncont", ncont, "ready", ready, "Ready", conds.get("Ready"))
        if conds.get("Ready") == "True" and ncont == 2 and ready and ready != previous:
            return ready
        time.sleep(10)
    raise SystemExit("revision-not-ready")


def probe(url_host: str) -> None:
    import urllib.error
    import urllib.request

    for path in ("/api/v1/health", "/api/v1/announcements"):
        req = urllib.request.Request(f"https://{url_host}{path}", method="GET")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read(200)
                print("http", path, resp.status, "bytes", len(body))
        except urllib.error.HTTPError as exc:
            print("http", path, exc.code)
        except Exception as exc:  # noqa: BLE001 — probe must not leak URL guts
            print("http", path, type(exc).__name__)


def main() -> int:
    envf = load_env()
    hostname = envf.get("PG_TUNNEL_HOSTNAME", "")
    db_url = envf.get("CLOUDRUN_DATABASE_URL") or ""
    if not hostname or not db_url:
        print("missing-hostname-or-url", file=sys.stderr)
        return 2
    if "127.0.0.1" not in db_url and "localhost" not in db_url:
        print("cloudrun-url-not-localhost", file=sys.stderr)
        return 3
    exported = describe_export()
    previous = ""
    try:
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
                "value(status.latestReadyRevisionName,status.url)",
            ]
        ).stdout.strip()
        previous = raw.split()[0] if raw else ""
        url_host = raw.split()[1].split("://", 1)[-1].split("/", 1)[0] if " " in raw else ""
    except subprocess.CalledProcessError:
        url_host = ""
    print("prev", previous)
    mutate(exported, db_url, hostname)
    print("replace-start", "sidecar", SIDECAR_IMAGE)
    replace(exported)
    ready = wait_ready(previous)
    print("ready", ready)
    if url_host:
        probe(url_host)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
