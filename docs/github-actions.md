# GitHub Actions

仓库使用三条职责明确的工作流：

| 工作流 | 触发方式 | 作用 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Pull Request、`main` 推送、手动触发 | 小程序/API/商家后台测试，Prisma 校验，依赖审计和 Docker 镜像构建验证 |
| `.github/workflows/wxcloud-deploy.yml` | 手动触发 | 通过 GitHub Environment 审批后，使用 `@wxcloud/cli` 发布 API 和商家后台 |
| `.github/workflows/miniprogram-release.yml` | 手动触发 | 使用 `miniprogram-ci` 上传小程序代码 |

生产发布的唯一目标是微信云托管。仓库不再通过 SSH、传统生产主机或旧 Compose 链路发布生产服务。

下一次手动发布按 [微信云托管发布 Runbook](release-runbook.md) 执行；本文件只说明 GitHub Actions 的触发条件和 Secret 边界。

## 生产发布保护

建议创建名为 `production` 的 GitHub Environment，并要求发布审批。云托管工作流还要求仓库变量 `WX_CLOUD_DEPLOY_ENABLED=true`，并通过 GitHub Secrets 注入云托管 CLI 和服务配置。

API 和商家后台必须使用同一个云托管环境：

- API 服务监听容器端口 `3000`；
- 商家后台服务监听容器端口 `80`；
- 商家后台构建时的 `VITE_API_BASE_URL` 必须指向同一环境的 API HTTPS 地址；
- API 的 `CORS_ORIGINS` 必须包含同一环境的商家后台来源；
- 数据库使用微信云托管 MySQL 8.0，生产配置不能包含 `REDIS_URL`。

工作流只从 GitHub Secrets/Variables 读取凭证，不读取或上传仓库中的本地密钥文件。CLI 私钥、微信 AppSecret、支付证书和数据库密码不得提交到 Git。

## 质量门禁

`ci.yml` 使用 MySQL 8.0 服务运行以下检查：

1. 小程序 Node.js 测试；
2. API Jest、ESLint、TypeScript 构建；
3. Prisma migration 和 schema 校验；
4. 商家后台构建；
5. 生产依赖审计；
6. API runtime、migration 和商家后台 Docker 镜像构建。

云托管发布工作流先调用同一套可复用质量检查，检查通过后才进入部署 job。

## 下一次 CI 发布

按 GitHub Actions 发布时，先确认：

1. 目标分支是 `main`；
2. 仓库变量 `WX_CLOUD_DEPLOY_ENABLED` 为 `true`；
3. `production` Environment 的审批和保护规则已满足；
4. `WX_CLOUD_ENV_ID`、`WX_CLOUD_APP_ID`、`WX_CLOUD_PRIVATE_KEY`、两个服务名和 `WX_CLOUD_API_PUBLIC_DOMAIN` 都来自同一云托管环境；
5. `WX_CLOUD_MERCHANT_MAP_KEY`（如使用地图）和 `WX_CLOUD_API_ENV_PARAMS` 已按当前生产配置审计。

工作流是手动触发的：推送 `main` 只执行 `ci.yml`，不会自动发布云托管。小程序上传也由独立的 `miniprogram-release.yml` 手动执行，云托管服务发布不会上传小程序代码。只要小程序代码或配置有变更，就必须在对应 Git SHA 上手动填写一个高于微信平台当前版本的版本号；工作流不提供静态默认版本，并用并发锁避免重复上传。

小程序工作流当前使用 GitHub 托管 Runner。由于其出口 IP 会变化，本次验证采用关闭微信代码上传 IP 白名单的配置；若生产要求启用白名单，应先改用固定出口的自托管 Runner。上传失败时工作流会打印当前 Runner 出口 IP，`invalid ip` 应按微信平台上传白名单问题处理。

CI 的 API job 使用全新 checkout，仓库中没有本地 `node_modules`，所以可以从 `server/api` 直接构建上传；本机发布不能照抄这一点，必须使用 [Runbook 的精简 API 上下文](release-runbook.md#6-发布-api必须使用精简临时上下文)。

`WX_CLOUD_API_ENV_PARAMS` 一旦设置，当前 CLI 会用它同步服务环境变量；不要只填写一个新增键。若需要修改变量，应传入完整、已脱敏且审计过的键值集合；否则留空，让工作流使用 `--override` 沿用现有版本参数。发布后仍需按 Runbook 做任务、版本、健康检查和商家构建产物验收。

如果终端或工作流日志出现 `ResourceNotFound.TopicNotExist`、旧日期日志或日志观察器异常，不要仅凭这段输出立即重跑；先检查最新版本状态、流量、副本以及 `/api/health/ready`、商家 `/healthz`。
