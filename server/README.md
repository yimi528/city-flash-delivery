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
- `POST /api/rider/orders/:id/accept` 骑手接单
- `GET /api/coupons?userId=demo-user` 优惠券列表

## 数据库

默认数据库文件：`server/data/dev.db`

首次启动会自动建表和写入演示数据：

- `users` 用户
- `addresses` 地址
- `vehicle_types` 配送工具/车型
- `riders` 骑手
- `orders` 订单
- `order_status_logs` 订单状态日志
- `coupons` 优惠券

本地数据库文件已加入 `.gitignore`，不会提交到 Git。
