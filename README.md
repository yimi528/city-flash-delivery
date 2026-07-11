# 同城速送多端 MVP

这是一个参考“同城即时配送/跑腿下单”业务的多端 MVP，品牌与界面已改成自有名称“同城速送”。当前产品定位为“甲方单运营方自营同城配送平台”，不是多商家入驻平台。仓库已按主流 GitHub monorepo 方式拆分为用户端微信小程序、运营 Web 后台，共用同一个本地后端和订单数据库。骑手端暂时删除，后续需要时再恢复。

## 目录结构

```text
city-flash-delivery/
  apps/
    customer-mp/      # 用户端微信小程序
    merchant-web/     # 运营 Web 后台（当前保留目录名，后续可改为 operations-web）
    merchant-mp/      # 旧版商家小程序，暂保留为 legacy，不作为主入口
  packages/
    shared/           # 多端共享业务状态/角色约定
  server/             # Python + SQLite 后端 MVP；server/api 为 NestJS 正式后端骨架
  docs/               # UI 参考和产品资料
```

根目录 `project.config.json` 默认指向 `apps/customer-mp/`，方便直接导入根目录打开用户端。运营后台主入口为 React Web：`http://127.0.0.1:5173`。

## 多端职责

- 用户端 `apps/customer-mp/`：寄货、拼车、拉货、急送、帮取、帮买、搬运装卸、送货/送客、车型选择、地址定位、订单确认与查询。
- 运营后台 `apps/merchant-web/`：Web 订单工作台、全部订单状态同步、接单、开始取货、开始配送、完成订单、订单筛选。
- 后端 `server/`：用户、地址、车型、订单、运营后台、骑手预留、优惠券、订单状态流转接口。

## 如何运行

### 1. 启动正式后端

```bash
cd /Users/Admin1/Documents/Codex/2026-07-09/xian/server/api
/Applications/Docker.app/Contents/Resources/bin/docker compose up -d
npm install
npm run prisma:deploy
npm run start:dev
```

NestJS 后端接口地址：`http://127.0.0.1:3000/api`。

Swagger 文档：`http://127.0.0.1:3000/api/docs`。

### 2. 打开用户端

- 微信开发者工具选择“导入项目”。
- 项目目录选择仓库根目录：`/Users/Admin1/Documents/Codex/2026-07-09/xian`。
- 根目录 `project.config.json` 已配置 `miniprogramRoot: "apps/customer-mp/"`。

也可以直接导入：`apps/customer-mp/`。

### 3. 打开运营 Web 后台

- 确保 NestJS 后端已启动。
- 启动 React 运营后台：

```bash
cd /Users/Admin1/Documents/Codex/2026-07-09/xian/apps/merchant-web
npm install
npm run dev
```

- 浏览器打开：`http://127.0.0.1:5173`。
- 点击“运营登录”，默认运营账号为 `operator-demo`。

旧版商家小程序 `apps/merchant-mp/` 暂时保留用于对照，后续确认 Web 端稳定后可以删除。

## 腾讯地图配置

用户端默认保留本地模拟 POI，填入腾讯位置服务 WebService Key 后会切换为真实搜索、逆地址解析和距离矩阵。

在 `apps/customer-mp/app.js` 中填写：

```js
mapConfig: {
  tencentKey: '你的腾讯位置服务Key',
  defaultRegion: '宁德市',
  distanceMode: 'bicycling'
}
```

微信小程序后台的 request 合法域名需要加入：`https://apis.map.qq.com`。用户端 `app.json` 已声明定位权限。

## 当前功能

- 用户下单：八类服务、车型联动计价、地址搜索、天气自动判断、费用预估和帮买商品价拆分。
- 报价确认：搬运装卸先显示系统预估价，商家报价后必须由用户确认才能进入履约流程。
- 运营履约：Web 后台“全部订单”同步用户端状态，固定处理 `待接单 -> 已接单 -> 取货中 -> 配送中 -> 已完成`。
- 角色隔离：用户端使用 customer token，运营后台使用 merchant token，后端已阻止用户端直接访问后台接单接口。
- 接单规则：MVP 只保留固定配送流程，不做自定义接单；用户端不能手动推进订单状态。
- 后端同步：用户端和 React 运营 Web 后台通过同一个 NestJS 订单接口共享状态；运营后台每 5 秒自动刷新一次，也可手动刷新。

## 测试

```bash
cd /Users/Admin1/Documents/Codex/2026-07-09/xian
node --test apps/customer-mp/tests/service-flow.test.js

cd server/api
npm test -- --runInBand
npm run build
npm run lint
```

## 正式后端迁移方向

已新增 `server/api/` 作为下一阶段正式后端骨架，技术栈为：

```text
TypeScript + NestJS + Prisma + PostgreSQL/PostGIS + Redis + Swagger + Docker Compose
```

当前策略是渐进式迁移：保留 `server/app.py` 作为可演示 MVP 后端，同时在 `server/api/` 逐步补齐正式 API、Prisma 数据模型和 PostgreSQL/PostGIS 数据库。等 NestJS 覆盖完整“用户下单 -> 运营后台接单 -> 订单状态同步”闭环后，再删除 Python 后端。

NestJS 后端本地启动说明见：`server/api/README.md`。

## UI 参考素材

用户提供的页面参考图已整理到 `docs/reference-ui/`，用于后续 UI 对齐和版本追踪。当前产品界面继续使用自有品牌“同城速送”，不会在小程序内直接使用第三方品牌标识。

## 下一阶段建议

- 升级正式登录：微信 code2session、服务端签发 token、token 过期刷新。
- 增加路线规划地图展示：把当前距离估算升级为可视化配送路线。
- 接入微信支付：统一下单、支付回调、退款。
- 新增正式运营后台：订单、城市、价格规则、服务范围、优惠券配置。
- 接入订阅消息：待接单、已接单、配送中、已送达通知。
- 后续如重新需要骑手端，再恢复 `apps/rider-mp` 并接入骑手权限。
