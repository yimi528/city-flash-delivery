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

当前仓库的 `project.config.json` 已切换为客户正式 AppID；体验版和正式版均通过 `runtime.js` 使用客户生产云环境。

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

当前账号下已创建独立的体验测试环境 `ding-delivery-test-d8clg2024ea54`；客户正式环境为 `ding-delivery-prod-d8c1eea132b4c`。正式环境已完成 MySQL 8.0、服务、环境变量、数据库迁移和基础业务数据初始化，避免测试数据和真实业务数据混用。

### 重要概念边界：小程序版本不是 API 环境

小程序版本通道和后端运行环境是两套独立概念，不能把它们当成同义词：

| 概念 | 取值 | 由什么决定 |
| --- | --- | --- |
| 小程序版本通道 | `develop` / `trial` / `release` | `wx.getAccountInfoSync().miniProgram.envVersion` |
| API 运行环境 | 本机 / `test` / `prod` | `runtime.js` 的地址和 `wx.cloud.callContainer({ config: { env } })` |

当前项目的有意映射是：`develop → 本机`（开发联调时可显式切到 `test`），`trial → prod`，`release → prod`。因此，“体验版”不是“测试环境”的另一种叫法；体验版当前会访问生产 API，产生真实生产订单和支付。反过来，创建或切换云托管环境也不会自动改变小程序版本，必须同时检查小程序运行时映射。

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

真实微信支付使用 API v3：商户私钥负责请求签名，微信支付公钥或平台证书负责验签，API v3 密钥负责解密回调。验签二选一：

```text
# 推荐：微信支付公钥模式
WECHAT_PAY_PUBLIC_KEY_ID=微信支付公钥 ID
WECHAT_PAY_PUBLIC_KEY_PATH=/run/secrets/wechatpay_public_key.pem

# 或：平台证书模式
WECHAT_PAY_PLATFORM_CERT_SERIAL=平台证书序列号
WECHAT_PAY_PLATFORM_CERT_PATH=/run/secrets/wechatpay_platform.pem
```

