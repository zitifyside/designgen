"""Print Cloud Run env names and image only. Never print values."""
from __future__ import annotations

import json
import subprocess
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
    containers = data["spec"]["template"]["spec"]["containers"]
    print("ncont", len(containers))
    print("rev", data["status"].get("latestReadyRevisionName"))
    for container in containers:
        names = [item["name"] for item in container.get("env", [])]
        image = container.get("image", "")
        digest = image.split("@")[-1][:20] if "@" in image else "tag"
        print("container", container.get("name", "default"), "env", names, "digest", digest)


if __name__ == "__main__":
    main()
