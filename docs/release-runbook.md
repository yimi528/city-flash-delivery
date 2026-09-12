# 当前发布 Runbook

本文是当前仓库的发布入口。一次完整发布包含 GitHub 代码、微信云托管 API、微信云托管商家端和微信公众平台小程序代码。生产目标统一为微信云托管；不使用旧服务器、SSH、Quick Tunnel、Redis 或 PostgreSQL 运行生产。

## 当前版本状态

| 项目 | 当前值 |
| --- | --- |
| 运行时代码发布提交 | `3c392ec` |
| Git tag | `v1.0.10` |
| 小程序上传版本 | `1.0.10` |
| 云托管环境 | `ding-delivery-prod-d8c1eea132b4c` |
| API 服务 | `city-flash-api:3000` |
| 商家服务 | `city-flash-merchant:80` |

域名必须每次通过 `wxcloud service:list --json` 查询，不要从历史文档或服务名自行拼接。

## 1. 发布前检查

```bash
git status --short --branch
git diff --check
git fetch origin main --tags
git rev-list --left-right --count HEAD...origin/main
wxcloud --version
wxcloud login --help
wxcloud env:list --help
wxcloud service:list --help
wxcloud run:deploy --help
```

工作区必须干净，当前提交必须已经推送到 `origin/main`。代码、云托管 CLI 私钥、微信上传私钥、AppSecret、支付证书和数据库密码分开管理，凭证只放在仓库外安全目录或 GitHub/云平台 Secret 中。

质量门禁：

```bash
npm ci
npm --prefix server/api ci
npm --prefix apps/merchant-web ci
npm run check:quality
npm run test:security
```

## 2. 发布版本

版本使用 annotated tag，当前小程序版本为 `1.0.10`。下一次发布必须使用微信后台允许的更高版本：

```bash
npm run release -- --dry-run
npm run release -- <next-version>
git push origin main
git push origin v<next-version>
```

`npm run release:local -- v<next-version>` 是本机发布编排入口，会根据 tag 差异决定是否发布 API、商家端和小程序；它要求生产配置位于仓库外安全目录。生产配置校验命令为：

```bash
npm run release:check -- /secure/path/production.env
```

## 3. 微信云托管环境核验

```bash
wxcloud env:list --region ap-shanghai --json
wxcloud service:list \
  --envId ding-delivery-prod-d8c1eea132b4c \
  --region ap-shanghai \
  --json
```

必须确认：

- `city-flash-api` 状态正常、端口 3000、开启公网访问；
- `city-flash-merchant` 状态正常、端口 80、开启公网访问；
- 两个服务来自同一个 `prod` 环境；
- API 使用 MySQL 8.0，服务区域边界使用 MySQL GIS；
- 生产 Mock 关闭、运营员自动初始化关闭、迁移开关开启；
- API `CORS_ORIGINS` 包含当前商家域名。

## 4. 发布 API

CLI 上传包不得包含 `node_modules`、`dist`、`coverage`、`.env`、PEM、KEY 或其他密钥。使用只包含 `package.json`、lockfile、Dockerfile、Docker ignore、Nest/TypeScript 配置、`src`、`prisma` 和必要 `scripts` 的临时目录：

```bash
release_root="$(mktemp -d -t city-flash-api-release.XXXXXX)"
api_context="$release_root/api"
mkdir -p "$api_context/scripts"
cp server/api/package.json server/api/package-lock.json server/api/Dockerfile \
  server/api/.dockerignore server/api/nest-cli.json server/api/tsconfig.json \
  server/api/tsconfig.build.json "$api_context/"
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
  --remark "Release v<version> <git-sha> API" \
  --noConfirm
```

服务环境变量由云托管现有生产配置提供，必须在控制台确认 `RUN_MIGRATIONS_ON_STARTUP=true`。当前 CLI 1.1.8 对部分已有服务同步环境参数可能返回 `UnknownParameter: Conf.OperationMode`；遇到该错误时不要重复覆盖服务参数，保留已核验配置并用独立 readiness 验收代码版本。

## 5. 发布商家端

先使用当前 API 公网域名构建：

```bash
VITE_API_BASE_URL="https://<current-api-domain>/api" \
VITE_TENCENT_MAP_JS_KEY="" \
npm --prefix apps/merchant-web ci
VITE_API_BASE_URL="https://<current-api-domain>/api" \
VITE_TENCENT_MAP_JS_KEY="" \
npm --prefix apps/merchant-web run build
```

将 `Dockerfile.cloud`、`nginx.conf`、`dist` 放入临时目录，发布到 `city-flash-merchant:80`。构建结果必须包含当前 API HTTPS 地址，不能把 `test` 域名编译进 `prod` 商家端。

## 6. 上传小程序

小程序使用当前 AppID 的代码上传密钥，不使用云托管 CLI 私钥：

```bash
WECHAT_PRIVATE_KEY_PATH=/secure/path/private.wxee631108a5a95efc.key \
WECHAT_VERSION=<next-version> \
npm run miniprogram:upload
```

上传脚本会校验根目录与 `apps/customer-mp/project.config.json` 的 AppID。当前运行时规则是：开发者工具 `develop` 可用本机 API；真机、预览、审核容器以及 `trial`、`release` 使用 `wx.cloud.callContainer` 和 `prod` 环境。上传成功后必须在微信公众平台手动设为体验版并重新进行登录验证。

## 7. 发布后验收

```bash
curl -fsS https://<current-api-domain>/api/health/ready
curl -fsS -o /dev/null -w '%{http_code}\n' https://<current-merchant-domain>/healthz
curl -fsS -o /dev/null -w '%{http_code}\n' https://<current-merchant-domain>/
```

API readiness 必须返回 200 且 `database:true`；商家 `/healthz` 与首页必须返回 200。小程序体验版必须人工验证：个人中心登录、配置/地址读取、一个允许的服务下单流程；「寄货配送」及顺风车模式当前保持关闭。

CLI 若输出 `ResourceNotFound.TopicNotExist` 或重复历史日志，以云托管版本状态、流量、副本和独立 HTTP 健康检查为准。只有代码、服务版本、健康检查和小程序上传版本均对应本次 Git tag，才算发布完成。
