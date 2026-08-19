"""Create Cloudflare TCP tunnel for Mac Mini Postgres. Never prints secrets."""
from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
from pathlib import Path

CLOUDFLARED = "cloudflared"
TUNNEL_NAME = "adg-pg"
SSH_KEY = Path.home() / ".ssh" / "id_ed25519_mac"
SSH_HOST = "joon@192.168.0.5"
WIN_CF_DIR = Path.home() / ".cloudflared"
MAC_CF_DIR = "/Users/joon/.cloudflared"
SECRETS_ENV = Path(r"D:\Project\ContextBuilder\Secrets\env\mae\macdb\designgenerator.env")


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=True, text=True, capture_output=True, **kwargs)


def ssh(remote: str) -> str:
    completed = run(
        [
            "ssh",
            "-i",
            str(SSH_KEY),
            "-o",
            "BatchMode=yes",
            SSH_HOST,
            remote,
        ]
    )
    return completed.stdout


def main() -> int:
    listed = run([CLOUDFLARED, "tunnel", "list", "--output", "json"])
    tunnels = json.loads(listed.stdout.decode("utf-8") if isinstance(listed.stdout, bytes) else listed.stdout)
    existing = next((item for item in tunnels if item.get("name") == TUNNEL_NAME), None)
    if existing is None:
        created = run([CLOUDFLARED, "tunnel", "create", TUNNEL_NAME])
        # stdout contains tunnel id; keep only the UUID line internally
        listed = run([CLOUDFLARED, "tunnel", "list", "--output", "json"])
        tunnels = json.loads(listed.stdout)
        existing = next(item for item in tunnels if item.get("name") == TUNNEL_NAME)
        print("tunnel-created")
    else:
        print("tunnel-exists")

    tunnel_id = existing["id"]
    cred_win = WIN_CF_DIR / f"{tunnel_id}.json"
    if not cred_win.is_file():
        print("missing-cred-json", file=sys.stderr)
        return 2

    suffix = secrets.token_hex(4)
    hostname = f"adg-pg-{suffix}.archiwork.io"

    # DNS route: ignore if already exists
    routed = subprocess.run(
        [CLOUDFLARED, "tunnel", "route", "dns", TUNNEL_NAME, hostname],
        text=True,
        capture_output=True,
    )
    if routed.returncode != 0 and "already exists" not in (routed.stderr or "").lower():
        print("dns-route-failed", file=sys.stderr)
        print(routed.stderr[-400:] if routed.stderr else "", file=sys.stderr)
        return 3
    print("dns-routed")

    config = "\n".join(
        [
            f"tunnel: {tunnel_id}",
            f"credentials-file: {MAC_CF_DIR}/{tunnel_id}.json",
            "protocol: http2",
            "originRequest:",
            "  connectTimeout: 10s",
            "  noHappyEyeballs: true",
            "ingress:",
            f"  - hostname: {hostname}",
            "    service: tcp://127.0.0.1:5432",
            "  - service: http_status:404",
            "",
        ]
    )
    cfg_win = WIN_CF_DIR / "adg-pg.yml"
    cfg_win.write_text(config, encoding="utf-8")

    ssh(f"mkdir -p {MAC_CF_DIR} && chmod 700 {MAC_CF_DIR}")
    scp_cmds = [
        [
            "scp",
            "-i",
            str(SSH_KEY),
            "-o",
            "BatchMode=yes",
            str(cred_win),
            f"{SSH_HOST}:{MAC_CF_DIR}/{tunnel_id}.json",
        ],
        [
            "scp",
            "-i",
            str(SSH_KEY),
            "-o",
            "BatchMode=yes",
            str(cfg_win),
            f"{SSH_HOST}:{MAC_CF_DIR}/adg-pg.yml",
        ],
    ]
    for cmd in scp_cmds:
        run(cmd)
    ssh(f"chmod 600 {MAC_CF_DIR}/{tunnel_id}.json {MAC_CF_DIR}/adg-pg.yml")

    plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.archiwork.adg-pg</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/cloudflared</string>
    <string>tunnel</string>
    <string>--config</string>
    <string>{MAC_CF_DIR}/adg-pg.yml</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/adg-pg.cloudflared.out.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/adg-pg.cloudflared.err.log</string>
</dict>
</plist>
"""
    local_plist = Path(os.environ["TEMP"]) / "io.archiwork.adg-pg.plist"
    local_plist.write_text(plist, encoding="utf-8")
    run(
        [
            "scp",
            "-i",
            str(SSH_KEY),
            "-o",
            "BatchMode=yes",
            str(local_plist),
            f"{SSH_HOST}:/Users/joon/Library/LaunchAgents/io.archiwork.adg-pg.plist",
        ]
    )
    ssh(
        "launchctl bootout gui/$(id -u) /Users/joon/Library/LaunchAgents/io.archiwork.adg-pg.plist 2>/dev/null; "
        "launchctl bootstrap gui/$(id -u) /Users/joon/Library/LaunchAgents/io.archiwork.adg-pg.plist; "
        "launchctl enable gui/$(id -u)/io.archiwork.adg-pg; "
        "launchctl kickstart -k gui/$(id -u)/io.archiwork.adg-pg"
    )
    print("origin-started")

    lines = SECRETS_ENV.read_text(encoding="utf-8").splitlines()
    kv = {}
    for line in lines:
        if "=" in line and not line.startswith("#"):
            key, _, val = line.partition("=")
            kv[key] = val
    kv["PG_TUNNEL_HOSTNAME"] = hostname
    kv["CLOUDRUN_DATABASE_URL"] = (
        f"postgresql://{kv.get('PGUSER', 'designgenerator_app')}:"
        f"{kv.get('PGPASSWORD', '')}@127.0.0.1:5432/"
        f"{kv.get('PGDATABASE', 'designgenerator')}?sslmode=disable"
    )
    # keep original keys, append/replace tunnel keys
    out_lines = []
    seen = set()
    for line in lines:
        if "=" in line and not line.startswith("#"):
            key = line.split("=", 1)[0]
            if key in {"PG_TUNNEL_HOSTNAME", "CLOUDRUN_DATABASE_URL"}:
                continue
            if key in kv:
                out_lines.append(f"{key}={kv[key]}")
                seen.add(key)
            else:
                out_lines.append(line)
        else:
            out_lines.append(line)
    for key in ("PG_TUNNEL_HOSTNAME", "CLOUDRUN_DATABASE_URL"):
        if key not in seen:
            out_lines.append(f"{key}={kv[key]}")
    SECRETS_ENV.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    print("secrets-updated")
    print(f"hostname-suffix {suffix}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
