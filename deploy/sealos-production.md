# Sealos 生产环境清单

生产环境文件需要设置 `DEPLOY_TARGET=sealos`；发布验收会使用平台 Ingress TLS，并跳过仅适用于本地 Compose 的证书文件检查。

测试环境继续保留 `xian-test-api`、`xian-test-merchant` 及其测试数据库。生产环境使用独立项目/命名空间，建议资源名如下：

- `xian-prod-api`：API Deployment，镜像必须是完整 Git SHA。
- `xian-prod-merchant`：运营后台静态站点，镜像必须是同一发布 SHA。
- `xian-prod-migrate`：一次性 Job，使用同一 SHA 的 migration 镜像执行 `prisma migrate deploy`。
- `xian-prod-postgres`、`xian-prod-redis`：独立持久化数据库，不复用任何 `xian-test-*` 连接串。

## 首次创建

1. 在 Sealos 创建独立生产项目，并为 API、运营后台、PostgreSQL、Redis 配置独立资源和网络策略。
2. 将 `deploy/env.production.example` 复制为平台环境变量模板；实际值逐项填入 Sealos Secret，不要提交 `deploy/env.production`。
3. 把 `DATABASE_URL`、`REDIS_URL`、JWT、微信 AppSecret、API v3 Key、商户私钥、平台证书和腾讯地图 Key 放进 Secret；普通环境变量只保留端口、域名、镜像 SHA 和非敏感开关。
4. 先部署 migration Job，确认日志显示 `prisma migrate deploy` 成功且 Job 正常退出，再启动 API。
5. API 只运行 `node dist/main.js`。若生产数据库迁移或 bootstrap 初始化失败，容器必须保持失败状态，不能通过 `db push --accept-data-loss` 或吞掉异常继续启动。
6. 首次创建正式运营员后，将 `OPERATOR_BOOTSTRAP_ENABLED` 设为 `false`，删除 bootstrap 密码 Secret，并重新发布 API。

## 发布与回滚

发布变量中的 `API_IMAGE`、`API_MIGRATION_IMAGE`、`MERCHANT_IMAGE` 使用同一个完整 Git SHA，例如 `:4f2c...`，禁止生产使用 `latest`。先执行 migration Job，再滚动更新 API 和运营后台；测试项目不受影响。

发生应用故障时，恢复上一份完整 SHA 的镜像变量并重新发布 API/运营后台。不要回滚数据库结构；迁移必须保持旧代码可读，数据库回滚只允许通过经过验证的前向修复迁移完成。

## 生产验收

在 Sealos Secret 和正式域名均配置后，在仓库根目录运行：

```bash
npm run release:check -- deploy/env.production
```

然后验证 `/api/health/ready`、运营后台 `/healthz`、请求响应头 `X-Request-Id`、支付回调、退款回调和备份任务。真实微信登录、真机小额支付、退款、通知及三方对账必须在微信后台和真机上完成，不能由 CI 模拟通过。
