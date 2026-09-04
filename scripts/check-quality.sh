#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/server/api"
WEB_DIR="$ROOT_DIR/apps/merchant-web"
MINI_DIR="$ROOT_DIR/apps/customer-mp"

printf '\n[质量检查] 小程序测试与脚本语法\n'
printf '[质量检查] 共享契约测试\n'
npm run test:shared
node --test "$MINI_DIR"/tests/*.test.js
while IFS= read -r -d '' file; do node --check "$file"; done < <(find "$MINI_DIR" -name '*.js' -print0)

printf '\n[质量检查] 后端测试、检查、构建与 Prisma 校验\n'
(cd "$API_DIR" && npm test -- --runInBand && npm run lint && npm run build && npx prisma validate)

printf '\n[质量检查] 商家后台构建\n'
(cd "$WEB_DIR" && npm run build)

printf '\n[质量检查] 全部通过。\n'
