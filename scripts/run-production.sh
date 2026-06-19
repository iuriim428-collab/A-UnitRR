#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

: "${PORT:=8092}"
: "${NODE_ENV:=production}"
: "${SERVE_FRONTEND_DIR:=$ROOT_DIR/artifacts/wb-optimizer/dist/public}"

export PORT
export NODE_ENV
export SERVE_FRONTEND_DIR

exec node ./artifacts/api-server/dist/index.mjs
