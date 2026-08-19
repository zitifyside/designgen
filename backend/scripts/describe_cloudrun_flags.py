"""Print non-secret Cloud Run flags only."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

GCLOUD = Path(r"C:\Users\Joon\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd")
SAFE = {
    "FAKE_AI_PIPELINE",
    "AI_PROVIDER",
    "GEMINI_MODEL",
    "MAE_LOGHUB_PROJECT_ID",
    "MAE_LOGHUB_ENV",
    "LOG_SINK_MODE",
    "ENVIRONMENT",
}


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
    print("rev", data["status"].get("latestReadyRevisionName"))
    print("ncont", len(data["spec"]["template"]["spec"]["containers"]))
    for container in data["spec"]["template"]["spec"]["containers"]:
        print("container", container.get("name"))
        for item in container.get("env") or []:
            name = item.get("name", "")
            if name in SAFE:
                print("flag", name, item.get("value", ""))
            elif name:
                print("present", name, "yes" if item.get("value") else "empty")


if __name__ == "__main__":
    main()
