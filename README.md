# 同城速送（City Flash Delivery）

同城速送是一套面向单一运营方的同城配送系统，包含用户微信小程序、同一小程序内的骑手工作台、商家运营后台和 NestJS API。

项目覆盖从用户询价、下单和支付，到商家调度、骑手抢单、取货、配送和完成的完整履约闭环。当前适合本地演示、业务验收和测试环境部署；正式上线前仍需配置真实域名、HTTPS 证书、微信凭证和生产镜像。

## 系统组成

| 模块 | 目录 | 技术 | 说明 |
| --- | --- | --- | --- |
| 用户端与骑手端 | `apps/customer-mp` | 微信原生小程序 | 用户下单、订单查询、地址簿、骑手申请及骑手履约 |
| 商家运营后台 | `apps/merchant-web` | React 18、TypeScript、Vite | 订单调度、骑手审核与管理、价格和系统配置 |
| 主后端 | `server/api` | NestJS、Prisma、PostgreSQL、Redis | 账号、订单、计价、支付、地图、骑手和运营接口 |
| 旧版后端 | `server/app.py` | Python、SQLite | 仅保留兼容性冒烟测试，不作为当前运行后端 |
| 生产部署 | `deploy` | Docker Compose、Nginx | 云端部署、证书、备份和监控配置 |

## 快速开始

### 环境要求

- Node.js 20 或更高版本（生产镜像使用 Node.js 22）
- npm
- Docker Desktop，并确保 Docker Engine 已启动
- 微信开发者工具（运行小程序时需要）
- macOS 或 Linux；一键脚本依赖 Bash、`curl`、`lsof` 和 Docker Compose

### 一键启动

在仓库根目录运行：

```bash
npm run dev
```

首次启动会自动：

1. 从 `server/api/.env.example` 创建本地 `.env`；
2. 安装后端和商家端依赖；
3. 启动 PostgreSQL 与 Redis；
4. 生成 Prisma Client 并执行数据库迁移；
5. 构建并启动 API；
6. 启动商家运营后台。

启动完成后访问：

| 服务 | 地址 |
| --- | --- |
| 商家运营后台 | <http://127.0.0.1:5173> |
| API 基础地址 | <http://127.0.0.1:3000/api> |
| API 健康检查 | <http://127.0.0.1:3000/api/health> |
| Swagger 文档 | <http://127.0.0.1:3000/api/docs> |

> 直接打开 `/api` 返回 `Cannot GET /api`（404）是正常现象，因为 API 根路径没有页面路由。请使用 `/api/health` 判断后端是否启动成功。

本地商家端演示账号：

```text
账号：operator-demo
密码：demo123456
```

该账号只用于本地开发。生产环境必须更换为独立强密码，并关闭运营账号自动引导功能。

### 停止项目

```bash
npm run dev:stop
```

该命令会停止前端、后端、PostgreSQL 和 Redis。macOS 也可以双击：

- `启动开发环境.command`
- `停止开发环境.command`
- `打开启停控制台.command`（打开仅限本机访问的图形化启停面板）

## 微信小程序

使用微信开发者工具导入仓库根目录；根目录的 `project.config.json` 会指向小程序代码。开发环境默认请求：

```text
http://127.0.0.1:3000/api
```

接口地址由 `apps/customer-mp/config/runtime.js` 按微信环境决定：

- `develop`：本地 API，可使用本地存储中的开发覆盖地址；
- `trial`：体验版 HTTPS API；
- `release`：正式版 HTTPS API。

上传体验版或正式版之前，必须把 `trial` 和 `release` 的占位地址替换为真实 HTTPS API 地址，并在微信公众平台配置 request 合法域名。

## 已实现功能

### 用户端

- 拼车、寄货、运货、搬运装卸、急送、帮取、帮买、送货/送客八类服务；
- 地图定位、地址搜索、手动填写、地址编辑和地址簿；
- 粘贴文本自动识别联系人、手机号和地址；
- 常用地址统计和最近使用推荐；
- 后端统一计价、固定车型、线路价格和恶劣天气倍率；
- 创建订单、报价确认、模拟支付、取消和订单状态跟踪；
- 用户身份与骑手身份共用同一账号，可在小程序内切换。

### 骑手端

