#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/server/api"
printf '\n[MVP 验收] 运行统一质量检查\n'
(cd "$ROOT_DIR" && bash scripts/check-quality.sh)

if [[ "${RUN_LIVE:-0}" == "1" ]]; then
  printf '\n[MVP 验收] 真实 API 履约测试\n'
  (cd "$API_DIR" && npm run test:live)
fi

printf '\n[MVP 验收] 全部检查通过。\n'
