#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/server/api"
WEB_DIR="$ROOT_DIR/apps/merchant-web"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PID_FILE="$RUNTIME_DIR/dev.pids"
LAUNCHER_PID_FILE="$RUNTIME_DIR/dev-launcher.pid"

mkdir -p "$RUNTIME_DIR"

log() {
  printf '\n[同城速送] %s\n' "$1"
}

fail() {
  printf '\n[启动失败] %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "未找到 $1，请先安装后重试。"
}

kill_tree() {
  local pid="$1"
  local child
  while IFS= read -r child; do
    [[ -n "$child" ]] && kill_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill "$pid" 2>/dev/null || true
}

kill_port() {
  local port="$1"
  local pid
  while IFS= read -r pid; do
    [[ "$pid" =~ ^[0-9]+$ ]] && kill "$pid" 2>/dev/null || true
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
}

cleanup() {
  trap - EXIT INT TERM
  if [[ -n "${WEB_PID:-}" ]] && kill -0 "$WEB_PID" 2>/dev/null; then kill_tree "$WEB_PID"; fi
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then kill_tree "$API_PID"; fi
  kill_port 5173
  kill_port 3000
  rm -f "$PID_FILE"
  if [[ -f "$LAUNCHER_PID_FILE" ]] && [[ "$(<"$LAUNCHER_PID_FILE")" == "$$" ]]; then
    rm -f "$LAUNCHER_PID_FILE"
  fi
}

trap cleanup EXIT INT TERM
printf '%s\n' "$$" >"$LAUNCHER_PID_FILE"

require_command node
require_command npm
require_command curl
require_command docker
require_command lsof

docker info >/dev/null 2>&1 || fail "Docker 尚未启动，请先打开 Docker Desktop。"

if [[ ! -f "$API_DIR/.env" ]]; then
  log "首次运行：创建本地环境配置"
  cp "$API_DIR/.env.example" "$API_DIR/.env"
fi

if [[ ! -d "$API_DIR/node_modules" ]]; then
  log "首次运行：安装后端依赖"
  (cd "$API_DIR" && npm ci)
fi

if [[ ! -d "$WEB_DIR/node_modules" ]]; then
  log "首次运行：安装运营后台依赖"
  (cd "$WEB_DIR" && npm ci)
fi

log "启动 PostgreSQL 与 Redis"
(cd "$API_DIR" && docker compose up -d --wait)

log "同步数据库结构"
(cd "$API_DIR" && npm run prisma:generate && npm run prisma:deploy && npm run build)

log "启动后端 API"
(cd "$API_DIR" && exec node dist/main.js) &
API_PID=$!
printf 'API_PID=%s\n' "$API_PID" > "$PID_FILE"

API_READY=false
for _ in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    API_READY=true
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    fail "后端进程已退出，请查看上方错误信息。"
  fi
  sleep 1
done

[[ "$API_READY" == "true" ]] || fail "后端在 45 秒内未通过健康检查。"

log "启动运营后台"
(cd "$WEB_DIR" && exec ./node_modules/.bin/vite --host 127.0.0.1) &
WEB_PID=$!
printf 'WEB_PID=%s\n' "$WEB_PID" >> "$PID_FILE"

WEB_READY=false
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:5173 >/dev/null 2>&1; then
    WEB_READY=true
    break
  fi
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    fail "运营后台进程已退出，请查看上方错误信息。"
  fi
  sleep 1
done

[[ "$WEB_READY" == "true" ]] || fail "运营后台在 30 秒内未启动。"

log "启动完成"
printf '%s\n' \
  "运营后台：http://127.0.0.1:5173" \
  "后端 API：http://127.0.0.1:3000/api" \
  "接口文档：http://127.0.0.1:3000/api/docs" \
  "按 Ctrl+C 可停止前后端；数据库会保留运行。"

if [[ "${OPEN_BROWSER:-1}" == "1" ]] && command -v open >/dev/null 2>&1; then
  open http://127.0.0.1:5173 >/dev/null 2>&1 || true
fi

wait "$API_PID" "$WEB_PID"
