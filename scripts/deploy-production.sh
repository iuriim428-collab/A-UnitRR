#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/opt/ad-unit-r/current"
APP_USER="ad-unit-r"
APP_GROUP="ad-unit-r"
HEALTHCHECK_URL="http://127.0.0.1:8092/api/healthz"
LOCK_FILE="/tmp/ad-unit-r-deploy.lock"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

exec 9>"$LOCK_FILE"
flock 9

cd "$ROOT_DIR"

install -d -o "$APP_USER" -g "$APP_GROUP" /var/log/ad-unit-r
chown -R "$APP_USER:$APP_GROUP" "$ROOT_DIR"

runuser -u "$APP_USER" -- bash -lc "cd '$ROOT_DIR' && pnpm install --frozen-lockfile"
runuser -u "$APP_USER" -- bash -lc "cd '$ROOT_DIR' && bash ./scripts/build-production.sh"

systemctl restart ad-unit-r
sleep 3
curl -fsS "$HEALTHCHECK_URL" >/dev/null

systemctl --no-pager --full status ad-unit-r | sed -n '1,18p'
echo "Deployment finished successfully."
