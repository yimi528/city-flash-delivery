# 鼎温榕同城配送 · City Flash Delivery

面向城市即时配送场景的端到端系统，覆盖用户下单、商家调度、骑手抢单与配送履约。

项目采用 monorepo 组织，包含微信小程序、React 商家运营后台、NestJS API 和 MySQL 8.0 数据库。当前仓库适合本地开发、功能演示和业务验收；正式上线前必须完成真实微信登录、微信支付、地图服务、生产账号、HTTPS 和微信云托管配置。

## 功能概览

### 用户与骑手小程序

- 寄货、急送、帮取、帮买、运货、搬运、顺风车等服务
- 地图选点、地址搜索、地址簿和文本地址识别
- 服务端统一计价，支持车型、重量、线路和天气风险规则
- 下单、报价确认、支付、取消、退款和订单进度查询
- 用户与骑手身份切换
- 骑手申请、审核、上下线、抢单、取货、配送、完成和收入记录

### 商家运营后台

- 运营员登录、权限控制和审计
- 新订单提醒、接单、报价和订单调度
- 订单搜索、状态/日期筛选和小票打印
- 骑手申请审核、状态管理和履约查看
- 价格规则、服务范围、营业状态和公告配置

### API 服务

- 用户、运营员、骑手多角色鉴权
- 订单状态机、状态日志、审计日志和请求 ID
- 规则版本快照、服务区域边界校验和 MySQL GIS 查询
- 微信登录、微信支付、退款与对账基础能力
- 腾讯地图代理、路线距离计算和天气风险识别
- Swagger、健康检查、限流和生产配置校验

## 系统架构

~~~
微信小程序（用户 / 骑手） ──┐
                            ├── NestJS API ── MySQL 8.0 + GIS
React 商家运营后台 ─────────┘       │
                                   ├── 微信登录 / 微信支付
                                   ├── 腾讯地图 WebService
                                   └── 天气服务
~~~

生产环境使用微信云托管，服务边界固定如下：

| 服务 | 用途 | 容器端口 |
| --- | --- | ---: |
| city-flash-api | NestJS API | 3000 |
| city-flash-merchant | Nginx 托管商家后台静态文件 | 80 |
| 微信云托管 MySQL 8.0 | 业务数据和 GIS 区域查询 | — |

API 和商家后台是两个独立服务，每个服务只监听一个端口。生产运行时不依赖 Redis，限流使用 API 单实例内存实现。普通地址和订单坐标保存为经纬度字段，服务区域边界使用 MySQL GIS。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 微信小程序 | JavaScript、WXML、WXSS、wx.cloud.callContainer |
| 商家后台 | React 18、TypeScript、Vite、Nginx |
| API | Node.js 22、NestJS 11、TypeScript |
| 数据层 | Prisma 5、MySQL 8.0、MySQL GIS |
| 外部服务 | 微信登录/支付、腾讯地图 WebService、Open-Meteo |
| 工程化 | Jest、Node.js Test Runner、ESLint、Prettier、Docker、GitHub Actions |

## 项目结构

~~~
city-flash-delivery/
├── apps/
│   ├── customer-mp/       # 用户端与骑手端微信小程序
│   └── merchant-web/      # React 商家运营后台
├── server/api/            # NestJS API、Prisma Schema 和迁移
├── packages/shared/       # 多端共享订单状态约定
├── scripts/               # 开发、测试和生产配置检查脚本
├── deploy/                # 小程序 CI 发布说明
├── docs/                  # 云托管、需求和参考资料
├── docker-compose.yml     # 本地 MySQL 编排
└── package.json           # 根目录统一命令
~~~

## 本地开发

### 环境要求

- Node.js 22 或更高版本（以 `.nvmrc` 为准）
- npm
- Docker Desktop / Docker Compose
- Bash、curl、lsof
- 微信开发者工具（调试小程序时使用）

### 一键启动

