#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/server/api"
PID_FILE="$ROOT_DIR/.runtime/dev.pids"

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

wait_for_port_to_close() {
  local port="$1"
  local attempt
  for attempt in $(seq 1 20); do
    if ! lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

if [[ -f "$PID_FILE" ]]; then
  while IFS='=' read -r _ pid; do
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      kill_tree "$pid"
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

# PID files can disappear when the launcher or control panel is interrupted.
# Always clear the two ports reserved by this project so "stop" remains reliable.
kill_port 5173
kill_port 3000
wait_for_port_to_close 5173 || true
wait_for_port_to_close 3000 || true

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  (cd "$API_DIR" && docker compose stop)
fi

printf '[同城速送] 本地前后端、PostgreSQL 和 Redis 已停止。\n'
