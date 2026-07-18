# 同城速送 City Flash Delivery

“同城速送”是一个面向单一运营方的同城配送业务 Demo。项目包含用户端微信小程序、运营 Web 后台和 NestJS 后端，重点验证从用户下单、价格确认、运营接单到订单完成的完整业务闭环。

当前版本已经加入云端部署、后端报价、固定车型、同小程序骑手模式和原子抢单基础能力，并完成首页、地址、订单与骑手工作台的新一轮体验优化。项目处于“核心功能验收 + 生产部署准备”阶段，尚未达到正式上线状态。

## 项目进度（2026-07-18）

### 本轮已完成

- 首页核心服务顺序固定为“拼车、寄货、运货、搬运装卸”，不再被后端旧排序覆盖；主按钮文案已统一为“去下单”。
- 拼车改为先选择“苍南线/温州线”，再填写对应区域内的详细地址；切换线路时清理旧地址，避免线路与地址不一致。
- 所有地址选择流程支持地图搜索后补充联系人、手机号和门牌详情，也支持直接手动新增、编辑和保存地址。
- 地址簿增加使用次数和最近使用时间，客户端与后端共同记录，地址页优先展示“你常去的”。
- 用户订单页按业务顺序整理为“待接单、报价中、待支付、进行中、已完成、已取消”，增加数量、状态说明和路线摘要。
- 骑手抢单大厅和任务页重新设计信息层级，突出上线状态、任务阶段、路线和主要操作。
- 个人中心精简为真实可用入口，增加订单数、常用地址数、平台资质、隐私政策和服务条款页面。
- 后端增加地址使用记录接口、手机号校验、下单联系人校验及对应 Prisma 迁移与自动化测试。

### 环境与上线准备

- Sealos 生产 PostgreSQL 和 Redis 已创建，连接信息已写入本机 Git 忽略的生产环境文件，未提交任何密码或密钥。
- 当前 Sealos 工作区资源处于暂停状态，需要恢复余额并启动数据库、Redis 和应用后才能进行云端联调。
- 微信登录和微信支付均支持开发 Mock；未注册微信支付商户号时可完整测试下单与模拟支付，但不能真实扣款、退款或对账。
- 用户小程序正式发布前仍需要一个稳定的 HTTPS API 域名并配置为微信 request 合法域名。
- 商家后台仅供单一运营者使用，暂不强制购买独立域名，可使用受保护的 Sealos HTTPS 地址或与 API 共用域名路径。

### 当前完成度判断

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 用户端核心下单 | 已实现，待真机回归 | 八项服务、地址、报价、订单状态已具备 |
| 拼车线路与地址 | 已实现，待地图真机联调 | 苍南/温州先选线路再填地址 |
| 地址簿与常用推荐 | 已实现，待迁移验证 | 本地降级与后端持久化均已覆盖 |
| 用户订单中心 | 已重新设计 | 状态顺序和分组已按用户决策流程整理 |
| 骑手工作台 | 已重新设计，待真实履约压测 | 原子抢单可用，实时通知仍以轮询兜底 |
| 运营后台 | 核心调度可用 | 仍可继续补充价格与服务范围配置页面 |
| 微信登录 | 代码已接入 | 正式环境需配置并验证小程序凭证 |
| 微信支付 | Mock 可用 | 真实支付需商户号、APIv3 密钥和证书 |
| Sealos 生产环境 | 资源已创建，当前暂停 | 恢复资源后执行迁移、部署和健康检查 |
| 正式上线 | 未完成 | 还需 HTTPS 域名、备案/平台配置、监控备份和整体验收 |

## 产品定位

- 单一运营方统一接单和履约，不是多商家入驻平台。
- 用户下单前看到后端报价，客户端不能决定最终价格或车型。
- 拼车按单人票价和人数计费，返程目的地固定为福鼎。
- 搬运装卸先收固定上门费，可选配送再按驾车距离收费。
- 用户端、骑手端和运营后台共享同一套订单、报价和状态数据。

## 当前已实现功能

### 用户端微信小程序

首页提供八项同城服务，搬家、搬店、装货和卸货统一从“搬运装卸”进入：

