# Operations Web

React + TypeScript operations console for the city flash delivery MVP.

## Local Start

Start the NestJS API first:

```bash
cd /Users/Admin1/Documents/Codex/2026-07-09/xian/server/api
npm run start:dev
```

Then start the operations website:

```bash
cd /Users/Admin1/Documents/Codex/2026-07-09/xian/apps/merchant-web
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

The login dialog requires an operator username, strong password, and the current six-digit code from a TOTP authenticator. Production must use an exact merchant HTTPS origin in `CORS_ORIGINS`, keep automatic operator bootstrap disabled, and retain the TOTP encryption key securely.

## Build

```bash
npm run build
npm run preview
```

The built website is generated in `dist/` and can later be deployed behind a domain such as `ops.example.com`.
