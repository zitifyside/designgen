"""Print Cloud Run safe spec only. Never print env values."""
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
    status = data.get("status", {})
    print("url-host", status.get("url", "").split("://", 1)[-1].split("/", 1)[0])
    print("rev", status.get("latestReadyRevisionName"))
    tmpl = data["spec"]["template"]
    meta = tmpl.get("metadata", {})
    print("ann-keys", sorted((meta.get("annotations") or {}).keys()))
    spec = tmpl.get("spec", {})
    print("sa", spec.get("serviceAccountName", ""))
    print("timeout", spec.get("timeoutSeconds"))
    for container in spec.get("containers", []):
        resources = container.get("resources", {})
        ports = [item.get("containerPort") for item in container.get("ports", [])]
        image = container.get("image", "")
        image_id = image.split("/")[-1][:40]
        print(
            "c",
            container.get("name", "default"),
            "ports",
            ports,
            "limits",
            resources.get("limits"),
            "image",
            image_id,
        )


if __name__ == "__main__":
    main()
