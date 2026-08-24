#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.cloud}"

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
  awk -v wanted="$1" '
    $0 ~ ("^" wanted "=") {
      found = 1
      sub("^" wanted "=", "", $0)
      printf "%s", $0
      next
    }
    found && $0 ~ /^[A-Za-z_][A-Za-z0-9_]*=/ { exit }
    found && $0 !~ /^[[:space:]]*#/ {
      gsub(/[[:space:]]/, "")
      printf "%s", $0
      next
    }
  ' "$ENV_FILE"
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

[[ -f "$ENV_FILE" ]] || {
  printf '[不通过] 缺少微信云托管生产环境文件：%s\n' "$ENV_FILE" >&2
  printf '请复制一个未提交的 .env.cloud，并按 docs/deploy-wxcloud.md 填写。\n' >&2
  exit 1
}

printf '\n[微信云托管验收] 运行模式\n'
[[ "$(value NODE_ENV)" == "production" ]] || fail 'NODE_ENV 必须为 production'
[[ "$(value WECHAT_LOGIN_MOCK_ENABLED)" == "false" ]] || fail '正式环境必须关闭登录 Mock'
[[ "$(value ENABLE_SWAGGER)" == "false" ]] || fail '正式环境应关闭 Swagger'
[[ "$(value OPERATOR_BOOTSTRAP_ENABLED)" == "false" ]] || fail '正式环境必须关闭运营账号自动初始化'
[[ "$(value RUN_MIGRATIONS_ON_STARTUP)" == "true" ]] || fail '云托管发布必须明确开启 RUN_MIGRATIONS_ON_STARTUP'

printf '\n[微信云托管验收] MySQL 与凭证\n'
for key in DATABASE_URL JWT_SECRET WECHAT_MINI_APP_ID WECHAT_MINI_APP_SECRET CORS_ORIGINS VITE_API_BASE_URL; do
  required_value "$key"
done
if [[ "$(value WEATHER_MOCK_ENABLED)" != "true" ]]; then
  required_value TENCENT_MAP_KEY
else
  pass '天气预报 Mock 已开启，跳过腾讯地图天气 Key 校验'
fi