`WECHAT_PAY_PRIVATE_KEY_PATH` 必须指向商户 API 私钥，不能使用微信云托管 CLI 私钥。内联 `WECHAT_PAY_PRIVATE_KEY` 可以是 PEM，或完整的 Base64-DER 私钥；如果环境文件把 Base64 分成多行，发布脚本会把连续行拼接后校验。`pub_key.pem` 只有在确认它是该商户的微信支付公钥并补齐对应 `WECHAT_PAY_PUBLIC_KEY_ID` 后才能用于支付验签。微信支付的下单、回调验签和 API v3 密钥解密规则以[官方 API v3 签名说明](https://pay.wechatpay.cn/doc/v3/merchant/4012365342)为准。

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
https://city-flash-api-298025-11-1469830209.sh.run.tcloudbase.com
https://city-flash-merchant-298025-11-1469830209.sh.run.tcloudbase.com
```

### 环境与域名的对应关系

是的，不同云托管环境下的后端服务通常使用不同的公网域名。域名由“云托管环境 + 服务名”共同决定；即使 API 服务名都叫 `city-flash-api`，`test` 和 `prod` 也不能共用同一套运行时地址。商家后台同理：每个环境的 `city-flash-merchant` 都应有自己的公网地址，并且商家后台构建时的 `VITE_API_BASE_URL` 必须指向同一环境的 API。

当前已确认的生产域名是：

| 运行环境 | API | 商家后台 |
| --- | --- | --- |
| 本机 | `http://127.0.0.1:3000` | 本机开发服务器 |
| `test` | 以云托管服务详情返回的地址为准 | 只有部署了测试商家服务后才有对应域名 |
| `prod` | `https://city-flash-api-298025-11-1469830209.sh.run.tcloudbase.com` | `https://city-flash-merchant-298025-11-1469830209.sh.run.tcloudbase.com` |

不能把生产商家域名配置到测试 API，也不能把测试 API 域名编译进生产商家包。每次切换环境都要同步检查：商家端 `VITE_API_BASE_URL`、API 的 `CORS_ORIGINS`、小程序的云环境 ID/服务名，以及数据库和支付模式。

如果以后开通静态资源存储，也可以按[官方静态资源文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/guide/resource/)把 `dist` 上传到静态资源；但那是可选替代方案，不是当前持续交付链路。

## 5. 小程序调用

`apps/customer-mp/config/runtime.js` 中按小程序版本配置微信云托管环境 ID 和服务名：

```js
const WX_CLOUD_TEST_ENV_ID = 'ding-delivery-test-d8clg2024ea54'
const WX_CLOUD_PROD_ENV_ID = 'ding-delivery-prod-d8c1eea132b4c'
const WX_CLOUD_SERVICE_NAME = 'city-flash-api'
```

开发版默认不初始化云托管、访问本机 API；如需云端联调，应显式切换到 `WX_CLOUD_TEST_ENV_ID`；体验版和正式版均初始化 `WX_CLOUD_PROD_ENV_ID`。用户端和骑手端请求统一通过 `wx.cloud.callContainer` 访问 `/api/...`。体验版产生的订单、支付和业务数据均属于生产数据。小程序基础库最低版本要满足官方文档要求（当前项目配置为 3.16.2）。修改后用微信开发者工具真机预览，再按现有 `miniprogram-ci` 流程上传正式 AppID 的代码版本。

通过 `wx.cloud.callContainer` 访问时，微信云托管会把当前微信用户身份注入 `x-wx-openid`/`x-wx-unionid` 请求头；API 优先使用这组身份完成小程序登录，不再依赖容器主动访问 `api.weixin.qq.com`。本地开发版直连 API 时没有这些请求头，才回退到 `wx.login` + `jscode2session`，因此本地仍需配置正确的 AppSecret。具体以[官方小程序调用云托管文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/call/mini.html)为准。

商家后台走 API 的 HTTPS 公网地址，因此 API 服务必须配置 CORS；小程序的 `callContainer` 不需要把容器内网地址写入代码。

## 5.1 微信登录故障复盘：`DEPTH_ZERO_SELF_SIGNED_CERT`

2026-08-23 体验版真机登录曾持续提示“微信登录服务暂时不可用”。这次问题经过多轮排查和修复后解决，结论分为“直接故障”和“架构问题”两层。

### 现象和证据

API 健康检查、路由注册、数据库连接和配置接口均正常，但登录请求返回 502。API 日志最终记录为：

```text
WeChat login upstream request failed
causeCode: DEPTH_ZERO_SELF_SIGNED_CERT
causeMessage: self-signed certificate
```

这表示容器访问 `https://api.weixin.qq.com/sns/jscode2session` 时，在 TLS 握手阶段收到了 Node.js 不信任的自签名证书，请求尚未进入微信的 AppID/AppSecret 业务校验。因此，真实 AppSecret 正确、数据库正常，也不能消除这个错误。

### 排查过程中排除的原因

- 检查了 API 服务启动日志、路由和数据库连接，服务本身正常。
- 检查了 AppID、AppSecret、云托管环境和服务配置，没有发现身份不匹配。
- 确认云托管“公网出口”已经开启。
- 在 API 镜像中补充 `ca-certificates` 后重新发布，错误仍然存在；因此不是单纯缺少系统 CA 包。
- 回滚到此前曾经工作的旧版本后，旧版本仍出现同样的 TLS 错误；因此不是当天新增业务代码直接破坏了登录。

### 根因

云托管容器访问微信接口的出网链路或中间代理证书链发生异常，导致 Node.js 拒绝自签名证书。这也解释了为什么之前可以登录、后来突然失败：外部出网链路可能变化，而源代码和 AppSecret 不一定发生变化。

同时，原实现存在一个架构上的放大因素：小程序已经通过 `wx.cloud.callContainer` 调用 API，微信云托管会注入 `x-wx-openid`/`x-wx-unionid`，但 API 仍然强制调用 `jscode2session`。这让本来可以在云托管内部完成的登录，额外依赖了一次外网 HTTPS 请求；一旦出网证书异常，整个登录链路就会失败。

### 最终修复

API 现在按调用来源处理身份：

- 通过微信云托管 `callContainer` 调用：优先使用云托管注入的 `x-wx-openid`/`x-wx-unionid`，不再请求微信 `jscode2session`。
- 本机开发版直接访问 API：因为没有云托管身份请求头，继续使用 `wx.login` + `jscode2session` 作为本地开发 fallback。

修复后已完成构建、测试和云端部署，并通过体验版真机登录验证。不能通过关闭 TLS 校验（例如设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`）规避证书问题，因为这会降低生产环境安全性。

后续遇到登录失败时，应先按以下顺序判断：

1. 是否通过 `wx.cloud.callContainer` 调用，以及请求是否带有云托管身份头；
2. API 是否优先使用 `x-wx-openid`，而不是无条件调用 `jscode2session`；
3. 只有本地直连 fallback 失败时，才检查 AppID、AppSecret、微信接口连通性和 TLS 证书链。

参考：[微信小程序调用云托管官方文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/call/mini.html)。

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