~~~
git clone https://github.com/yimi528/city-flash-delivery.git
cd city-flash-delivery
npm run start:dev
~~~

首次运行脚本会自动完成：

1. 从 server/api/.env.example 创建本地 .env；
2. 安装 API 和商家后台依赖；
3. 启动本地 MySQL；
4. 生成 Prisma Client 并执行迁移；
5. 构建 API 并启动 API 与商家后台。

启动后访问：

| 服务 | 地址 |
| --- | --- |
| 商家运营后台 | <http://127.0.0.1:5173> |
| API 健康检查 | <http://127.0.0.1:3000/api/health> |
| Swagger 文档 | <http://127.0.0.1:3000/api/docs> |

需要持续查看日志时运行：

~~~
npm run dev
~~~

停止本地前后端和 MySQL：

~~~
npm run dev:stop
~~~

### 手动启动

启动 API：

~~~
cd server/api
cp .env.example .env
npm ci
npm run prisma:generate
npm run prisma:deploy
npm run start:dev
~~~

启动商家后台：

~~~
cd apps/merchant-web
npm ci
npm run dev
~~~

### 小程序调试

用微信开发者工具导入仓库根目录。project.config.json 已将 miniprogramRoot 指向 apps/customer-mp/。

- 开发版默认访问本地 API：http://127.0.0.1:3000/api
- 体验版通过 wx.cloud.callContainer 访问微信云托管 `prod` 环境
- 正式版通过 wx.cloud.callContainer 访问微信云托管 `prod` 环境；只有显式切换运行时配置时才使用 `test` 环境

真机开发版不能访问手机自身的 127.0.0.1。联调时可在小程序运行时配置手机可访问的局域网 API 地址；体验版和正式版使用微信云托管。

## 环境配置

本地 API 配置：

~~~
cp server/api/.env.example server/api/.env
~~~

常用变量如下，完整配置以 server/api/.env.example 和部署文档为准：

| 变量 | 说明 |
| --- | --- |
| DATABASE_URL | MySQL 连接串 |
| JWT_SECRET | Token 签名密钥 |
| WECHAT_LOGIN_MOCK_ENABLED | 本地是否启用微信登录 Mock |
| WECHAT_PAY_MODE | mock、disabled 或 wechat |
| TENCENT_MAP_KEY | 腾讯地图服务端 Key |
| CORS_ORIGINS | 商家后台允许访问 API 的 HTTPS 来源 |
| ENABLE_SWAGGER | 是否开放 Swagger |

商家后台的 VITE_API_BASE_URL 是构建时注入值。生产构建前必须填入微信云托管 API 的 HTTPS 地址：

~~~
cd apps/merchant-web
VITE_API_BASE_URL="https://<api-service-domain>/api" npm run build
~~~

所有 .env、微信 AppSecret、支付证书、数据库密码、CLI 私钥和上传密钥都只能保存在本机或云端密钥配置中，不能提交到 Git。

## 测试与校验

~~~
# 根目录
npm run check:quality     # 小程序、API 和商家后台质量检查
npm run test:shared       # 校验跨端状态与角色契约
npm run test:mvp          # 小程序、API 和商家后台验收
npm run test:start-stop   # 验证一键启停流程
npm run test:security     # 检查生产依赖漏洞
npm run test:containers   # 构建并检查生产镜像
npm run release:check     # 校验微信云托管生产配置

# API
cd server/api
npm test -- --runInBand
npm run lint
npm run build
npx prisma validate

