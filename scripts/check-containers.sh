#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

printf '\n[容器验收] 构建后端运行镜像\n'
docker build --target runtime -t city-flash-api:local-check "$ROOT_DIR/server/api"

printf '\n[容器验收] 构建数据库迁移镜像\n'
docker build --target migration -t city-flash-api-migration:local-check "$ROOT_DIR/server/api"

printf '\n[容器验收] 构建运营后台镜像\n'
docker build --build-arg VITE_API_BASE_URL=https://api.example.com/api -t city-flash-merchant:local-check "$ROOT_DIR/apps/merchant-web"

printf '\n[容器验收] 检查运行用户与 Nginx 配置\n'
[[ "$(docker image inspect city-flash-api:local-check --format '{{.Config.User}}')" == 'node' ]]
docker run --rm city-flash-merchant:local-check nginx -t

printf '\n[容器验收] 三个生产镜像均构建成功。\n'
