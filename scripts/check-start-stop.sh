#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$ROOT_DIR/.runtime/start-stop-test.log"
LAUNCHER_PID=''

cleanup() {
  if [[ -n "$LAUNCHER_PID" ]] && kill -0 "$LAUNCHER_PID" 2>/dev/null; then
    kill "$LAUNCHER_PID" 2>/dev/null || true
  fi
  "$ROOT_DIR/scripts/stop-dev.sh" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

mkdir -p "$ROOT_DIR/.runtime"
"$ROOT_DIR/scripts/stop-dev.sh" >/dev/null 2>&1 || true
OPEN_BROWSER=0 "$ROOT_DIR/scripts/dev.sh" >"$LOG_FILE" 2>&1 &
LAUNCHER_PID=$!

for _ in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1 && \
    curl -fsS http://127.0.0.1:5173 >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$LAUNCHER_PID" 2>/dev/null; then
    printf '[不通过] 一键启动提前退出，日志：%s\n' "$LOG_FILE" >&2
    exit 1
  fi
  sleep 1
done

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
LAUNCHER_PID=''
trap - EXIT INT TERM