| 服务 | 主要用途 | 默认推荐运力 |
| --- | --- | --- |
| 🚘 拼车 | 苍南/温州至福鼎固定线路拼车 | 7 座商务车 |
| 📦 寄货 | 文件、小件、固定线路寄送 | 小车 |
| 🚚 运货 | 门店补货、大件或多件货物 | 货三轮车 |
| 🏗️ 搬运装卸 | 搬家、搬店、装货、卸货 | 货三轮车或人力服务 |
| ⚡ 急送 | 一对一快速送达 | 二轮车 |
| 📥 帮取 | 代取快递或物品后送达 | 二轮车 |
| 🛍️ 帮买 | 代买商品并配送 | 二轮车 |
| 🛺 送货/送客 | 短途送货或送客 | 人力三轮车 |

用户端当前支持：

- 起点、终点支持地图搜索、手动填写、保存和地址簿选择。
- 根据使用次数和最近使用时间推荐“你常去的”地址。
- 腾讯地图地址搜索、逆地址解析和路线距离。
- 地图服务不可用时自动使用本地地址与直线距离估算。
- 每项业务展示后端配置的固定车型，用户不能切换。
- 拼车支持先选苍南/温州线路，再填写对应区域地址，并支持去程/返程和 1 至 6 人实时总价。
- Open-Meteo 未来三小时天气预报与恶劣天气自动判断。
- 帮买订单分别显示商品价格、配送价格和应付合计。
- 搬运装卸只要求上门地址；开启配送后才填写目的地并增加距离费。
- 订单列表按待接单、报价中、待支付、进行中、已完成、已取消的顺序展示，订单详情和状态自动同步。
- 已完成订单保持终态，不能重复履约。

### 运营 Web 后台

运营后台地址默认为 `http://127.0.0.1:5173`，当前支持：

- 运营账号登录占位流程，默认账号为 `operator-demo`。
- 全部订单列表、状态筛选和今日订单统计。
- 查看服务、车型、距离、地址和价格信息。
- 为搬运装卸订单填写最终报价和报价说明。
- 等待用户接受报价，确认前不能进入履约。
- 按固定顺序执行接单、取货、配送和完成。
- 已完成、已取消订单显示明确终态。
- 模拟打印小票。
- 审核骑手申请、车型和搬运资格。

### 小程序内骑手模式

骑手工作台位于 `apps/customer-mp/pages/rider/`，与用户端共用同一个小程序 AppID。用户审核通过后可在个人中心切换到骑手模式，无需再次微信登录；用户 token 与骑手 token 分开保存。骑手模式支持上线定位、附近订单、原子抢单、导航、联系用户、确认到达、开始配送、完成、异常上报、历史订单和收入统计。上线后每 30 秒发送一次心跳并刷新前台位置，心跳超时后后端自动下线骑手；实时网关尚未安装时使用 8 秒轮询兜底。

### NestJS 后端

正式 Demo 主后端位于 `server/api/`，当前支持：

- PostgreSQL + Prisma 持久化用户、订单、车型和状态日志。
- 用户订单创建、列表、详情和状态查询。
- 运营订单列表、报价和履约状态更新。
- 报价确认、报价拒绝和重新报价规则。
- 禁止订单跨级、倒退或在终态后重复更新。
- 帮买商品费与配送费分开存储。
- 腾讯地图 WebService 服务端代理，避免在小程序中暴露 Key。
- Open-Meteo 天气预报和恶劣天气规则判断。
- Swagger API 文档和健康检查接口。

### 统一账号与骑手身份

当前账号模型已支持“一个用户账号、多个业务身份”：微信登录先创建/复用 `User`，用户在个人中心提交骑手申请，运营审核通过后通过 `UserRoleAssignment` 增加 `RIDER` 身份，不会创建第二个用户账号。骑手申请历史、审核人、审核时间、拒绝原因和状态变更日志均保留。

- 用户端：`/api/v1/account/roles`、`/api/v1/account/switch-role`、`/api/v1/rider/applications`。
- 运营端：`/api/operations/riders/applications`、`/api/operations/riders` 及审核、暂停、恢复、离职接口。
- 骑手角色状态与工作状态分离；服务端会在每次骑手接口调用时校验当前状态，旧 Token 不能绕过暂停或离职。
- 数据库迁移：`server/api/prisma/migrations/20260713170000_unified_customer_rider_identity/`。

