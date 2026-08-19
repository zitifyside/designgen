#!/bin/bash
set -euo pipefail
PSQL="/opt/homebrew/opt/postgresql@18/bin/psql"
"$PSQL" -d postgres -Atc "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1;"
echo "---ROLES---"
"$PSQL" -d postgres -Atc "SELECT rolname FROM pg_roles WHERE rolcanlogin ORDER BY 1;"
echo "---LISTEN---"
"$PSQL" -d postgres -Atc "SHOW listen_addresses;"
echo "---CLOUDFLARED---"
if command -v cloudflared >/dev/null 2>&1; then
  cloudflared --version
  launchctl list 2>/dev/null | grep -i cloudflare || true
  ls "$HOME/.cloudflared" 2>/dev/null | sed 's/.json$/.json/' || true
else
  echo "cloudflared-not-installed"
fi
