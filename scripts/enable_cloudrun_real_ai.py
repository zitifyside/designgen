"""Cloud Run 에 실제 Gemini 파이프라인을 켠다. 키 값은 출력하지 않는다."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEYS = Path(r"D:/Project/ContextBuilder/Secrets/_gemini/keys.json")
PROJECT = "design-gen-zitify"
REGION = "asia-northeast3"
SERVICE = "adg-api"
ACCOUNT = os.environ.get("GCLOUD_ACCOUNT", "zitifycorp@gmail.com")
MODEL = "gemini-2.0-flash"


def _load_gemini_key() -> str:
    env_path = ROOT / "backend" / ".env"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("GEMINI_API_KEY="):
                value = line.split("=", 1)[1].strip().strip('"').strip("'")
                if value:
                    return value
    if KEYS.is_file():
        data = json.loads(KEYS.read_text(encoding="utf-8"))
        value = data.get("general")
        if isinstance(value, dict):
            value = value.get("key") or value.get("apiKey") or ""
        if isinstance(value, str) and value.strip():
            return value.strip()
    raise SystemExit("Gemini 키를 찾지 못했습니다. Secrets/_gemini/keys.json general 을 확인하세요.")


def main() -> None:
    key = _load_gemini_key()
    env_pair = (
        "FAKE_AI_PIPELINE=false,"
        "AI_PROVIDER=gemini,"
        f"GEMINI_MODEL={MODEL},"
        f"GEMINI_API_KEY={key}"
    )
    gcloud = shutil.which("gcloud") or shutil.which("gcloud.cmd")
    if not gcloud:
        raise SystemExit("gcloud 를 PATH 에서 찾지 못했습니다.")
    cmd = [
        gcloud,
        "run",
        "deploy",
        SERVICE,
        "--source",
        str(ROOT / "backend"),
        f"--account={ACCOUNT}",
        f"--project={PROJECT}",
        f"--region={REGION}",
        "--no-cpu-throttling",
        "--timeout=300",
        f"--update-env-vars={env_pair}",
        "--quiet",
    ]
    print("Cloud Run 실제 파이프라인 배포 — 키는 출력하지 않는다.")
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)
    print("완료: FAKE_AI_PIPELINE=false · AI_PROVIDER=gemini · 키 설정됨")


if __name__ == "__main__":
    sys.exit(main() or 0)
