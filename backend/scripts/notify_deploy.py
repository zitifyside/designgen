"""운영 배포 결과를 Google Chat 으로 알린다.

배포는 끝났는데 무엇이 올라갔는지는 배포한 사람 머릿속에만 남는 일이 잦다.
그래서 알림에 **반영 내용 요약**을 함께 싣는다. 요약은 두 경로로 만든다.

  1. `--summary` 로 직접 준 문장 (사람이 쓴 것이 가장 정확하다)
  2. 없으면 직전 배포 태그 이후의 커밋 제목을 모아 자동 생성

웹훅 URL 은 코드·저장소에 두지 않는다. ContextBuilder Secrets SSOT 에서
읽고, 실패 메시지에도 URL 을 넣지 않는다 — 알림이 실패했다는 사실보다
토큰이 로그에 남는 쪽이 나쁘다.

사용:
    py -3 backend/scripts/notify_deploy.py --status success \\
        --hosting 1787080558575000 --revision adg-api-00026-abc \\
        --summary "시안 정의를 완성 웹페이지로 전환"
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

WEBHOOK_ENV = Path(
    r"D:\Project\ContextBuilder\Secrets\env\_webhooks\webhooks.env"
)
WEBHOOK_KEY = "DESIGNGENERATOR_DEPLOY_GOOGLE_CHAT_WEBHOOK_URL"
REPO = Path(__file__).resolve().parents[2]

#: 배포 태그는 이 접두어로 단다 — 다음 배포가 "직전 배포 이후" 를 찾는 기준.
DEPLOY_TAG_PREFIX = "deploy/"

STATUS_ICON = {"success": "✅", "failure": "❌", "partial": "⚠️"}


def load_webhook_url() -> str:
    if not WEBHOOK_ENV.exists():
        raise SystemExit(f"webhook secrets file not found: {WEBHOOK_ENV}")
    for line in WEBHOOK_ENV.read_text(encoding="utf-8-sig").splitlines():
        if line.startswith(f"{WEBHOOK_KEY}="):
            url = line.split("=", 1)[1].strip().strip('"')
            if url:
                return url
    raise SystemExit(f"{WEBHOOK_KEY} missing or empty in the secrets file")


def _git(*args: str) -> str:
    try:
        out = subprocess.run(
            ["git", *args],
            cwd=str(REPO),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError:
        return ""
    return out.stdout.strip() if out.returncode == 0 else ""


def previous_deploy_ref() -> str:
    """직전 배포 지점. 태그가 없으면 빈 문자열."""
    tags = _git("tag", "--list", f"{DEPLOY_TAG_PREFIX}*", "--sort=-creatordate")
    return tags.splitlines()[0].strip() if tags else ""


def auto_summary(limit: int = 12) -> list[str]:
    """직전 배포 이후 커밋 제목. 태그가 없으면 최근 커밋으로 대신한다."""
    since = previous_deploy_ref()
    rng = f"{since}..HEAD" if since else "-{n}".format(n=limit)
    log = _git("log", "--no-merges", "--pretty=format:%s", *( [rng] if since else ["-n", str(limit)] ))
    lines = [l.strip() for l in log.splitlines() if l.strip()]
    return lines[:limit]


def build_message(args: argparse.Namespace) -> str:
    now = dt.datetime.utcnow() + dt.timedelta(hours=9)  # 운영자 대면 보고는 KST
    icon = STATUS_ICON.get(args.status, "•")
    commit = _git("rev-parse", "--short", "HEAD") or "unknown"
    branch = _git("rev-parse", "--abbrev-ref", "HEAD") or "unknown"

    lines = [
        f"{icon} *AI Design Generator · {args.environment} 배포*",
        f"*시각* {now:%Y-%m-%d %H:%M} KST",
        f"*브랜치* {branch} @ {commit}",
    ]
    if args.revision:
        lines.append(f"*Cloud Run* {args.revision}")
    if args.hosting:
        lines.append(f"*Hosting* 버전 {args.hosting}")
    if args.migration:
        lines.append(f"*마이그레이션* {args.migration}")

    lines.append("")
    lines.append("*반영 내용*")
    if args.summary:
        for item in args.summary:
            lines.append(f"• {item}")
    else:
        entries = auto_summary()
        if entries:
            lines.extend(f"• {e}" for e in entries)
        else:
            lines.append("• (요약 없음 — 커밋 이력을 읽지 못했다)")

    if args.note:
        lines.append("")
        lines.append(f"*참고* {args.note}")
    if args.url:
        lines.append("")
        lines.append(args.url)
    return "\n".join(lines)


def send(text: str, *, dry_run: bool = False) -> int:
    if dry_run:
        print(text)
        return 0
    url = load_webhook_url()
    body = json.dumps({"text": text}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json; charset=UTF-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            print(f"chat webhook: {response.status}")
            return 0
    except urllib.error.HTTPError as exc:
        # 본문에 URL 이 들어가지 않도록 상태 코드와 응답만 남긴다.
        print(f"chat webhook failed: HTTP {exc.code} {exc.read()[:300]!r}", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001
        print(f"chat webhook failed: {type(exc).__name__}", file=sys.stderr)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="운영 배포 결과 Chat 알림")
    parser.add_argument("--status", default="success", choices=sorted(STATUS_ICON))
    parser.add_argument("--environment", default="운영")
    parser.add_argument("--revision", default="", help="Cloud Run 리비전")
    parser.add_argument("--hosting", default="", help="Firebase Hosting 버전 ID")
    parser.add_argument("--migration", default="", help="적용한 alembic 리비전")
    parser.add_argument(
        "--summary",
        action="append",
        default=[],
        help="반영 내용 한 줄. 여러 번 줄 수 있다. 생략하면 커밋 제목으로 자동 생성",
    )
    parser.add_argument("--note", default="", help="주의사항 한 줄")
    parser.add_argument("--url", default="https://design-gen-zitify.web.app")
    parser.add_argument("--dry-run", action="store_true", help="보내지 않고 본문만 출력")
    args = parser.parse_args()
    return send(build_message(args), dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