- 提交骑手申请并查看审核结果；
- 上线、手动下线和位置心跳；
- 按车型、资质、距离和任务上限获取可抢订单；
- 原子抢单，避免同一订单被多个骑手同时领取；
- 当前任务、导航、联系用户、到达、取货、配送和完成；
- 历史订单、收入统计和异常上报；
- 上线状态保存在后端，不因切换回用户端而自动下线。

### 商家运营后台

- 运营账号登录和后端连接状态；
- 当前订单及历史订单搜索、状态筛选和日期筛选；
- 接单、报价、取货、配送、完成等履约操作；
- 骑手申请独立审核，导航数字显示待处理申请数量；
- 按姓名、手机号或骑手编号搜索骑手；
- 暂停、恢复或标记骑手离职；
- 价格规则、服务范围、营业状态、公告和调度参数配置；
- 订单小票打印。

### 后端

- 微信登录 Mock 与正式微信登录配置；
- 用户、运营员和骑手多角色授权；
- PostgreSQL + Prisma 数据持久化及 PostGIS 扩展；
- Redis 限流和骑手在线状态支持；
- 订单状态机、幂等抢单和状态日志；
- 后端计价与配置版本快照；
- 腾讯地图 WebService 服务端代理；
- 天气风险识别与恶劣天气计价；
- 微信支付 Mock，以及正式支付、回调、退款和对账基础能力；
- Swagger、健康检查、请求 ID 和审计日志。

## 核心业务流程

普通配送订单：

```text
选择服务与地址
  → 后端计算价格并创建订单
  → 用户支付
  → 商家接单或骑手抢单
  → 取货中
  → 配送中
  → 已完成
```

需要商家报价的订单：

```text
用户提交需求
  → 商家填写报价
  → 用户确认报价
  → 用户支付
  → 接单与履约
```

订单状态由后端状态机控制，不能跨级推进、倒退，已完成或已取消订单不能再次履约。

## 技术架构

```text
微信小程序（用户 / 骑手） ───────┐
                                 │ HTTP API
React 商家运营后台 ──────────────┤
                                 ▼
                       NestJS API
                        │       │
                        │       └── Redis
                        ▼
                PostgreSQL + PostGIS
                        │
                        ├── 腾讯地图 WebService
                        ├── 天气预报服务
                        └── 微信登录 / 微信支付
```

## 项目结构

```text
city-flash-delivery/
├── apps/
│   ├── customer-mp/          # 用户端与骑手端微信小程序
│   └── merchant-web/         # 商家运营后台
├── server/
│   ├── api/                  # 当前 NestJS 主后端
│   ├── app.py                # 旧版 Python MVP
│   └── smoke_test.py         # 旧版兼容性冒烟测试
├── packages/shared/          # 多端共享状态约定
├── scripts/                  # 启停、验收和发布检查脚本
├── deploy/                   # 云端 Compose、Nginx、备份和监控
├── docs/                     # 产品需求和 UI 参考资料
├── project.config.json       # 微信开发者工具项目配置
└── package.json              # 根目录统一命令
```

## 环境配置

本地后端配置文件：

```bash
cp server/api/.env.example server/api/.env
```

常用配置：

| 变量 | 用途 | 本地默认值 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接 | 本地 Docker PostgreSQL |
| `REDIS_URL` | Redis 连接 | `redis://127.0.0.1:6379` |
| `JWT_SECRET` | 登录令牌签名 | 仅限本地的占位密钥 |
| `WECHAT_LOGIN_MOCK_ENABLED` | 微信登录 Mock | `true` |
| `WECHAT_PAY_MODE` | `mock`、`disabled` 或 `wechat` | `mock` |
| `TENCENT_MAP_KEY` | 腾讯地图 WebService Key | 空，使用降级逻辑 |
| `ENABLE_SWAGGER` | 是否启用 Swagger | `true` |
| `CORS_ORIGINS` | 允许访问 API 的 Web 来源 | 本地商家端地址 |

不要提交 `.env`、数据库密码、微信密钥、支付私钥或生产证书。

## 常用开发命令

### 根目录

```bash
npm run dev                 # 一键启动本地项目
npm run dev:stop            # 停止本地项目及数据库容器
npm run test:mvp            # 小程序、后端、商家端完整代码验收
npm run test:start-stop     # 验证一键启动和停止
npm run test:security       # 检查生产依赖漏洞
npm run test:containers     # 构建并验证三个生产镜像
npm run release:check       # 检查生产发布配置
```

执行包含真实数据库订单履约的测试：

