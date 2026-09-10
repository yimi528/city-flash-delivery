#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MACOS_SECRETS_DIR="$HOME/Library/Application Support/city-flash-delivery/secrets"
XDG_SECRETS_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/city-flash-delivery/secrets"
if [[ -n "${RELEASE_SECRETS_DIR:-}" ]]; then
  SECRETS_DIR="$RELEASE_SECRETS_DIR"
elif [[ "$(uname -s)" == "Darwin" && -d "$MACOS_SECRETS_DIR" ]]; then
  SECRETS_DIR="$MACOS_SECRETS_DIR"
elif [[ -d "$XDG_SECRETS_DIR" ]]; then
  SECRETS_DIR="$XDG_SECRETS_DIR"
else
  # 保持默认路径明确；后续的 production.env 检查会给出缺失提示。
  if [[ "$(uname -s)" == "Darwin" ]]; then
    SECRETS_DIR="$MACOS_SECRETS_DIR"
  else
    SECRETS_DIR="$XDG_SECRETS_DIR"
  fi
fi
if [[ "$SECRETS_DIR" != /* ]]; then
  SECRETS_DIR="$ROOT_DIR/$SECRETS_DIR"
fi
ENV_FILE="${RELEASE_ENV_FILE:-$SECRETS_DIR/production.env}"
if [[ "$ENV_FILE" != /* ]]; then
  ENV_FILE="$ROOT_DIR/$ENV_FILE"
fi
RELEASE_FORCE_ALL="${RELEASE_FORCE_ALL:-false}"
RELEASE_ROOT=""

fail() {
  printf '[本地发布失败] %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
用法：
  npm run release:local              按当前 tag 以来的变更选择性发布
  npm run release:local -- v1.0.5    发布指定的本地 tag

说明：
  - 只检查和发布当前 tag 以来发生变化的服务；
  - API 和商家后台的云托管任务会并行提交；
  - 小程序上传会复用上传动作自身的 AppID 校验，不再重复 validate；
  - macOS 默认读取仓库外的 ~/Library/Application Support/city-flash-delivery/secrets/production.env；
  - Linux/其他环境默认读取 ~/.config/city-flash-delivery/secrets/production.env；
  - 可用 RELEASE_SECRETS_DIR 或 RELEASE_ENV_FILE 指定其他安全位置；
  - 命令不会创建、推送或删除 Git tag，也不会触发 GitHub Actions。

如需强制重新发布全部服务：
  RELEASE_FORCE_ALL=true npm run release:local -- v1.0.5
EOF
}

cleanup() {
  if [[ -n "$RELEASE_ROOT" && -d "$RELEASE_ROOT" ]]; then
    rm -rf -- "$RELEASE_ROOT"
  fi
}
trap cleanup EXIT

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

dirty_paths="$(git status --porcelain=v1 --untracked-files=all | grep -vE '^\?\? deploy/secrets/\.gitkeep$' || true)"
[[ -z "$dirty_paths" ]] || fail "工作区不干净，请先提交或处理以下变更：\n$dirty_paths"

HEAD_SHA="$(git rev-parse HEAD)"
ORIGIN_MAIN_SHA="$(git rev-parse refs/remotes/origin/main)"
[[ "$HEAD_SHA" == "$ORIGIN_MAIN_SHA" ]] || fail '当前 HEAD 与 origin/main 不一致，请先推送 main'

TAG_SHA="$(git rev-parse --verify "${RELEASE_TAG}^{commit}")"
[[ "$TAG_SHA" == "$HEAD_SHA" ]] || fail "$RELEASE_TAG 没有指向当前 HEAD"

[[ -f "$ENV_FILE" ]] || fail "缺少本地生产配置：$ENV_FILE"

# 以当前 tag 的前一个发布 tag 为基线，避免每次发布都重新构建没有变化的服务。
previous_release_tag="$(
  git tag --merged "$HEAD_SHA" --sort=-v:refname \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
    | grep -v -F -x "$RELEASE_TAG" \
    | sed -n '1p' || true
)"
if [[ -n "$previous_release_tag" ]]; then
  changed_files="$(git diff --name-only "$previous_release_tag" "$HEAD_SHA")"
  change_baseline="$previous_release_tag"
else
  changed_files="$(git ls-tree -r --name-only "$HEAD_SHA")"
  change_baseline='仓库初始版本'
fi

scope_changed() {
  if [[ "$RELEASE_FORCE_ALL" == '1' || "$RELEASE_FORCE_ALL" == 'true' ]]; then
    return 0
  fi
  printf '%s\n' "$changed_files" | grep -Eq "$1"
}

API_CHANGED=false
MERCHANT_CHANGED=false
MINI_CHANGED=false

if scope_changed '^(server/api/|packages/shared/)'; then
  API_CHANGED=true
fi
if scope_changed '^(apps/merchant-web/|packages/shared/)'; then
  MERCHANT_CHANGED=true
fi
if scope_changed '^(apps/customer-mp/|project.config.json$|scripts/miniprogram-ci.cjs$|packages/shared/)'; then
  MINI_CHANGED=true
fi

printf '[本地发布] tag=%s commit=%s\n' "$RELEASE_TAG" "$RELEASE_SHA"
printf '[本地发布] 变更基线=%s\n' "$change_baseline"
printf '[本地发布] 发布范围：API=%s 商家=%s 小程序=%s\n' \
  "$API_CHANGED" "$MERCHANT_CHANGED" "$MINI_CHANGED"

CLOUD_APP_ID="$(env_value WX_CLOUD_APP_ID)"
CLOUD_PRIVATE_KEY="$(env_value WX_CLOUD_PRIVATE_KEY)"
CLOUD_ENV_ID="$(env_value WX_CLOUD_ENV_ID)"
API_SERVICE_NAME="$(env_value WX_CLOUD_API_SERVICE_NAME)"
MERCHANT_SERVICE_NAME="$(env_value WX_CLOUD_MERCHANT_SERVICE_NAME)"
CONFIGURED_API_DOMAIN="$(env_value WX_CLOUD_API_PUBLIC_DOMAIN)"
CONFIGURED_API_BASE="$(env_value VITE_API_BASE_URL)"
MAP_JS_KEY="$(env_value VITE_TENCENT_MAP_JS_KEY)"
MINI_APP_ID="$(env_value WECHAT_MINI_APP_ID)"

require_value() {
  local variable_name="$1"
  [[ -n "${!variable_name}" ]] || fail "production.env 缺少 ${variable_name} 对应配置"
}

if [[ "$API_CHANGED" == true || "$MERCHANT_CHANGED" == true ]]; then
  command -v wxcloud >/dev/null 2>&1 || fail '找不到 wxcloud CLI，请先安装 @wxcloud/cli'
  command -v jq >/dev/null 2>&1 || fail '找不到 jq，请先安装 jq'
  require_value CLOUD_APP_ID
  require_value CLOUD_PRIVATE_KEY
  require_value CLOUD_ENV_ID
  require_value API_SERVICE_NAME
  require_value MERCHANT_SERVICE_NAME
  require_value CONFIGURED_API_DOMAIN
  require_value CONFIGURED_API_BASE
fi
if [[ "$MINI_CHANGED" == true ]]; then
  require_value MINI_APP_ID
fi

printf '[本地发布] 运行受影响范围的生产配置与质量门禁\n'
npm run release:check -- "$ENV_FILE"

quality_scopes=''
[[ "$API_CHANGED" == true ]] && quality_scopes="$quality_scopes api"
[[ "$MERCHANT_CHANGED" == true ]] && quality_scopes="$quality_scopes merchant"
[[ "$MINI_CHANGED" == true ]] && quality_scopes="$quality_scopes mini"

if [[ -n "$quality_scopes" ]]; then
  # 让质量检查直接生成可发布的商家 dist，避免后面再次 npm ci/build。
  VITE_API_BASE_URL="$CONFIGURED_API_BASE" \
  VITE_TENCENT_MAP_JS_KEY="$MAP_JS_KEY" \
    npm run check:quality -- $quality_scopes
else
  printf '[本地发布] 应用目录未变化，跳过应用质量检查\n'
  bash -n "$ROOT_DIR/scripts/release-local.sh"
fi

if [[ "$API_CHANGED" == true ]]; then
  npm --prefix "$ROOT_DIR/server/api" audit --omit=dev
fi
if [[ "$MERCHANT_CHANGED" == true ]]; then
  npm --prefix "$ROOT_DIR/apps/merchant-web" audit --omit=dev
fi

API_DOMAIN=''
MERCHANT_DOMAIN=''
EXPECTED_API_BASE=''
MINI_KEY_PATH=''
MINI_NODE_BIN=''

if [[ "$API_CHANGED" == true || "$MERCHANT_CHANGED" == true ]]; then
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
  EXPECTED_API_BASE="${API_DOMAIN%/}/api"
  [[ "$CONFIGURED_API_DOMAIN" == "$API_DOMAIN" || "https://$CONFIGURED_API_DOMAIN" == "$API_DOMAIN" ]] \
    || fail 'production.env 中的 WX_CLOUD_API_PUBLIC_DOMAIN 已过期，请先更新当前服务域名'
  [[ "$CONFIGURED_API_BASE" == "$EXPECTED_API_BASE" ]] \
    || fail 'production.env 中的 VITE_API_BASE_URL 未指向当前 API 服务域名'

  if [[ "$MERCHANT_CHANGED" == true ]]; then
    MERCHANT_DOMAIN="$(service_domain "$MERCHANT_SERVICE_NAME")" \
      || fail "找不到商家服务 $MERCHANT_SERVICE_NAME"
  fi
fi

if [[ "$MINI_CHANGED" == true ]]; then
  MINI_KEY_PATH="${RELEASE_MINI_KEY_PATH:-$SECRETS_DIR/private.${MINI_APP_ID}.key}"
  [[ -f "$MINI_KEY_PATH" ]] || fail "找不到当前小程序 AppID 对应的上传私钥：$MINI_KEY_PATH"

  MINI_NODE_BIN="${WECHAT_NODE_BIN:-$(command -v node)}"
  MINI_NODE_MAJOR="$($MINI_NODE_BIN -p 'process.versions.node.split(".")[0]')"
  if [[ "$MINI_NODE_MAJOR" -lt 22 || "$MINI_NODE_MAJOR" -gt 24 ]]; then
    for candidate in /opt/homebrew/opt/node@24/bin/node /opt/homebrew/opt/node@22/bin/node; do
      if [[ -x "$candidate" ]]; then
        MINI_NODE_BIN="$candidate"
        break
      fi
    done
  fi
  MINI_NODE_MAJOR="$($MINI_NODE_BIN -p 'process.versions.node.split(".")[0]')"
  [[ "$MINI_NODE_MAJOR" -ge 22 && "$MINI_NODE_MAJOR" -le 24 ]] \
    || fail 'miniprogram-ci 需要 Node 22–24；请安装兼容 Node 或设置 WECHAT_NODE_BIN'
fi

if [[ "$API_CHANGED" == true || "$MERCHANT_CHANGED" == true ]]; then
  RELEASE_ROOT="$(mktemp -d -t city-flash-local-release.XXXXXX)"

  if [[ "$API_CHANGED" == true ]]; then
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
  fi

  if [[ "$MERCHANT_CHANGED" == true ]]; then
    MERCHANT_CONTEXT="$RELEASE_ROOT/merchant"
    [[ -d "$ROOT_DIR/apps/merchant-web/dist" ]] || fail '商家后台质量检查未生成 dist'
    rg -n --fixed-strings "$EXPECTED_API_BASE" "$ROOT_DIR/apps/merchant-web/dist" >/dev/null \
      || fail '商家后台构建产物未包含当前 API 地址'
    mkdir -p "$MERCHANT_CONTEXT"
    cp "$ROOT_DIR/apps/merchant-web/Dockerfile.cloud" "$MERCHANT_CONTEXT/Dockerfile"
    cp "$ROOT_DIR/apps/merchant-web/nginx.conf" "$MERCHANT_CONTEXT/nginx.conf"
    cp -R "$ROOT_DIR/apps/merchant-web/dist" "$MERCHANT_CONTEXT/dist"

    if find "$MERCHANT_CONTEXT" -type f | grep -Eq '(^|/)(node_modules|coverage)/|(^|/)\.env($|\.)|.*\.(pem|key|p12|pfx|crt|cer)$'; then
      fail '商家临时发布上下文包含不应上传的文件'
    fi
  fi

  API_DEPLOY_PID=''
  MERCHANT_DEPLOY_PID=''
  API_DEPLOY_LOG="$RELEASE_ROOT/api-deploy.log"
  MERCHANT_DEPLOY_LOG="$RELEASE_ROOT/merchant-deploy.log"

  if [[ "$API_CHANGED" == true ]]; then
    printf '[本地发布] 后台提交 API 云托管部署\n'
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
      --detach \
      --noConfirm >"$API_DEPLOY_LOG" 2>&1 &
    API_DEPLOY_PID=$!
  fi

  if [[ "$MERCHANT_CHANGED" == true ]]; then
    printf '[本地发布] 后台提交商家后台云托管部署\n'
    wxcloud run:deploy "$MERCHANT_CONTEXT" \
      --targetDir . \
      --dockerfile Dockerfile \
      --containerPort 80 \
      --envId "$CLOUD_ENV_ID" \
      --serviceName "$MERCHANT_SERVICE_NAME" \
      --region ap-shanghai \
      --releaseType FULL \
      --remark "Release $RELEASE_TAG merchant $RELEASE_SHA (local)" \
      --detach \
      --noConfirm >"$MERCHANT_DEPLOY_LOG" 2>&1 &
    MERCHANT_DEPLOY_PID=$!
  fi

  wait_for_deploy() {
    local label="$1"
    local pid="$2"
    local log_path="$3"
    if wait "$pid"; then
      printf '[本地发布] %s 云托管部署任务完成\n' "$label"
      tail -n 8 "$log_path" || true
      return 0
    fi
    printf '[本地发布失败] %s 云托管部署失败，最近日志：\n' "$label" >&2
    tail -n 80 "$log_path" >&2 || true
    return 1
  }

  deploy_failures=0
  if [[ -n "$API_DEPLOY_PID" ]]; then
    wait_for_deploy API "$API_DEPLOY_PID" "$API_DEPLOY_LOG" || deploy_failures=$((deploy_failures + 1))
  fi
  if [[ -n "$MERCHANT_DEPLOY_PID" ]]; then
    wait_for_deploy 商家后台 "$MERCHANT_DEPLOY_PID" "$MERCHANT_DEPLOY_LOG" || deploy_failures=$((deploy_failures + 1))
  fi
  [[ "$deploy_failures" == 0 ]] || fail '至少一个云托管服务发布失败'

  if [[ "$API_CHANGED" == true ]]; then
    printf '[本地发布] 检查 API readiness\n'
    curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused \
      "${API_DOMAIN%/}/api/health/ready" >/dev/null
  fi

  if [[ "$MERCHANT_CHANGED" == true ]]; then
    printf '[本地发布] 检查商家后台健康状态\n'
    curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused \
      "${MERCHANT_DOMAIN%/}/healthz" >/dev/null
    curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused \
      "${MERCHANT_DOMAIN%/}/" >/dev/null
  fi
fi

if [[ "$MINI_CHANGED" == true ]]; then
  printf '[本地发布] 上传小程序 %s\n' "$RELEASE_VERSION"
  WECHAT_ACTION=upload \
  WECHAT_PRIVATE_KEY_PATH="$MINI_KEY_PATH" \
  WECHAT_VERSION="$RELEASE_VERSION" \
  WECHAT_DESCRIPTION="Release $RELEASE_TAG ($RELEASE_SHA, local)" \
    "$MINI_NODE_BIN" "$ROOT_DIR/scripts/miniprogram-ci.cjs"
fi

if [[ "$API_CHANGED" == false && "$MERCHANT_CHANGED" == false && "$MINI_CHANGED" == false ]]; then
  printf '[本地发布] 本次只有文档/发布工具等非运行时代码变化，跳过云托管和小程序发布\n'
fi

printf '[本地发布] 完成：%s\n' "$RELEASE_TAG"
printf '[本地发布] GitHub 只需随后推送 main/tag 做版本留痕，不会再次触发生产发布。\n'
