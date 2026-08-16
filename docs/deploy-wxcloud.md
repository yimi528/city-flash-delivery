# 微信云托管部署说明

本项目的正式部署目标是微信云托管，不再依赖 osako、Quick Tunnel、Sealos 或其他服务器。

## 正式发布参数

当前已确定的客户正式发布目标如下：

```text
微信小程序 AppID：wxee631108a5a95efc
微信云托管环境 ID：ding-delivery-prod-d8c1eea132b4c
API 服务名：city-flash-api
商家端服务名：city-flash-merchant
```

当前仓库的 `project.config.json` 仍保留测试 AppID `wx4878475053d6a722`，用于本地开发和测试；正式上传时必须显式使用客户正式 AppID。

官方资料必须优先于本文件：

- [微信云托管文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/)
- [微信云托管 CLI](https://cloud.weixin.qq.com/cli/)
- [调用云托管服务](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/call/)
- [MySQL 数据库](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/guide/mysql/)
- [静态资源托管](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/guide/resource/)

## 1. 资源关系

微信云托管环境中需要创建以下资源：

```text
微信云托管环境
├── MySQL 8.0（持久化业务数据）
├── city-flash-api（NestJS API，容器端口 3000）
└── city-flash-merchant（商家后台，Nginx 容器端口 80）
```

MySQL 是微信云托管里的云资源，不是另外租一台服务器，也不是外部数据库。它需要在云托管控制台中开通/创建，费用以控制台当前套餐、免费额度和实际用量为准。项目不再使用 Redis；当前限流使用 API 单实例内存实现。

请选择 MySQL 8.0。API 使用 MySQL GIS 保存服务区域边界，普通地址和订单仍保存 `latitude`、`longitude` 两个字段。云托管不提供容器本地磁盘持久化，因此业务数据不能写入容器目录。

## 2. CLI 安装和登录

涉及 `wxcloud` 的命令前，先查阅上面的官方 CLI 文档，并以本机 `wxcloud <command> --help` 为准。

```bash
npm install -g @wxcloud/cli
wxcloud --help
```

在微信云托管控制台的“设置 → CLI 密钥”生成密钥。私钥只保存到本机安全位置，不提交 Git，也不要粘贴到聊天或文档中。登录示例：

```bash
WX_CLOUD_PRIVATE_KEY="$(< /绝对路径/cloud-cli-private-key.pem)"
wxcloud login \
  --appId "$WX_CLOUD_APP_ID" \
  --privateKey "$WX_CLOUD_PRIVATE_KEY"
wxcloud env:list --region ap-shanghai --json
```

当前 CLI 的 `--privateKey` 接收私钥内容，不是文件路径；上面的 shell 变量只存在于当前终端，不要写入仓库或 shell 脚本。

当前环境 `prod-d0gpn0x7a421ec215` 作为体验测试环境使用；客户正式环境为 `ding-delivery-prod-d8c1eea132b4c`。正式环境仍需完成 MySQL 8.0、服务、环境变量和生产数据初始化，避免测试数据和真实业务数据混用。

## 3. 创建 API 服务

商家后台是浏览器页面，API 作为一个独立的云托管容器服务。API 服务需要开通外网访问，供商家后台浏览器通过 HTTPS 调用。小程序则使用 `wx.cloud.callContainer`，不依赖 API 公网 IP。

```bash
wxcloud service:create \
  --envId "$WX_CLOUD_ENV_ID" \
  --serviceName city-flash-api \
  --isPublic \
  --region ap-shanghai
```

服务只监听一个端口 `3000`。从 `server/api` 目录发布代码包：

```bash
cd server/api
wxcloud run:deploy \
  --targetDir . \
  --dockerfile Dockerfile \
  --containerPort 3000 \
  --envId "$WX_CLOUD_ENV_ID" \
  --serviceName city-flash-api \
  --releaseType FULL \
  --remark "mysql migration and cloud hosting"
```

本项目 Dockerfile 在 `RUN_MIGRATIONS_ON_STARTUP=true` 时执行幂等的 `prisma migrate deploy`，随后启动 API；不会执行 `migrate reset`。数据库连接串、JWT、微信 Secret、地图 Key、支付证书等通过云托管服务环境变量/密钥配置，不写进镜像和 Git。

生产环境至少需要关闭：

```text
NODE_ENV=production
WECHAT_LOGIN_MOCK_ENABLED=false
OPERATOR_BOOTSTRAP_ENABLED=false
ENABLE_SWAGGER=false
RUN_MIGRATIONS_ON_STARTUP=true
```

测试环境可以暂时保留 Mock 登录/支付，但不能把测试密钥当正式密钥使用。

## 4. 发布商家后台

商家后台和 API 分成两个服务是常见的部署方式：后台页面负责展示和交互，API 负责业务逻辑和数据库访问。当前实际部署使用第二个云托管容器服务，避免依赖未开通的静态资源存储。

先从 API 服务详情中取得 HTTPS 公网访问地址，例如 `https://<api-service-domain>`，再构建商家后台：

```bash
cd apps/merchant-web
VITE_API_BASE_URL="https://<api-service-domain>/api" npm run build
```

把 `Dockerfile.cloud`、`nginx.conf` 和构建后的 `dist` 放在同一个临时目录，然后发布到商家服务：

```bash
mkdir -p /tmp/city-flash-merchant-cloud
cp apps/merchant-web/Dockerfile.cloud /tmp/city-flash-merchant-cloud/Dockerfile
cp apps/merchant-web/nginx.conf /tmp/city-flash-merchant-cloud/nginx.conf
cp -R apps/merchant-web/dist /tmp/city-flash-merchant-cloud/dist

wxcloud run:deploy /tmp/city-flash-merchant-cloud \
  --targetDir . \
  --dockerfile Dockerfile \
  --containerPort 80 \
  --envId "$WX_CLOUD_ENV_ID" \
  --serviceName city-flash-merchant \
  --releaseType FULL \
  --region ap-shanghai
```

商家服务的默认公网地址形如 `https://<merchant-service-domain>.sh.run.tcloudbase.com`。把这个地址加入 API 的 `CORS_ORIGINS`，保留 API 自身地址，然后重新发布 API。当前环境已配置为：

```text
https://city-flash-api-296677-11-1468253816.sh.run.tcloudbase.com
https://city-flash-merchant-296677-11-1468253816.sh.run.tcloudbase.com
```

如果以后开通静态资源存储，也可以按[官方静态资源文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/guide/resource/)把 `dist` 上传到静态资源；但那是可选替代方案，不是当前持续交付链路。

## 5. 小程序调用

`apps/customer-mp/config/runtime.js` 中按小程序版本配置微信云托管环境 ID 和服务名：

```js
const WX_CLOUD_TEST_ENV_ID = 'prod-d0gpn0x7a421ec215'
const WX_CLOUD_PROD_ENV_ID = 'ding-delivery-prod-d8c1eea132b4c'
const WX_CLOUD_SERVICE_NAME = 'city-flash-api'
```

开发版不初始化云托管，访问本机 API；体验版初始化 `WX_CLOUD_TEST_ENV_ID`；正式版只有在填写独立的 `WX_CLOUD_PROD_ENV_ID` 后才初始化云托管。用户端和骑手端请求统一通过 `wx.cloud.callContainer` 访问 `/api/...`。小程序基础库最低版本要满足官方文档要求（当前项目配置为 3.16.2）。修改后用微信开发者工具真机预览，再按现有 `miniprogram-ci` 流程上传体验版。

商家后台走 API 的 HTTPS 公网地址，因此 API 服务必须配置 CORS；小程序的 `callContainer` 不需要把容器内网地址写入代码。

## 6. 验收顺序

```bash
curl --fail "https://<api-service-domain>/api/health"
curl --fail "https://<merchant-service-domain>/"
curl --fail "https://<merchant-service-domain>/healthz"
```

随后依次验证：商家首页、运营员登录、订单列表、配置中心、地图代理、用户小程序登录、骑手登录和一个测试订单闭环。确认云端 MySQL 表已创建并且 API 日志没有 Prisma/连接错误后，才可以停止 osako 上的旧 Compose 环境。

## 7. 持续交付

微信云托管官方 CLI 支持在自定义 CI/CD 中发布版本。持续交付需要把 `WX_CLOUD_ENV_ID`、AppID 和 CLI 私钥配置在 CI Secret 中；私钥不能进入仓库。每次合并到发布分支时，CI 应先跑本地测试和构建，再执行：

`.github/workflows/wxcloud-deploy.yml` 使用以下 GitHub Actions Secret：

```text
WX_CLOUD_ENV_ID
WX_CLOUD_APP_ID
WX_CLOUD_PRIVATE_KEY
WX_CLOUD_API_SERVICE_NAME
WX_CLOUD_MERCHANT_SERVICE_NAME
WX_CLOUD_API_PUBLIC_DOMAIN
```

`WX_CLOUD_MERCHANT_MAP_KEY` 可以作为可选的商家地图前端 Key；`WX_CLOUD_API_ENV_PARAMS` 只有在需要同步更新 API 环境变量时才设置，不能把私钥或密码提交到仓库。

另外设置一个仓库变量 `WX_CLOUD_DEPLOY_ENABLED`：

- 不设置或设置为 `false`：每次推送仍执行完整质量检查，但跳过云端发布；
- 设置为 `true`：在上述 Secret 都已配置后，每次推送到 `main` 才发布 API 和商家后台。

当前仓库的最近一次 Actions 已验证质量检查通过；因为尚未配置云托管 Secret，发布开关应保持关闭，避免产生误报。

```bash
cd server/api
wxcloud run:deploy --targetDir . --dockerfile Dockerfile --containerPort 3000 \
  --envId "$WX_CLOUD_ENV_ID" --serviceName city-flash-api --releaseType FULL
cd ../../apps/merchant-web
npm run build
merchant_package_dir="$(mktemp -d)"
cp Dockerfile.cloud "$merchant_package_dir/Dockerfile"
cp nginx.conf "$merchant_package_dir/nginx.conf"
cp -R dist "$merchant_package_dir/dist"
wxcloud run:deploy "$merchant_package_dir" --targetDir . --dockerfile Dockerfile --containerPort 80 \
  --envId "$WX_CLOUD_ENV_ID" --serviceName "$WX_CLOUD_MERCHANT_SERVICE_NAME" \
  --releaseType FULL --region ap-shanghai
```

实际 CI 参数以官方文档和当前 CLI 帮助为准。首次接入新环境时，先完成一次手动部署和验收，再将 `WX_CLOUD_DEPLOY_ENABLED` 设为 `true`。

## 8. 云端接管后的旧环境清理

只有在 API、商家后台、MySQL 就绪检查、CORS 和小程序链路验收通过后，才停止 osako 上的旧 Compose 环境。清理运行时但保留数据库卷：

```bash
ssh osako-macbookair
cd /Users/osako/Projects/city-flash-delivery
export PATH=/usr/local/bin:$PATH
docker compose --profile tunnel --profile quick-tunnel down --remove-orphans
docker compose down --remove-orphans
```

确认 `city-flash-api`、`city-flash-merchant-web`、`postgres`、`redis` 和两个 `cloudflared` 容器都已停止后，再决定是否处理旧镜像。不要执行 `docker compose down -v`：旧 PostgreSQL/Redis 卷可能包含配置或历史数据，删除前必须另行完成备份和数据迁移确认。
