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
- `orders`: create/list/detail/status APIs with in-memory demo storage.
- `operations`: operator order list and status update endpoints.
- `pricing`: delivery price estimate using fixed vehicle rules.
- `maps`: Tencent map integration placeholder.
- `health`: health check.

## Migration Plan

1. Keep `server/app.py` running as the stable MVP backend.
2. Use this NestJS API to model the final modules and database schema.
3. Move data persistence from in-memory placeholders to Prisma/PostgreSQL.
4. Point customer mini program and operations web to `http://127.0.0.1:3000/api` after endpoint parity.
5. Remove the Python backend only after NestJS covers the complete user order + operations workflow.

## Database Notes

`prisma/schema.prisma` stores latitude/longitude as decimals and reserves PostGIS columns with Prisma `Unsupported("geography(...)")` fields. The initial Prisma migration enables PostGIS extensions before creating tables. The SQL file `prisma/sql/001_enable_postgis.sql` also enables PostGIS when the Docker Postgres container first initializes.

Core delivery flow:

```text
PENDING -> ACCEPTED -> PICKING_UP -> DELIVERING -> COMPLETED
```

These map to the user-facing statuses:

```text
待接单 -> 已接单 -> 取货中 -> 配送中 -> 已完成
```
