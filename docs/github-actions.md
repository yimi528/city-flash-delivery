# GitHub Actions

仓库使用两条发布入口，并保留一个被发布入口调用的小程序上传工作流：

| 工作流 | 触发方式 | 作用 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Pull Request、`main` 推送、手动触发 | 小程序/API/商家后台测试，Prisma 校验，依赖审计和 Docker 镜像构建验证 |
| `.github/workflows/wxcloud-deploy.yml` | `workflow_dispatch`（备用） | 手动指定 tag 后，通过 GitHub Environment 审批发布 API、商家后台并调用小程序上传工作流 |
| `.github/workflows/miniprogram-release.yml` | `workflow_call` | 从发布 tag 解析版本，使用 `miniprogram-ci` 上传小程序代码 |

生产发布的唯一目标是微信云托管。仓库不再通过 SSH、传统生产主机或旧 Compose 链路发布生产服务。

下一次发布按 [微信云托管发布 Runbook](release-runbook.md) 执行；本文件只说明 GitHub Actions 的触发条件和 Secret 边界。

## 生产发布保护

建议创建名为 `production` 的 GitHub Environment，并要求发布审批。云托管工作流还要求仓库变量 `WX_CLOUD_DEPLOY_ENABLED=true`，并通过 GitHub Secrets 注入云托管 CLI 和服务配置。

API 和商家后台必须使用同一个云托管环境：

- API 服务监听容器端口 `3000`；
- 商家后台服务监听容器端口 `80`；
- 商家后台构建时的 `VITE_API_BASE_URL` 必须指向同一环境的 API HTTPS 地址；
- API 的 `CORS_ORIGINS` 必须包含同一环境的商家后台来源；
- 数据库使用微信云托管 MySQL 8.0，生产配置不能包含 `REDIS_URL`。

工作流只从 GitHub Secrets/Variables 读取凭证，不读取或上传仓库中的本地密钥文件。CLI 私钥、微信 AppSecret、支付证书和数据库密码不得提交到 Git。

## 统一发布标识

项目使用 Git annotated tag `vX.Y.Z` 作为一次发布的统一标识。例如 `v1.0.3`：

- 小程序上传版本自动取去掉 `v` 后的 `1.0.3`；
- API 和商家后台的云托管内部版本号仍由平台生成；
- 两个云托管版本的 `--remark` 会记录发布标签和 Git SHA，便于从平台版本反查源码；
- 本地执行 `npm run release:local` 后直接发布云托管和小程序；Git tag 只作为版本留痕，推送 tag 不再触发生产发布。

创建 tag 和执行本地发布是人工确认动作。GitHub 云发布工作流仅保留为应急备用入口，要求手动选择 tag，并会拒绝格式不正确、未指向当前提交或不在 `main` 分支历史中的标签。

## 质量门禁

`ci.yml` 使用 MySQL 8.0 服务运行以下检查：

1. 小程序 Node.js 测试；
2. API Jest、ESLint、TypeScript 构建；
3. Prisma migration 和 schema 校验；
4. 商家后台构建；
5. 生产依赖审计；
6. API runtime、migration 和商家后台 Docker 镜像构建。

本地发布入口先调用同一套质量检查和生产依赖审计，检查通过后才进入部署；GitHub 备用工作流也复用同一套门禁。

## 下一次 CI 发布

按本地发布时，先确认：

1. 代码已经推送到 `main`，并准备好指向该提交的 `vX.Y.Z` 发布标签；
2. `deploy/secrets/production.env` 已在本机安全位置配置，且未被 Git 跟踪；
3. 本机 `wxcloud` CLI、云托管 CLI 私钥和当前 AppID 的小程序上传私钥可用；
4. API、商家服务和数据库均来自同一云托管环境，当前域名以 `wxcloud service:list` 为准；
5. 微信后台允许本次小程序版本上传，并已确认支付、Mock 和迁移配置。

推送 `main` 只执行 `ci.yml`，不会发布生产；推送 tag 也不会触发生产工作流。创建 tag 后执行 `npm run release:local`，本地会依次完成质量检查、API/商家部署、健康检查和小程序上传；确认成功后再将 `main` 和 tag 推送到 GitHub 做版本留痕。

### 创建发布 tag

创建 tag 和本地发布均保留人工确认。项目提供 `npm run release` 辅助计算版本和创建本地 annotated tag，`npm run release:local` 负责直接发布，但两者都不会自动推送：

~~~sh
# 首次建立 Git 发布版本基线时手动指定；新项目可以从 1.0.0 开始
npm run release -- 1.0.0

# 已有发布 tag 后，不填版本号则自动递增 patch，例如 v1.0.2 -> v1.0.3
npm run release

# 也可以手动指定更高版本，例如大版本或次版本升级
npm run release -- 2.0.0

# 检查但不创建 tag
npm run release -- --dry-run

# 先在本地直接发布；成功后再推送 tag 做版本留痕
npm run release:local -- v1.0.0
git push origin v1.0.0
~~~

两个辅助命令都要求工作区干净、当前分支为 `main`，且当前提交已经与 `origin/main` 一致。首次发布版本不应盲目使用 `1.0.0`：如果微信后台已有更高版本，应手动指定实际允许上传的下一个版本。后续自动递增只基于 Git tag，仍需留意微信平台上曾经手动上传但未形成 Git tag 的版本。

小程序工作流当前使用 GitHub 托管 Runner。由于其出口 IP 会变化，本次验证采用关闭微信代码上传 IP 白名单的配置；若生产要求启用白名单，应先改用固定出口的自托管 Runner。上传失败时工作流会打印当前 Runner 出口 IP，`invalid ip` 应按微信平台上传白名单问题处理。

CI 的 API job 使用全新 checkout，仓库中没有本地 `node_modules`，所以可以从 `server/api` 直接构建上传；本机发布不能照抄这一点，必须使用 [Runbook 的精简 API 上下文](release-runbook.md#6-发布-api必须使用精简临时上下文)。

`WX_CLOUD_API_ENV_PARAMS` 一旦设置，当前 CLI 会用它同步服务环境变量；不要只填写一个新增键。若需要修改变量，应传入完整、已脱敏且审计过的键值集合；否则留空，让工作流使用 `--override` 沿用现有版本参数。发布后仍需按 Runbook 做任务、版本、健康检查和商家构建产物验收。

如果终端或工作流日志出现 `ResourceNotFound.TopicNotExist`、旧日期日志或日志观察器异常，不要仅凭这段输出立即重跑；先检查最新版本状态、流量、副本以及 `/api/health/ready`、商家 `/healthz`。
