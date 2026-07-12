# 同城速送 City Flash Delivery

“同城速送”是一个面向单一运营方的同城配送业务 Demo。项目包含用户端微信小程序、运营 Web 后台和 NestJS 后端，重点验证从用户下单、价格确认、运营接单到订单完成的完整业务闭环。

当前版本已经加入云端部署、后端报价、固定车型、独立骑手端和原子抢单基础能力；正式上线仍需配置真实云账号、备案域名、微信凭证、地图 Key 和支付证书。

## 产品定位

- 单一运营方统一接单和履约，不是多商家入驻平台。
- 用户下单前看到后端报价，客户端不能决定最终价格或车型。
- 拼车按单人票价和人数计费，返程目的地固定为福鼎。
- 搬运装卸先收固定上门费，可选配送再按驾车距离收费。
- 用户端、骑手端和运营后台共享同一套订单、报价和状态数据。

## 当前已实现功能

### 用户端微信小程序

首页将拼车、运货、搬家和搬运装卸排在最前，并继续提供其他同城服务：

| 服务 | 主要用途 | 默认推荐运力 |
| --- | --- | --- |
| 📦 寄货 | 文件、小件、固定线路寄送 | 小车 |
| 🚘 拼车 | 固定线路拼车 | 小车 |
| 🚚 运货 | 门店补货、大件或多件货物 | 货三轮车 |
| 🏠 搬家 | 住宅、宿舍或门店搬迁 | 厢式货车 |
| ⚡ 急送 | 一对一快速送达 | 二轮车 |
| 📥 帮取 | 代取快递或物品后送达 | 二轮车 |
| 🛍️ 帮买 | 代买商品并配送 | 二轮车 |
| 🏗️ 搬运装卸 | 搬家、搬店、装货、卸货 | 货三轮车或人力服务 |
| 🛺 送货/送客 | 短途送货或送客 | 人力三轮车 |

用户端当前支持：

- 起点、终点和地址簿选择。
- 腾讯地图地址搜索、逆地址解析和路线距离。
- 地图服务不可用时自动使用本地地址与直线距离估算。
- 每项业务展示后端配置的固定车型，用户不能切换。
- 拼车支持去程/返程和 1 至 6 人实时总价。
- Open-Meteo 未来三小时天气预报与恶劣天气自动判断。
- 帮买订单分别显示商品价格、配送价格和应付合计。
- 搬运装卸只要求上门地址；开启配送后才填写目的地并增加距离费。
- 订单列表、订单详情和状态自动同步。
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

### 独立骑手小程序

骑手端位于 `apps/rider-mp/`，支持微信登录、资料申请、上线定位、附近订单、原子抢单、导航、联系用户、确认到达、开始配送、完成、异常上报、历史订单和收入统计。实时网关尚未安装时使用 8 秒轮询兜底。

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

## 核心业务流程

### 普通配送订单

```text
选择服务和地址
  -> 系统计算路线与预估价格
  -> 用户选择车型并下单
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
    customer-mp/       用户端微信小程序
    merchant-web/      React 运营 Web 后台
    merchant-mp/       旧版商家小程序，仅保留对照
  server/
    api/               当前 NestJS + Prisma 主后端
    app.py             早期 Python MVP，暂时保留
  packages/shared/     多端共享状态约定
  docs/                UI 参考与产品资料
  project.config.json  微信开发者工具根项目配置
```

## 开发验证与云端运行