```bash
RUN_LIVE=1 npm run test:start-stop
```

### 后端

```bash
cd server/api
npm run start:dev           # 开发模式
npm test -- --runInBand     # 单元与集成测试
npm run lint                # ESLint
npm run build               # NestJS 构建
npx prisma validate         # 校验 Prisma Schema
npm run prisma:deploy       # 执行已有数据库迁移
npm run test:live           # 真实 API 订单履约流程
```

### 商家端

```bash
cd apps/merchant-web
npm run dev
npm run build
```

### 小程序

小程序测试使用 Node.js 内置测试运行器，无需额外测试框架：

```bash
node --test apps/customer-mp/tests/*.test.js
```

## 当前验证基线

最近一次完整回归日期：**2026-07-18**。

- 小程序自动化测试：32 项通过；
- 后端 Jest：11 个测试套件、60 项测试通过；
- 后端 lint、构建和 Prisma 校验通过；
- 商家端生产构建和主要页面浏览器回归通过；
- 历史订单搜索、骑手搜索及骑手申请页面通过；
- PostgreSQL、Redis、API 和商家端健康检查通过；
- 报价、下单、支付、接单、取货、配送、完成真实数据库链路通过；
- API、迁移和商家端三个生产镜像构建通过；
- 生产依赖安全检查为 0 个已知漏洞。

这些结果表示当前提交可用于本地验收，不表示已经满足正式上线条件。

## 生产部署

详细步骤见 [`deploy/README.md`](deploy/README.md)，Sealos 说明见 [`deploy/sealos-production.md`](deploy/sealos-production.md)。

正式部署前至少需要：

1. PostgreSQL 16（启用 PostGIS）和 Redis；
2. API、数据库迁移和商家端三个不可变版本镜像；
3. 稳定的 API HTTPS 域名及 TLS 证书；
4. 正式微信小程序 AppID 和 Secret；
5. 腾讯地图 WebService Key；
6. 至少 32 字符的随机 `JWT_SECRET`；
7. 与 API 域名一致的小程序 `trial` / `release` 地址；
8. 若启用真实支付：微信支付商户号、APIv3 密钥、证书和回调域名；
9. 数据库备份、日志、监控、告警和恢复演练。

准备生产配置：

```bash
cp deploy/env.production.example deploy/env.production
npm run release:check -- deploy/env.production
```

发布检查全部通过后再执行部署。商家后台不强制购买独立域名，可以使用云平台提供的受保护 HTTPS 地址；用户小程序请求的 API 则必须使用符合微信要求的稳定 HTTPS 域名。

## 常见问题

### 打开 `http://127.0.0.1:3000/api` 显示 404

正常。这里是 API 前缀，不是网页。请访问：

```text
http://127.0.0.1:3000/api/health
```

### 端口 3000 或 5173 被占用

先执行：

```bash
npm run dev:stop
```

再重新运行 `npm run dev`。停止脚本会清理项目占用的两个开发端口。

### 小程序请求不到本地 API

- 确认 `/api/health` 可访问；
- 检查 `apps/customer-mp/config/runtime.js` 的开发地址；
- 微信开发者工具本地调试时可关闭合法域名校验；
- 真机不能把 `127.0.0.1` 当作电脑地址，需要使用同一局域网内电脑的 IP 或测试 HTTPS 地址。

### 地图搜索没有真实结果

在 `server/api/.env` 中配置 `TENCENT_MAP_KEY`。未配置或地图服务不可用时，项目会使用本地建议和距离估算降级逻辑。

### 骑手上线后没有附近订单

检查位置权限、骑手审核状态、车型和资格、订单服务范围、抢单半径以及最大进行中订单数量。切换回用户端不会主动下线骑手；只有手动下线、账号状态变化或心跳超时才会结束在线状态。

## 安全说明

- 本地演示账号、Mock 登录和 Mock 支付不得直接用于公开生产环境；
- 生产环境应关闭 Swagger、关闭登录 Mock，并按发布阶段配置支付模式；
- 所有地图、微信和支付密钥只保存在服务端；
- 生产镜像必须使用完整 Git SHA，不要使用 `latest`；
- 数据库和 Redis 不应直接暴露到公网；
- 仓库中的功能和支付接入代码不能替代微信平台审核、备案、隐私合规和真实设备验收。

## License

当前项目为私有业务项目，未声明开源许可证。
