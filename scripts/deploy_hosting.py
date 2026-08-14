"""Firebase Hosting 배포 (REST API 직접 호출).

firebase CLI 로그인(`firebase login`) 없이, 이미 인증된 gcloud 사용자 토큰으로
Hosting 에 정적 산출물을 올린다. CLI 는 ADC 를 그대로 쓰지 못해 실패하지만
Hosting REST API 는 `x-goog-user-project` 헤더로 정상 동작한다.

전제:
  · `gcloud auth login` 이 되어 있고, 활성 계정이 대상 프로젝트에 권한을 가진다
  · `frontend/out` 에 정적 export 산출물이 있다
      cd frontend && NEXT_STATIC_EXPORT=1 npm run build

실행:
    python scripts/deploy_hosting.py                       # firebase.json 의 default 프로젝트
    python scripts/deploy_hosting.py --site my-site        # 사이트 지정
    python scripts/deploy_hosting.py --dry-run             # 업로드 없이 계획만 출력

절차 (Hosting REST v1beta1):
  1. versions.create          — firebase.json 의 hosting config 를 그대로 전달
  2. versions.populateFiles   — 파일별 gzip SHA-256 등록 → 업로드 필요 목록 수신
  3. 업로드                    — 필요한 파일만 gzip 바이트로 전송
  4. versions.patch           — status=FINALIZED
  5. releases.create          — 라이브 반영
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://firebasehosting.googleapis.com/v1beta1"

def to_serving_config(hosting: dict) -> dict:
    """firebase.json(CLI 표기) → Hosting REST 의 ServingConfig 로 변환한다.

    CLI 는 source/destination·헤더 배열을 쓰지만 REST 는 glob/path·헤더 맵을 받는다.
    같은 뜻을 다른 이름으로 요구하므로 여기서 한 번에 맞춘다.
    """
    config: dict = {}

    rewrites = []
    for rule in hosting.get("rewrites", []):
        out = {k: rule[k] for k in ("glob", "regex") if k in rule}
        if "source" in rule:
            out["glob"] = rule["source"]
        if "destination" in rule:
            out["path"] = rule["destination"]
        for passthrough in ("path", "function", "run", "dynamicLinks"):
            if passthrough in rule:
                out[passthrough] = rule[passthrough]
        rewrites.append(out)
    if rewrites:
        config["rewrites"] = rewrites

    redirects = []
    for rule in hosting.get("redirects", []):
        out = {k: rule[k] for k in ("glob", "regex") if k in rule}
        if "source" in rule:
            out["glob"] = rule["source"]
        out["location"] = rule.get("destination") or rule.get("location", "")
        status = rule.get("type") or rule.get("statusCode")
        if status:
            out["statusCode"] = int(status)
        redirects.append(out)
    if redirects:
        config["redirects"] = redirects

    headers = []
    for rule in hosting.get("headers", []):
        out = {k: rule[k] for k in ("glob", "regex") if k in rule}
        if "source" in rule:
            out["glob"] = rule["source"]
        raw = rule.get("headers", [])
        out["headers"] = (
            raw
            if isinstance(raw, dict)
            else {h["key"]: h["value"] for h in raw}
        )
        headers.append(out)
    if headers:
        config["headers"] = headers

    if "cleanUrls" in hosting:
        config["cleanUrls"] = bool(hosting["cleanUrls"])
    if "trailingSlash" in hosting:
        config["trailingSlashBehavior"] = (
            "ADD" if hosting["trailingSlash"] else "REMOVE"
        )
    for passthrough in ("appAssociation", "i18n"):
        if passthrough in hosting:
            config[passthrough] = hosting[passthrough]

    return config


def access_token() -> str:
    try:
        out = subprocess.run(
            ["gcloud", "auth", "print-access-token"],
            capture_output=True,
            text=True,
            check=True,
            shell=sys.platform == "win32",
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        raise SystemExit(
            "gcloud 액세스 토큰을 얻지 못했습니다. `gcloud auth login` 후 다시 실행하세요."
        ) from exc
    return out.stdout.strip()


def request(
    method: str,
    url: str,
    token: str,
    project: str,
    *,
    body: bytes | None = None,
    content_type: str = "application/json",
) -> dict:
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("x-goog-user-project", project)
    if body is not None:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req) as res:
            payload = res.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise SystemExit(f"{method} {url}\n  → HTTP {exc.code}\n{detail}") from exc
    return json.loads(payload) if payload else {}


def load_hosting_config() -> dict:
    data = json.loads((ROOT / "firebase.json").read_text(encoding="utf-8"))
    hosting = data["hosting"]
    if isinstance(hosting, list):
        hosting = hosting[0]
    return hosting


def default_project() -> str:
    data = json.loads((ROOT / ".firebaserc").read_text(encoding="utf-8"))
    return data["projects"]["default"]


def collect_files(public_dir: Path) -> dict[str, tuple[str, bytes]]:
    """{'/경로': (gzip sha256, gzip 바이트)} 를 만든다."""
    files: dict[str, tuple[str, bytes]] = {}
    for path in sorted(public_dir.rglob("*")):
        if not path.is_file():
            continue
        rel = "/" + path.relative_to(public_dir).as_posix()
        if rel.startswith("/."):
            continue
        # mtime=0 으로 고정해 같은 내용이면 같은 해시가 나오게 한다.
        blob = gzip.compress(path.read_bytes(), mtime=0)
        files[rel] = (hashlib.sha256(blob).hexdigest(), blob)
    return files


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default=None)
    parser.add_argument("--site", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    project = args.project or default_project()
    site = args.site or project
    hosting = load_hosting_config()
    public_dir = (ROOT / hosting["public"]).resolve()

    if not public_dir.is_dir():
        raise SystemExit(
            f"정적 산출물이 없습니다: {public_dir}\n"
            "  cd frontend && NEXT_STATIC_EXPORT=1 npm run build"
        )

    files = collect_files(public_dir)
    total_bytes = sum(len(blob) for _, blob in files.values())
    print(f"프로젝트 {project} · 사이트 {site}")
    print(f"업로드 대상 {len(files)}개 파일 (gzip {total_bytes / 1024:.0f} KB)")

    config = to_serving_config(hosting)
    if args.dry_run:
        print("dry-run — 실제 배포는 하지 않습니다.")
        print(json.dumps(config, ensure_ascii=False, indent=2)[:800])
        return 0

    token = access_token()

    # 1) 버전 생성
    version = request(
        "POST",
        f"{API}/sites/{site}/versions",
        token,
        project,
        body=json.dumps({"config": config}).encode("utf-8"),
    )
    version_name = version["name"]  # sites/{site}/versions/{id}
    print(f"버전 생성 {version_name}")

    # 2) 파일 해시 등록
    populated = request(
        "POST",
        f"{API}/{version_name}:populateFiles",
        token,
        project,
        body=json.dumps(
            {"files": {path: digest for path, (digest, _) in files.items()}}
        ).encode("utf-8"),
    )
    required = populated.get("uploadRequiredHashes", []) or []
    upload_url = populated.get("uploadUrl")
    print(f"업로드 필요 {len(required)}개")

    # 3) 업로드
    by_hash = {digest: blob for digest, blob in files.values()}
    for i, digest in enumerate(required, start=1):
        blob = by_hash.get(digest)
        if blob is None:
            raise SystemExit(f"해시에 해당하는 파일을 찾지 못했습니다: {digest}")
        request(
            "POST",
            f"{upload_url}/{digest}",
            token,
            project,
            body=blob,
            content_type="application/octet-stream",
        )
        if i % 20 == 0 or i == len(required):
            print(f"  업로드 {i}/{len(required)}")

    # 4) 확정
    request(
        "PATCH",
        f"{API}/{version_name}?update_mask=status",
        token,
        project,
        body=json.dumps({"status": "FINALIZED"}).encode("utf-8"),
    )
    print("버전 확정")

    # 5) 릴리즈
    release = request(
        "POST",
        f"{API}/sites/{site}/releases?versionName={version_name}",
        token,
        project,
        body=b"{}",
    )
    print("릴리즈 완료:", release.get("name", "(이름 없음)"))
    print(f"https://{site}.web.app")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
