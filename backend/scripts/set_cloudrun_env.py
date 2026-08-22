"""Cloud Run `adg-api` 의 app 컨테이너 환경변수만 갱신한다.

`gcloud run services update --set-env-vars` 는 멀티 컨테이너 서비스에서
어느 컨테이너를 고칠지 애매하고, `--source` 계열은 sidecar 를 떨어뜨린다.
그래서 `deploy_cloudrun_app_keep_sidecar.py` 와 같은 방식을 쓴다 — 현재
spec 을 통째로 받아 app 컨테이너의 env 만 손보고 그대로 되돌려 넣는다.
sidecar 가 spec 에 없으면 아무것도 하지 않고 멈춘다. 그게 빠진 spec 을
올리면 DB 로 가는 터널이 끊긴다.

값은 인자로 받지 않고 **Secrets SSOT 에서 읽는다**. 명령줄에 적으면 셸
기록과 프로세스 목록에 토큰이 남는다.

사용:
    py -3 backend/scripts/set_cloudrun_env.py AI_PROVIDER=relay RELAY_URL=@secret RELAY_TOKEN=@secret
    py -3 backend/scripts/set_cloudrun_env.py --show          # 현재 키 목록만
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

SERVICE = "adg-api"
PROJECT = "design-gen-zitify"
REGION = "asia-northeast3"
ACCOUNT = os.environ.get("GCLOUD_ACCOUNT", "zitifycorp@gmail.com")

#: `@secret` 로 표기한 값을 찾아 읽을 파일들. 앞에서부터 먼저 찾은 것을 쓴다.
SECRET_FILES = (
    Path(r"D:\Project\ContextBuilder\Secrets\env\designgenerator\relay.env"),
    Path(r"D:\Project\ContextBuilder\Secrets\env\designgenerator\backend\.env"),
)

#: 값이 비밀인 키 — 화면에 찍지 않는다.
SECRET_KEYS = {"RELAY_TOKEN", "SECRET_KEY", "GEMINI_API_KEY", "DATABASE_URL", "MAE_LOGHUB_KEY"}

#: Secrets 파일의 키 이름이 Cloud Run 환경변수 이름과 다를 때의 대응표.
SECRET_ALIASES = {"RELAY_TOKEN": "ADG_RELAY_TOKEN"}


def gcloud(args: list[str], *, capture: bool = True) -> subprocess.CompletedProcess[str]:
    exe = "gcloud.cmd" if sys.platform == "win32" else "gcloud"
    return subprocess.run(
        [exe, *args],
        capture_output=capture,
        text=True,
        encoding="utf-8",
        check=True,
    )


def read_secret(name: str) -> str:
    wanted = [name, SECRET_ALIASES.get(name, "")]
    for path in SECRET_FILES:
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            for key in wanted:
                if key and line.startswith(f"{key}="):
                    value = line.split("=", 1)[1].strip().strip('"')
                    if value:
                        return value
    raise SystemExit(f"{name} 값을 Secrets 에서 찾지 못했습니다.")


def export_spec() -> dict:
    raw = gcloud(
        ["run", "services", "describe", SERVICE, "--project", PROJECT,
         "--region", REGION, "--account", ACCOUNT, "--format", "export"]
    ).stdout
    return yaml.safe_load(raw)


def app_container(spec: dict) -> dict:
    containers = spec["spec"]["template"]["spec"]["containers"]
    names = [c.get("name") for c in containers]
    if "cloudflared" not in names:
        # 여기서 멈추지 않고 replace 를 강행하면 DB 터널이 끊긴다.
        raise SystemExit(f"sidecar-missing (containers={names})")
    app = next((c for c in containers if c.get("name") == "app"), None)
    if app is None:
        raise SystemExit("app-container-missing")
    return app


def replace(spec: dict) -> None:
    spec.pop("status", None)
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yaml", delete=False, encoding="utf-8"
    ) as handle:
        yaml.safe_dump(spec, handle, sort_keys=False, allow_unicode=True)
        path = handle.name
    try:
        gcloud(
            ["run", "services", "replace", path, "--project", PROJECT,
             "--region", REGION, "--account", ACCOUNT],
            capture=False,
        )
    finally:
        Path(path).unlink(missing_ok=True)


def main() -> int:
    args = sys.argv[1:]
    spec = export_spec()
    app = app_container(spec)
    env = app.setdefault("env", [])

    if not args or args[0] == "--show":
        for item in env:
            name = item.get("name", "")
            shown = "<redacted>" if name in SECRET_KEYS else item.get("value", "")
            print(f"  {name} = {shown}")
        return 0

    by_name = {item["name"]: item for item in env}
    changed: list[str] = []
    for pair in args:
        if "=" not in pair:
            raise SystemExit(f"KEY=VALUE 형식이 아닙니다: {pair}")
        name, value = pair.split("=", 1)
        if value == "@secret":
            value = read_secret(name)
        if by_name.get(name, {}).get("value") == value:
            print(f"  {name} 변경 없음")
            continue
        if name in by_name:
            by_name[name]["value"] = value
            by_name[name].pop("valueFrom", None)
        else:
            item = {"name": name, "value": value}
            env.append(item)
            by_name[name] = item
        shown = "<redacted>" if name in SECRET_KEYS else value
        changed.append(f"{name}={shown}")

    if not changed:
        print("no-change")
        return 0

    print("updating:", ", ".join(changed))
    replace(spec)
    print("replaced")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