## 核心业务流程

### 普通配送订单

```text
选择服务和地址
  -> 系统计算路线与预估价格
  -> 系统匹配固定车型并下单
  -> 运营接单
  -> 取货中
  -> 配送中
  -> 已完成
```

状态必须按以下顺序推进：

```text
待接单 -> 已接单 -> 取货中 -> 配送中 -> 已完成
```

### 搬运装卸订单

```text
填写上门服务地址
  -> 固定上门服务费
  -> 可选“需要配送”
  -> 后端按腾讯地图驾车距离增加配送费
  -> 用户确认后支付
```

后端报价保留 10 分钟并保存计价规则版本，历史订单不随配置变化。

## 当前定价模型

以下是基础参考规则，最终价格还会受到服务类型、固定线路、服务附加费和天气规则影响：

| 运力 | 起步价 | 超出 4 公里 | 配送费上限 |
| --- | ---: | ---: | ---: |
| 🛵 二轮车 | 10 元 | 1.6 元/公里 | 68 元 |
| 🛺 人力三轮车 | 15 元 | 2 元/公里 | 88 元 |
| 🛻 货三轮车 | 28 元 | 2.8 元/公里 | 138 元 |
| 🚗 小车 | 35 元 | 3.2 元/公里 | 168 元 |
| 👷 人力服务 | 38 元 | 按需求报价 | 88 元 |

- 急送、帮买、拉货和搬运装卸会增加对应的小额服务费。
- 寄货和拼车使用固定线路基础价，并根据所选车型计算。
- 恶劣天气由系统判断，当前默认倍率为 `1.15`。
- 长距离订单使用配送费封顶，并在费用明细中显示封顶优惠。

## 技术架构

```text
微信小程序 apps/customer-mp
            |
            | HTTP API
            v
NestJS server/api ---------------- React 运营后台 apps/merchant-web
      |                                      |
      v                                      |
PostgreSQL + Prisma <------------------------+
      |
      +-- 腾讯地图 WebService
      +-- Open-Meteo 天气预报
```

主要技术：

- 用户端：微信原生小程序。
- 运营后台：React、TypeScript、Vite。
- 后端：NestJS、TypeScript、Prisma。
- 数据库：PostgreSQL、PostGIS。
- 本地环境：Docker Compose。

## 项目结构

```text
city-flash-delivery/
  apps/
    customer-mp/       用户端与骑手模式共用的微信小程序
    merchant-web/      React 运营 Web 后台
  server/
    api/               当前 NestJS + Prisma 主后端
    app.py             早期 Python MVP，暂时保留
  packages/shared/     多端共享状态约定
  docs/                UI 参考与产品资料
  project.config.json  微信开发者工具根项目配置
```

## 本地一键启动

首次运行前只需安装 Node.js 20+ 和 Docker Desktop，并确保 Docker Desktop 已打开。在仓库根目录执行：

```bash
npm run dev
```

脚本会自动创建本地 `.env`、安装缺失依赖、启动 PostgreSQL/Redis、迁移数据库、构建并启动 API 和运营后台。启动完成后访问：

- 运营后台：`http://127.0.0.1:5173`
- 后端 API：`http://127.0.0.1:3000/api`
- Swagger：`http://127.0.0.1:3000/api/docs`

停止全部本地服务：

```bash
npm run dev:stop
```

macOS 也可直接双击根目录的 `启动开发环境.command` 和 `停止开发环境.command`。小程序仍需用微信开发者工具导入仓库根目录。

如果更喜欢按钮操作，可双击根目录的 `打开启停控制台.command`。浏览器会打开一个仅限本机访问的控制页面，提供“一键启动”“一键停机”、运行状态和实时日志；无需安装 macOS App。

### 手动启动与云端运行

以下命令适合需要分别观察服务日志时使用。腾讯云生产部署步骤见 `deploy/README.md`。

### 环境要求

- Node.js 20 或更高版本。
- Docker Desktop。
- 微信开发者工具。
- 腾讯位置服务 WebService Key，未配置时使用地图降级数据。

### 1. 启动数据库和后端

```bash
cd server/api
cp .env.example .env
npm install
docker compose up -d
npm run prisma:generate
npm run prisma:deploy
npm run start:dev
```

