"""추적 대상 파일에서 시크릿 패턴을 찾는다 (체크리스트 step 11)."""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PATTERNS = (
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),
    re.compile(r"AIza[0-9A-Za-z\-_]{20,}"),
    re.compile(r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"(?i)(api[_-]?key|secret[_-]?key|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]"),
)

SKIP = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".pdf")
PLACEHOLDER = re.compile(
    r"xxxx|example|placeholder|change-me|your[_-]?key|dummy|fake|adg_xxxx",
    re.I,
)
SKIP_PATH_PARTS = ("/node_modules/", "/.venv/", "/frontend/out/")


def tracked_files() -> list[Path]:
    out = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True)
    return [ROOT / line for line in out.splitlines() if line]


def main() -> int:
    hits: list[str] = []
    for path in tracked_files():
        if path.suffix.lower() in SKIP or not path.is_file():
            continue
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        if any(part in f"/{rel}" for part in SKIP_PATH_PARTS):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if PLACEHOLDER.search(line):
                continue
            if any(p.search(line) for p in PATTERNS):
                hits.append(f"{rel}:{i}")
    if hits:
        print("시크릿 패턴 검출:")
        for hit in hits[:50]:
            print(" ", hit)
        return 1
    print("시크릿 패턴 0건")
    return 0


if __name__ == "__main__":
    sys.exit(main())
