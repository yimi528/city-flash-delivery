# GitHub Actions

## 工作流

| 工作流 | 触发方式 | 作用 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Pull Request、`main` 推送、手动触发、被调用 | MySQL 8.0 质量门禁、测试、Prisma 校验、依赖审计和 Docker 构建验证 |
| `.github/workflows/wxcloud-deploy.yml` | 手动 `workflow_dispatch` | 指定 Git tag 后，作为微信云托管和小程序上传的备用发布入口 |
| `.github/workflows/miniprogram-release.yml` | `workflow_call` | 使用当前 AppID 上传小程序代码 |

生产发布目标只有微信云托管，不再使用 SSH、旧 Compose、传统服务器、Quick Tunnel 或 GHCR 作为生产入口。

## 当前发布基线

- 当前运行时代码发布提交：`3c392ec`；当前 tag：`v1.0.10`；文档提交可继续推进 `main`，不会改变该运行时版本；
- 小程序当前上传版本：`1.0.10`；
- 云托管环境：`ding-delivery-prod-d8c1eea132b4c`；
- API：`city-flash-api:3000`；商家端：`city-flash-merchant:80`；
- API 与商家域名必须每次用 `wxcloud service:list --json` 查询。

## 质量门禁

`ci.yml` 使用 MySQL 8.0 服务运行：

1. 共享契约和小程序 Node.js 测试；
2. 小程序脚本语法检查；
3. API Jest、ESLint、TypeScript 构建和 Prisma 校验；
4. 商家端构建；
5. 生产依赖审计；
6. API runtime、migration 和商家端 Docker 镜像构建。

本地等价检查：

```bash
npm ci
npm --prefix server/api ci
npm --prefix apps/merchant-web ci
npm run check:quality
npm run test:security
```

## 备用发布工作流

备用工作流需要手动输入一个已推送、指向 `main` 历史的 `vX.Y.Z` tag，并要求生产 GitHub Environment 审批。需要配置：

- `WX_CLOUD_ENV_ID`、`WX_CLOUD_APP_ID`、`WX_CLOUD_PRIVATE_KEY`；
- `WX_CLOUD_API_SERVICE_NAME`、`WX_CLOUD_MERCHANT_SERVICE_NAME`；
- `WX_CLOUD_API_PUBLIC_DOMAIN`、`WX_CLOUD_MERCHANT_PUBLIC_DOMAIN`；
- `WX_CLOUD_API_ENV_PARAMS`（如修改服务变量，必须传完整集合）；
- `WECHAT_PRIVATE_KEY`（小程序代码上传密钥，不能与云托管 CLI 私钥混用）。

推送 `main` 只触发质量检查；tag 不会自动发布生产。默认本机发布入口是 `npm run release:local`，它根据 tag 变更范围发布受影响的 API、商家端和小程序。

## 安全和环境边界

- API 和商家端必须属于同一云托管环境；商家构建时的 `VITE_API_BASE_URL` 和 API `CORS_ORIGINS` 必须使用同环境域名；
- 生产使用微信云托管 MySQL 8.0，不配置 `REDIS_URL`；
- API migration 只能使用 `prisma migrate deploy`，禁止 `migrate reset`；
- CLI 私钥、微信 AppSecret、支付证书、数据库密码和上传密钥不得提交到 Git；
- API 发布包必须排除 `node_modules`、`dist`、`.env`、证书和密钥。

相关流程见 [当前发布 Runbook](release-runbook.md)、[凭证边界](credentials.md) 和 [微信云托管部署](deploy-wxcloud.md)。
