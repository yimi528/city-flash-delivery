#!/usr/bin/env bash

set -Eeuo pipefail

deploy_path="${1:?deployment path is required}"
image_namespace="${2:?image namespace is required}"
image_tag="${3:?image tag is required}"
ghcr_username="${4:?GHCR username is required}"
read -r ghcr_pull_token

cd "$deploy_path"
printf '%s' "$ghcr_pull_token" | docker login ghcr.io --username "$ghcr_username" --password-stdin

export API_IMAGE="$image_namespace/city-flash-api:$image_tag"
export API_MIGRATION_IMAGE="$image_namespace/city-flash-api-migration:$image_tag"
export MERCHANT_IMAGE="$image_namespace/city-flash-merchant:$image_tag"

compose=(docker compose --env-file env.production -f docker-compose.cloud.yml)
"${compose[@]}" pull
"${compose[@]}" --profile tools run --rm migrate
"${compose[@]}" up -d
"${compose[@]}" ps
docker logout ghcr.io