共享后端和数据库必须部署到云端。本地命令只用于代码检查、单元测试和构建，不作为开发、测试或生产服务。腾讯云部署步骤见 `deploy/README.md`。

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
WECHAT_LOGIN_MOCK_ENABLED=true
WECHAT_PAY_MOCK_ENABLED=true
OPERATOR_BOOTSTRAP_ENABLED=true
OPERATOR_BOOTSTRAP_USERNAME=operator-demo
OPERATOR_BOOTSTRAP_PASSWORD=demo123456
```

真实微信环境必须关闭 Mock，并配置小程序和微信支付 API v3 凭证：

```bash
WECHAT_MINI_APP_ID=小程序AppID
WECHAT_MINI_APP_SECRET=小程序AppSecret
WECHAT_LOGIN_MOCK_ENABLED=false
WECHAT_PAY_MOCK_ENABLED=false
WECHAT_PAY_MCH_ID=微信支付商户号
WECHAT_PAY_CERT_SERIAL=商户API证书序列号
WECHAT_PAY_PRIVATE_KEY_PATH=/绝对路径/apiclient_key.pem
WECHAT_PAY_API_V3_KEY=32字节APIv3Key
WECHAT_PAY_PLATFORM_CERT_SERIAL=微信支付平台证书序列号
WECHAT_PAY_PLATFORM_CERT_PATH=/绝对路径/wechatpay_platform.pem
WECHAT_PAY_NOTIFY_URL=https://你的域名/api/payments/wechat/notify
JWT_SECRET=高强度随机密钥
```

首次升级数据库后执行 `npm run prisma:deploy`。微信支付回调必须使用公网可访问的 HTTPS 地址，不能填写 `127.0.0.1`。

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

### 小程序业务和地图测试

```bash
node --test \
  apps/customer-mp/tests/service-flow.test.js \
  apps/customer-mp/tests/map-backend.test.js \
  apps/customer-mp/tests/auth-payment.test.js
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

该脚本会创建普通急送和搬运报价测试订单，完成报价确认与履约流程，并自动清理自己创建的数据。

## 推荐 Demo 演示方式

建议只演示两个场景，控制在 8 至 10 分钟：

1. 急送：选择地址、切换车型、观察价格变化，然后在运营后台依次接单、取货、配送和完成。
2. 搬运装卸：展示系统预估价、运营最终报价、用户确认，以及确认前禁止履约。

帮买功能可以用一句话说明“商品价格 + 配送价格 = 应付合计”。

## 当前边界

以下能力尚未达到正式生产标准：

- 微信登录、运营账号密码登录和微信支付 JSAPI 已完成代码接入；正式使用仍依赖有效微信凭证、HTTPS 域名和微信平台配置。
- 尚未接入退款、关单、账单下载和自动对账。
- 尚未接入微信订阅消息或短信通知。
- 运营后台打印小票目前为模拟操作。
- 已提供独立骑手端、云端 Compose、健康检查和 CI；真实云资源、HTTPS、监控和备份仍需使用甲方云账号创建。
- 服务车型和计价规则已有后端配置接口，运营后台当前主要提供订单调度和骑手审核，完整可视化配置页仍可继续扩展。
- WebSocket/Redis 实时发布器依赖安装因当前审批服务不可用未完成，骑手端暂以 8 秒轮询兜底；数据库原子抢单不受影响。
- 腾讯地图正式调用依赖有效 Key 和账号免费额度。

## 下一阶段建议

1. 配置正式微信凭证，部署测试环境 HTTPS API 并完成真机登录与支付联调。
2. 接入退款、关单、账单下载和自动对账。
3. 增加微信订阅消息，通知报价、接单、配送和完成状态。
4. 完善价格规则、服务范围和城市配置的可视化后台。
5. 接入订阅消息，通知报价、接单、配送和完成状态。
6. 安装并接入 WebSocket/Redis Outbox 发布器，将轮询降级为断线兜底。

## 安全说明

- `.env`、商户私钥、平台证书、数据库文件、构建产物和微信开发者私有配置均不得提交。
- 不要在 Issue、提交记录、截图或聊天中公开地图 Key、数据库密码和生产 Token。
- 正式环境应为腾讯地图 Key 配置服务器公网 IP 白名单，并为开发、测试和生产分别创建 Key。

## License

当前仓库未声明开源许可证，默认保留全部权利。对外发布或开放源代码前，请补充明确的许可证和第三方服务使用条款。
