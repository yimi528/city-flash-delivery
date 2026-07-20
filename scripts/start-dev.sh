#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
START_LOCK_DIR="$RUNTIME_DIR/dev-start.lock"
LOG_FILE="$RUNTIME_DIR/dev-launcher.log"
API_URL="http://127.0.0.1:3000/api/health"
WEB_URL="http://127.0.0.1:5173"

mkdir -p "$RUNTIME_DIR"

log() {
  printf '[同城速送] %s\n' "$1"
}

is_reachable() {
  curl -fsS --max-time 2 "$1" >/dev/null 2>&1
}

is_running() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

launch_dev() {
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$ROOT_DIR" "$LOG_FILE" <<'PY'
import os
import subprocess
import sys

root_dir, log_file = sys.argv[1:]
environment = {**os.environ, "OPEN_BROWSER": "0"}
with open(log_file, "ab", buffering=0) as output:
    process = subprocess.Popen(
        ["bash", os.path.join(root_dir, "scripts", "dev.sh")],
        cwd=root_dir,
        env=environment,
        stdin=subprocess.DEVNULL,
        stdout=output,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
print(process.pid)
PY
    return
  fi

  nohup bash "$ROOT_DIR/scripts/dev.sh" >"$LOG_FILE" 2>&1 </dev/null &
  printf '%s\n' "$!"
}

if ! mkdir "$START_LOCK_DIR" 2>/dev/null; then
  log '启动任务已经在进行中，请稍候。'
  exit 0
fi

cleanup_lock() {
  rmdir "$START_LOCK_DIR" 2>/dev/null || true
}

trap cleanup_lock EXIT INT TERM

if is_reachable "$API_URL" && is_reachable "$WEB_URL"; then
  log '前后端已经在运行，无需重复启动。'
  printf '%s\n' \
    "运营后台：$WEB_URL" \
    "后端 API：http://127.0.0.1:3000/api" \
    "接口文档：http://127.0.0.1:3000/api/docs"
  exit 0
fi

log '正在后台启动 PostgreSQL、Redis、后端 API 和运营后台……'
launcher_pid="$(launch_dev)"

for _ in $(seq 1 90); do
  if is_reachable "$API_URL" && is_reachable "$WEB_URL"; then
    if [[ "${OPEN_BROWSER:-1}" == "1" ]] && command -v open >/dev/null 2>&1; then
      open "$WEB_URL" >/dev/null 2>&1 || true
    fi
    log '前后端启动完成。'
    printf '%s\n' \
      "运营后台：$WEB_URL" \
      "后端 API：http://127.0.0.1:3000/api" \
      "接口文档：http://127.0.0.1:3000/api/docs" \
      "停止服务：npm run dev:stop"
    exit 0
  fi

  if ! is_running "$launcher_pid"; then
    log "启动失败，请查看日志：$LOG_FILE"
    tail -n 80 "$LOG_FILE" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

log "前后端在 90 秒内未完成启动，请查看日志：$LOG_FILE"
tail -n 80 "$LOG_FILE" 2>/dev/null || true
exit 1
