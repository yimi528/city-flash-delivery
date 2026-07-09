# 后端 MVP

这是“同城速送”小程序的本地后端 MVP，使用 Python 标准库 + SQLite，不需要安装第三方依赖。

## 启动

```bash
cd /Users/Admin1/Documents/Codex/2026-07-09/xian/server
python3 app.py --host 127.0.0.1 --port 8000
```

启动后接口地址为：`http://127.0.0.1:8000/api`

小程序端默认配置在 `app.js`：

```js
apiBaseUrl: 'http://127.0.0.1:8000/api',
useBackend: true
```

如果后端没有启动，小程序会自动回退到本地模拟下单。

## 测试

```bash
cd /Users/Admin1/Documents/Codex/2026-07-09/xian/server
python3 smoke_test.py
```

## 已有接口

- `GET /api/health` 健康检查
- `POST /api/auth/wechat-login` 模拟微信登录，返回用户和 mock token
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
- `GET /api/rider/dashboard?riderId=rider-1` 骑手工作台
- `GET /api/rider/orders?riderId=rider-1` 骑手订单池
- `POST /api/rider/orders/:id/accept` 骑手接单
- `PATCH /api/rider/orders/:id/status` 骑手更新状态
- `GET /api/coupons?userId=demo-user` 优惠券列表
- `GET /api/merchant/dashboard?merchantId=merchant-demo` 商家工作台
- `GET /api/merchant/orders?merchantId=merchant-demo` 商家订单列表
- `PATCH /api/merchant/orders/:id/status` 更新商家订单状态

### 帮买订单字段

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

返回订单会包含 `buyItems`、`budget`、`purchaseAddressName`、`serviceFee` 和 `fee`。其中 `serviceFee` 是跑腿服务费，`fee` 是商品预算 + 跑腿服务费的预估合计。

### 商家端状态流转

商家端 MVP 面向帮买订单，默认门店为 `merchant-demo`。状态流转：

```text
待接单 -> 备货中 -> 待骑手取货 -> 已交付
```

更新示例：

```bash
curl -X PATCH http://127.0.0.1:8000/api/merchant/orders/S订单号/status \
  -H 'Content-Type: application/json' \
  -d '{"status":"备货中"}'
```

### 骑手端状态流转

骑手端默认账号为 `rider-1`。普通帮送/送货订单可直接进入骑手订单池；帮买订单需要商家先流转到 `待骑手取货` 后才会进入骑手订单池。状态流转：

```text
可接单 -> 待取货 -> 配送中 -> 已完成
```

更新示例：

```bash
curl -X POST http://127.0.0.1:8000/api/rider/orders/S订单号/accept \
  -H 'Content-Type: application/json' \
  -d '{"riderId":"rider-1"}'

curl -X PATCH http://127.0.0.1:8000/api/rider/orders/S订单号/status \
  -H 'Content-Type: application/json' \
  -d '{"riderId":"rider-1","action":"pickup"}'

curl -X PATCH http://127.0.0.1:8000/api/rider/orders/S订单号/status \
  -H 'Content-Type: application/json' \
  -d '{"riderId":"rider-1","action":"complete"}'
```

## 数据库

默认数据库文件：`server/data/dev.db`

首次启动会自动建表和写入演示数据：

- `users` 用户
- `addresses` 地址
- `vehicle_types` 配送工具/车型
- `riders` 骑手
- `merchants` 商家/门店
- `orders` 订单
- `order_status_logs` 订单状态日志
- `coupons` 优惠券

本地数据库文件已加入 `.gitignore`，不会提交到 Git。
