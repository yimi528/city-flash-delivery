# NestJS API

This is the backend for the city flash delivery project. All customer, rider, operations, pricing, payment, and configuration flows use this NestJS + MySQL 8.0 GIS service.

## Stack

- TypeScript + NestJS
- MySQL 8.0 + GIS
- Prisma
- Swagger / OpenAPI
- Docker Compose（仅用于本地 MySQL）

## Local Start

```bash
# 在仓库根目录执行
cp server/api/.env.example server/api/.env
npm --prefix server/api ci
(cd server/api && docker compose up -d --wait)
npm --prefix server/api run prisma:generate
npm --prefix server/api run prisma:deploy
npm --prefix server/api run start:dev
```

API base after startup:

```text
http://127.0.0.1:3000/api
```

Swagger docs:

```text
http://127.0.0.1:3000/api/docs
```

Health check:

```text
http://127.0.0.1:3000/api/health
```

If startup reports `EADDRINUSE` for port `3000`, another API instance is already running. Keep that instance and verify it with the health-check URL instead of starting a second copy.

## Current Scope

The production API includes:

- `auth`: WeChat/customer login, operator login, and role switching.
- `users`: customer profile and account roles.
- `addresses`: persisted customer address book.
- `orders`: create/list/detail/status APIs persisted with Prisma/MySQL.
- `operations`: operator order list, quote, and status update endpoints.
- `pricing`: delivery price estimate using fixed vehicle rules.
- `maps`: server-side Tencent address search, reverse geocoding, route distance, and automatic bad-weather risk endpoints.
- `payments`: WeChat Pay API v3, callbacks, close, refund, bills, and reconciliation.
- `riders`: applications, review, availability, dispatch, lifecycle, and history.
- `health`: liveness and readiness checks.

## Unified customer and rider identity

The customer and rider roles now share the same `users` row. A customer submits a rider application from the customer mini program; an operator review transaction creates or activates the `RIDER` role assignment and the rider profile. Rejected applications do not affect customer access, and suspend/resign operations only disable rider capabilities.

Customer sessions use the identity injected by WeChat Cloud Hosting when the mini program calls the API through `wx.cloud.callContainer` (`x-wx-openid`/`x-wx-unionid`). Local development requests that go directly to the API fall back to `wx.login` and `jscode2session`. The returned UnionID is persisted when the Mini Program is bound to a WeChat Open Platform account, while customer and rider tokens remain separate so switching back to customer mode does not end an active rider shift.

The operations web app uses username + strong password authentication. Passwords are stored with salted scrypt hashes, and five consecutive failures lock the account for 15 minutes. Customer and rider credentials cannot be used to enter the operations console.

New endpoints:

- `GET /api/v1/account/roles`
- `POST /api/v1/account/switch-role`
- `POST /api/v1/rider/applications`
- `GET /api/v1/rider/applications/current`
- `POST /api/operations/riders/:id/review`
- `GET /api/operations/riders`
- `POST /api/operations/riders/:id/suspend|restore|resign`

Apply the Prisma migration before using the new flow:

```bash
npm run prisma:deploy
```

## Database Notes

`prisma/schema.prisma` stores latitude/longitude as decimals and keeps MySQL GIS columns as Prisma `Unsupported("point")`/`Unsupported("polygon")` fields. Service-area boundaries are written with `ST_GeomFromGeoJSON` and checked with MySQL `ST_Intersects`; the historical PostgreSQL migrations are archived under `prisma/migrations-postgresql-archive/` and are not executed.

Customer orders, operator quotes, and order status changes now write to MySQL. `order_status_logs` stores the status timeline, while quote fields on `orders` keep pending/quoted state visible to the customer mini program and operations web.

The `搬运装卸` service uses a merchant-quote workflow. The customer submits the on-site service address without a destination or upfront payment; the merchant enters the final quote, the customer confirms it, and payment is then enabled. Quote records expire after ten minutes and orders persist the pricing-rule snapshot. The zero-value estimate is intentional and does not represent a fixed base fee.

Buy-for-me orders persist `productFee` and `deliveryFee` separately. Their payable `totalFee` is always calculated as `productFee + deliveryFee`; the legacy `budget` and `serviceFee` response aliases remain available to older clients.

Bad-weather pricing should be system-driven, not user-selected. The mini program calls `GET /api/maps/weather-risk` on the order confirmation page and applies the returned `isBadWeather` result to the estimate. With a valid `TENCENT_MAP_KEY`, the endpoint queries Tencent weather by the delivery coordinates for hourly data and alerts, normalizes the response, and applies keyword/wind/rain thresholds. Open-Meteo remains an availability fallback for local development. Set `WEATHER_MOCK_ENABLED=true` for a temporary deterministic normal-weather demo; it skips all weather providers and never adds a weather fee. `BAD_WEATHER_OVERRIDE=true|false` is supported for local demos.

Set `TENCENT_MAP_KEY` in `.env` to enable real address suggestions, reverse geocoding, route matrix distance, and Tencent weather. The key stays on the server; the mini program calls the NestJS map endpoints and falls back to local suggestions and straight-line distance when the provider is unavailable. Published distance-weather rules use a fixed 5 yuan bad-weather surcharge.

Core delivery flow:

```text
PENDING -> ACCEPTED -> PICKING_UP -> DELIVERING -> COMPLETED
```

These map to the user-facing statuses:

```text
待接单 -> 已接单 -> 取货中 -> 配送中 -> 已完成
```
