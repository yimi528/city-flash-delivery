#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/deploy/env.production}"
RUNTIME_CONFIG="$ROOT_DIR/apps/customer-mp/config/runtime.js"

if [[ "$ENV_FILE" != /* ]]; then
  ENV_FILE="$ROOT_DIR/$ENV_FILE"
fi

failures=0

fail() {
  printf '[不通过] %s\n' "$1" >&2
  failures=$((failures + 1))
}

pass() {
  printf '[通过] %s\n' "$1"
}

value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1
}

required_value() {
  local key="$1"
  local current
  current="$(value "$key")"
  if [[ -z "$current" || "$current" =~ replace[-_]|example\.com|change-me|your- ]]; then
    fail "$key 尚未填写正式值"
  else
    pass "$key 已配置"
  fi
}

[[ -f "$ENV_FILE" ]] || { printf '[不通过] 缺少生产环境文件：%s\n' "$ENV_FILE" >&2; exit 1; }

printf '\n[生产验收] 环境与凭证\n'
[[ "$(value NODE_ENV)" == "production" ]] || fail 'NODE_ENV 必须为 production'
[[ "$(value WECHAT_LOGIN_MOCK_ENABLED)" == "false" ]] || fail '正式环境必须关闭登录 Mock'
[[ "$(value WECHAT_PAY_MOCK_ENABLED)" == "false" ]] || fail '正式环境必须关闭支付 Mock'
[[ "$(value ENABLE_SWAGGER)" == "false" ]] || fail '正式环境应关闭 Swagger'

for key in API_IMAGE API_MIGRATION_IMAGE MERCHANT_IMAGE API_DOMAIN OPS_DOMAIN DATABASE_URL REDIS_URL WECHAT_MINI_APP_ID WECHAT_MINI_APP_SECRET WECHAT_PAY_MCH_ID WECHAT_PAY_CERT_SERIAL WECHAT_PAY_API_V3_KEY WECHAT_PAY_PLATFORM_CERT_SERIAL TENCENT_MAP_KEY; do
  required_value "$key"
done

jwt_secret="$(value JWT_SECRET)"
if (( ${#jwt_secret} < 32 )) || [[ "$jwt_secret" =~ replace|change-me ]]; then
  fail 'JWT_SECRET 必须是至少 32 字符的随机密钥'
else
  pass 'JWT_SECRET 长度符合要求'
fi

cors="$(value CORS_ORIGINS)"
[[ "$cors" == https://* && "$cors" != *'*'* ]] || fail 'CORS_ORIGINS 必须是明确的 HTTPS 运营后台域名'

for key in WECHAT_PAY_NOTIFY_URL WECHAT_PAY_REFUND_NOTIFY_URL; do
  current="$(value "$key")"
  [[ "$current" == https://* && "$current" != *example.com* ]] || fail "$key 必须使用正式 HTTPS 地址"
done

for file in "$ROOT_DIR/deploy/certs/fullchain.pem" "$ROOT_DIR/deploy/certs/privkey.pem" "$ROOT_DIR/deploy/secrets/apiclient_key.pem" "$ROOT_DIR/deploy/secrets/wechatpay_platform.pem"; do
  [[ -s "$file" ]] || fail "缺少证书或密钥文件：${file#$ROOT_DIR/}"
done

printf '\n[生产验收] 小程序接口域名\n'
api_domain="$(value API_DOMAIN)"
release_url="$(node -e "const c=require(process.argv[1]);process.stdout.write(c.API_BASE_URLS.release)" "$RUNTIME_CONFIG")"
if [[ "$release_url" == "https://$api_domain/api" && "$release_url" != *example.com* && "$release_url" != *trycloudflare* ]]; then
  pass '小程序 release 接口地址与 API_DOMAIN 一致'
else
  fail "小程序 release 地址应设置为 https://$api_domain/api，当前为 $release_url"
fi

printf '\n[生产验收] Compose 配置\n'
if API_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/deploy/docker-compose.cloud.yml" config --quiet; then
  pass '生产 Compose 配置有效'
else
  fail '生产 Compose 配置无效'
fi

if (( failures > 0 )); then
  printf '\n生产验收未通过，共 %s 项需要处理。\n' "$failures" >&2
  exit 1
fi

printf '\n生产配置验收全部通过，可以执行部署。\n'
