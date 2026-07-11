# 后端 MVP

这是“同城速送”小程序的本地后端 MVP，使用 Python 标准库 + SQLite，不需要安装第三方依赖。

## 启动

```bash
cd /Users/Admin1/Documents/Codex/2026-07-09/xian/server
python3 app.py --host 127.0.0.1 --port 8000
```

启动后接口地址为：`http://127.0.0.1:8000/api`

运营 Web 后台地址：`http://127.0.0.1:8000/merchant/`

用户端小程序默认配置在 `apps/customer-mp/app.js`，运营 Web 后台在 `apps/merchant-web/app.js`：

```js
apiBaseUrl: 'http://127.0.0.1:8000/api',
useBackend: true
```

如果后端没有启动，用户端小程序会自动回退到本地演示数据；运营 Web 后台需要连接后端才能登录和同步订单。

## 测试

```bash
cd /Users/Admin1/Documents/Codex/2026-07-09/xian/server
python3 smoke_test.py
```

## 已有接口

- `GET /api/health` 健康检查
- `POST /api/auth/wechat-login` 模拟微信登录，返回用户和 mock token
- `POST /api/auth/merchant-login` 模拟运营登录，返回运营中心和 mock token
- `GET /api/users/:id` 用户详情
- `GET /api/addresses?userId=demo-user` 地址列表
- `POST /api/addresses` 新增地址
- `PUT /api/addresses/:id` 编辑地址
- `DELETE /api/addresses/:id` 删除地址
- `GET /api/vehicle-types` 车型/配送工具列表
- `POST /api/pricing/estimate` 费用预估
- `GET /api/orders?userId=demo-user` 订单列表
- `POST /api/orders` 创建订单
- `GET /api/orders/:id` 订单详情
- `PATCH /api/orders/:id/status` 更新订单状态
- `GET /api/coupons?userId=demo-user` 优惠券列表
- `GET /api/merchant/all-orders?merchantId=merchant-demo` 运营后台全部订单同步列表
- `GET /api/merchant/dashboard?merchantId=merchant-demo` 旧版帮买工作台预留
- `GET /api/merchant/orders?merchantId=merchant-demo` 旧版帮买订单列表预留
- `PATCH /api/merchant/orders/:id/status` 旧版帮买订单状态预留

### 配送工具

`GET /api/vehicle-types` 默认返回三类固定车型：

- `ebike` 二轮电动：适合文件、小件、饮料、鲜花蛋糕。
- `etrike` 三轮电动：适合大箱、多件包裹、小家电。
- `van` 面包车：适合搬家小件、家具家纺、批量货物。

前端帮送、帮取、送货都会把所选 `vehicleId` 带到计价和下单接口；当前不做用户自定义车型。

### 本地鉴权

除健康检查、费用预估、车型列表、登录接口外，接口会校验 `Authorization` mock token 和 `X-App-Role`：

```text
Authorization: Bearer mock-token:customer:demo-user
X-App-Role: customer

Authorization: Bearer mock-token:merchant:merchant-demo
X-App-Role: merchant
```

用户端只能访问自己的地址和订单，不能手动推进订单状态；运营 Web 后台可以查看全部订单并按固定配送流程更新订单状态。当前 token 是本地 MVP 格式，正式版需要替换成微信登录 code2session + 服务端签发 token，并按用户/运营/管理员角色拆权限。

### 帮买订单字段（暂时隐藏）

帮买入口当前通过前端功能开关隐藏，代码和后端字段暂不删除，方便后续确认垫付、退款、买不到商品处理规则后再开启。

`POST /api/orders` 创建“帮买”订单时可额外传：

```json
{
  "service": "帮买",
  "item": "咖啡奶茶",
  "buyItems": "帮我买两杯奶茶，一杯少糖一杯正常糖",
  "budget": 50,
  "purchaseAddressId": "a4",
  "dropoffAddressId": "a2"
}
```

返回订单会包含 `buyItems`、`productFee`、`deliveryFee` 和 `totalFee`。其中 `productFee` 是商品价格，`deliveryFee` 是配送费，`totalFee` 始终为商品价格 + 配送费；`budget` 和 `serviceFee` 作为旧客户端兼容字段继续返回。

### 运营后台状态流转

运营 Web 后台默认展示“全部订单”，用于和用户端订单状态同步；默认运营账号为 `merchant-demo`。配送订单状态流转：

```text
待接单 -> 已接单 -> 取货中 -> 配送中 -> 已完成
```

更新示例：

```bash
curl -X PATCH http://127.0.0.1:8000/api/orders/S订单号/status \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer mock-token:merchant:merchant-demo' \
  -H 'X-App-Role: merchant' \
  -d '{"status":"取货中"}'
```

### 骑手预留接口

骑手端前端已暂时删除，后端骑手相关函数可作为后续恢复骑手端时的预留能力；当前已纳入 mock token 角色校验。

## 数据库

默认数据库文件：`server/data/dev.db`

首次启动会自动建表和写入演示数据：

- `users` 用户
- `addresses` 地址
- `vehicle_types` 配送工具/车型
- `riders` 骑手
- `merchants` 运营中心/旧版商家预留
- `orders` 订单
- `order_status_logs` 订单状态日志
- `coupons` 优惠券

本地数据库文件已加入 `.gitignore`，不会提交到 Git。

## 地址经纬度字段

地址接口已支持腾讯地图搜索结果字段，方便小程序端保存定位和 POI：

```json
{
  "name": "宁德万达广场",
  "detail": "福建省宁德市蕉城区天湖东路 1 号",
  "latitude": 26.6659,
  "longitude": 119.5476,
  "city": "宁德市",
  "district": "蕉城区",
  "mapPoiId": "腾讯地图POI ID",
  "distanceKm": 2.4
}
```

后端仍以 `distanceKm` 参与计价；小程序端会优先用腾讯地图距离矩阵/本地直线估算生成该字段。
