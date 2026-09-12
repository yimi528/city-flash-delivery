# Operations Web

React + TypeScript operations console for the city flash delivery MVP.

## Local Start

Start the NestJS API first:

```bash
# 在仓库根目录执行
npm --prefix server/api run start:dev
```

Then start the operations website:

```bash
npm --prefix apps/merchant-web ci
npm --prefix apps/merchant-web run dev
```

Open:

```text
http://127.0.0.1:5173
```

The login dialog requires an operator username and strong password. Production must use an exact merchant HTTPS origin in `CORS_ORIGINS` and keep automatic operator bootstrap disabled.

## Build

```bash
npm run build
npm run preview
```

The built website is generated in `dist/`. In production it is published as the `city-flash-merchant` service in the same WeChat Cloud Hosting environment as the API; use `wxcloud service:list` for the current public domain.

## Source layout

```text
src/
├── features/
│   ├── config/             # 价格、服务范围和系统设置工作区
│   └── operations/         # 订单、骑手和登录运营界面
├── services/               # API client and notifications
├── types/                  # Frontend domain types
├── main.tsx
└── styles.css
```
