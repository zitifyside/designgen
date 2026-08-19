"""Print Cloud Run revision logs with secrets stripped."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

GCLOUD = Path(r"C:\Users\Joon\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd")
REV = "adg-api-00021-qw5"
SECRETISH = re.compile(
    r"(postgres(?:ql)?(?:\+asyncpg)?://[^ \n\"']+)|"
    r"(postgresql\+asyncpg://[^ \n\"']+)|"
    r"([A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)|"
    r"(sk-[A-Za-z0-9]+)|"
    r"(AIza[A-Za-z0-9_-]+)",
    re.I,
)


def redact(text: str) -> str:
    return SECRETISH.sub("***", text)


def main() -> None:
    raw = subprocess.check_output(
        [
            str(GCLOUD),
            "logging",
            "read",
            (
                'resource.type="cloud_run_revision" '
                'resource.labels.service_name="adg-api" '
                f'resource.labels.revision_name="{REV}"'
            ),
            "--project",
            "design-gen-zitify",
            "--account",
            "zitifycorp@gmail.com",
            "--limit",
            "80",
            "--format",
            "json",
            "--freshness",
            "30m",
        ]
    )
    entries = json.loads(raw.decode("utf-8-sig"))
    print("nentries", len(entries))
    for item in reversed(entries):
        payload = item.get("textPayload") or item.get("jsonPayload") or {}
        if isinstance(payload, dict):
            msg = payload.get("message") or payload.get("msg") or json.dumps(payload, ensure_ascii=False)[:300]
        else:
            msg = str(payload)
        sev = item.get("severity", "")
        print(sev, redact(msg)[:400])


if __name__ == "__main__":
    main()
