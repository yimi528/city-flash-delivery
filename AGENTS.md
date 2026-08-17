# City Flash Delivery 项目约定

## 下一阶段：迁移到微信云托管

后续部署目标是微信云托管，不再把 osako 上的 Quick Tunnel 作为长期正式入口。微信云托管使用官方 CLI `@wxcloud/cli`，命令为 `wxcloud`；不要把它与另一套 CloudBase CLI 的 `tcb` 命令混用。

凡涉及 `wxcloud` CLI 的安装、登录、环境查询、服务创建、部署、发布、回滚或 CI/CD 配置，必须先查阅微信云托管官方文档，以当前文档和 CLI 实际帮助为准，不凭记忆猜测参数。主文档：[微信云托管官方文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/)；CLI 入口：[微信云托管 CLI](https://cloud.weixin.qq.com/cli/)。腾讯云 CloudBase Run 文档只能作为底层能力补充，不能替代微信云托管专属文档。

部署前必须保留并核对以下边界：

- API 和商家端都是微信云托管服务，当前分别为 `city-flash-api:3000` 和 `city-flash-merchant:80`；静态资源存储只能作为后续可选替代方案。每个服务必须保持“一服务一端口”。
- API 使用微信云托管提供的 MySQL 8.0；MySQL GIS 用于服务区域边界查询，普通地址/订单坐标仍保留经纬度字段。Redis 不再作为项目依赖，限流使用单实例内存实现。
- API 镜像需要执行 Prisma migration；云托管发布时通过明确的 `RUN_MIGRATIONS_ON_STARTUP=true` 环境变量执行 `prisma migrate deploy`，不能执行 `migrate reset` 或破坏性数据初始化。
- 商家端的 `VITE_API_BASE_URL` 是构建时注入值，必须指向微信云托管 API 的 HTTPS 地址后再构建 `dist`，再将 `Dockerfile.cloud`、`nginx.conf` 和 `dist` 发布到商家服务。
- 生产环境不得使用 Mock 微信登录、Mock 支付、默认 JWT 密钥或默认运营员密码；CLI 密钥、微信 AppSecret、支付证书和数据库密码不得提交到 Git。
- 在用户明确确认前，只做 CLI 登录检查、环境/服务查询和本地构建验证，不执行实际云端发布或产生新云资源。

osako 上的旧 Compose、PostgreSQL、Redis 和 Quick Tunnel 仅属于历史环境；不得把 Quick Tunnel 或 osako 地址写回新配置。新的发布目标和运行入口统一使用微信云托管。
