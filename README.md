# 同城速送 City Flash Delivery

一套覆盖用户下单、商家调度与骑手履约的同城配送系统。

项目采用 monorepo 组织，包含微信原生小程序、React 商家运营后台、NestJS API 与 MySQL 数据库，支持从服务询价、下单支付到抢单配送、退款对账的完整业务流程。

> 当前项目适合本地开发、功能演示和业务验收。正式上线前，请完成微信登录与支付、地图服务、HTTPS、生产账号及微信云托管等配置。

## 功能概览

### 用户端

- 支持寄货、急送、帮取、帮买、运货、搬运、顺风车等同城服务
- 地图选点、地址搜索、地址簿及粘贴文本智能识别
- 服务端统一计价，支持车型、重量、固定线路和天气风险规则
- 创建订单、确认报价、微信支付、取消、退款及进度查询
- 同一微信账号可切换用户与骑手身份

### 骑手端

- 骑手申请、审核状态查询及上下线管理
- 根据服务范围、车型、资质和距离展示可抢订单
- 原子抢单与幂等控制，避免订单被重复领取
- 到达、取货、配送、完成等完整履约操作
- 当前任务、历史订单、收入统计和异常上报

### 商家运营后台

- 运营人员登录及权限控制
- 新订单提醒、接单、报价和订单调度
- 订单搜索、状态与日期筛选、小票打印
- 骑手申请审核、人员查询及状态管理
- 价格规则、服务范围、营业状态和公告配置

### 服务端

- 用户、运营员和骑手多角色鉴权
- 订单状态机、状态日志、审计日志和请求 ID
- 统一计价、规则版本快照和服务区域校验
- 微信登录、微信支付、退款与对账基础能力
- 腾讯地图服务端代理和天气风险识别
- Swagger、健康检查、接口限流与生产配置校验

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 微信小程序 | JavaScript、WXML、WXSS、微信云托管调用 |
| 商家后台 | React 18、TypeScript、Vite |
| API | Node.js、NestJS 11、TypeScript |
| 数据层 | Prisma 5、MySQL 8.0、MySQL GIS |
| 外部服务 | 微信登录与支付、腾讯地图 WebService、Open-Meteo |
| 工程化 | Jest、Node.js Test Runner、ESLint、Prettier、Docker、GitHub Actions |

## 系统架构

```text
微信小程序（用户 / 骑手） ──┐
                            ├── NestJS API ── MySQL 8.0 + GIS
React 商家运营后台 ─────────┘       │
                                   ├── 微信登录 / 微信支付
                                   ├── 腾讯地图 WebService
                                   └── 天气服务
```

## 项目结构

```text
city-flash-delivery/
├── apps/
│   ├── customer-mp/       # 用户端与骑手端微信小程序
│   └── merchant-web/      # React 商家运营后台
├── server/api/            # NestJS API 与 Prisma Schema
├── packages/shared/       # 多端共享的订单状态约定
├── scripts/               # 本地启停、测试和发布检查脚本
├── deploy/                # 小程序发布说明
├── docs/                  # 部署、需求与界面参考资料
├── docker-compose.yml     # 容器编排配置
└── package.json           # 根目录统一命令
```

## 快速开始

### 环境要求

- Node.js 20+（CI 与生产镜像使用 Node.js 22）
- npm
- Docker Desktop
- Bash、`curl`、`lsof` 和 Docker Compose
- 微信开发者工具（调试小程序时需要）

一键脚本面向 macOS 和 Linux。Windows 建议使用 WSL，或分别启动数据库、API 与商家后台。

### 1. 获取代码

```bash
git clone https://github.com/yimi528/city-flash-delivery.git
cd city-flash-delivery
```

### 2. 启动开发环境

```bash
npm run start:dev
```

首次运行会自动完成以下工作：

1. 从 `server/api/.env.example` 创建本地 `.env`
2. 安装 API 与商家后台依赖
3. 启动本地 MySQL
4. 生成 Prisma Client 并执行数据库迁移
5. 构建并启动 API 与商家后台

启动完成后可访问：

| 服务 | 地址 |
| --- | --- |
| 商家运营后台 | <http://127.0.0.1:5173> |
| API 健康检查 | <http://127.0.0.1:3000/api/health> |
| Swagger 文档 | <http://127.0.0.1:3000/api/docs> |

若希望在当前终端持续查看日志，请运行：

```bash
npm run dev
```

停止开发环境：

```bash
npm run dev:stop
```

macOS 也可使用根目录中的 `启动开发环境.command`、`停止开发环境.command` 和 `打开启停控制台.command`。

## 微信小程序调试

使用微信开发者工具导入仓库根目录，根目录 `project.config.json` 已指向 `apps/customer-mp`。

开发环境默认请求：

```text
http://127.0.0.1:3000/api
```

运行时配置位于 `apps/customer-mp/config/runtime.js`：

- `develop` 可回退到本地 API
- `trial` 和 `release` 使用 `wx.cloud.callContainer`
- 上传体验版或正式版前，必须填写微信云托管环境 ID，并确认小程序拥有访问权限

真机无法访问 `127.0.0.1`。本地真机联调需要使用同一局域网内可访问的电脑 IP；体验版与正式版应使用微信云托管。