# 小程序脚本
node --test apps/customer-mp/tests/*.test.js
~~~

## 订单流程

普通计价订单：

~~~
选择服务与地址 → 服务端计价并创建订单 → 支付 → 商家接单
→ 骑手抢单 → 到达取货 → 配送中 → 已完成
~~~

需要人工报价的订单：

~~~
提交需求 → 商家报价 → 用户确认并支付 → 商家接单 → 骑手履约
~~~

订单状态由服务端状态机控制，不允许跳级、倒退或重复完成。

## 微信云托管部署

正式部署目标是微信云托管，不再把历史服务器、旧 Compose 环境或 Quick Tunnel 作为新的生产入口。

涉及 wxcloud CLI 的安装、登录、环境查询、服务管理、部署、发布、回滚和 CI/CD 配置时，必须先阅读官方文档，并以当前 CLI 的 --help 输出为准：

- [微信云托管官方文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/)
- [微信云托管 CLI](https://cloud.weixin.qq.com/cli/)
- [项目部署说明](docs/deploy-wxcloud.md)
- [下一次发布 Runbook](docs/release-runbook.md)

发布前必须保留以下边界：

1. API 和商家后台分别发布为 city-flash-api:3000 与 city-flash-merchant:80，每个服务只监听一个端口。
2. API 使用微信云托管 MySQL 8.0；服务区域边界使用 MySQL GIS，普通地址和订单坐标保留经纬度字段。
3. API 只有在明确设置 RUN_MIGRATIONS_ON_STARTUP=true 时才执行 prisma migrate deploy，禁止执行 migrate reset 或破坏性初始化。
4. 商家后台先以 API HTTPS 地址注入 VITE_API_BASE_URL 构建 dist，再使用 Dockerfile.cloud、nginx.conf 和 dist 发布到商家服务。
5. 生产环境必须关闭 Mock 微信登录、Mock 支付、Swagger 和运营员自动初始化，并使用随机强 JWT 密钥及正式凭证。
6. Redis 不属于生产依赖，不能把历史 Redis 配置写回新的云托管配置。

建议发布顺序：

1. 按官方文档完成云托管环境和 MySQL 8.0 准备。
2. 查询并确认 API 服务的 HTTPS 地址，再构建商家后台。
3. 使用 npm run release:check -- .env.cloud 验证生产配置。
4. 发布 API 和商家后台，依次验收健康检查、CORS、商家登录、小程序登录和测试订单闭环。
5. 验收通过后再启用 CI/CD 发布开关。

环境变量、镜像文件和底层配置说明见 docs/deploy-wxcloud.md；下一次发布按 docs/release-runbook.md 执行。在云端发布获得用户明确确认前，只进行 CLI 登录检查、环境/服务查询和本地构建验证。

## GitHub Actions

仓库工作流包括：

- .github/workflows/ci.yml：Pull Request 和 main 分支的质量检查、构建验证
- .github/workflows/wxcloud-deploy.yml：经手动触发并通过环境审批后发布微信云托管
- .github/workflows/miniprogram-release.yml：小程序手动上传

未配置云托管 Secret 或未将 WX_CLOUD_DEPLOY_ENABLED 设为 true 时，工作流只执行质量检查，不发布云端服务。CLI 私钥、微信 AppSecret、支付证书和数据库密码不得提交到仓库。

## 相关文档

- [微信云托管部署](docs/deploy-wxcloud.md)
- [小程序账号基本信息](docs/miniprogram-account-info.md)
- [小程序 CI 发布](deploy/miniprogram-ci.md)
- [商家后台说明](apps/merchant-web/README.md)
- [API 说明](server/api/README.md)
- [GitHub Actions 配置](docs/github-actions.md)
- [界面参考资料](docs/reference-ui/README.md)

## 安全与上线检查

- 生产环境不得使用 Mock 登录、Mock 支付、默认 JWT 密钥或默认运营员密码。
- 生产环境的 CORS_ORIGINS 必须是明确的 HTTPS 来源，禁止使用 *。
- 数据库密码、微信凭证、支付私钥、地图 Key 和 CLI 私钥只能通过密钥配置注入。
- API、商家后台、小程序和支付回调都要完成真实设备或真实链路验收。
- 上线前完成 HTTPS、微信平台审核、隐私合规、日志监控和数据备份检查。

## License

本项目尚未声明开源许可证。未获得授权前，请勿将代码用于商业分发。