database_url="$(value DATABASE_URL)"
[[ "$database_url" == mysql://* ]] || fail 'DATABASE_URL 必须使用 mysql://，不能再使用 PostgreSQL'

if [[ -n "$(value REDIS_URL)" ]]; then
  fail '项目已移除 Redis，生产配置不应再包含 REDIS_URL'
else
  pass '未配置 Redis'
fi

cors="$(value CORS_ORIGINS)"
if [[ -n "$cors" && "$cors" != *'*'* ]]; then
  IFS=',' read -r -a origins <<< "$cors"
  for origin in "${origins[@]}"; do
    [[ "$origin" == https://* ]] || fail "CORS 来源必须是 HTTPS：$origin"
  done
  pass 'CORS_ORIGINS 使用明确的 HTTPS 来源'
else
  fail 'CORS_ORIGINS 必须配置商家静态资源的 HTTPS 来源'
fi

api_base="$(value VITE_API_BASE_URL)"
[[ "$api_base" == https://* && "$api_base" != *example.com* ]] || fail 'VITE_API_BASE_URL 必须是实际的微信云托管 HTTPS API 地址'

jwt_secret="$(value JWT_SECRET)"
(( ${#jwt_secret} >= 32 )) || fail 'JWT_SECRET 必须至少 32 个字符'

release_stage="$(value APP_RELEASE_STAGE)"
[[ "$release_stage" == "testing" || "$release_stage" == "production" ]] || fail 'APP_RELEASE_STAGE 必须是 testing 或 production'

deploy_target="$(value DEPLOY_TARGET)"
if [[ -n "$deploy_target" && "$deploy_target" != "wxcloud" ]]; then
  fail 'DEPLOY_TARGET 只能是 wxcloud；不再支持 compose、Sealos 或其他服务器'
else
  pass '部署目标为微信云托管'
fi

payment_mode="$(value WECHAT_PAY_MODE)"
payment_mode="${payment_mode:-mock}"
case "$payment_mode" in
  mock)
    [[ "$release_stage" == "testing" ]] || fail '模拟支付仅允许 APP_RELEASE_STAGE=testing'
    [[ "$(value WECHAT_PAY_MOCK_ENABLED)" == "true" ]] || fail '模拟支付模式必须启用 WECHAT_PAY_MOCK_ENABLED'
    [[ "$(value WECHAT_PAY_AUTO_RECONCILIATION_ENABLED)" != "true" ]] || fail '模拟支付不能启用微信自动对账'
    pass '测试阶段使用模拟支付'
    ;;
  disabled)
    [[ "$(value WECHAT_PAY_MOCK_ENABLED)" == "false" ]] || fail '关闭在线支付时必须关闭支付 Mock'
    pass '在线支付已关闭'
    ;;
  wechat)
    [[ "$(value WECHAT_PAY_MOCK_ENABLED)" == "false" ]] || fail '微信支付模式必须关闭支付 Mock'
    for key in WECHAT_PAY_MCH_ID WECHAT_PAY_CERT_SERIAL WECHAT_PAY_API_V3_KEY; do
      required_value "$key"
    done
    private_key="$(value WECHAT_PAY_PRIVATE_KEY)"
    private_key_path="$(value WECHAT_PAY_PRIVATE_KEY_PATH)"
    if [[ -n "$private_key" || -n "$private_key_path" ]]; then
      pass '已配置微信支付商户私钥'
    else
      fail '必须配置 WECHAT_PAY_PRIVATE_KEY 或 WECHAT_PAY_PRIVATE_KEY_PATH'
    fi
    if [[ -n "$private_key" && ! "$private_key" =~ -----BEGIN[[:space:]]([A-Z]+[[:space:]])?PRIVATE[[:space:]]KEY----- && ( ! "$private_key" =~ ^[A-Za-z0-9+/]+={0,2}$ || ${#private_key} -lt 1000 ) ]]; then
      fail 'WECHAT_PAY_PRIVATE_KEY 必须是 PEM 或完整 Base64-DER 格式私钥'
    fi
    platform_serial="$(value WECHAT_PAY_PLATFORM_CERT_SERIAL)"
    platform_cert="$(value WECHAT_PAY_PLATFORM_CERT)"
    platform_cert_path="$(value WECHAT_PAY_PLATFORM_CERT_PATH)"
    public_key_id="$(value WECHAT_PAY_PUBLIC_KEY_ID)"
    public_key="$(value WECHAT_PAY_PUBLIC_KEY)"
    public_key_path="$(value WECHAT_PAY_PUBLIC_KEY_PATH)"
    if [[ -n "$platform_serial" && ( -n "$platform_cert" || -n "$platform_cert_path" ) ]]; then
      pass '已配置微信支付平台证书验签'
    elif [[ -n "$public_key_id" && ( -n "$public_key" || -n "$public_key_path" ) ]]; then
      pass '已配置微信支付公钥验签'
    else
      fail '必须配置平台证书（序列号+证书）或微信支付公钥（公钥 ID+公钥）'
    fi
    if [[ -n "$platform_cert" && ! "$platform_cert" =~ -----BEGIN[[:space:]]CERTIFICATE----- && ( ! "$platform_cert" =~ ^[A-Za-z0-9+/]+={0,2}$ || ${#platform_cert} -lt 500 ) ]]; then
      fail 'WECHAT_PAY_PLATFORM_CERT 必须是 PEM 或完整 Base64-DER 格式证书'
    fi
    if [[ -n "$public_key" && ! "$public_key" =~ -----BEGIN[[:space:]]([A-Z]+[[:space:]])?PUBLIC[[:space:]]KEY----- && ( ! "$public_key" =~ ^[A-Za-z0-9+/]+={0,2}$ || ${#public_key} -lt 300 ) ]]; then
      fail 'WECHAT_PAY_PUBLIC_KEY 必须是 PEM 或完整 Base64-DER 格式公钥'
    fi
    ;;
  *)
    fail 'WECHAT_PAY_MODE 必须是 mock、disabled 或 wechat'
    ;;
esac

if (( failures > 0 )); then
  printf '\n微信云托管生产配置验收未通过，共 %s 项需要处理。\n' "$failures" >&2
  exit 1
fi

printf '\n微信云托管生产配置验收全部通过。\n'
