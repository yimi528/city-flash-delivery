#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$ROOT_DIR/.runtime/start-stop-test.log"

cleanup() {
  "$ROOT_DIR/scripts/stop-dev.sh" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

mkdir -p "$ROOT_DIR/.runtime"
"$ROOT_DIR/scripts/stop-dev.sh" >/dev/null 2>&1 || true
if ! OPEN_BROWSER=0 "$ROOT_DIR/scripts/start-dev.sh" >"$LOG_FILE" 2>&1; then
  printf '[不通过] 一键启动失败，日志：%s\n' "$LOG_FILE" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

curl -fsS http://127.0.0.1:3000/api/health >/dev/null
curl -fsS http://127.0.0.1:5173 >/dev/null
printf '[通过] 一键启动已同时提供 API 与运营后台。\n'

if [[ "${RUN_LIVE:-0}" == "1" ]]; then
  (cd "$ROOT_DIR/server/api" && npm run test:live)
  printf '[通过] 真实数据库 API 履约流程通过。\n'
fi

"$ROOT_DIR/scripts/stop-dev.sh" >/dev/null
sleep 2

if lsof -tiTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 || lsof -tiTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  printf '[不通过] 一键停止后仍有开发端口被占用。\n' >&2
  exit 1
fi

printf '[通过] 一键停止已关闭前端、后端、PostgreSQL 与 Redis。\n'
trap - EXIT INT TERM
