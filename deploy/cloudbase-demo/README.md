# 微信云托管纯体验版

这个分支的目标是让项目可以用较少云资源完成演示，不代表生产部署方案。

## 体验版取舍

- 数据库改为 MySQL，使用 Prisma `db push` 建表；不再依赖 PostgreSQL/PostGIS。
- 地址和订单仍保存经纬度，但服务区域使用 GeoJSON 在应用层判断。
- Redis 设为可选；没有 `REDIS_URL` 时，限流自动回退到单实例内存实现。
- 微信登录和微信支付默认使用 Mock，不会发起真实支付。
- API 和商家后台分别作为两个云托管服务部署；商家后台构建时注入 API HTTPS 地址。

## 本地验证

在仓库根目录执行：

```bash
docker compose --env-file deploy/env.cloudbase-demo.example \
  -f deploy/docker-compose.cloudbase-demo.yml up --build
```

打开：

- 商家后台：`http://localhost:8080`
- API 健康检查：`http://localhost:3000/api/health`
- Swagger：`http://localhost:3000/api/docs`

体验结束后停止容器：

```bash
docker compose -f deploy/docker-compose.cloudbase-demo.yml down
```

如需连同本地 MySQL 数据一起删除，再执行：

```bash
docker compose -f deploy/docker-compose.cloudbase-demo.yml down -v
```

## 微信云托管部署

### 1. 创建 MySQL

在云开发/腾讯云控制台创建 MySQL，并记录内网连接信息。免费额度是有上限的，体验环境不要保持过高实例规格或长时间运行。

### 2. 部署 API 服务

创建自定义部署服务：

- 代码来源：GitHub 的 `yimi528/city-flash-delivery`；
- 分支：`cloudbase-demo`；
- Dockerfile：`server/api/Dockerfile.cloudbase`；
- 构建上下文：`server/api`；
- 端口：`3000`；
- 启动命令：镜像默认命令；
- 实例数：体验时先设为 1，结束后缩容或删除服务。

先发布一次 migration 镜像/任务，执行：

```bash
npm run prisma:generate && npm run prisma:cloudbase
```

API 环境变量至少需要：

```text
DATABASE_URL=mysql://用户名:密码@MySQL内网地址:3306/数据库名
REDIS_URL=
NODE_ENV=development
APP_RELEASE_STAGE=testing
JWT_SECRET=随机长字符串
WECHAT_LOGIN_MOCK_ENABLED=true
WECHAT_PAY_MOCK_ENABLED=true
WECHAT_PAY_MODE=mock
OPERATOR_BOOTSTRAP_ENABLED=true
OPERATOR_BOOTSTRAP_USERNAME=admin
OPERATOR_BOOTSTRAP_PASSWORD=强密码
```

### 3. 部署商家后台

创建第二个自定义部署服务：

- Dockerfile：`apps/merchant-web/Dockerfile`；
- 构建上下文：`apps/merchant-web`；
- 端口：`80`；
- 构建参数 `VITE_API_BASE_URL`：API 服务的 HTTPS 地址，结尾为 `/api`；
- `CORS_ORIGINS`：商家后台最终 HTTPS 地址。

### 4. 体验范围

这个版本适合查看商家后台、Mock 登录、价格配置、订单状态流转和骑手工作台。它不适合真实支付、生产订单、多人并发或长期保存业务数据。

体验结束后应删除或停止 API、商家后台和 MySQL 环境，避免免费额度耗尽后产生费用。
