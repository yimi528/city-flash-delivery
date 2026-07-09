# 同城速送多端 MVP

这是一个参考“同城即时配送/跑腿下单”业务的小程序 MVP，品牌与界面已改成自有名称“同城速送”。仓库已按主流 GitHub monorepo 方式拆分为用户端、商家端两个独立微信小程序，共用同一个本地后端和订单数据库。骑手端暂时删除，后续需要时再恢复。

## 目录结构

```text
city-flash-delivery/
  apps/
    customer-mp/      # 用户端微信小程序
    merchant-mp/      # 商家端微信小程序
  packages/
    shared/           # 多端共享业务状态/角色约定
  server/             # Python + SQLite 后端 MVP
  docs/               # UI 参考和产品资料
```

根目录 `project.config.json` 默认指向 `apps/customer-mp/`，方便直接导入根目录打开用户端。商家端可单独导入自己的 app 目录。

## 多端职责

- 用户端 `apps/customer-mp/`：首页下单、取送饮料/文件/数码、全城帮买、送货车型、地址定位搜索、确认订单、订单列表、消息、我的。
- 商家端 `apps/merchant-mp/`：门店工作台、帮买订单接单、备货完成、交付骑手、商品售罄管理、商家模式订单详情。
- 后端 `server/`：用户、地址、车型、订单、商家、骑手、优惠券、订单状态流转接口。

## 如何运行

### 1. 启动后端

```bash
cd /Users/Admin1/Documents/Codex/2026-07-09/xian/server
python3 app.py --host 127.0.0.1 --port 8000
```

后端接口地址：`http://127.0.0.1:8000/api`。

### 2. 打开用户端

- 微信开发者工具选择“导入项目”。
- 项目目录选择仓库根目录：`/Users/Admin1/Documents/Codex/2026-07-09/xian`。
- 根目录 `project.config.json` 已配置 `miniprogramRoot: "apps/customer-mp/"`。

也可以直接导入：`apps/customer-mp/`。

### 3. 打开商家端

- 新开一个微信开发者工具项目。
- 项目目录选择：`/Users/Admin1/Documents/Codex/2026-07-09/xian/apps/merchant-mp`。
- 默认门店账号：`merchant-demo`。

正式上线建议用户端和商家端使用独立 AppID；当前 MVP 可先共用测试 AppID 验证流程。

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

- 用户下单：帮送、帮取、送货、帮买、快捷服务、车型选择、地址搜索、费用预估。
- 商家履约：帮买订单 `待接单 -> 备货中 -> 待骑手取货 -> 已交付`。
- 角色隔离：用户端使用 customer token，商家端使用 merchant token，后端已阻止用户端直接访问商家工作台/接单接口。
- 接单规则：MVP 只保留固定接单/备货流程，不做自定义接单；用户端不能手动推进订单状态。
- 后端同步：用户端和商家端通过同一个 `server/` 的订单接口共享状态，后端未启动时各端会使用本地演示数据。

## 测试

```bash
cd /Users/Admin1/Documents/Codex/2026-07-09/xian
node work/test-miniapp-flow.js
python3 server/smoke_test.py
```

## UI 参考素材

用户提供的页面参考图已整理到 `docs/reference-ui/`，用于后续 UI 对齐和版本追踪。当前产品界面继续使用自有品牌“同城速送”，不会在小程序内直接使用第三方品牌标识。

## 下一阶段建议

- 升级正式登录：微信 code2session、服务端签发 token、token 过期刷新。
- 增加路线规划地图展示：把当前距离估算升级为可视化配送路线。
- 接入微信支付：统一下单、支付回调、退款。
- 新增平台管理后台：订单、商家、城市、价格规则、优惠券配置。
- 接入订阅消息：待接单、已接单、配送中、已送达通知。
- 后续如重新需要骑手端，再恢复 `apps/rider-mp` 并接入骑手权限。
