#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${RELEASE_ENV_FILE:-$ROOT_DIR/deploy/secrets/production.env}"

if [[ "$ENV_FILE" != /* ]]; then
  ENV_FILE="$ROOT_DIR/$ENV_FILE"
fi

fail() {
  printf '[本地发布失败] %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
用法：
  npm run release:local              发布当前 HEAD 上唯一的 vX.Y.Z tag
  npm run release:local -- v1.0.5    发布指定的本地 tag

说明：
  - 本命令直接发布微信云托管 API、商家后台并上传小程序；
  - 默认读取未提交的 deploy/secrets/production.env；
  - 命令不会创建、推送或删除 Git tag，也不会触发 GitHub Actions。
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

[[ "$#" -le 1 ]] || fail '只能提供一个版本 tag 参数'

env_value() {
  local wanted="$1"
  awk -v key="$wanted" '
    $0 ~ ("^" key "=") {
      sub("^" key "=", "", $0)
      print $0
      exit
    }
  ' "$ENV_FILE"
}

normalize_tag() {
  local input="$1"
  if [[ "$input" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf '%s' "$input"
  elif [[ "$input" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf 'v%s' "$input"
  else
    fail "版本 tag 必须是 vX.Y.Z，例如 v1.0.5；收到 $input"
  fi
}

git fetch --quiet --tags origin main

release_tag_input="${1:-}"
if [[ -n "$release_tag_input" ]]; then
  RELEASE_TAG="$(normalize_tag "$release_tag_input")"
else
  head_tags="$(git tag --points-at HEAD | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true)"
  tag_count="$(printf '%s\n' "$head_tags" | sed '/^$/d' | wc -l | tr -d ' ')"
  [[ "$tag_count" == "1" ]] || fail '当前 HEAD 必须恰好有一个合法发布 tag；请先运行 npm run release'
  RELEASE_TAG="$(printf '%s\n' "$head_tags" | sed -n '1p')"
fi

RELEASE_VERSION="${RELEASE_TAG#v}"
RELEASE_SHA="$(git rev-parse --short HEAD)"

[[ "$(git branch --show-current)" == "main" ]] || fail '本地发布只能从 main 分支执行'

dirty_paths="$(git status --porcelain=v1 --untracked-files=all | grep -vE '^\?\? deploy/secrets/' || true)"
[[ -z "$dirty_paths" ]] || fail "工作区不干净，请先提交或处理以下变更：\n$dirty_paths"

HEAD_SHA="$(git rev-parse HEAD)"
ORIGIN_MAIN_SHA="$(git rev-parse refs/remotes/origin/main)"
[[ "$HEAD_SHA" == "$ORIGIN_MAIN_SHA" ]] || fail '当前 HEAD 与 origin/main 不一致，请先推送 main'

TAG_SHA="$(git rev-parse --verify "${RELEASE_TAG}^{commit}")"
[[ "$TAG_SHA" == "$HEAD_SHA" ]] || fail "$RELEASE_TAG 没有指向当前 HEAD"

[[ -f "$ENV_FILE" ]] || fail "缺少本地生产配置：$ENV_FILE"
command -v wxcloud >/dev/null 2>&1 || fail '找不到 wxcloud CLI，请先安装 @wxcloud/cli'
command -v jq >/dev/null 2>&1 || fail '找不到 jq，请先安装 jq'

printf '[本地发布] tag=%s commit=%s\n' "$RELEASE_TAG" "$RELEASE_SHA"
printf '[本地发布] 执行生产配置、质量和依赖门禁\n'
npm run release:check -- "$ENV_FILE"
npm run check:quality
npm run test:security

CLOUD_APP_ID="$(env_value WX_CLOUD_APP_ID)"
CLOUD_PRIVATE_KEY="$(env_value WX_CLOUD_PRIVATE_KEY)"
CLOUD_ENV_ID="$(env_value WX_CLOUD_ENV_ID)"
API_SERVICE_NAME="$(env_value WX_CLOUD_API_SERVICE_NAME)"
MERCHANT_SERVICE_NAME="$(env_value WX_CLOUD_MERCHANT_SERVICE_NAME)"
CONFIGURED_API_DOMAIN="$(env_value WX_CLOUD_API_PUBLIC_DOMAIN)"
CONFIGURED_API_BASE="$(env_value VITE_API_BASE_URL)"
MAP_JS_KEY="$(env_value VITE_TENCENT_MAP_JS_KEY)"
MINI_APP_ID="$(env_value WECHAT_MINI_APP_ID)"

for required_value in \
  CLOUD_APP_ID CLOUD_PRIVATE_KEY CLOUD_ENV_ID API_SERVICE_NAME \
  MERCHANT_SERVICE_NAME CONFIGURED_API_DOMAIN CONFIGURED_API_BASE MINI_APP_ID; do
  [[ -n "${!required_value}" ]] || fail "production.env 缺少 ${required_value} 对应配置"
done

printf '[本地发布] 登录微信云托管并查询当前服务域名\n'
wxcloud login --appId "$CLOUD_APP_ID" --privateKey "$CLOUD_PRIVATE_KEY"

service_output="$(wxcloud service:list --envId "$CLOUD_ENV_ID" --region ap-shanghai --json)"
service_json="$(printf '%s\n' "$service_output" | awk '/^\{/{json=$0} END{print json}')"
[[ -n "$service_json" ]] || fail '无法解析 wxcloud service:list 返回结果'

service_domain() {
  local service_name="$1"
  printf '%s' "$service_json" | jq -er --arg name "$service_name" \
    '.data[] | select(.ServerName == $name) | .DefaultPublicDomain'
}

API_DOMAIN="$(service_domain "$API_SERVICE_NAME")" || fail "找不到 API 服务 $API_SERVICE_NAME"
MERCHANT_DOMAIN="$(service_domain "$MERCHANT_SERVICE_NAME")" || fail "找不到商家服务 $MERCHANT_SERVICE_NAME"
EXPECTED_API_BASE="${API_DOMAIN%/}/api"

[[ "$CONFIGURED_API_DOMAIN" == "$API_DOMAIN" || "https://$CONFIGURED_API_DOMAIN" == "$API_DOMAIN" ]] \
  || fail 'production.env 中的 WX_CLOUD_API_PUBLIC_DOMAIN 已过期，请先更新当前服务域名'
[[ "$CONFIGURED_API_BASE" == "$EXPECTED_API_BASE" ]] \
  || fail 'production.env 中的 VITE_API_BASE_URL 未指向当前 API 服务域名'

MINI_KEY_PATH="$ROOT_DIR/deploy/secrets/private.${MINI_APP_ID}.key"
[[ -f "$MINI_KEY_PATH" ]] || fail "找不到当前小程序 AppID 对应的上传私钥：$MINI_KEY_PATH"

MINI_NODE_BIN="${WECHAT_NODE_BIN:-$(command -v node)}"
MINI_NODE_MAJOR="$("$MINI_NODE_BIN" -p 'process.versions.node.split(".")[0]')"
if [[ "$MINI_NODE_MAJOR" -lt 22 || "$MINI_NODE_MAJOR" -gt 24 ]]; then
  for candidate in /opt/homebrew/opt/node@24/bin/node /opt/homebrew/opt/node@22/bin/node; do
    if [[ -x "$candidate" ]]; then
      MINI_NODE_BIN="$candidate"
      break
    fi
  done
fi
MINI_NODE_MAJOR="$("$MINI_NODE_BIN" -p 'process.versions.node.split(".")[0]')"
[[ "$MINI_NODE_MAJOR" -ge 22 && "$MINI_NODE_MAJOR" -le 24 ]] \
  || fail 'miniprogram-ci 需要 Node 22–24；请安装兼容 Node 或设置 WECHAT_NODE_BIN'

RELEASE_ROOT="$(mktemp -d -t city-flash-local-release.XXXXXX)"
trap 'rm -rf -- "$RELEASE_ROOT"' EXIT

API_CONTEXT="$RELEASE_ROOT/api"
mkdir -p "$API_CONTEXT/scripts"
cp \
  "$ROOT_DIR/server/api/package.json" \
  "$ROOT_DIR/server/api/package-lock.json" \
  "$ROOT_DIR/server/api/Dockerfile" \
  "$ROOT_DIR/server/api/.dockerignore" \
  "$ROOT_DIR/server/api/nest-cli.json" \
  "$ROOT_DIR/server/api/tsconfig.json" \
  "$ROOT_DIR/server/api/tsconfig.build.json" \
  "$API_CONTEXT/"
cp -R "$ROOT_DIR/server/api/src" "$ROOT_DIR/server/api/prisma" "$API_CONTEXT/"
cp "$ROOT_DIR/server/api/scripts/create-operator.mjs" "$API_CONTEXT/scripts/"

if find "$API_CONTEXT" -type f | grep -Eq '(^|/)(node_modules|dist)/|(^|/)\.env($|\.)|.*\.(pem|key|p12|pfx|crt|cer)$'; then
  fail 'API 临时发布上下文包含依赖、构建产物、环境文件或证书'
fi

printf '[本地发布] 部署 API 服务\n'
wxcloud run:deploy "$API_CONTEXT" \
  --targetDir . \
  --dockerfile Dockerfile \
  --containerPort 3000 \
  --envId "$CLOUD_ENV_ID" \
  --serviceName "$API_SERVICE_NAME" \
  --region ap-shanghai \
  --releaseType FULL \
  --remark "Release $RELEASE_TAG API $RELEASE_SHA (local)" \
  --override \
  --noConfirm

printf '[本地发布] 检查 API readiness\n'
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused \
  "${API_DOMAIN%/}/api/health/ready" >/dev/null

printf '[本地发布] 构建商家后台\n'
npm --prefix "$ROOT_DIR/apps/merchant-web" ci
VITE_API_BASE_URL="$EXPECTED_API_BASE" \
VITE_TENCENT_MAP_JS_KEY="$MAP_JS_KEY" \
  npm --prefix "$ROOT_DIR/apps/merchant-web" run build
rg -n --fixed-strings "$EXPECTED_API_BASE" "$ROOT_DIR/apps/merchant-web/dist" >/dev/null

MERCHANT_CONTEXT="$RELEASE_ROOT/merchant"
mkdir -p "$MERCHANT_CONTEXT"
cp "$ROOT_DIR/apps/merchant-web/Dockerfile.cloud" "$MERCHANT_CONTEXT/Dockerfile"
cp "$ROOT_DIR/apps/merchant-web/nginx.conf" "$MERCHANT_CONTEXT/nginx.conf"
cp -R "$ROOT_DIR/apps/merchant-web/dist" "$MERCHANT_CONTEXT/dist"

if find "$MERCHANT_CONTEXT" -type f | grep -Eq '(^|/)(node_modules|coverage)/|(^|/)\.env($|\.)|.*\.(pem|key|p12|pfx|crt|cer)$'; then
  fail '商家临时发布上下文包含不应上传的文件'
fi

printf '[本地发布] 部署商家后台\n'
wxcloud run:deploy "$MERCHANT_CONTEXT" \
  --targetDir . \
  --dockerfile Dockerfile \
  --containerPort 80 \
  --envId "$CLOUD_ENV_ID" \
  --serviceName "$MERCHANT_SERVICE_NAME" \
  --region ap-shanghai \
  --releaseType FULL \
  --remark "Release $RELEASE_TAG merchant $RELEASE_SHA (local)" \
  --noConfirm

printf '[本地发布] 检查商家后台健康状态\n'
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused \
  "${MERCHANT_DOMAIN%/}/healthz" >/dev/null
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused \
  "${MERCHANT_DOMAIN%/}/" >/dev/null

printf '[本地发布] 校验并上传小程序 %s\n' "$RELEASE_VERSION"
WECHAT_ACTION=validate \
WECHAT_PRIVATE_KEY_PATH="$MINI_KEY_PATH" \
WECHAT_VERSION="$RELEASE_VERSION" \
WECHAT_DESCRIPTION="Release $RELEASE_TAG ($RELEASE_SHA, local)" \
  "$MINI_NODE_BIN" "$ROOT_DIR/scripts/miniprogram-ci.cjs"
WECHAT_ACTION=upload \
WECHAT_PRIVATE_KEY_PATH="$MINI_KEY_PATH" \
WECHAT_VERSION="$RELEASE_VERSION" \
WECHAT_DESCRIPTION="Release $RELEASE_TAG ($RELEASE_SHA, local)" \
  "$MINI_NODE_BIN" "$ROOT_DIR/scripts/miniprogram-ci.cjs"

printf '[本地发布] 完成：%s\n' "$RELEASE_TAG"
printf '[本地发布] GitHub 只需随后推送 main/tag 做版本留痕，不会再次触发生产发布。\n'
