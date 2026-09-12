# 微信云托管部署说明

本文只记录当前生产发布方式。正式入口是微信云托管；仓库不再使用 SSH 服务器、旧 Compose、Quick Tunnel、Sealos 或 Redis 作为生产依赖。

官方资料和 CLI：

- [微信云托管文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/)
- [微信云托管 CLI](https://cloud.weixin.qq.com/cli/)
- 小程序调用云托管：[官方文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/call/mini.html)

所有 `wxcloud` 参数必须以官方文档和本机 `wxcloud --help` 为准。当前本机 CLI 版本为 `@wxcloud/cli@1.1.8`。

## 当前发布基线

| 项目 | 当前值 |
| --- | --- |
| 小程序 AppID | `wxee631108a5a95efc` |
| 云托管环境 | `ding-delivery-prod-d8c1eea132b4c` |
| API 服务 | `city-flash-api`，端口 `3000` |
| 商家端服务 | `city-flash-merchant`，端口 `80` |
| API 公网域名 | `https://city-flash-api-298025-11-1469830209.sh.run.tcloudbase.com` |
| 商家端公网域名 | `https://city-flash-merchant-298025-11-1469830209.sh.run.tcloudbase.com` |
| 当前 Git 发布 tag | `v1.0.10` |
| 当前 Git 提交 | `3c392ec` |
| 当前小程序上传版本 | `1.0.10` |

域名和服务状态以实时查询为准：

```bash
wxcloud env:list --region ap-shanghai --json
wxcloud service:list \
  --envId ding-delivery-prod-d8c1eea132b4c \
  --region ap-shanghai \
  --json
```

## 小程序运行环境

小程序版本通道和后端运行环境是两个独立维度：

| 小程序通道 | API 环境 |
| --- | --- |
| 微信开发者工具内的 `develop` | 本机 API |
| 真机、预览、审核容器中的 `develop` | `prod` |
| `trial` | `prod` |
| `release` | `prod` |

开发者工具可通过 `developerApiBaseUrl` 做本地或测试联调覆盖。真机、预览和审核容器不得使用 `127.0.0.1`；如果运行时提供 `wx.cloud.callContainer`，客户端优先通过云托管调用 `/api/...`，避免微信合法域名限制。

体验版和正式版都访问生产 API，会产生生产数据；“体验版”不等于名为 `test` 的云环境。

## 生产安全边界

生产环境必须满足：

- `NODE_ENV=production`；
- `WECHAT_LOGIN_MOCK_ENABLED=false`；
- `WECHAT_PAY_MOCK_ENABLED=false`，并使用正式支付凭证；
- `ENABLE_SWAGGER=false`；
- `OPERATOR_BOOTSTRAP_ENABLED=false`；
- `RUN_MIGRATIONS_ON_STARTUP=true`；
- `DATABASE_URL` 使用微信云托管 MySQL 8.0；
- `CORS_ORIGINS` 只包含同一环境的 HTTPS 商家域名；
- 不配置 `REDIS_URL`；
- CLI 私钥、AppSecret、支付证书、数据库密码和小程序上传私钥不进入 Git。

数据库迁移只能执行：

```bash
npm run prisma:deploy
```

禁止 `prisma migrate reset`、删库、破坏性初始化或把 PostgreSQL 历史迁移复制回活动迁移目录。

## 发布 API

`wxcloud run:deploy` 会上传目标目录内容；`.dockerignore` 不是 CLI 上传过滤器。因此必须创建精简临时上下文，只放 Docker 构建所需文件：

```bash
release_root="$(mktemp -d -t city-flash-api-release.XXXXXX)"
api_context="$release_root/api"
mkdir -p "$api_context/scripts"

cp server/api/package.json \
  server/api/package-lock.json \
  server/api/Dockerfile \
  server/api/.dockerignore \
  server/api/nest-cli.json \
  server/api/tsconfig.json \
  server/api/tsconfig.build.json \
  "$api_context/"
cp -R server/api/src server/api/prisma "$api_context/"
cp server/api/scripts/create-operator.mjs "$api_context/scripts/"

wxcloud run:deploy "$api_context" \
  --targetDir . \
  --dockerfile Dockerfile \
  --containerPort 3000 \
  --envId ding-delivery-prod-d8c1eea132b4c \
  --serviceName city-flash-api \
  --region ap-shanghai \
  --releaseType FULL \
  --override \
  --remark "Release vX.Y.Z <git-sha> API" \
  --noConfirm
```

如果需要同步完整服务环境变量，使用 `--envParams` 时必须传入完整、审计过的集合，不能只传一个键覆盖掉其他生产变量。当前 CLI 1.1.8 在部分已存在服务上同步环境参数可能返回 `UnknownParameter: Conf.OperationMode`；此时不要反复重试参数同步，使用 `--override` 沿用已核验的服务配置，并在控制台确认 `RUN_MIGRATIONS_ON_STARTUP=true`。

## 发布商家后台

商家端必须在构建时注入同环境 API HTTPS 地址：

```bash
VITE_API_BASE_URL="https://<current-api-domain>/api" \
VITE_TENCENT_MAP_JS_KEY="" \
npm --prefix apps/merchant-web ci

VITE_API_BASE_URL="https://<current-api-domain>/api" \
VITE_TENCENT_MAP_JS_KEY="" \
npm --prefix apps/merchant-web run build
```

将 `Dockerfile.cloud`、`nginx.conf` 和 `dist` 放进临时上下文，再发布：

```bash
merchant_context="$(mktemp -d -t city-flash-merchant-release.XXXXXX)"
cp apps/merchant-web/Dockerfile.cloud "$merchant_context/Dockerfile"
cp apps/merchant-web/nginx.conf "$merchant_context/nginx.conf"
cp -R apps/merchant-web/dist "$merchant_context/dist"

wxcloud run:deploy "$merchant_context" \
  --targetDir . \
  --dockerfile Dockerfile \
  --containerPort 80 \
  --envId ding-delivery-prod-d8c1eea132b4c \
  --serviceName city-flash-merchant \
  --region ap-shanghai \
  --releaseType FULL \
  --override \
  --remark "Release vX.Y.Z <git-sha> merchant" \
  --noConfirm
```

## 发布后验收

```bash
curl -fsS https://<current-api-domain>/api/health/ready
curl -fsS -o /dev/null -w '%{http_code}\n' https://<current-merchant-domain>/healthz
curl -fsS -o /dev/null -w '%{http_code}\n' https://<current-merchant-domain>/
```

必须同时满足：

- API readiness 返回 HTTP 200 且 `database` 为 `true`；
- 商家 `/healthz` 和首页返回 HTTP 200；
- 两个服务状态正常、流量 100%、至少一个副本；
- 商家构建产物包含当前 API HTTPS 地址；
- API 的 `CORS_ORIGINS` 包含当前商家域名；
- 小程序使用同一云托管环境 ID。

CLI 出现 `ResourceNotFound.TopicNotExist` 或重复历史日志时，以服务版本状态和独立 HTTP 健康检查为准，不要只根据日志观察器重发。

## 小程序上传

小程序上传不是 `wxcloud run:deploy` 的一部分。使用当前 AppID 对应的代码上传私钥：

```bash
WECHAT_PRIVATE_KEY_PATH=/secure/path/private.wxee631108a5a95efc.key \
WECHAT_VERSION=<next-version> \
npm run miniprogram:upload
```

上传成功后必须在微信公众平台手动将版本设为体验版，再进行真机登录和业务验收；上传不会自动切换体验版，也不会自动提交审核。