后端启动后：

- API：`http://127.0.0.1:3000/api`
- Swagger：`http://127.0.0.1:3000/api/docs`
- 健康检查：`http://127.0.0.1:3000/api/health`
- 如果看到 `EADDRINUSE: address already in use 0.0.0.0:3000`，说明已有 API 实例在运行，不要重复启动；直接用健康检查确认即可。

### 2. 配置地图和天气

在 `server/api/.env` 中填写：

```bash
TENCENT_MAP_KEY=你的腾讯位置服务WebServiceKey
BAD_WEATHER_MULTIPLIER=1.15
```

真实 Key 只能放在 `.env` 中，不要写入小程序代码或提交到 GitHub。修改后需要重启 NestJS 后端。

### 3. 配置登录和微信支付

开发环境可在 `server/api/.env` 中显式开启登录与支付 Mock：

```bash
APP_RELEASE_STAGE=testing
WECHAT_LOGIN_MOCK_ENABLED=true
WECHAT_PAY_MODE=mock
WECHAT_PAY_MOCK_ENABLED=true
OPERATOR_BOOTSTRAP_ENABLED=true
OPERATOR_BOOTSTRAP_USERNAME=operator-demo
OPERATOR_BOOTSTRAP_PASSWORD=demo123456
```

没有微信支付商户号时，测试部署默认使用 `APP_RELEASE_STAGE=testing` 和 `WECHAT_PAY_MODE=mock`。测试支付会明确显示“测试支付成功”，不会向微信发起扣款，也不会启用微信账单对账。模拟支付不能用于公开生产发布。

如果暂时不需要在线支付，公开发布前应切换为：

```bash
APP_RELEASE_STAGE=production
WECHAT_PAY_MODE=disabled
WECHAT_PAY_MOCK_ENABLED=false
WECHAT_PAY_AUTO_RECONCILIATION_ENABLED=false
```

注册微信支付商户号后，再切换到真实支付并配置 API v3 凭证：

```bash
APP_RELEASE_STAGE=production
WECHAT_MINI_APP_ID=小程序AppID
WECHAT_MINI_APP_SECRET=小程序AppSecret
WECHAT_LOGIN_MOCK_ENABLED=false
WECHAT_PAY_MODE=wechat
WECHAT_PAY_MOCK_ENABLED=false
WECHAT_PAY_MCH_ID=微信支付商户号
WECHAT_PAY_CERT_SERIAL=商户API证书序列号
WECHAT_PAY_PRIVATE_KEY_PATH=/绝对路径/apiclient_key.pem
WECHAT_PAY_API_V3_KEY=32字节APIv3Key
WECHAT_PAY_PLATFORM_CERT_SERIAL=微信支付平台证书序列号
WECHAT_PAY_PLATFORM_CERT_PATH=/绝对路径/wechatpay_platform.pem
WECHAT_PAY_NOTIFY_URL=https://你的域名/api/payments/wechat/notify
WECHAT_PAY_REFUND_NOTIFY_URL=https://你的域名/api/payments/wechat/refund-notify
WECHAT_PAY_AUTO_RECONCILIATION_ENABLED=true
JWT_SECRET=高强度随机密钥
```

开启自动对账后，API 会在每天 UTC 03:30 下载前一日微信交易账单并将匹配、金额不一致、退款不一致和本地缺失订单写入对账表；也可以通过运营端接口手动补跑指定日期。

首次升级数据库后执行 `npm run prisma:deploy`。微信支付回调必须使用公网可访问的 HTTPS 地址，不能填写 `127.0.0.1`。

商家后台域名是可选项：只有小程序 API 必须配置稳定的 HTTPS 域名。商家后台可以使用 Sealos 分配的 HTTPS 地址；如果需要浏览器访问 API，将该完整来源填写到 `CORS_ORIGINS`。不提供商家后台时可将 `CORS_ORIGINS` 留空，服务端会默认关闭浏览器跨域访问。

配置运营账号和密码后，可创建或重置商家账号：

```bash
cd server/api
npm run operator:create
```

### 4. 启动运营后台

```bash
cd apps/merchant-web
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:5173`，点击“运营登录”。

### 5. 打开用户端

