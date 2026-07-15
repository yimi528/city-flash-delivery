#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/server/api"
WEB_DIR="$ROOT_DIR/apps/merchant-web"
MINI_DIR="$ROOT_DIR/apps/customer-mp"

printf '\n[MVP 验收] 小程序业务测试\n'
node --test "$MINI_DIR"/tests/*.test.js

printf '\n[MVP 验收] 小程序脚本语法\n'
while IFS= read -r -d '' file; do node --check "$file"; done < <(find "$MINI_DIR" -name '*.js' -print0)

printf '\n[MVP 验收] 后端测试、代码检查与构建\n'
(cd "$API_DIR" && npm test -- --runInBand && npm run lint && npm run build && npx prisma validate)

printf '\n[MVP 验收] 运营后台生产构建\n'
(cd "$WEB_DIR" && npm run build)

if [[ "${RUN_LIVE:-0}" == "1" ]]; then
  printf '\n[MVP 验收] 真实 API 履约测试\n'
  (cd "$API_DIR" && npm run test:live)
fi

printf '\n[MVP 验收] 全部检查通过。\n'
