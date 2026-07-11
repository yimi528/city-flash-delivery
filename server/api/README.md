# NestJS API Skeleton

This is the planned production backend for the city flash delivery project. It does not replace the current Python MVP yet. Use it as the migration target for TypeScript + NestJS + PostgreSQL/PostGIS + Redis.

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

## Current Scope

This skeleton includes route/module placeholders for:

- `auth`: WeChat/customer login and operator login placeholders.
- `users`: user profile placeholder.
- `addresses`: address list placeholder.
- `orders`: create/list/detail/status APIs persisted with Prisma/PostgreSQL.
- `operations`: operator order list, quote, and status update endpoints.
- `pricing`: delivery price estimate using fixed vehicle rules.
- `maps`: Tencent map integration placeholder and automatic bad-weather risk endpoint.
- `health`: health check.

## Migration Plan

1. Keep `server/app.py` running as the stable MVP backend.
2. Use this NestJS API to model the final modules and database schema.
3. Continue replacing remaining demo placeholders with Prisma-backed modules.
4. Point customer mini program and operations web to `http://127.0.0.1:3000/api` after endpoint parity.
5. Remove the Python backend only after NestJS covers the complete user order + operations workflow.

## Database Notes

`prisma/schema.prisma` stores latitude/longitude as decimals and reserves PostGIS columns with Prisma `Unsupported("geography(...)")` fields. The initial Prisma migration enables PostGIS extensions before creating tables. The SQL file `prisma/sql/001_enable_postgis.sql` also enables PostGIS when the Docker Postgres container first initializes.

Customer orders, operator quotes, and order status changes now write to PostgreSQL. `order_status_logs` stores the status timeline, while quote fields on `orders` keep pending/quoted state visible to the customer mini program and operations web.

Manual-quote services use a two-stage price flow. Before ordering, the existing vehicle and distance rules return `estimatedFee` so the customer can decide whether to submit. After ordering, the operator sets the final `quotedFee`; the customer must accept it through `PATCH /api/orders/:id/quote/confirm` before operations can advance the order. A rejection through `PATCH /api/orders/:id/quote/reject` returns the order for a new quote.

Buy-for-me orders persist `productFee` and `deliveryFee` separately. Their payable `totalFee` is always calculated as `productFee + deliveryFee`; the legacy `budget` and `serviceFee` response aliases remain available to older clients.

Bad-weather pricing should be system-driven, not user-selected. The mini program calls `GET /api/maps/weather-risk` on the order confirmation page and applies the returned `isBadWeather` result to the estimate. The endpoint reads forecast data by coordinate, applies keyword/weather-code/wind/rain thresholds, and supports `BAD_WEATHER_OVERRIDE=true|false` for local demos.

Core delivery flow:

```text
PENDING -> ACCEPTED -> PICKING_UP -> DELIVERING -> COMPLETED
```

These map to the user-facing statuses:

```text
待接单 -> 已接单 -> 取货中 -> 配送中 -> 已完成
```