在微信开发者工具中导入仓库根目录。根目录 `project.config.json` 已设置：

```json
{
  "miniprogramRoot": "apps/customer-mp/"
}
```

本地开发使用 `http://127.0.0.1:3000/api`。真机或正式发布时需要部署 HTTPS API，并在微信公众平台配置 request 合法域名。

## 测试与验收

在仓库根目录执行完整 MVP 检查：

```bash
npm run test:mvp
npm run test:start-stop
npm run test:security
npm run test:containers
```

`test:mvp` 覆盖小程序业务与语法、后端单元测试/代码检查/构建/Prisma 校验和运营后台生产构建；`test:start-stop` 实际验证一键启停；`test:security` 检查生产依赖漏洞；`test:containers` 构建三个生产镜像并校验运行配置。启动本地环境后还可执行 `RUN_LIVE=1 npm run test:mvp`，加入真实数据库 API 履约流程。

### 小程序业务和地图测试

```bash
node --test apps/customer-mp/tests/*.test.js
```

### NestJS 测试和代码检查

```bash
cd server/api
npm test -- --runInBand
npm run build
npm run lint
npx prisma validate
```

### 真实 API 履约验收

确保 PostgreSQL 和 NestJS 已启动后运行：

```bash
cd server/api
npm run test:live
```

该脚本会创建普通急送订单，并先通过 `/api/v1/quotes/handling` 获取搬运后端报价，再用报价创建订单、支付和完成履约；脚本结束后会自动清理自己创建的数据。请始终在 `server/api` 目录执行，否则 Prisma 找不到 `prisma/schema.prisma`。

## 推荐 Demo 演示方式

建议只演示两个场景，控制在 8 至 10 分钟：

1. 急送：选择地址、切换车型、观察价格变化，然后在运营后台依次接单、取货、配送和完成。
2. 搬运装卸：展示先获取后端报价、再创建订单、支付，以及支付前禁止履约。

帮买功能可以用一句话说明“商品价格 + 配送价格 = 应付合计”。

## 当前边界

以下能力尚未达到正式生产标准：

- 微信登录、运营账号密码登录和微信支付 JSAPI 已完成代码接入；测试阶段默认使用安全模拟支付，公开发布时必须切换为关闭在线支付或真实微信支付。
- 退款、关单、交易账单下载和自动对账代码已接入；正式上线前必须用真实商户号完成小额支付、退款回调与账单联调。
- 尚未接入微信订阅消息或短信通知。
- 运营后台打印小票目前为模拟操作。
- 已提供同小程序骑手模式、云端 Compose、健康检查和 CI；真实云资源、HTTPS、监控和备份仍需使用甲方云账号创建。
- 服务车型和计价规则已有后端配置接口，运营后台当前主要提供订单调度和骑手审核，完整可视化配置页仍可继续扩展。
- WebSocket/Redis 实时发布器依赖安装因当前审批服务不可用未完成，骑手端暂以 8 秒轮询兜底；数据库原子抢单不受影响。
- 骑手模式暂未启用微信后台定位和订阅消息；切到后台会停止心跳，回到前台先重新校验在线状态。正式启用前需完成隐私协议、类目和订阅消息模板审核。
- 腾讯地图正式调用依赖有效 Key 和账号免费额度。

## 下一阶段建议

1. 配置正式微信凭证，部署测试环境 HTTPS API 并完成真机登录与支付联调。
2. 使用真实微信商户环境完成支付、关单、退款和自动对账联调。
3. 增加微信订阅消息，通知报价、接单、配送和完成状态。
4. 完善价格规则、服务范围和城市配置的可视化后台。
5. 安装并接入 WebSocket/Redis Outbox 发布器，将轮询降级为断线兜底。

## 安全说明

- `.env`、商户私钥、平台证书、数据库文件、构建产物和微信开发者私有配置均不得提交。
- 不要在 Issue、提交记录、截图或聊天中公开地图 Key、数据库密码和生产 Token。
- 正式环境应为腾讯地图 Key 配置服务器公网 IP 白名单，并为开发、测试和生产分别创建 Key。

## License

当前仓库未声明开源许可证，默认保留全部权利。对外发布或开放源代码前，请补充明确的许可证和第三方服务使用条款。
