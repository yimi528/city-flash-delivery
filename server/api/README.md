# NestJS API

This is the backend for the city flash delivery project. All customer, rider, operations, pricing, payment, and configuration flows use this NestJS + PostgreSQL/PostGIS + Redis service.

## Stack

- TypeScript + NestJS
- PostgreSQL + PostGIS
- Redis
- Prisma
- Swagger / OpenAPI
- Docker Compose

## Local Start

```bash
cd /Users/Admin1/Documents/Codex/2026-07-09/xian/server/api
cp .env.example .env
/Applications/Docker.app/Contents/Resources/bin/docker compose up -d
npm install
npm run prisma:generate
npm run prisma:deploy
npm run start:dev
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
- `orders`: create/list/detail/status APIs persisted with Prisma/PostgreSQL.
- `operations`: operator order list, quote, and status update endpoints.
- `pricing`: delivery price estimate using fixed vehicle rules.
- `maps`: server-side Tencent address search, reverse geocoding, route distance, and automatic bad-weather risk endpoints.
- `payments`: WeChat Pay API v3, callbacks, close, refund, bills, and reconciliation.
- `riders`: applications, review, availability, dispatch, lifecycle, and history.
- `health`: liveness and readiness checks.

## Unified customer and rider identity

The customer and rider roles now share the same `users` row. A customer submits a rider application from the customer mini program; an operator review transaction creates or activates the `RIDER` role assignment and the rider profile. Rejected applications do not affect customer access, and suspend/resign operations only disable rider capabilities.

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

`prisma/schema.prisma` stores latitude/longitude as decimals and reserves PostGIS columns with Prisma `Unsupported("geography(...)")` fields. The initial Prisma migration enables PostGIS extensions before creating tables. The SQL file `prisma/sql/001_enable_postgis.sql` also enables PostGIS when the Docker Postgres container first initializes.

Customer orders, operator quotes, and order status changes now write to PostgreSQL. `order_status_logs` stores the status timeline, while quote fields on `orders` keep pending/quoted state visible to the customer mini program and operations web.

The `搬运装卸` service now uses a server-side fixed base fee. A destination is optional; when delivery is enabled, Tencent Map driving distance adds the configured start and per-kilometer fee. Quotes expire after ten minutes and orders persist a price-rule snapshot. The legacy manual-quote fields and endpoints remain only for historical-order compatibility.

Buy-for-me orders persist `productFee` and `deliveryFee` separately. Their payable `totalFee` is always calculated as `productFee + deliveryFee`; the legacy `budget` and `serviceFee` response aliases remain available to older clients.

Bad-weather pricing should be system-driven, not user-selected. The mini program calls `GET /api/maps/weather-risk` on the order confirmation page and applies the returned `isBadWeather` result to the estimate. The endpoint reads forecast data by coordinate, applies keyword/weather-code/wind/rain thresholds, and supports `BAD_WEATHER_OVERRIDE=true|false` for local demos.

Set `TENCENT_MAP_KEY` in `.env` to enable real address suggestions, reverse geocoding, and route matrix distance. The key stays on the server; the mini program calls the NestJS map endpoints and falls back to local suggestions and straight-line distance when the provider is unavailable. `BAD_WEATHER_MULTIPLIER` defaults to `1.15`.

Core delivery flow:

```text
PENDING -> ACCEPTED -> PICKING_UP -> DELIVERING -> COMPLETED
```

These map to the user-facing statuses:

```text
待接单 -> 已接单 -> 取货中 -> 配送中 -> 已完成
```