## 环境配置

后端本地配置：

```bash
cp server/api/.env.example server/api/.env
```

常用变量：

| 变量 | 说明 | 本地默认行为 |
| --- | --- | --- |
| `DATABASE_URL` | MySQL 连接串 | 连接本地 Docker MySQL |
| `JWT_SECRET` | Token 签名密钥 | 仅限本地的占位值 |
| `WECHAT_LOGIN_MOCK_ENABLED` | 微信登录 Mock | 开启 |
| `WECHAT_PAY_MODE` | `mock`、`disabled` 或 `wechat` | `mock` |
| `TENCENT_MAP_KEY` | 腾讯地图 WebService Key | 未配置时使用降级逻辑 |
| `CORS_ORIGINS` | 允许访问 API 的 Web 来源 | 本地商家后台 |
| `ENABLE_SWAGGER` | 是否开放 Swagger | 开启 |

请勿提交 `.env`、数据库密码、微信 AppSecret、支付私钥、证书或其他生产凭证。

## 常用命令

### 根目录

```bash
npm run start:dev          # 后台启动完整开发环境
npm run dev                # 前台启动并持续输出日志
npm run dev:stop           # 停止前后端与本地数据库
npm run test:mvp           # 执行完整代码验收
npm run test:start-stop    # 验证一键启停流程
npm run test:security      # 检查生产依赖漏洞
npm run test:containers    # 构建并检查生产镜像
npm run release:check      # 校验微信云托管生产配置
```

### API

```bash
cd server/api
npm run start:dev
npm test -- --runInBand
npm run lint
npm run build
npm run prisma:deploy
npx prisma validate
```

### 商家后台

```bash
cd apps/merchant-web
npm run dev
npm run build
```

### 微信小程序

```bash
node --test apps/customer-mp/tests/*.test.js
```

## 核心订单流程

普通计价订单：

```text
选择服务与地址
  → 服务端计价并创建订单
  → 用户支付
  → 商家接单
  → 骑手抢单
  → 到达取货
  → 配送中
  → 已完成
```

需要人工报价的订单：

```text
用户提交需求
  → 商家报价
  → 用户确认报价并支付
  → 商家接单
  → 骑手抢单与履约
```

订单状态由服务端状态机控制，不允许跳级、倒退或重复完成。

## 生产部署

正式部署目标为微信云托管：

- `city-flash-api`：NestJS API，容器端口 `3000`
- `city-flash-merchant`：商家后台静态站点，容器端口 `80`
- 数据库：微信云托管 MySQL 8.0
- 小程序：通过 `wx.cloud.callContainer` 访问 API

部署前至少需要配置：

- 微信云托管环境、API 服务和商家后台服务
- 正式小程序 AppID、AppSecret 与服务授权
- MySQL 连接、随机强 `JWT_SECRET` 和正式运营账号
- 腾讯地图 WebService Key
- 商家后台 HTTPS 来源与 API CORS
- 微信支付商户信息、APIv3 密钥、私钥、平台证书和回调地址（启用支付时）

生产环境必须关闭 Mock 登录、Mock 支付和运营账号自动初始化，禁止使用默认密钥。数据库迁移仅使用 `prisma migrate deploy`。

完整操作步骤、环境变量和 CI/CD 配置请阅读 [微信云托管部署说明](docs/deploy-wxcloud.md)。执行发布前可运行：

```bash
npm run release:check -- .env.cloud
```

## 常见问题

### 访问 `/api` 返回 404

这是正常现象，`/api` 是接口前缀而不是网页。请使用健康检查：

```text
http://127.0.0.1:3000/api/health
```

### 端口 3000 或 5173 被占用

```bash
npm run dev:stop
npm run start:dev
```

### 地图搜索没有真实结果

在 `server/api/.env` 中填写 `TENCENT_MAP_KEY`。未配置或地图服务不可用时，系统会使用本地建议和距离估算。

### 小程序请求不到 API

请依次确认：

1. `/api/health` 能正常访问
2. 本地调试地址或微信云托管环境 ID 配置正确
3. 微信开发者工具中的合法域名校验设置符合当前环境
4. 真机能够访问对应局域网地址，或已切换到云托管调用

### 骑手上线后看不到订单

检查骑手审核状态、位置权限、车型与资质、抢单半径、订单服务范围以及最大进行中任务数量。

## 安全与上线说明

- Mock 登录、Mock 支付和示例运营账号仅用于本地或测试环境
- 正式环境应关闭 Swagger，并使用明确的 HTTPS CORS 来源
- 地图、微信和支付密钥仅保存在服务端或云端密钥配置中
- 生产镜像建议使用完整 Git SHA 标识，不使用 `latest`
- MySQL 不应直接暴露到公网
- 上线前仍需完成备案、隐私合规、微信平台审核和真实设备验收

## 文档

- [微信云托管部署](docs/deploy-wxcloud.md)
- [小程序 CI 发布](deploy/miniprogram-ci.md)
- [商家后台说明](apps/merchant-web/README.md)
- [API 说明](server/api/README.md)

## License

本项目尚未声明开源许可证。未获得授权前，请勿将代码用于商业分发。
