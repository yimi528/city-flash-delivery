# GitHub Actions

仓库使用三条职责明确的工作流：

| 工作流 | 触发方式 | 作用 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Pull Request、`main` 推送、手动触发 | 小程序/API/商家后台测试，Prisma 校验，依赖审计和 Docker 镜像构建验证 |
| `.github/workflows/wxcloud-deploy.yml` | 手动触发 | 通过 GitHub Environment 审批后，使用 `@wxcloud/cli` 发布 API 和商家后台 |
| `.github/workflows/miniprogram-release.yml` | 手动触发 | 使用 `miniprogram-ci` 上传小程序代码 |

生产发布的唯一目标是微信云托管。仓库不再通过 SSH、传统生产主机或旧 Compose 链路发布生产服务。

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
